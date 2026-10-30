import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { NetworkStatus } from '../network-status';
import { Icon } from '../icon';
import { PracticeLayout } from '../practice-layout';
import { AttemptService, type Attempt, type AttemptSummary } from './attempt.service';
import { chapterColor } from './chapter-color';
import {
  contentKindLabels,
  chapterNotPublishedMessage,
  externalLinkNeedsNetworkMessage,
  externalLinkOfflineMessage,
  loadErrorMessage,
  loadingMessage,
} from './content-labels';
import { CurriculumService } from './curriculum.service';
import {
  createPracticeProgress,
  practiceProgressKey,
  readPracticeProgress,
  type PracticeFeedback,
  type PracticeProgress,
} from './practice-progress';
import { practiceItemIds, PracticeRunner } from './practice-runner';

@Component({
  selector: 'app-sequence-page',
  imports: [BilingualText, Icon, MatProgressBarModule, PracticeRunner, RouterLink],
  styleUrls: ['./curriculum.css', './sequence-page.css'],
  host: { '[style.--chapter-accent]': 'accent()' },
  template: `
    @if (!practiceLayout.active()) {
      <a class="back" [routerLink]="['/chapitres', chapterId()]">
        <app-icon name="previous" />
        <app-bilingual-text eu="Kapitulura itzuli" fr="Retour au chapitre" />
      </a>
    }
    @if (chapter.isLoading()) {
      <p id="sequence-loading" role="status">
        <app-bilingual-text [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="sequence-loading" />
    } @else if (chapter.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (!chapter.value()) {
      <p role="alert">
        <app-bilingual-text [eu]="notPublished.eu" [fr]="notPublished.fr" />
      </p>
    } @else if (position(); as position) {
      @let chapter = position.chapter;
      @let sequence = position.sequence;
      <div [hidden]="practiceLayout.active()">
        <p class="eyebrow">
          <span class="chapter-marker" aria-hidden="true">{{ chapter.number }}</span>
          <app-bilingual-text
            [eu]="chapter.number + '. kapitulua · ' + sequence.letter + ' sekuentzia'"
            [fr]="'Chapitre ' + chapter.number + ' · Séquence ' + sequence.letter"
          />
        </p>
        <h1>
          <app-bilingual-text [eu]="sequence.title.eu" [fr]="sequence.title.fr" />
        </h1>
      </div>
      @if (attemptSummary(); as summary) {
        <p
          class="attempt-summary muted"
          [class.visually-hidden]="practiceLayout.active()"
          role="status"
        >
          <app-bilingual-text
            [eu]="'Saiakera sinkronizatuak: ' + summary.synced + ' · zain: ' + summary.pending"
            [fr]="
              'Tentatives synchronisées : ' + summary.synced + ' · en attente : ' + summary.pending
            "
          />
        </p>
      }
      @if (attempts.error(); as error) {
        <p role="alert">
          <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
        </p>
      }
      @if (practiceActive() && learnerId(); as learnerId) {
        <app-practice-runner
          [sequence]="sequence"
          [chapterId]="chapter.id"
          [learnerId]="learnerId"
          [practiceSessionId]="practiceSession()"
          [nextSequenceId]="position.next?.id ?? null"
          [initialProgress]="activeProgress()!"
          [initialStorageError]="practiceStorageError()"
          (attempted)="recordAttempt(chapter.id, $event)"
          (progressChanged)="savePractice($event)"
          (exit)="exitPractice()"
        />
      } @else {
        @if (practiceItemCount()) {
          <button type="button" class="start-practice" (click)="startPractice()">
            <app-icon name="play" />
            @if (savedPractice()) {
              <app-bilingual-text eu="Ariketekin jarraitu" fr="Reprendre les exercices" />
            } @else {
              <app-bilingual-text eu="Hasi ariketak" fr="Commencer les exercices" />
            }
          </button>
        }
        @if (practiceStorageError(); as error) {
          <p role="alert">
            <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
          </p>
        }
        <ol class="contents">
          @for (content of sequence.contents; track content.id) {
            <li>
              <article [attr.aria-labelledby]="'content-' + content.id">
                <p class="kind">
                  <app-bilingual-text
                    [eu]="kindLabels[content.kind].eu"
                    [fr]="kindLabels[content.kind].fr"
                  />
                </p>
                <h2 [id]="'content-' + content.id">
                  <app-bilingual-text [eu]="content.title.eu" [fr]="content.title.fr" />
                </h2>
                @switch (content.kind) {
                  @case ('note') {
                    <p><app-bilingual-text [eu]="content.body.eu" [fr]="content.body.fr" /></p>
                  }
                  @case ('dialogue') {
                    <dl class="dialogue">
                      @for (line of content.lines; track $index) {
                        <dt>{{ line.speaker }}</dt>
                        <dd><app-bilingual-text [eu]="line.text.eu" [fr]="line.text.fr" /></dd>
                      }
                    </dl>
                  }
                  @case ('external-link') {
                    <p>
                      <app-bilingual-text
                        [eu]="content.description.eu"
                        [fr]="content.description.fr"
                      />
                    </p>
                    <a [href]="content.url" target="_blank" rel="noopener noreferrer">
                      <app-bilingual-text
                        [eu]="content.title.eu + ' (kanpoko orria)'"
                        [fr]="content.title.fr + ' (page externe)'"
                      />
                    </a>
                    <p class="muted">
                      @let availability = network.online() ? needsNetwork : offlineLink;
                      <app-bilingual-text [eu]="availability.eu" [fr]="availability.fr" />
                    </p>
                  }
                  @case ('oral-prompt') {
                    <p>
                      <app-bilingual-text
                        [eu]="content.instructions.eu"
                        [fr]="content.instructions.fr"
                      />
                    </p>
                    <p class="muted">
                      <app-bilingual-text
                        eu="Nahi baduzu egiteko jarduera; ez da automatikoki zuzentzen."
                        fr="Activité à faire si vous le souhaitez ; elle n’est pas corrigée automatiquement."
                      />
                    </p>
                  }
                  @default {
                    <p>
                      <app-bilingual-text
                        [eu]="content.instructions.eu"
                        [fr]="content.instructions.fr"
                      />
                    </p>
                    <p class="muted">
                      <app-bilingual-text
                        [eu]="content.items.length + ' item'"
                        [fr]="content.items.length + ' questions dans la série'"
                      />
                    </p>
                  }
                }
              </article>
            </li>
          }
        </ol>
        <nav class="pager">
          @if (position.previous; as previous) {
            <a [routerLink]="['/chapitres', chapter.id, 'sequences', previous.id]">
              <app-icon name="previous" />
              <app-bilingual-text
                [eu]="'Aurreko sekuentzia: ' + previous.letter"
                [fr]="'Séquence précédente : ' + previous.letter"
              />
            </a>
          }
          @if (position.next; as next) {
            <a class="next" [routerLink]="['/chapitres', chapter.id, 'sequences', next.id]">
              <app-bilingual-text
                [eu]="'Hurrengo sekuentzia: ' + next.letter"
                [fr]="'Séquence suivante : ' + next.letter"
              />
              <app-icon name="next" />
            </a>
          }
        </nav>
      }
    } @else {
      <p role="alert">
        <app-bilingual-text
          eu="Sekuentzia hau ez dago kapitulu honetan."
          fr="Cette séquence n’existe pas dans ce chapitre."
        />
      </p>
    }
  `,
})
export class SequencePage {
  readonly chapterId = input.required<string>();
  readonly sequenceId = input.required<string>();
  private readonly curriculum = inject(CurriculumService);
  private readonly auth = inject(AuthService);
  protected readonly attempts = inject(AttemptService);
  protected readonly network = inject(NetworkStatus);
  protected readonly practiceLayout = inject(PracticeLayout);
  protected readonly learnerId = computed(() => this.auth.user()?.uid ?? null);
  protected readonly practiceActive = signal(false);
  protected readonly activeProgress = signal<PracticeProgress | null>(null);
  protected readonly savedPractice = signal<PracticeProgress | null>(null);
  protected readonly practiceStorageError = signal<{ eu: string; fr: string } | null>(null);
  protected readonly practiceItemCount = computed(() => {
    const position = this.position();
    return position ? practiceItemIds(position.sequence).size : 0;
  });
  protected readonly chapter = resource({
    params: () => this.chapterId(),
    loader: ({ params }) => this.curriculum.chapter(params),
  });
  protected readonly position = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    const index = chapter?.sequences.findIndex(({ id }) => id === this.sequenceId()) ?? -1;
    if (!chapter || index < 0) return null;
    return {
      chapter,
      sequence: chapter.sequences[index],
      previous: index > 0 ? chapter.sequences[index - 1] : null,
      next: index < chapter.sequences.length - 1 ? chapter.sequences[index + 1] : null,
    };
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  /** A practice session lasts one visit to a sequence: opening, reloading or changing it starts a new one. */
  private readonly practiceSession = computed(() => {
    this.chapterId();
    this.sequenceId();
    return crypto.randomUUID();
  });
  protected readonly attemptSummary = signal<AttemptSummary | null>(null);
  protected readonly kindLabels = contentKindLabels;
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;
  protected readonly needsNetwork = externalLinkNeedsNetworkMessage;
  protected readonly offlineLink = externalLinkOfflineMessage;

