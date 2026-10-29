import { Component, input, output, signal } from '@angular/core';
import { BilingualText } from '../bilingual-text';
import type { AttemptOutcome } from './attempt.service';
import type {
  Activity,
  GapFillItem,
  MultipleChoiceItem,
  TranslationItem,
  WordOrderItem,
} from './curriculum.model';

type ItemResult = AttemptOutcome;

export interface ItemAttempt {
  itemId: string;
  outcome: ItemResult;
}
type GradedItem = GapFillItem | TranslationItem | MultipleChoiceItem | WordOrderItem;

@Component({
  selector: 'app-activity-feedback',
  imports: [BilingualText],
  host: {
    role: 'status',
    '[attr.data-result]': 'result()',
  },
  template: ` <app-bilingual-text [eu]="labels[result()].eu" [fr]="labels[result()].fr" /> `,
})
class ActivityFeedback {
  readonly result = input.required<ItemResult>();
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
  template: `
    @let currentActivity = activity();
    @switch (currentActivity.kind) {
      @case ('gap-fill') {
        <ol class="items">
          @for (item of currentActivity.items; track item.id) {
            @let blank = item.prompt.eu.indexOf('___');
            <li class="item">
              <p class="prompt">
                <span lang="eu">{{ item.prompt.eu.slice(0, blank) }}</span>
                <label class="inline-answer">
                  <app-bilingual-text eu="Erantzuna" fr="Réponse" />
                  <input
                    type="text"
                    [value]="answers()[item.id] ?? ''"
                    (input)="updateAnswer(item.id, $event)"
                    autocomplete="off"
                  />
                </label>
                <span lang="eu">{{ item.prompt.eu.slice(blank + 3) }}</span>
              </p>
              <p class="prompt-translation" lang="fr">{{ item.prompt.fr }}</p>
              <button type="button" (click)="grade(item)">
                <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
              </button>
              @if (results()[item.id]; as result) {
                <app-activity-feedback [result]="result" />
              }
            </li>
          }
        </ol>
      }
      @case ('multiple-choice') {
        <ol class="items">
          @for (item of currentActivity.items; track item.id) {
            <li class="item">
              <app-bilingual-text [eu]="item.prompt.eu" [fr]="item.prompt.fr" />
              <fieldset class="choices">
                <legend>
                  <app-bilingual-text eu="Aukeratu erantzuna" fr="Choisissez une réponse" />
                </legend>
                @for (choice of item.choices; track choice.id) {
                  <label>
                    <input
                      type="radio"
                      [name]="item.id"
                      [value]="choice.id"
                      [checked]="answers()[item.id] === choice.id"
                      (change)="selectChoice(item.id, choice.id)"
                    />
                    <span [attr.lang]="choice.lang">{{ choice.text }}</span>
                  </label>
                }
              </fieldset>
              <button type="button" (click)="grade(item)">
                <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
              </button>
              @if (results()[item.id]; as result) {
                <app-activity-feedback [result]="result" />
              }
            </li>
          }
        </ol>
      }
      @case ('word-order') {
        <ol class="items">
          @for (item of currentActivity.items; track item.id) {
            <li class="item">
              <app-bilingual-text [eu]="item.prompt.eu" [fr]="item.prompt.fr" />
              <div class="word-answer" aria-label="Erantzuna / Réponse">
                @for (wordIndex of selectedWords()[item.id] ?? []; track $index) {
                  <button
                    class="word"
                    type="button"
                    (click)="removeWord(item.id, wordIndex, item.words)"
                  >
                    <span lang="eu">{{ item.words[wordIndex] }}</span>
                  </button>
                }
                @if (!(selectedWords()[item.id] ?? []).length) {
                  <app-bilingual-text
                    class="empty-answer"
                    eu="Hautatu hitzak erantzuna osatzeko."
                    fr="Choisissez les mots pour composer la réponse."
                  />
                }
              </div>
              <div class="word-bank">
                @for (word of item.words; track $index) {
                  @if (!(selectedWords()[item.id] ?? []).includes($index)) {
                    <button
                      class="word"
                      type="button"
                      (click)="selectWord(item.id, $index, item.words)"
                    >
                      <span lang="eu">{{ word }}</span>
                    </button>
                  }
                }
              </div>
              <div class="word-actions">
                <button class="secondary" type="button" (click)="resetWords(item.id)">
                  <app-bilingual-text eu="Hasi berriz" fr="Recommencer" />
                </button>
                <button type="button" (click)="grade(item)">
                  <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
                </button>
              </div>
              @if (results()[item.id]; as result) {
                <app-activity-feedback [result]="result" />
              }
            </li>
          }
        </ol>
      }
      @case ('translation') {
        <ol class="items">
          @for (item of currentActivity.items; track item.id) {
            <li class="item">
              <app-bilingual-text
                [eu]="
                  item.direction === 'eu-fr' ? 'Euskaratik frantsesera' : 'Frantsesetik euskarara'
                "
                [fr]="
                  item.direction === 'eu-fr'
                    ? 'Du basque vers le français'
                    : 'Du français vers le basque'
                "
              />
              <p class="source" [attr.lang]="item.direction === 'eu-fr' ? 'eu' : 'fr'">
                {{ item.source }}
              </p>
              <label class="answer">
                <app-bilingual-text eu="Erantzuna" fr="Réponse" />
                <input
                  type="text"
                  [value]="answers()[item.id] ?? ''"
                  (input)="updateAnswer(item.id, $event)"
                  autocomplete="off"
                />
              </label>
              <button type="button" (click)="grade(item)">
                <app-bilingual-text eu="Egiaztatu" fr="Vérifier" />
              </button>
              @if (results()[item.id]; as result) {
                <app-activity-feedback [result]="result" />
              }
            </li>
          }
        </ol>
      }
    }
  `,
})
export class ActivityPlayer {
  readonly activity = input.required<Activity>();
  /** Emitted each time an Item is corrected; the answer itself is never emitted. */
  readonly attempted = output<ItemAttempt>();
  protected readonly answers = signal<Record<string, string>>({});
  protected readonly results = signal<Record<string, ItemResult>>({});
  protected readonly selectedWords = signal<Record<string, number[]>>({});

