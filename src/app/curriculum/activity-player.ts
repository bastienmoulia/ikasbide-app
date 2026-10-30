import { Component, effect, input, output, signal } from '@angular/core';
import { BilingualText } from '../bilingual-text';
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
  template: `
    <span aria-hidden="true">{{ symbols[result()] }}</span>
    <app-bilingual-text [eu]="labels[result()].eu" [fr]="labels[result()].fr" />
  `,
})
class ActivityFeedback {
  readonly result = input.required<AttemptOutcome>();
  protected readonly symbols = {
    correct: '✓',
    almost: '≈',
    incorrect: '✕',
  };
  protected readonly labels = {
    correct: { eu: 'Zuzena.', fr: 'Correct.' },
    almost: { eu: 'Ia!', fr: 'Presque !' },
    incorrect: { eu: 'Saiatu berriro.', fr: 'Incorrect.' },
  };
}

@Component({
  selector: 'app-activity-player',
  imports: [ActivityFeedback, BilingualText],
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
          <form (submit)="grade(currentQuestion.item, $event)">
            <p class="prompt">
              <span lang="eu">{{ currentQuestion.item.prompt.eu.slice(0, blank) }}</span>
              @if (feedback(); as result) {
                <span class="answer" [attr.lang]="answerLang(currentQuestion, result.answer)">{{
                  result.answer
                }}</span>
              } @else {
                <label class="inline-answer">
                  <app-bilingual-text eu="Erantzuna" fr="Réponse" />
                  <input
                    type="text"
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
          <fieldset class="choices">
            <legend>
              <app-bilingual-text eu="Aukeratu erantzuna" fr="Choisissez une réponse" />
            </legend>
            @for (choice of currentQuestion.item.choices; track choice.id) {
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
                    (click)="selectWord($index, currentQuestion.item.words)"
                  >
                    <span lang="eu">{{ word }}</span>
                  </button>
                }
              }
            </div>
            <div class="word-actions">
              <button class="secondary" type="button" (click)="resetWords()">
                <app-bilingual-text eu="Hasi berriz" fr="Recommencer" />
              </button>
              <button type="button" (click)="grade(currentQuestion.item)" [disabled]="!canSubmit()">
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
          @if (feedback(); as result) {
            <p class="answer" [attr.lang]="answerLang(currentQuestion, result.answer)">
              {{ result.answer }}
            </p>
          } @else {
            <form (submit)="grade(currentQuestion.item, $event)">
              <label class="answer">
                <app-bilingual-text eu="Erantzuna" fr="Réponse" />
                <input
                  type="text"
                  [value]="answer()"
                  (input)="updateAnswer($event)"
                  autocomplete="off"
                />
              </label>
              <button type="submit" [disabled]="!canSubmit()">
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
  protected readonly canSubmit = () => this.answer().trim().length > 0;

  constructor() {
    effect(() => {
      this.question();
      this.feedback();
      this.answer.set('');
      this.selectedWords.set([]);
    });
  }

  protected updateAnswer(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.answer.set(target.value);
  }

  protected selectWord(wordIndex: number, words: string[]): void {
    this.selectedWords.update((indices) => [...indices, wordIndex]);
    this.answer.set(
      this.selectedWords()
        .map((index) => words[index])
        .join(' '),
    );
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
        : gradeFreeResponse(answer, item.acceptedAnswers);
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

function gradeFreeResponse(answer: string, acceptedAnswers: string[]): AttemptOutcome {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedAccepted = acceptedAnswers.map(normalizeAnswer);
  if (normalizedAccepted.includes(normalizedAnswer)) return 'correct';
  return normalizedAccepted.some((accepted) => isNearMatch(normalizedAnswer, accepted))
    ? 'almost'
    : 'incorrect';
}

function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\p{P}+$/gu, '')
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
