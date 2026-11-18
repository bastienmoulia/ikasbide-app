import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import { PracticeLayout } from '../practice-layout';
import { normalizeVocabularyAnswer } from './answer-normalization.mjs';
import { chapterColor } from './chapter-color';
import { chapterNotPublishedMessage, loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';
import type { BilingualText as WordPair, Chapter } from './curriculum.model';
import { VocabularyRushProgressService } from './vocabulary-rush-progress.service';

const boardSize = 6;
const roundSeconds = 60;
const feedbackMilliseconds = 700;
const boardSlots = Array.from({ length: boardSize }, (_, index) => index);

interface Pair {
  id: string;
  eu: string;
  fr: string;
}

interface PlacedPair {
  pair: Pair;
  euSlot: number;
  frSlot: number;
}

@Component({
  selector: 'app-vocabulary-rush',
  imports: [BilingualText, Icon, MatProgressBarModule, RouterLink],
  styleUrls: ['./curriculum.css', './vocabulary-rush.css'],
  host: { '[style.--chapter-accent]': 'accent()' },
  template: `
    <a class="back" [routerLink]="['/', bookId(), chapterId()]">
      <app-icon name="previous" />
      <app-bilingual-text mode="stacked" eu="Kapitulura itzuli" fr="Retour au chapitre" />
    </a>
    @if (chapter.isLoading()) {
      <p id="rush-loading" role="status">
        <app-bilingual-text mode="stacked" [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="rush-loading" />
    } @else if (chapter.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text mode="stacked" [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (chapter.value(); as chapter) {
      <p class="eyebrow">
        <span
          class="chapter-marker"
          role="img"
          [attr.aria-label]="chapter.number + '. kapitulua / Chapitre ' + chapter.number"
          >{{ chapter.number }}</span
        >
        <app-bilingual-text mode="stacked" eu="Hitzak lotzeko erronka" fr="Défi d’association" />
      </p>
      <h1>
        <app-bilingual-text mode="stacked" eu="Euskara eta frantsesa" fr="Basque et français" />
      </h1>
      <p class="muted">
        <app-bilingual-text
          mode="stacked"
          eu="Aurkitu ahalik eta bikote gehien 60 segundoan."
          fr="Trouvez le plus de paires possible en 60 secondes."
        />
      </p>

      @if (bestScoreLoading()) {
        <p role="status">
          <app-bilingual-text mode="stacked" eu="Errekorra kargatzen…" fr="Chargement du record…" />
        </p>
      } @else if (bestScoreError(); as error) {
        <p role="alert">
          <app-bilingual-text mode="stacked" [eu]="error.eu" [fr]="error.fr" />
        </p>
      } @else if (bestScore() !== null) {
        <p class="best-score">
          <app-bilingual-text
            mode="stacked"
            [eu]="'Zure errekorra: ' + bestScore() + ' bikote'"
            [fr]="'Votre record : ' + bestScore() + ' paires'"
          />
        </p>
      } @else if (!auth.user()) {
        <p class="muted">
          <app-bilingual-text
            mode="stacked"
            eu="Saioa hasi errekorra gordetzeko."
            fr="Connectez-vous pour enregistrer votre record."
          />
        </p>
      }
      @if (progress.writeError(); as error) {
        <p role="alert">
          <app-bilingual-text mode="stacked" [eu]="error.eu" [fr]="error.fr" />
        </p>
      }

      @if (!pairs().length) {
        <p role="status">
          <app-bilingual-text
            mode="stacked"
            eu="Kapitulu honek ez du lotzeko ariketarik."
            fr="Ce chapitre ne contient aucun exercice d’association."
          />
        </p>
      } @else {
        <section class="rush-game" aria-label="Hitzak lotzeko erronka / Défi d’association">
          <div class="game-stats">
            <p class="timer" [class.urgent]="secondsRemaining() <= 10">
              <app-bilingual-text mode="stacked" eu="Denbora" fr="Temps" />
              <strong>{{ secondsRemaining() }} s</strong>
            </p>
            <p class="score">
              <app-bilingual-text mode="stacked" eu="Puntuazioa" fr="Score" />
              <strong>{{ score() }}</strong>
            </p>
          </div>

          @if (phase() === 'ready') {
            <p class="muted">
              <app-bilingual-text
                mode="stacked"
                eu="Bi zutabeetako hitzak nahastuta daude. Klikatu hitz bana bikote bat osatzeko."
                fr="Les mots des deux colonnes sont mélangés. Cliquez sur un mot de chaque colonne pour former une paire."
              />
            </p>
          } @else if (phase() === 'countdown') {
            <p class="game-message" role="status" aria-live="assertive">
              <app-bilingual-text
                mode="stacked"
                [eu]="countdown()! > 0 ? countdown()!.toString() : 'Prest!'"
                [fr]="countdown()! > 0 ? countdown()!.toString() : 'Prêt !'"
              />
            </p>
          } @else if (phase() === 'finished') {
            <p class="game-message" role="status" aria-live="polite">
              <app-bilingual-text
                mode="stacked"
                [eu]="
                  secondsRemaining() === 0
                    ? 'Denbora amaitu da!'
                    : 'Kapitulu honetako bikote guztiak aurkitu dituzu!'
                "
                [fr]="
                  secondsRemaining() === 0
                    ? 'Temps écoulé !'
                    : 'Vous avez trouvé toutes les paires de ce chapitre !'
                "
              />
            </p>
          } @else {
            <p class="game-message" role="status" aria-live="polite">
              @if (feedback() === 'correct') {
                <app-bilingual-text mode="stacked" eu="Bikote zuzena!" fr="Bonne paire !" />
              } @else if (feedback() === 'incorrect') {
                <app-bilingual-text mode="stacked" eu="Ez da bikotea" fr="Ce n’est pas une paire" />
              }
            </p>
          }

          <div class="rush-board" [class.locked]="phase() !== 'running'">
            <div class="rush-column" role="group" aria-label="Frantsesa / Français">
              <h2><app-bilingual-text mode="stacked" eu="Frantsesa" fr="Français" /></h2>
              @for (slot of boardSlots; track slot) {
                @let placed = pairAt('fr', slot);
                <div class="word-slot">
                  @if (placed) {
                    <button
                      type="button"
                      class="word-option"
                      [class.selected]="selectedFrId() === placed.pair.id"
                      [class.wrong]="isWrong('fr', placed.pair.id)"
                      [attr.aria-pressed]="selectedFrId() === placed.pair.id"
                      [disabled]="phase() !== 'running' || resolving()"
                      (click)="select('fr', placed)"
                    >
                      <span lang="fr">{{ placed.pair.fr }}</span>
                    </button>
                  }
                </div>
              }
            </div>
            <div class="rush-column" role="group" aria-label="Euskara / Basque">
              <h2><app-bilingual-text mode="stacked" eu="Euskara" fr="Basque" /></h2>
              @for (slot of boardSlots; track slot) {
                @let placed = pairAt('eu', slot);
                <div class="word-slot">
                  @if (placed) {
                    <button
                      type="button"
                      class="word-option"
                      [class.selected]="selectedEuId() === placed.pair.id"
                      [class.wrong]="isWrong('eu', placed.pair.id)"
                      [attr.aria-pressed]="selectedEuId() === placed.pair.id"
                      [disabled]="phase() !== 'running' || resolving()"
                      (click)="select('eu', placed)"
                    >
                      <span lang="eu">{{ placed.pair.eu }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
          @if (phase() === 'ready') {
            <button type="button" class="start-button" (click)="start()">
              <app-icon name="play" />
              <app-bilingual-text mode="stacked" eu="Hasi" fr="Commencer" />
            </button>
          } @else if (phase() === 'finished') {
            <button type="button" class="start-button" (click)="start()">
              <app-icon name="restart" />
              <app-bilingual-text mode="stacked" eu="Berriz jokatu" fr="Rejouer" />
            </button>
          }
        </section>
      }
    } @else {
      <p role="alert">
        <app-bilingual-text mode="stacked" [eu]="notPublished.eu" [fr]="notPublished.fr" />
      </p>
    }
  `,
})
export class VocabularyRush {
  readonly bookId = input.required<string>();
  readonly chapterId = input.required<string>();
  protected readonly auth = inject(AuthService);
  protected readonly progress = inject(VocabularyRushProgressService);
  private readonly curriculum = inject(CurriculumService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly practiceLayout = inject(PracticeLayout);
  protected readonly chapter = resource({
    params: () => ({ bookId: this.bookId(), chapterId: this.chapterId() }),
    loader: ({ params }) => this.curriculum.chapter(params.bookId, params.chapterId),
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  protected readonly pairs = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? matchingPairs(chapter) : [];
  });
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;
  protected readonly boardSlots = boardSlots;
  protected readonly phase = signal<'ready' | 'countdown' | 'running' | 'finished'>('ready');
  protected readonly countdown = signal<number | null>(null);
  protected readonly secondsRemaining = signal(roundSeconds);
  protected readonly score = signal(0);
  protected readonly resolving = signal(false);
  protected readonly feedback = signal<'correct' | 'incorrect' | null>(null);
  protected readonly selectedEuId = signal<string | null>(null);
  protected readonly selectedFrId = signal<string | null>(null);
  protected readonly bestScore = signal<number | null>(null);
  protected readonly bestScoreLoading = signal(false);
  protected readonly bestScoreError = signal<WordPair | null>(null);
  private readonly placements = signal<PlacedPair[]>([]);
  private readonly wrongSelection = signal<{ eu: string; fr: string } | null>(null);
  private unusedPairs: Pair[] = [];
  private countdownTimer: number | null = null;
  private roundTimer: number | null = null;
  private roundDeadline: number | null = null;
  private feedbackTimer: number | null = null;
  private removedSlots: { eu: number; fr: number } | null = null;

  constructor() {
    effect((onCleanup) => {
      const learner = this.auth.user();
      const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
      this.bestScore.set(null);
      this.bestScoreError.set(null);
      if (!learner || !chapter) {
        this.bestScoreLoading.set(false);
        return;
      }
      this.bestScoreLoading.set(true);
      onCleanup(
        this.progress.watchBestScore(
          learner.uid,
          this.bookId(),
          chapter.id,
          (score) => {
            this.bestScore.set(score);
            this.bestScoreLoading.set(false);
            this.bestScoreError.set(null);
          },
          (error) => {
            this.bestScoreLoading.set(false);
            this.bestScoreError.set(error);
          },
        ),
      );
    });
    this.destroyRef.onDestroy(() => {
      this.clearTimers();
      this.practiceLayout.sessionActive.set(false);
    });
  }

  protected pairAt(side: 'eu' | 'fr', slot: number): PlacedPair | null {
    return (
      this.placements().find((placed) =>
        side === 'eu' ? placed.euSlot === slot : placed.frSlot === slot,
      ) ?? null
    );
  }

  protected isWrong(side: 'eu' | 'fr', pairId: string): boolean {
    return this.wrongSelection()?.[side] === pairId;
  }

  protected start(): void {
    this.clearTimers();
    this.practiceLayout.sessionActive.set(true);
    this.score.set(0);
    this.secondsRemaining.set(roundSeconds);
    this.selectedEuId.set(null);
    this.selectedFrId.set(null);
    this.feedback.set(null);
    this.wrongSelection.set(null);
    this.resolving.set(false);
    this.removedSlots = null;
    this.unusedPairs = shuffle(this.pairs());
    const initial: Pair[] = [];
    while (initial.length < boardSize) {
      const next = this.takeCompatible(initial);
      if (!next) break;
      initial.push(next);
    }
    this.placements.set(assignSlots(initial));
    this.phase.set('countdown');
    this.countdown.set(3);
    this.countdownTimer = window.setInterval(() => {
      const remaining = this.countdown();
      if (remaining === null || remaining <= 1) {
        this.clearCountdownTimer();
        this.countdown.set(null);
        this.phase.set('running');
        this.startRoundTimer();
        return;
      }
      this.countdown.set(remaining - 1);
    }, 1000);
  }

  protected select(side: 'eu' | 'fr', placed: PlacedPair): void {
    if (this.phase() !== 'running' || this.resolving()) return;
    this.updateRemainingTime();
    if (this.phase() !== 'running') return;
    if (side === 'eu') {
      this.selectedEuId.set(this.selectedEuId() === placed.pair.id ? null : placed.pair.id);
    } else {
      this.selectedFrId.set(this.selectedFrId() === placed.pair.id ? null : placed.pair.id);
    }
    const euId = this.selectedEuId();
    const frId = this.selectedFrId();
    if (euId && frId) this.resolveSelection(euId, frId);
  }

  private resolveSelection(euId: string, frId: string): void {
    const eu = this.placements().find(({ pair }) => pair.id === euId);
    const fr = this.placements().find(({ pair }) => pair.id === frId);
    if (!eu || !fr) {
      this.selectedEuId.set(null);
      this.selectedFrId.set(null);
      return;
    }
    this.selectedEuId.set(null);
    this.selectedFrId.set(null);
    this.feedback.set(euId === frId ? 'correct' : 'incorrect');
    if (euId !== frId) {
      this.resolving.set(true);
      this.wrongSelection.set({ eu: euId, fr: frId });
      this.feedbackTimer = window.setTimeout(() => {
        this.feedback.set(null);
        this.wrongSelection.set(null);
        this.resolving.set(false);
        this.feedbackTimer = null;
      }, feedbackMilliseconds);
      return;
    }

    this.resolving.set(true);
    this.score.update((score) => score + 1);
    this.removedSlots = { eu: eu.euSlot, fr: fr.frSlot };
    this.placements.update((placed) => placed.filter(({ pair }) => pair.id !== euId));
    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackTimer = null;
      this.refillBoard();
    }, feedbackMilliseconds);
  }

  private refillBoard(): void {
    let active = this.placements();
    const removed = this.removedSlots;
    if (!removed) throw new Error('Cannot refill the vocabulary board without a removed pair.');
    while (active.length < boardSize) {
      const next = this.takeCompatible(active.map(({ pair }) => pair));
      if (!next) break;
      active = placeNewPair(active, next, removed);
    }
    this.placements.set(active);
    this.removedSlots = null;
    this.feedback.set(null);
    this.resolving.set(false);
    if (active.length === 0 && this.unusedPairs.length === 0) this.finish();
  }

  private takeCompatible(active: readonly Pair[]): Pair | null {
    const index = this.unusedPairs.findIndex((candidate) =>
      active.every(
        (placed) =>
          normalizeVocabularyAnswer(placed.eu) !== normalizeVocabularyAnswer(candidate.eu) &&
          normalizeVocabularyAnswer(placed.fr) !== normalizeVocabularyAnswer(candidate.fr),
      ),
    );
    if (index < 0) return null;
    return this.unusedPairs.splice(index, 1)[0];
  }

  private startRoundTimer(): void {
    if (!this.placements().length) {
      this.finish();
      return;
    }
    this.roundDeadline = Date.now() + roundSeconds * 1000;
    this.roundTimer = window.setInterval(() => this.updateRemainingTime(), 250);
  }

  private updateRemainingTime(): void {
    if (this.roundDeadline === null) return;
    const remaining = Math.max(0, Math.ceil((this.roundDeadline - Date.now()) / 1000));
    this.secondsRemaining.set(remaining);
    if (remaining === 0) this.finish();
  }

  private finish(): void {
    this.clearTimers();
    this.phase.set('finished');
    this.countdown.set(null);
    this.resolving.set(false);
    const learner = this.auth.user();
    const score = this.score();
    if (learner && score > (this.bestScore() ?? 0)) {
      void this.progress.recordBestScore(learner.uid, this.bookId(), this.chapterId(), score);
    }
  }

  private clearTimers(): void {
    this.clearCountdownTimer();
    if (this.roundTimer !== null) window.clearInterval(this.roundTimer);
    if (this.feedbackTimer !== null) window.clearTimeout(this.feedbackTimer);
    this.roundTimer = null;
    this.roundDeadline = null;
    this.feedbackTimer = null;
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }
}

