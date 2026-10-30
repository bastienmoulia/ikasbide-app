import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { BilingualText } from '../bilingual-text';
import { DisplayModeControl } from '../display-mode-control';
import { Icon } from '../icon';
import { PracticeLayout } from '../practice-layout';
import { ActivityPlayer, type ExerciseQuestion, type ItemResponse } from './activity-player';
import type { Sequence } from './curriculum.model';
import {
  type PracticeFeedback,
  type PracticeProgress,
  practiceProgressKey,
  writePracticeProgress,
} from './practice-progress';

@Component({
  selector: 'app-practice-runner',
  imports: [ActivityPlayer, BilingualText, DisplayModeControl, Icon, MatTooltipModule, RouterLink],
  styleUrls: ['./practice-runner.css'],
  template: `
    @if (progress(); as state) {
      @if (currentQuestion()) {
        <section class="practice" aria-label="Ariketa sorta / Série d’exercices">
          <div class="practice-toolbar">
            <button
              type="button"
              class="exit"
              aria-label="Utzi oraingoz / Arrêter pour le moment"
              matTooltip="Utzi oraingoz / Arrêter pour le moment"
              (click)="exit.emit()"
            >
              <app-icon name="previous" />
            </button>
            <p class="progress-label">
              <app-bilingual-text
                [eu]="state.completedItemIds.length + ' / ' + questions().length + ' item'"
                [fr]="state.completedItemIds.length + ' / ' + questions().length + ' questions'"
              />
            </p>
            <app-display-mode-control />
          </div>
          <progress
            [value]="state.completedItemIds.length"
            [max]="questions().length"
            aria-label="Ariketen aurrerapena / Progression des exercices"
          ></progress>
          @for (presentation of presentedQuestions(); track presentation.key) {
            <app-activity-player
              [question]="presentation.question"
              [feedback]="state.feedback"
              (attempted)="submit($event)"
            />
          }
          @if (state.feedback && state.feedback.outcome !== 'correct') {
            <button type="button" class="continue" (click)="continue()">
              <app-bilingual-text eu="Jarraitu" fr="Continuer" />
              <app-icon name="next" />
            </button>
          }
          @if (storageError(); as error) {
            <p role="alert">
              <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
            </p>
          }
        </section>
      } @else {
        <section class="completion" aria-labelledby="completion-heading">
          <h2 id="completion-heading" tabindex="-1" #completionHeading>
            <app-bilingual-text eu="Oso ondo!" fr="Bravo !" />
          </h2>
          <p class="progress-label">
            <app-bilingual-text
              [eu]="state.completedItemIds.length + ' / ' + questions().length + ' item'"
              [fr]="state.completedItemIds.length + ' / ' + questions().length + ' questions'"
            />
          </p>
          <progress
            [value]="state.completedItemIds.length"
            [max]="questions().length"
            aria-label="Ariketen aurrerapena / Progression des exercices"
          ></progress>
          <p>
            <app-bilingual-text
              [eu]="questions().length + ' itemak amaitu dituzu.'"
              [fr]="questions().length + ' questions terminées.'"
            />
          </p>
          <nav class="completion-actions">
            @if (nextSequenceId(); as nextId) {
              <a [routerLink]="['/chapitres', chapterId(), 'sequences', nextId]">
                <app-bilingual-text eu="Hurrengo sekuentzia" fr="Séquence suivante" />
                <app-icon name="next" />
              </a>
            } @else {
              <a [routerLink]="['/chapitres', chapterId()]">
                <app-icon name="previous" />
                <app-bilingual-text eu="Itzuli kapitulura" fr="Retour au chapitre" />
              </a>
            }
            <button type="button" class="secondary" (click)="exit.emit()">
              <app-icon name="previous" />
              <app-bilingual-text eu="Baliabideetara itzuli" fr="Revenir aux ressources" />
            </button>
            <button type="button" class="secondary" (click)="restart()">
              <app-icon name="restart" />
              <app-bilingual-text eu="Berriro hasi" fr="Recommencer" />
            </button>
          </nav>
          @if (storageError(); as error) {
            <p role="alert">
              <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
            </p>
          }
        </section>
      }
    }
  `,
})
export class PracticeRunner {
  readonly sequence = input.required<Sequence>();
  readonly chapterId = input.required<string>();
  readonly learnerId = input.required<string>();
  readonly practiceSessionId = input.required<string>();
  readonly nextSequenceId = input<string | null>(null);
  readonly initialProgress = input.required<PracticeProgress>();
  readonly initialStorageError = input<{ eu: string; fr: string } | null>(null);
  readonly attempted = output<PracticeFeedback>();
  readonly exit = output<void>();
  readonly progressChanged = output<PracticeProgress>();
  protected readonly questions = computed(() => flattenQuestions(this.sequence()));
  protected readonly progress = signal<PracticeProgress | null>(null);
  protected readonly storageError = signal<{ eu: string; fr: string } | null>(null);
  private readonly presentation = signal(0);
  private readonly practiceLayout = inject(PracticeLayout);
  protected readonly currentQuestion = computed(() => {
    const id = this.progress()?.queue[0];
    return this.questions().find((question) => question.item.id === id) ?? null;
  });
  protected readonly presentedQuestions = computed(() => {
    const question = this.currentQuestion();
    // Even a retry of the same item needs a fresh view, shuffle and focus.
    return question ? [{ key: question.item.id + ':' + this.presentation(), question }] : [];
  });
  @ViewChild('completionHeading', { read: ElementRef })
  private completionHeading?: ElementRef<HTMLElement>;

