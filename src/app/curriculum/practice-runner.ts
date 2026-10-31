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
import { Icon } from '../icon';
import { PracticeLayout } from '../practice-layout';
import { ActivityPlayer, type ExerciseQuestion, type ItemResponse } from './activity-player';
import type { Sequence } from './curriculum.model';
import {
  createPracticeProgress,
  type PracticeFeedback,
  type PracticeProgress,
  practiceProgressKey,
  writePracticeProgress,
} from './practice-progress';
import { advancePracticeStep, practiceSteps, withPracticeSteps } from './practice-steps';
import { ReadingPlayer } from './reading-player';

@Component({
  selector: 'app-practice-runner',
  imports: [ActivityPlayer, BilingualText, Icon, MatTooltipModule, RouterLink, ReadingPlayer],
  styleUrls: ['./practice-runner.css'],
  template: `
    @if (progress(); as state) {
      @if (displayedStep(); as step) {
        <section class="practice" aria-label="Ikasketa ibilbidea / Parcours de la séquence">
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
              {{ state.completedItemIds.length + visitedReadingCount() }} /
              {{ questions().length + readingCount() }}
            </p>
          </div>
          <progress
            [value]="questions().length ? state.completedItemIds.length : visitedReadingCount()"
            [max]="questions().length || readingCount()"
            [attr.aria-label]="
              questions().length
                ? 'Ariketen aurrerapena / Progression des exercices'
                : 'Irakurketaren aurrerapena / Progression des lectures'
            "
          ></progress>
          @for (presentation of presentedQuestions(); track presentation.key) {
            <app-activity-player
              [question]="presentation.question"
              [feedback]="state.feedback"
              [hidden]="reviewing()"
              (attempted)="submit($event)"
            />
          }
          @for (reading of presentedReadings(); track reading.key) {
            <app-reading-player [content]="reading.content" />
          }
          @if (reviewing() && step.kind === 'question') {
            <article class="question-review" tabindex="-1" #reviewHeading>
              <h2>
                <app-bilingual-text [eu]="step.question.title.eu" [fr]="step.question.title.fr" />
              </h2>
              <p>
                <app-bilingual-text
                  [eu]="step.question.instructions.eu"
                  [fr]="step.question.instructions.fr"
                />
              </p>
              @if (step.question.kind === 'translation') {
                <p [attr.lang]="step.question.item.direction === 'eu-fr' ? 'eu' : 'fr'">
                  {{ step.question.item.source }}
                </p>
              } @else {
                <p>
                  <app-bilingual-text
                    [eu]="step.question.item.prompt.eu"
                    [fr]="step.question.item.prompt.fr"
                  />
                </p>
              }
              <p>
                <app-bilingual-text
                  eu="Ariketa hau jada egin duzu. Berrikusteak ez du beste saiakerarik erregistratzen."
                  fr="Vous avez déjà répondu à cet exercice. La relecture n’enregistre aucune nouvelle tentative."
                />
              </p>
            </article>
          }
          <nav class="step-navigation" aria-label="Edukien nabigazioa / Navigation des contenus">
            @if (canGoBack()) {
              <button type="button" class="exit" (click)="previous()">
                <app-icon name="previous" />
                <app-bilingual-text eu="Aurrekoa" fr="Précédent" />
              </button>
            }
            @if (reviewing() || step.kind === 'reading') {
              <button type="button" class="continue" (click)="next()">
                <app-bilingual-text eu="Hurrengoa" fr="Suivant" />
                <app-icon name="next" />
              </button>
            }
            @if (!reviewing() && state.feedback && state.feedback.outcome !== 'correct') {
              <button type="button" class="continue" (click)="continue()">
                <app-bilingual-text eu="Jarraitu" fr="Continuer" />
                <app-icon name="next" />
              </button>
            }
          </nav>
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
              [eu]="state.completedItemIds.length + ' / ' + questions().length + ' ariketa'"
              [fr]="
                state.completedItemIds.length + ' / ' + questions().length + ' exercices réussis'
              "
            />
          </p>
          <progress
            [value]="questions().length ? state.completedItemIds.length : visitedReadingCount()"
            [max]="questions().length || readingCount()"
            [attr.aria-label]="
              questions().length
                ? 'Ariketen aurrerapena / Progression des exercices'
                : 'Irakurketaren aurrerapena / Progression des lectures'
            "
          ></progress>
          <p>
            <app-bilingual-text eu="Ibilbidea amaitu duzu." fr="Vous avez terminé le parcours." />
          </p>
          <p>
            <app-bilingual-text
              [eu]="visitedReadingCount() + ' / ' + readingCount() + ' irakurgai'"
              [fr]="
                visitedReadingCount() + ' / ' + readingCount() + ' lectures parcourues, sans score.'
              "
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
              <app-bilingual-text eu="Aurkibidera itzuli" fr="Revenir au sommaire" />
            </button>
            <button type="button" class="secondary" (click)="restart()">
              <app-icon name="restart" />
              <app-bilingual-text eu="Berriro hasi" fr="Recommencer" />
            </button>
            @if (canGoBack()) {
              <button type="button" class="secondary" (click)="previous()">
                <app-icon name="previous" />
                <app-bilingual-text eu="Berrikusi" fr="Relire le parcours" />
              </button>
            }
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
  protected readonly steps = computed(() => practiceSteps(this.sequence()));
  protected readonly readingCount = computed(
    () => this.steps().filter((step) => step.kind === 'reading').length,
  );
  protected readonly visitedReadingCount = computed(
    () => this.progress()?.journey?.visited.filter((id) => id.startsWith('content:')).length ?? 0,
  );
  protected readonly reviewing = computed(() => this.progress()?.journey?.reviewIndex != null);
  protected readonly currentStep = computed(
    () => this.steps().find(({ id }) => id === this.progress()?.journey?.queue[0]) ?? null,
  );
  protected readonly displayedStep = computed(() => {
    const journey = this.progress()?.journey;
    if (!journey) return null;
    const id =
      journey.reviewIndex === null ? journey.queue[0] : journey.visited[journey.reviewIndex];
    return this.steps().find((step) => step.id === id) ?? null;
  });
  protected readonly canGoBack = computed(() => {
    const journey = this.progress()?.journey;
    return (
      !!journey &&
      (journey.reviewIndex === null ? journey.visited.length > 0 : journey.reviewIndex > 0)
    );
  });
  protected readonly progress = signal<PracticeProgress | null>(null);
  protected readonly storageError = signal<{ eu: string; fr: string } | null>(null);
  private readonly presentation = signal(0);
  private readonly practiceLayout = inject(PracticeLayout);
  protected readonly currentQuestion = computed(() => {
    const step = this.currentStep();
    return step?.kind === 'question' ? step.question : null;
  });
  protected readonly presentedReadings = computed(() => {
    const step = this.displayedStep();
    return step?.kind === 'reading'
      ? [{ key: step.id + ':' + this.progress()?.journey?.reviewIndex, content: step.content }]
      : [];
  });
  private readonly feedback = computed(() => this.progress()?.feedback);
  protected readonly presentedQuestions = computed(() => {
    const question = this.currentQuestion();
    // Even a retry of the same item needs a fresh view, shuffle and focus.
    return question ? [{ key: question.item.id + ':' + this.presentation(), question }] : [];
  });
  @ViewChild('completionHeading', { read: ElementRef })
  private completionHeading?: ElementRef<HTMLElement>;
  @ViewChild('reviewHeading', { read: ElementRef })
  private reviewHeading?: ElementRef<HTMLElement>;
  @ViewChild(ActivityPlayer, { read: ElementRef })
  private activityElement?: ElementRef<HTMLElement>;

  constructor() {
    effect(() => {
      const progress = withPracticeSteps(this.initialProgress(), this.steps());
      this.progress.set(progress);
      this.storageError.set(this.initialStorageError());
      if (!this.initialProgress().journey) this.save(progress);
    });
    effect(() => {
      const feedback = this.feedback();
      if (feedback && feedback.outcome !== 'correct-with-warning') this.attempted.emit(feedback);
    });
    effect((onCleanup) => {
      this.practiceLayout.active.set(!!this.displayedStep());
      onCleanup(() => this.practiceLayout.active.set(false));
    });
    effect((onCleanup) => {
      const step = this.displayedStep();
      const reviewing = this.reviewing();
      if (step?.kind === 'reading') return;
      const timer = setTimeout(() => {
        const element = !step
          ? this.completionHeading?.nativeElement
          : reviewing
            ? this.reviewHeading?.nativeElement
            : (this.activityElement?.nativeElement.querySelector<HTMLElement>('input') ??
              this.activityElement?.nativeElement);
        element?.focus();
        element?.scrollIntoView({ block: 'start' });
      }, 0);
      onCleanup(() => clearTimeout(timer));
    });
    effect((onCleanup) => {
      if (this.reviewing() || this.feedback()?.outcome !== 'correct') return;
      const timer = setTimeout(() => this.advance(), 600);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected submit(response: ItemResponse): void {
    const current = this.progress();
    if (
      !current ||
      this.reviewing() ||
      current.feedback ||
      this.currentQuestion()?.item.id !== response.itemId
    )
      return;
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
    const feedback = this.progress()?.feedback;
    if (!feedback || this.reviewing()) return;
    if (feedback.outcome === 'correct-with-warning') this.attempted.emit(feedback);
    this.advance();
  }

  protected restart(): void {
    this.presentation.update((value) => value + 1);
    this.save(
      withPracticeSteps(
        createPracticeProgress(this.questions().map(({ item }) => item.id)),
        this.steps(),
      ),
    );
  }

  protected previous(): void {
    const current = this.progress();
    const journey = current?.journey;
    if (!current || !journey || !this.canGoBack()) return;
    this.save({
      ...current,
      journey: {
        ...journey,
        reviewIndex:
          journey.reviewIndex === null ? journey.visited.length - 1 : journey.reviewIndex - 1,
      },
    });
  }

  protected next(): void {
    const current = this.progress();
    const journey = current?.journey;
    if (!current || !journey) return;
    if (journey.reviewIndex !== null) {
      const index = journey.reviewIndex + 1;
      this.save({
        ...current,
        journey: { ...journey, reviewIndex: index < journey.visited.length ? index : null },
      });
    } else if (this.currentStep()?.kind === 'reading') {
      this.advance();
    }
  }

  private advance(): void {
    const current = this.progress();
    if (!current) return;
    const next = advancePracticeStep(current);
    if (next === current) return;
    this.presentation.update((value) => value + 1);
    this.save(next);
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
  return practiceSteps(sequence).flatMap((step) =>
    step.kind === 'question' ? [step.question] : [],
  );
}

export function practiceItemIds(sequence: Sequence): Set<string> {
  return new Set(flattenQuestions(sequence).map(({ item }) => item.id));
}