  protected updateAnswer(itemId: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.answers.update((answers) => ({ ...answers, [itemId]: target.value }));
    this.results.update(({ [itemId]: _result, ...results }) => results);
  }

  protected selectChoice(itemId: string, choiceId: string): void {
    this.answers.update((answers) => ({ ...answers, [itemId]: choiceId }));
    this.results.update(({ [itemId]: _result, ...results }) => results);
  }

  protected selectWord(itemId: string, wordIndex: number, words: string[]): void {
    const indices = [...(this.selectedWords()[itemId] ?? []), wordIndex];
    this.setWordOrderAnswer(itemId, indices, words);
  }

  protected removeWord(itemId: string, wordIndex: number, words: string[]): void {
    const indices = (this.selectedWords()[itemId] ?? []).filter((index) => index !== wordIndex);
    this.setWordOrderAnswer(itemId, indices, words);
  }

  protected resetWords(itemId: string): void {
    this.selectedWords.update(({ [itemId]: _indices, ...selection }) => selection);
    this.answers.update(({ [itemId]: _answer, ...answers }) => answers);
    this.results.update(({ [itemId]: _result, ...results }) => results);
  }

  protected grade(item: GradedItem): void {
    // Editing an answer clears its result, so an existing result means the answer is unchanged.
    if (this.results()[item.id]) return;
    const answer = this.answers()[item.id] ?? '';
    const result =
      'correctChoiceIds' in item
        ? item.correctChoiceIds.includes(answer)
          ? 'correct'
          : 'incorrect'
        : gradeFreeResponse(answer, item.acceptedAnswers);
    this.results.update((results) => ({ ...results, [item.id]: result }));
    this.attempted.emit({ itemId: item.id, outcome: result });
  }

  private setWordOrderAnswer(itemId: string, indices: number[], words: string[]): void {
    this.selectedWords.update((selection) => ({ ...selection, [itemId]: indices }));
    this.answers.update((answers) => ({
      ...answers,
      [itemId]: indices.map((index) => words[index]).join(' '),
    }));
    this.results.update(({ [itemId]: _result, ...results }) => results);
  }
}

function gradeFreeResponse(answer: string, acceptedAnswers: string[]): ItemResult {
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