  constructor() {
    effect(() => {
      this.progress.set(this.initialProgress());
      this.storageError.set(this.initialStorageError());
    });
    effect(() => {
      const feedback = this.progress()?.feedback;
      if (feedback) this.attempted.emit(feedback);
    });
    effect((onCleanup) => {
      this.practiceLayout.active.set(!!this.currentQuestion());
      onCleanup(() => this.practiceLayout.active.set(false));
    });
    effect((onCleanup) => {
      if (this.currentQuestion()) return;
      const timer = setTimeout(() => this.completionHeading?.nativeElement.focus(), 0);
      onCleanup(() => clearTimeout(timer));
    });
    effect((onCleanup) => {
      if (this.progress()?.feedback?.outcome !== 'correct') return;
      const timer = setTimeout(() => this.advance(), 600);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected submit(response: ItemResponse): void {
    const current = this.progress();
    if (!current || current.feedback || current.queue[0] !== response.itemId) return;
    const feedback: PracticeFeedback = {
      ...response,
      sessionId: this.practiceSessionId(),
    };
    const completedItemIds =
      response.outcome === 'correct'
        ? [...new Set([...current.completedItemIds, response.itemId])]
        : current.completedItemIds;
    this.save({ ...current, completedItemIds, feedback });
  }

  protected continue(): void {
    this.advance();
  }

  protected restart(): void {
    this.presentation.update((value) => value + 1);
    this.save({
      version: 1,
      queue: this.questions().map(({ item }) => item.id),
      completedItemIds: [],
      feedback: null,
    });
  }

  private advance(): void {
    const current = this.progress();
    const feedback = current?.feedback;
    if (!current || !feedback || !current.queue.length) return;
    const nextQueue = current.queue.slice(1);
    if (feedback.outcome !== 'correct') nextQueue.push(feedback.itemId);
    this.presentation.update((value) => value + 1);
    this.save({ ...current, queue: nextQueue, feedback: null });
  }

  private save(progress: PracticeProgress): void {
    this.storageError.set(
      writePracticeProgress(
        practiceProgressKey(this.learnerId(), this.chapterId(), this.sequence().id),
        progress,
      ),
    );
    this.progress.set(progress);
    this.progressChanged.emit(progress);
  }
}

export function flattenQuestions(sequence: Sequence): ExerciseQuestion[] {
  return sequence.contents.flatMap((content): ExerciseQuestion[] => {
    if (content.type !== 'activity' || !('items' in content)) return [];
    switch (content.kind) {
      case 'gap-fill':
        return content.items.map((item) => ({
          kind: 'gap-fill' as const,
          title: content.title,
          instructions: content.instructions,
          item,
        }));
      case 'translation':
        return content.items.map((item) => ({
          kind: 'translation' as const,
          title: content.title,
          instructions: content.instructions,
          item,
        }));
      case 'multiple-choice':
        return content.items.map((item) => ({
          kind: 'multiple-choice' as const,
          title: content.title,
          instructions: content.instructions,
          item,
        }));
      case 'word-order':
        return content.items.map((item) => ({
          kind: 'word-order' as const,
          title: content.title,
          instructions: content.instructions,
          item,
        }));
    }
  });
}

export function practiceItemIds(sequence: Sequence): Set<string> {
  return new Set(flattenQuestions(sequence).map(({ item }) => item.id));
}
