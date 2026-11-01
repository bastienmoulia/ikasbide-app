import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import type { AttemptOutcome } from './attempt.service';
import type {
  GapFillActivity,
  GapFillItem,
  MultipleChoiceActivity,
  MultipleChoiceItem,
  TranslationActivity,
  TranslationItem,
  WordOrderActivity,
  WordOrderItem,
  BilingualText as BilingualTextValue,
} from './curriculum.model';
import type { PracticeFeedback } from './practice-progress';

type GradedActivity =
  GapFillActivity | TranslationActivity | MultipleChoiceActivity | WordOrderActivity;

export type ExerciseQuestion =
  | {
      kind: 'gap-fill';
      title: BilingualTextValue;
      instructions: BilingualTextValue;
      item: GapFillItem;
    }
  | {
      kind: 'translation';
      title: BilingualTextValue;
      instructions: BilingualTextValue;
      item: TranslationItem;
    }
  | {
      kind: 'multiple-choice';
      title: BilingualTextValue;
      instructions: BilingualTextValue;
      item: MultipleChoiceItem;
    }
  | {
      kind: 'word-order';
      title: BilingualTextValue;
      instructions: BilingualTextValue;
      item: WordOrderItem;
    };

export interface ItemAttempt {
  itemId: string;
  outcome: AttemptOutcome;
}

export interface ItemResponse {
  itemId: string;
  outcome: AttemptOutcome;
  answer: string;
  attemptId: string;
  occurredAt: number;
}