function matchingPairs(chapter: Chapter): Pair[] {
  const found = new Map<string, Pair>();
  for (const sequence of chapter.sequences) {
    for (const content of sequence.contents) {
      if (content.type !== 'activity' || content.kind !== 'matching') continue;
      for (const words of content.items.flatMap((item) => item.pairs)) {
        if (!words.eu.trim() || !words.fr.trim()) continue;
        const id = JSON.stringify([
          normalizeVocabularyAnswer(words.eu),
          normalizeVocabularyAnswer(words.fr),
        ]);
        if (!found.has(id)) found.set(id, { id, eu: words.eu, fr: words.fr });
      }
    }
  }
  return [...found.values()];
}

function assignSlots(pairs: readonly Pair[]): PlacedPair[] {
  const euSlots = shuffle(boardSlots).slice(0, pairs.length);
  const frSlots = shuffle(boardSlots).slice(0, pairs.length);
  return pairs.map((pair, index) => ({ pair, euSlot: euSlots[index], frSlot: frSlots[index] }));
}

function placeNewPair(
  placements: readonly PlacedPair[],
  pair: Pair,
  removed: { eu: number; fr: number },
): PlacedPair[] {
  let updated = [...placements];
  const chooseSlot = (side: 'eu' | 'fr'): number => {
    const field = side === 'eu' ? 'euSlot' : 'frSlot';
    const freeSlot = randomChoice(
      boardSlots.filter(
        (slot) => slot !== removed[side] && !updated.some((placed) => placed[field] === slot),
      ),
    );
    if (freeSlot !== null) return freeSlot;

    // On a full board, move one existing word into the vacated slot instead of putting
    // the replacement under the pointer that selected the previous word.
    const displaced = randomChoice(updated);
    if (!displaced) throw new Error('Cannot find a slot for a new vocabulary word.');
    const slot = displaced[field];
    updated = updated.map((placed) =>
      placed === displaced ? { ...placed, [field]: removed[side] } : placed,
    );
    return slot;
  };
  const euSlot = chooseSlot('eu');
  const frSlot = chooseSlot('fr');
  return [...updated, { pair, euSlot, frSlot }];
}

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function randomChoice<T>(values: readonly T[]): T | null {
  if (!values.length) return null;
  return values[Math.floor(Math.random() * values.length)];
}
