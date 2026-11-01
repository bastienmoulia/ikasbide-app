import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import { PracticeLayout } from '../practice-layout';
import { AttemptService, type Attempt, type AttemptSummary } from './attempt.service';
import { chapterColor } from './chapter-color';
import { chapterNotPublishedMessage, loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';
import {
  createPracticeProgress,
  mergeSyncedPracticeProgress,
  practiceProgressKey,
  readPracticeProgress,
  type PracticeFeedback,
  type PracticeProgress,
  type SyncedPracticeProgress,
  writePracticeProgress,
} from './practice-progress';
import { practiceItemIds, PracticeRunner } from './practice-runner';
import { practiceSteps, withPracticeSteps } from './practice-steps';
import { SequenceProgressService } from './sequence-progress.service';

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
        @if (practiceStepCount()) {
          <section
            class="journey-overview"
            aria-label="Ibilbidearen laburpena / Résumé du parcours"
          >
            <p class="muted">
              <app-bilingual-text
                eu="Irakurketak eta ariketak ordena pedagogiko berean, urratsez urrats."
                fr="Lectures et exercices dans l’ordre pédagogique, étape par étape."
              />
            </p>
            <p class="journey-progress">
              @if (savedPractice(); as progress) {
                <app-bilingual-text
                  [eu]="
                    progress.journey.visited.length +
                    progress.skippedStepIds.length +
                    ' / ' +
                    practiceStepCount() +
                    ' urrats eginda · ' +
                    progress.completedItemIds.length +
                    ' ariketa gaindituta'
                  "
                  [fr]="
                    progress.journey.visited.length +
                    progress.skippedStepIds.length +
                    ' / ' +
                    practiceStepCount() +
                    ' étapes parcourues · ' +
                    progress.completedItemIds.length +
                    ' exercices réussis'
                  "
                />
              } @else {
                <app-bilingual-text
                  [eu]="practiceStepCount() + ' urrats zure zain'"
                  [fr]="practiceStepCount() + ' étapes à découvrir'"
                />
              }
            </p>
            <mat-progress-bar
              mode="determinate"
              [value]="overviewProgress()"
              [attr.aria-label]="'Ibilbidearen aurrerapena / Progression du parcours'"
            />
            @if (nextPracticeStep(); as step) {
              <p>
                <strong>
                  <app-bilingual-text eu="Hurrengo urratsa" fr="Prochaine étape" />
                </strong>
                <app-bilingual-text [eu]="step.title.eu" [fr]="step.title.fr" />
              </p>
            } @else {
              <p role="status">
                <app-bilingual-text
                  eu="Ibilbide hau amaitu duzu."
                  fr="Vous avez terminé ce parcours."
                />
              </p>
            }
            <button type="button" class="start-practice" (click)="startPractice()">
              <app-icon name="play" />
              @if (savedPractice() && !nextPracticeStep()) {
                <app-bilingual-text eu="Ikusi laburpena" fr="Voir le bilan" />
              } @else if (savedPractice()) {
                <app-bilingual-text eu="Ibilbidearekin jarraitu" fr="Reprendre le parcours" />
              } @else {
                <app-bilingual-text eu="Hasi ibilbidea" fr="Commencer le parcours" />
              }
            </button>
          </section>
        }
        @if (practiceStorageError(); as error) {
          <p role="alert">
            <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
          </p>
        }
        @if (sequenceProgress.error(); as error) {
          <p role="alert">
            <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
          </p>
        }
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
  protected readonly sequenceProgress = inject(SequenceProgressService);
  protected readonly practiceLayout = inject(PracticeLayout);
  protected readonly learnerId = computed(() => this.auth.user()?.uid ?? null);
  protected readonly practiceActive = signal(false);
  protected readonly activeProgress = signal<PracticeProgress | null>(null);
  protected readonly savedPractice = signal<PracticeProgress | null>(null);
  private readonly remoteProgress = signal<SyncedPracticeProgress | null>(null);
  protected readonly practiceStorageError = signal<{ eu: string; fr: string } | null>(null);
  protected readonly practiceStepCount = computed(() => {
    const position = this.position();
    return position ? practiceSteps(position.sequence).length : 0;
  });
  protected readonly overviewProgress = computed(() => {
    const progress = this.savedPractice();
    return progress && this.practiceStepCount()
      ? ((progress.journey.visited.length + progress.skippedStepIds.length) /
          this.practiceStepCount()) *
          100
      : 0;
  });
  protected readonly nextPracticeStep = computed(() => {
    const position = this.position();
    const progress = this.savedPractice();
    if (!position || !progress) {
      const step = position ? practiceSteps(position.sequence)[0] : null;
      return step
        ? { title: step.kind === 'reading' ? step.content.title : step.question.title }
        : null;
    }
    const stepId = progress.journey.queue[0];
    const step = practiceSteps(position.sequence).find(({ id }) => id === stepId);
    return step
      ? { title: step.kind === 'reading' ? step.content.title : step.question.title }
      : null;
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
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;

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
    effect((onCleanup) => {
      const learner = this.auth.user();
      const position = this.position();
      this.practiceActive.set(false);
      this.activeProgress.set(null);
      this.savedPractice.set(null);
      this.remoteProgress.set(null);
      this.practiceStorageError.set(null);
      this.sequenceProgress.error.set(null);
      if (!learner || !position || !practiceSteps(position.sequence).length) return;
      const key = practiceProgressKey(learner.uid, position.chapter.id, position.sequence.id);
      const steps = practiceSteps(position.sequence);
      const stepIds = new Set(steps.map(({ id }) => id));
      const itemIds = practiceItemIds(position.sequence);
      const result = readPracticeProgress(key, itemIds, stepIds);
      const localProgress = result.progress ? withPracticeSteps(result.progress, steps) : null;
      this.savedPractice.set(localProgress);
      this.practiceStorageError.set(result.error);
      const unsubscribe = this.sequenceProgress.watch(
        learner.uid,
        position.chapter.id,
        position.sequence.id,
        stepIds,
        itemIds,
        (remote) => {
          if (!remote) {
            if (localProgress) this.savePractice(localProgress);
            return;
          }
          const base =
            this.savedPractice() ?? withPracticeSteps(createPracticeProgress([...itemIds]), steps);
          this.remoteProgress.set(remote);
          const merged = mergeSyncedPracticeProgress(
            base,
            remote,
            steps.map(({ id }) => id),
          );
          this.savedPractice.set(merged);
          this.practiceStorageError.set(writePracticeProgress(key, merged));
        },
      );
      onCleanup(unsubscribe);
    });
  }

  protected startPractice(): void {
    const position = this.position();
    if (!position || !this.learnerId() || !this.practiceStepCount()) return;
    this.activeProgress.set(
      this.savedPractice() ?? createPracticeProgress([...practiceItemIds(position.sequence)]),
    );
    this.practiceActive.set(true);
  }

  protected savePractice(progress: PracticeProgress): void {
    const position = this.position();
    const learner = this.auth.user();
    if (!position || !learner) return;
    const steps = practiceSteps(position.sequence);
    const merged = this.remoteProgress()
      ? mergeSyncedPracticeProgress(
          progress,
          this.remoteProgress()!,
          steps.map(({ id }) => id),
        )
      : progress;
    this.savedPractice.set(merged);
    this.practiceStorageError.set(
      writePracticeProgress(
        practiceProgressKey(learner.uid, position.chapter.id, position.sequence.id),
        merged,
      ),
    );
    void this.sequenceProgress.record(
      learner.uid,
      position.chapter.id,
      position.sequence.id,
      merged,
    );
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