@Component({
  selector: 'app-activity-feedback',
  imports: [BilingualText],
  host: {
    role: 'status',
    '[attr.data-result]': 'result()',
  },
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1.5rem minmax(0, 1fr);
      align-items: start;
      gap: 0.6rem;
    }

    .feedback-icon {
      text-align: center;
    }
  `,
  template: `
    <span class="feedback-icon" aria-hidden="true">{{ symbols[result()] }}</span>
    <app-bilingual-text [eu]="labels[result()].eu" [fr]="labels[result()].fr" />
  `,
})
class ActivityFeedback {
  readonly result = input.required<AttemptOutcome>();
  protected readonly symbols = {
    correct: '✓',
    'correct-with-warning': '⚠',
    almost: '≈',
    incorrect: '✕',
  };
  protected readonly labels = {
    correct: { eu: 'Zuzena.', fr: 'Correct.' },
    'correct-with-warning': {
      eu: 'Erantzuna onartua da, baina beste bat espero zen.',
      fr: 'Réponse acceptée, mais une autre était attendue.',
    },
    almost: { eu: 'Ia!', fr: 'Presque !' },
    incorrect: { eu: 'Saiatu berriro.', fr: 'Incorrect.' },
  };
}

@Component({
  selector: 'app-exercise-hint',
  imports: [BilingualText, Icon],
  styles: `
    :host {
      display: grid;
      justify-items: start;
      gap: 0.5rem;
    }

    .hint-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0.4rem 0.8rem;
      border: 1px solid var(--app-border-strong);
      border-radius: 0.6rem;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .hint-toggle[aria-expanded='true'] {
      border-color: var(--chapter-accent);
    }

    .hint-toggle:focus-visible {
      outline: 3px solid var(--chapter-accent);
      outline-offset: 3px;
    }

    .hint-panel {
      display: grid;
      gap: 0.5rem;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 0.75rem 1rem;
      border-left: 4px solid var(--chapter-accent);
      border-radius: 0.65rem;
      background: var(--app-surface-muted);
      list-style: none;
    }
  `,
  template: `
    <button
      type="button"
      class="hint-toggle"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      (click)="toggled.emit()"
    >
      <app-icon name="hint" />
      <app-bilingual-text eu="Laguntza" fr="Aide" />
    </button>
    @if (open()) {
      <ul class="hint-panel" [id]="panelId">
        @for (line of lines(); track $index) {
          <li><app-bilingual-text [eu]="line.eu" [fr]="line.fr" /></li>
        }
      </ul>
    }
  `,
})
export class ExerciseHint {
  readonly lines = input.required<BilingualTextValue[]>();
  readonly open = input.required<boolean>();
  readonly toggled = output<void>();
  protected readonly panelId = 'exercise-hint';
}

@Component({
  selector: 'app-activity-player',
  imports: [ActivityFeedback, BilingualText, ExerciseHint, Icon],
  styleUrls: ['./activity-player.css'],
  host: {
    role: 'region',
    tabindex: '-1',
    '[attr.aria-labelledby]': "'exercise-heading'",
  },
  template: `
    @let currentQuestion = question();
    <article class="exercise-item">
      <h2 id="exercise-heading">
        <app-bilingual-text [eu]="currentQuestion.title.eu" [fr]="currentQuestion.title.fr" />
      </h2>
      <p class="instructions">
        <app-bilingual-text
          [eu]="currentQuestion.instructions.eu"
          [fr]="currentQuestion.instructions.fr"
        />
      </p>
      @switch (currentQuestion.kind) {
        @case ('gap-fill') {
          @let blank = currentQuestion.item.prompt.eu.indexOf('___');
          @if (currentQuestion.item.hint?.length) {
            <app-exercise-hint
              [lines]="currentQuestion.item.hint!"
              [open]="hintOpen()"
              (toggled)="toggleHint()"
            />
          }
          <form autocomplete="off" (submit)="grade(currentQuestion.item, $event)">
            <p class="prompt">
              <span lang="eu">{{ currentQuestion.item.prompt.eu.slice(0, blank) }}</span>
              @if (feedback(); as result) {
                <span
                  class="gap-answer"
                  [class.answer-error]="
                    result.outcome === 'incorrect' || result.outcome === 'almost'
                  "
                  [attr.lang]="answerLang(currentQuestion, result.answer)"
                  >{{ result.answer }}</span
                >
              } @else {
                <label class="inline-answer">
                  <app-bilingual-text class="visually-hidden" eu="Erantzuna" fr="Réponse" />
                  <input
                    #answerInput
                    type="text"
                    name="exercise-answer"
                    [value]="answer()"
                    (input)="updateAnswer($event)"
                    autocomplete="off"
                  />
                </label>
              }
              <span lang="eu">{{ currentQuestion.item.prompt.eu.slice(blank + 3) }}</span>
            </p>
            <p class="prompt-translation" lang="fr">{{ currentQuestion.item.prompt.fr }}</p>
            @if (!feedback()) {
              <button type="submit" [disabled]="!canSubmit()">
                <app-icon name="check" />
                <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
              </button>
            }
          </form>
        }
        @case ('multiple-choice') {
          <app-bilingual-text
            [eu]="currentQuestion.item.prompt.eu"
            [fr]="currentQuestion.item.prompt.fr"
          />
          @if (currentQuestion.item.hint?.length) {
            <app-exercise-hint
              [lines]="currentQuestion.item.hint!"
              [open]="hintOpen()"
              (toggled)="toggleHint()"
            />
          }
          <fieldset class="choices">
            <legend>
              <app-bilingual-text eu="Aukeratu erantzuna" fr="Choisissez une réponse" />
            </legend>
            @for (choice of choices(); track choice.id) {
              <button
                type="button"
                class="choice"
                (click)="gradeChoice(currentQuestion.item, choice.id)"
                [disabled]="!!feedback()"
                [attr.aria-pressed]="feedback()?.answer === choice.id"
              >
                <span [attr.lang]="choice.lang">{{ choice.text }}</span>
              </button>
            }
          </fieldset>
        }
        @case ('word-order') {
          <app-bilingual-text
            [eu]="currentQuestion.item.prompt.eu"
            [fr]="currentQuestion.item.prompt.fr"
          />
          @if (currentQuestion.item.hint?.length) {
            <app-exercise-hint
              [lines]="currentQuestion.item.hint!"
              [open]="hintOpen()"
              (toggled)="toggleHint()"
            />
          }
          @if (feedback(); as result) {
            <p class="answer" [attr.lang]="answerLang(currentQuestion, result.answer)">
              {{ result.answer }}
            </p>
          } @else {
            <div class="word-answer" aria-label="Erantzuna / Réponse">
              @for (wordIndex of selectedWords(); track $index) {
                <button
                  class="word"
                  type="button"
                  (click)="removeWord(wordIndex, currentQuestion.item.words)"
                >
                  <span lang="eu">{{ currentQuestion.item.words[wordIndex] }}</span>
                </button>
              }
              @if (!selectedWords().length) {
                <app-bilingual-text
                  class="empty-answer"
                  eu="Hautatu hitzak erantzuna osatzeko."
                  fr="Choisissez les mots pour composer la réponse."
                />
              }
            </div>
            <div class="word-bank">
              @for (word of currentQuestion.item.words; track $index) {
                @if (!selectedWords().includes($index)) {
                  <button
                    class="word"
                    type="button"
                    (click)="selectWord($index, currentQuestion.item.words, $event)"
                  >
                    <span lang="eu">{{ word }}</span>
                  </button>
                }
              }
            </div>
            <div class="word-actions">
              <button class="secondary" type="button" (click)="resetWords()">
                <app-icon name="restart" />
                <app-bilingual-text eu="Hasi berriz" fr="Recommencer" />
              </button>
              <button
                #wordSubmitButton
                type="button"
                (click)="grade(currentQuestion.item)"
                [disabled]="!canSubmit()"
              >
                <app-icon name="check" />
                <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
              </button>
            </div>
          }
        }
        @case ('translation') {
          <app-bilingual-text
            [eu]="
              currentQuestion.item.direction === 'eu-fr'
                ? 'Euskaratik frantsesera'
                : 'Frantsesetik euskarara'
            "
            [fr]="
              currentQuestion.item.direction === 'eu-fr'
                ? 'Du basque vers le français'
                : 'Du français vers le basque'
            "
          />
          <p class="source" [attr.lang]="currentQuestion.item.direction === 'eu-fr' ? 'eu' : 'fr'">
            {{ currentQuestion.item.source }}
          </p>
          @if (currentQuestion.item.hint?.length) {
            <app-exercise-hint
              [lines]="currentQuestion.item.hint!"
              [open]="hintOpen()"
              (toggled)="toggleHint()"
            />
          }
          @if (feedback(); as result) {
            <p class="answer" [attr.lang]="answerLang(currentQuestion, result.answer)">
              {{ result.answer }}
            </p>
          } @else {
            <form autocomplete="off" (submit)="grade(currentQuestion.item, $event)">
              <label class="answer">
                <app-bilingual-text class="visually-hidden" eu="Erantzuna" fr="Réponse" />
                <input
                  #answerInput
                  type="text"
                  name="exercise-answer"
                  [value]="answer()"
                  (input)="updateAnswer($event)"
                  autocomplete="off"
                />
              </label>
              <button type="submit" [disabled]="!canSubmit()">
                <app-icon name="check" />
                <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
              </button>
            </form>
          }
        }
      }
      @if (feedback(); as result) {
        <app-activity-feedback [result]="result.outcome" />
        @if (result.outcome !== 'correct') {
          <p class="correction">
            <strong><app-bilingual-text eu="Erantzun zuzena" fr="Réponse attendue" /></strong>
            <span [attr.lang]="answerLang(currentQuestion)">{{
              correctAnswer(currentQuestion)
            }}</span>
          </p>
        }
      }
    </article>
  `,
})
export class ActivityPlayer {
  readonly question = input.required<ExerciseQuestion>();
  readonly feedback = input<PracticeFeedback | null>(null);
  readonly attempted = output<ItemResponse>();
  protected readonly answer = signal('');
  protected readonly selectedWords = signal<number[]>([]);
  readonly hintOpen = model(false);
  protected readonly canSubmit = () => this.answer().trim().length > 0;
  protected readonly choices = computed(() => {
    const question = this.question();
    if (question.kind !== 'multiple-choice') return [];
    const choices = [...question.item.choices];
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [choices[index], choices[other]] = [choices[other], choices[index]];
    }
    return choices;
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  @ViewChild('answerInput', { read: ElementRef })
  private answerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('wordSubmitButton', { read: ElementRef })
  private wordSubmitButton?: ElementRef<HTMLButtonElement>;

  constructor() {
    afterNextRender(() => {
      (this.answerInput?.nativeElement ?? this.host.nativeElement).focus();
    });
    effect(() => {
      this.question();
      this.feedback();
      this.answer.set('');
      this.selectedWords.set([]);
    });
    effect(() => {
      this.question();
      this.hintOpen.set(false);
    });
  }

  protected toggleHint(): void {
    this.hintOpen.update((open) => !open);
  }

  protected updateAnswer(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.answer.set(target.value);
  }

  protected selectWord(wordIndex: number, words: string[], event: MouseEvent): void {
    this.selectedWords.update((indices) => [...indices, wordIndex]);
    this.answer.set(
      this.selectedWords()
        .map((index) => words[index])
        .join(' '),
    );
    if (event.detail === 0 && this.selectedWords().length === words.length) {
      this.wordSubmitButton?.nativeElement.focus();
    }
  }

  protected removeWord(wordIndex: number, words: string[]): void {
    this.selectedWords.update((indices) => indices.filter((index) => index !== wordIndex));
    this.answer.set(
      this.selectedWords()
        .map((index) => words[index])
        .join(' '),
    );
  }

  protected resetWords(): void {
    this.selectedWords.set([]);
    this.answer.set('');
  }

  protected gradeChoice(item: MultipleChoiceItem, choiceId: string): void {
    this.answer.set(choiceId);
    this.grade(item);
  }

  protected grade(item: ExerciseQuestion['item'], event?: Event): void {
    event?.preventDefault();
    if (this.feedback() || !this.canSubmit()) return;
    const answer = this.answer();
    const outcome =
      'correctChoiceIds' in item
        ? item.correctChoiceIds.includes(answer)
          ? 'correct'
          : 'incorrect'
        : gradeFreeResponse(answer, item.acceptedAnswers, item.warningAnswers);
    this.attempted.emit({
      itemId: item.id,
      outcome,
      answer,
      attemptId: crypto.randomUUID(),
      occurredAt: Date.now(),
    });
  }

  protected correctAnswer(question: ExerciseQuestion): string {
    if (question.kind === 'multiple-choice') {
      return question.item.choices
        .filter(({ id }) => question.item.correctChoiceIds.includes(id))
        .map(({ text }) => text)
        .join(' / ');
    }
    return question.item.acceptedAnswers[0] ?? '';
  }

  protected answerLang(question: ExerciseQuestion, answer?: string): 'eu' | 'fr' {
    if (question.kind === 'translation') return question.item.direction === 'eu-fr' ? 'fr' : 'eu';
    if (question.kind === 'multiple-choice') {
      const choice = question.item.choices.find(({ id }) =>
        answer ? id === answer : question.item.correctChoiceIds.includes(id),
      );
      return choice?.lang ?? 'eu';
    }
    return 'eu';
  }
}

function gradeFreeResponse(
  answer: string,
  acceptedAnswers: string[],
  warningAnswers: string[] = [],
): AttemptOutcome {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedAccepted = acceptedAnswers.map(normalizeAnswer);
  if (normalizedAccepted.includes(normalizedAnswer)) return 'correct';
  if (warningAnswers.map(normalizeAnswer).includes(normalizedAnswer)) return 'correct-with-warning';
  if (
    normalizedAccepted.some(
      (accepted) =>
        accepted.replace(/(?<![\p{L}\p{N}_])zara(?![\p{L}\p{N}_])/gu, 'zira') === normalizedAnswer,
    )
  ) {
    return 'correct-with-warning';
  }
  return normalizedAccepted.some((accepted) => isNearMatch(normalizedAnswer, accepted))
    ? 'almost'
    : 'incorrect';
}

function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[’]/gu, "'")
    .replace(/[‐‑]/gu, '-')
    .replace(/\p{P}/gu, (punctuation) =>
      punctuation === "'" || punctuation === '-' ? punctuation : ' ',
    )
    .replace(/\s+/gu, ' ')
    .trim();
}

function isNearMatch(answer: string, accepted: string): boolean {
  const answerCharacters = Array.from(answer);
  const acceptedCharacters = Array.from(accepted);
  if (
    answerCharacters.length !== acceptedCharacters.length ||
    answerCharacters.length < 5 ||
    !/^\p{L}+$/u.test(answer) ||
    !/^\p{L}+$/u.test(accepted)
  ) {
    return false;
  }

  for (let index = 0; index < acceptedCharacters.length - 3; index += 1) {
    if (
      acceptedCharacters[index] === acceptedCharacters[index + 1] ||
      !/^\p{L}$/u.test(acceptedCharacters[index]) ||
      !/^\p{L}$/u.test(acceptedCharacters[index + 1]) ||
      answerCharacters[index] !== acceptedCharacters[index + 1] ||
      answerCharacters[index + 1] !== acceptedCharacters[index]
    ) {
      continue;
    }
    if (
      answerCharacters.slice(0, index).join('') === acceptedCharacters.slice(0, index).join('') &&
      answerCharacters.slice(index + 2).join('') === acceptedCharacters.slice(index + 2).join('')
    ) {
      return true;
    }
  }
  return false;
}