  constructor() {
    effect((onCleanup) => {
      const learner = this.auth.user();
      const position = this.position();
      this.attemptSummary.set(null);
      if (!learner || !position) return;
      const itemIds = new Set(
        position.sequence.contents.flatMap((content) =>
          content.type === 'activity' && 'items' in content
            ? content.items.map(({ id }) => id)
            : [],
        ),
      );
      if (!itemIds.size) return;
      onCleanup(
        this.attempts.watch(learner.uid, position.chapter.id, itemIds, (summary) =>
          this.attemptSummary.set(summary),
        ),
      );
    });
    effect(() => {
      const learner = this.auth.user();
      const position = this.position();
      this.practiceActive.set(false);
      this.activeProgress.set(null);
      this.savedPractice.set(null);
      this.practiceStorageError.set(null);
      if (!learner || !position || !practiceItemIds(position.sequence).size) return;
      const key = practiceProgressKey(learner.uid, position.chapter.id, position.sequence.id);
      const result = readPracticeProgress(key, practiceItemIds(position.sequence));
      this.savedPractice.set(result.progress);
      this.practiceStorageError.set(result.error);
    });
  }

  protected startPractice(): void {
    const position = this.position();
    if (!position || !this.learnerId() || !this.practiceItemCount()) return;
    this.activeProgress.set(
      this.savedPractice() ??
        createPracticeProgress(
          position.sequence.contents.flatMap((content) =>
            content.type === 'activity' && 'items' in content
              ? content.items.map(({ id }) => id)
              : [],
          ),
        ),
    );
    this.practiceActive.set(true);
  }

  protected savePractice(progress: PracticeProgress): void {
    this.savedPractice.set(progress);
  }

  protected exitPractice(): void {
    this.practiceActive.set(false);
  }

  protected recordAttempt(chapterId: string, feedback: PracticeFeedback): void {
    const learner = this.auth.user();
    if (!learner) return;
    const attempt: Attempt = {
      chapterId,
      itemId: feedback.itemId,
      outcome: feedback.outcome,
      sessionId: feedback.sessionId,
      attemptId: feedback.attemptId,
      occurredAt: feedback.occurredAt,
    };
    void this.attempts.record(learner.uid, attempt);
  }
}
