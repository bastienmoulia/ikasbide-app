import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  resource,
  signal,
  ViewChild,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import { PracticeLayout } from '../practice-layout';
import {
  ActivityPlayer,
  ExerciseHint,
  type ExerciseQuestion,
  type ItemResponse,
} from './activity-player';
import type { Sequence } from './curriculum.model';
import {
  createPracticeProgress,
  type PracticeFeedback,
  type PracticeProgress,
  practiceProgressKey,
  writePracticeProgress,
} from './practice-progress';
import {
  advancePracticeStep,
  practiceSteps,
  skipPracticeStep,
  withPracticeSteps,
} from './practice-steps';
import { ReadingPlayer } from './reading-player';
import { prepareVocabularyImages } from './vocabulary-images';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-practice-runner',
  imports: [
    ActivityPlayer,
    BilingualText,
    ExerciseHint,
    Icon,
    MatTooltipModule,
    RouterLink,
    ReadingPlayer,
  ],
  styleUrls: ['./practice-runner.css'],
  template: `
    @if (images.isLoading()) {
      <p role="status">
        <app-bilingual-text mode="stacked" eu="Irudiak prestatzen…" fr="Préparation des images…" />
      </p>
    } @else if (images.error()) {
      <p role="alert">
        <app-bilingual-text
          mode="stacked"
          eu="Ezin izan dira irudiak prestatu."
          fr="Impossible de préparer les images."
        />
      </p>
      <button type="button" (click)="images.reload()">
        <app-bilingual-text mode="stacked" eu="Berriz saiatu" fr="Réessayer" />
      </button>
    } @else if (progress(); as state) {
      @if (images.value()?.cacheUnavailable) {
        <p role="alert">
          <app-bilingual-text
            mode="stacked"
            eu="Irudiak ezin dira gailu honetan gorde; konexioa beharko duzu."
            fr="Les images ne peuvent pas être conservées sur cet appareil ; une connexion sera nécessaire."
          />
        </p>
      }
      @if (unavailableCount()) {
        <p class="image-availability" role="status">
          <app-bilingual-text
            mode="stacked"
            [eu]="
              availableCount() +
              ' galdera erabilgarri · ' +
              unavailableCount() +
              ' irudirik gabe. Ibilbidea osatu gabe geratuko da.'
            "
            [fr]="
              availableCount() +
              ' questions disponibles · ' +
              unavailableCount() +
              ' sans image. Le parcours restera incomplet.'
            "
          />
        </p>
      }
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
              <span
                role="img"
                [attr.aria-label]="
                  state.journey.visited.length +
                  state.skippedStepIds.length +
                  ' / ' +
                  steps().length +
                  ' urrats / étapes'
                "
              >
                {{ state.journey.visited.length + state.skippedStepIds.length }} /
                {{ steps().length }}
              </span>
              <span
                class="success-count"
                role="img"
                [attr.aria-label]="
                  state.completedItemIds.length +
                  ' ariketa gaindituta / ' +
                  state.completedItemIds.length +
                  (state.completedItemIds.length === 1 ? ' exercice réussi' : ' exercices réussis')
                "
                matTooltip="Ariketa gaindituak / Exercices réussis"
              >
                <app-icon name="check" />
                {{ state.completedItemIds.length }}
              </span>
            </p>
          </div>
          <progress
            [value]="state.journey.visited.length + state.skippedStepIds.length"
            [max]="steps().length"
            aria-label="Ibilbidearen aurrerapena / Progression du parcours"
          ></progress>
          @for (presentation of presentedQuestions(); track presentation.key) {
            <app-activity-player
              [question]="presentation.question"
              [feedback]="state.feedback"
              [imageUrl]="imageUrl(presentation.question)"
              (imageFailed)="markImageUnavailable(presentation.question)"
              [hidden]="reviewing()"
              [(hintOpen)]="hintOpen"
              (attempted)="submit($event)"
            />
          }
          @if (memo(); as content) {
            <details class="practice-memo" [open]="memoOpen()" (toggle)="toggleMemo($event)">
              <summary>
                <app-bilingual-text
                  mode="stacked"
                  [eu]="'Oroigarria · ' + content.title.eu"
                  [fr]="'Mémo · ' + content.title.fr"
                />
              </summary>
              @if (memoOpen()) {
                <app-reading-player
                  class="memo-reading"
                  [content]="content"
                  [focusOnLoad]="false"
                />
              }
            </details>
          }
          @for (reading of presentedReadings(); track reading.key) {
            <app-reading-player [content]="reading.content" />
          }
          @if (reviewing() && step.kind === 'question') {
            <article class="question-review" tabindex="-1" #reviewHeading>
              <h2>
                <app-bilingual-text
                  mode="stacked"
                  [eu]="step.question.title.eu"
                  [fr]="step.question.title.fr"
                />
              </h2>
              <p>
                <app-bilingual-text
                  mode="reveal"
                  [eu]="step.question.instructions.eu"
                  [fr]="step.question.instructions.fr"
                />
              </p>
              @if (step.question.kind === 'translation') {
                <p [attr.lang]="step.question.item.direction === 'eu-fr' ? 'eu' : 'fr'">
                  {{ step.question.item.source }}
                </p>
              } @else if (step.question.kind === 'matching') {
                <ul>
                  @for (pair of step.question.item.pairs; track $index) {
                    <li><app-bilingual-text mode="stacked" [eu]="pair.eu" [fr]="pair.fr" /></li>
                  }
                </ul>
              } @else if (
                step.question.kind === 'image-choice' || step.question.kind === 'image-write'
              ) {
                <app-bilingual-text
                  mode="stacked"
                  [eu]="step.question.item.word.eu"
                  [fr]="step.question.item.word.fr"
                />
              } @else {
                <p>
                  <app-bilingual-text
                    mode="stacked"
                    [eu]="step.question.item.prompt.eu"
                    [fr]="step.question.item.prompt.fr"
                  />
                </p>
              }
              @if (step.question.item.hint?.length) {
                <app-exercise-hint
                  [lines]="step.question.item.hint!"
                  [open]="hintOpen()"
                  (toggled)="hintOpen.set(!hintOpen())"
                />
              }
              <p>
                <app-bilingual-text
                  mode="stacked"
                  eu="Ariketa hau jada egin duzu. Berrikusteak ez du beste saiakerarik erregistratzen."
                  fr="Vous avez déjà répondu à cet exercice. La relecture n’enregistre aucune nouvelle tentative."
                />
              </p>
            </article>
          }
          @if (
            !reviewing() &&
            !isIllustrated(currentQuestion()) &&
            (state.feedback?.outcome === 'incorrect' || state.feedback?.outcome === 'almost')
          ) {
            <button type="button" class="exit retry" (click)="retry()">
              <app-icon name="restart" />
              <app-bilingual-text mode="stacked" eu="Berriz saiatu" fr="Réessayer" />
            </button>
          }
          <nav class="step-navigation" aria-label="Edukien nabigazioa / Navigation des contenus">
            @if (canGoBack()) {
              <button type="button" class="exit" (click)="previous()">
                <app-icon name="previous" />
                <app-bilingual-text mode="stacked" eu="Aurrekoa" fr="Précédent" />
              </button>
            }
            @if (reviewing() || step.kind === 'reading') {
              <button type="button" class="continue" (click)="next()">
                <app-bilingual-text mode="stacked" eu="Hurrengoa" fr="Suivant" />
                <app-icon name="next" />
              </button>
            }
            @if (
              !reviewing() &&
              step.kind === 'question' &&
              !state.feedback &&
              !isIllustrated(step.question)
            ) {
              <button type="button" class="continue" (click)="skip()">
                <app-bilingual-text mode="stacked" eu="Saltatu" fr="Passer cette étape" />
                <app-icon name="next" />
              </button>
            }
            @if (
              !reviewing() &&
              state.feedback &&
              (state.feedback.outcome !== 'correct' ||
                currentQuestion()?.kind === 'word-order' ||
                isIllustrated(currentQuestion()))
            ) {
              <button type="button" class="continue" (click)="continue()">
                <app-bilingual-text mode="stacked" eu="Jarraitu" fr="Continuer" />
                <app-icon name="next" />
              </button>
            }
          </nav>
          @if (storageError(); as error) {
            <p role="alert">
              <app-bilingual-text mode="stacked" [eu]="error.eu" [fr]="error.fr" />
            </p>
          }
        </section>
      } @else if (state.journey.queue.length) {
        <section class="partial-practice">
          <h2>
            <app-bilingual-text mode="stacked" eu="Ibilbidea osatu gabe" fr="Parcours incomplet" />
          </h2>
          <p role="status">
            <app-bilingual-text
              mode="stacked"
              eu="Irudi batzuk falta dira. Zure erantzunak gordeta daude; konektatu falta diren galderekin jarraitzeko."
              fr="Certaines images sont indisponibles. Vos réponses sont conservées ; reconnectez-vous pour reprendre les questions manquantes."
            />
          </p>
          <button type="button" (click)="images.reload()">
            <app-bilingual-text mode="stacked" eu="Berriz saiatu" fr="Réessayer" />
          </button>
          <button type="button" (click)="exit.emit()">
            <app-bilingual-text mode="stacked" eu="Utzi oraingoz" fr="Arrêter pour le moment" />
          </button>
        </section>
      } @else {
        <section class="completion" aria-labelledby="completion-heading">
          <h2 id="completion-heading" tabindex="-1" #completionHeading>
            <app-bilingual-text mode="stacked" eu="Oso ondo!" fr="Bravo !" />
          </h2>
          <p class="progress-label">
            <span
              class="success-count"
              role="img"
              [attr.aria-label]="
                state.completedItemIds.length +
                ' / ' +
                questions().length +
                ' ariketa gaindituta / ' +
                state.completedItemIds.length +
                ' / ' +
                questions().length +
                (state.completedItemIds.length === 1 ? ' exercice réussi' : ' exercices réussis')
              "
              matTooltip="Ariketa gaindituak / Exercices réussis"
            >
              <app-icon name="check" />
              {{ state.completedItemIds.length }} / {{ questions().length }}
            </span>
          </p>
          <progress
            [value]="state.journey.visited.length + state.skippedStepIds.length"
            [max]="steps().length"
            aria-label="Ibilbidearen aurrerapena / Progression du parcours"
          ></progress>
          <p>
            <app-bilingual-text
              mode="stacked"
              [eu]="visitedReadingCount() + ' / ' + readingCount() + ' irakurgai'"
              [fr]="
                visitedReadingCount() + ' / ' + readingCount() + ' lectures parcourues, sans score.'
              "
            />
          </p>
          <p>
            <app-bilingual-text
              mode="stacked"
              [eu]="state.incorrectItemIds.length + ' ariketa berrikusteko'"
              [fr]="state.incorrectItemIds.length + ' exercices à revoir'"
            />
          </p>
          <p>
            <app-bilingual-text
              mode="stacked"
              [eu]="state.skippedStepIds.length + ' urrats saltatuta'"
              [fr]="state.skippedStepIds.length + ' étapes ignorées'"
            />
          </p>
          <nav class="completion-actions">
            @if (nextSequenceId(); as nextId) {
              <a [routerLink]="['/', bookId(), chapterId(), nextId]">
                <app-bilingual-text
                  mode="stacked"
                  eu="Hurrengo sekuentzia"
                  fr="Séquence suivante"
                />
                <app-icon name="next" />
              </a>
            } @else {
              <a [routerLink]="['/', bookId(), chapterId()]">
                <app-icon name="previous" />
                <app-bilingual-text mode="stacked" eu="Itzuli kapitulura" fr="Retour au chapitre" />
              </a>
            }
            <button type="button" class="secondary" (click)="exit.emit()">
              <app-icon name="previous" />
              <app-bilingual-text mode="stacked" eu="Aurkibidera itzuli" fr="Revenir au sommaire" />
            </button>
            <button type="button" class="secondary" (click)="restart()">
              <app-icon name="restart" />
              <app-bilingual-text mode="stacked" eu="Berriro hasi" fr="Recommencer" />
            </button>
            @if (canGoBack()) {
              <button type="button" class="secondary" (click)="previous()">
                <app-icon name="previous" />
                <app-bilingual-text mode="stacked" eu="Berrikusi" fr="Relire le parcours" />
              </button>
            }
          </nav>
          @if (storageError(); as error) {
            <p role="alert">
              <app-bilingual-text mode="stacked" [eu]="error.eu" [fr]="error.fr" />
            </p>
          }
        </section>
      }
    }
  `,
})
export class PracticeRunner {
  private readonly auth = inject(AuthService);
  readonly sequence = input.required<Sequence>();
  readonly bookId = input.required<string>();
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
  protected readonly images = resource({
    params: () =>
      this.steps().flatMap((step) =>
        step.kind === 'question' && 'image' in step.question.item ? [step.question.item.image] : [],
      ),
    loader: async ({ params, abortSignal }) => {
      const prepared = await prepareVocabularyImages(params, abortSignal, async () => {
        const user = this.auth.user();
        if (!user) throw new Error('Sign-in is required to download illustrations.');
        return user.getIdToken();
      });
      abortSignal.addEventListener('abort', () => prepared.release(), { once: true });
      return prepared;
    },
  });
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());
  protected readonly unavailableCount = computed(
    () =>
      this.steps().filter(
        (step) => this.progress()?.journey.queue.includes(step.id) && !this.stepAvailable(step),
      ).length,
  );
  protected readonly availableCount = computed(
    () =>
      this.steps().filter(
        (step) =>
          step.kind === 'question' &&
          this.progress()?.journey.queue.includes(step.id) &&
          this.stepAvailable(step),
      ).length,
  );
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
    const state = this.progress();
    const journey = state?.journey;
    if (!journey) return null;
    const id =
      journey.reviewIndex === null ? journey.queue[0] : journey.visited[journey.reviewIndex];
    const step = this.steps().find((step) => step.id === id);
    return step && (journey.reviewIndex !== null || state?.feedback || this.stepAvailable(step))
      ? step
      : null;
  });
  protected readonly canGoBack = computed(() => {
    const journey = this.progress()?.journey;
    return (
      !!journey &&
      (journey.reviewIndex === null ? journey.visited.length > 0 : journey.reviewIndex > 0)
    );
  });
  protected readonly memo = computed(() => {
    const step = this.displayedStep();
    if (step?.kind !== 'question') return null;
    const steps = this.steps();
    const previous = steps.slice(
      0,
      steps.findIndex(({ id }) => id === step.id),
    );
    const isResource = (candidate: (typeof steps)[number]) =>
      candidate.kind === 'reading' && candidate.content.type === 'resource';
    const reading = previous.reverse().find(isResource) ?? steps.find(isResource);
    return reading?.kind === 'reading' ? reading.content : null;
  });
  protected readonly memoOpen = signal(false);
  protected readonly progress = signal<PracticeProgress | null>(null);
  protected readonly storageError = signal<{ eu: string; fr: string } | null>(null);
  private readonly presentation = signal(0);
  protected readonly hintOpen = signal(false);
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
    effect((onCleanup) => {
      const prepared = this.images.value();
      this.failedImages.set(new Set());
      if (prepared) onCleanup(() => prepared.release());
    });
    effect(() => {
      const progress = withPracticeSteps(this.initialProgress(), this.steps());
      this.progress.set(progress);
      this.storageError.set(this.initialStorageError());
      if (progress !== this.initialProgress()) this.save(progress);
    });
    effect(() => {
      if (this.images.isLoading() || !this.images.hasValue()) return;
      const current = this.progress();
      if (!current || current.feedback) return;
      const available = new Set(
        this.steps()
          .filter((step) => this.stepAvailable(step))
          .map(({ id }) => id),
      );
      const queue = [
        ...current.journey.queue.filter((id) => available.has(id)),
        ...current.journey.queue.filter((id) => !available.has(id)),
      ];
      if (queue.some((id, index) => id !== current.journey.queue[index])) {
        this.save({
          ...current,
          queue: queue.filter((id) => id.startsWith('item:')).map((id) => id.slice(5)),
          journey: { ...current.journey, queue },
        });
      }
    });
    effect(() => {
      const feedback = this.feedback();
      if (feedback && feedback.outcome !== 'correct-with-warning') this.attempted.emit(feedback);
    });
    effect(() => {
      this.displayedStep();
      this.reviewing();
      this.hintOpen.set(false);
      this.memoOpen.set(false);
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
      if (
        this.reviewing() ||
        this.feedback()?.outcome !== 'correct' ||
        this.currentQuestion()?.kind === 'word-order' ||
        this.isIllustrated(this.currentQuestion())
      )
        return;
      const timer = setTimeout(() => this.advance(), 600);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected isIllustrated(question: ExerciseQuestion | null): boolean {
    return question?.kind === 'image-choice' || question?.kind === 'image-write';
  }

  protected imageUrl(question: ExerciseQuestion): string | null {
    return 'image' in question.item
      ? (this.images.value()?.urls.get(question.item.image.sha256) ?? null)
      : null;
  }

  private stepAvailable(step: ReturnType<typeof practiceSteps>[number]): boolean {
    if (step.kind !== 'question' || !('image' in step.question.item)) return true;
    const sha = step.question.item.image.sha256;
    return !this.failedImages().has(sha) && !!this.images.value()?.urls.has(sha);
  }

  protected markImageUnavailable(question: ExerciseQuestion): void {
    if (!('image' in question.item)) return;
    const sha = question.item.image.sha256;
    console.error('Prepared vocabulary image could not be displayed.', sha);
    this.failedImages.update((failed) => new Set([...failed, sha]));
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
    this.save({ ...current, feedback });
  }

  protected toggleMemo(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) {
      this.memoOpen.set(event.target.open);
    }
  }

  protected retry(): void {
    const current = this.progress();
    if (
      !current ||
      this.reviewing() ||
      (current.feedback?.outcome !== 'incorrect' && current.feedback?.outcome !== 'almost')
    )
      return;
    this.presentation.update((value) => value + 1);
    this.save({ ...current, feedback: null });
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

  protected skip(): void {
    const current = this.progress();
    if (!current) return;
    const next = skipPracticeStep(current);
    if (next !== current) this.save(next);
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
        practiceProgressKey(this.learnerId(), this.bookId(), this.chapterId(), this.sequence().id),
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
