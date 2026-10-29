import { Component, computed, inject, input, resource } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { BilingualText } from '../bilingual-text';
import { chapterColor } from './chapter-color';
import {
  contentKindLabels,
  chapterNotPublishedMessage,
  loadFailedMessage,
  loadingMessage,
} from './content-labels';
import { CurriculumService } from './curriculum.service';

@Component({
  selector: 'app-sequence-page',
  imports: [BilingualText, MatProgressBarModule, RouterLink],
  styleUrls: ['./curriculum.css', './sequence-page.css'],
  host: { '[style.--chapter-accent]': 'accent()' },
  template: `
    <a class="back" [routerLink]="['/chapitres', chapterId()]">
      <app-bilingual-text eu="Kapitulura itzuli" fr="Retour au chapitre" />
    </a>
    @if (chapter.isLoading()) {
      <p id="sequence-loading" role="status">
        <app-bilingual-text [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="sequence-loading" />
    } @else if (chapter.error()) {
      <p role="alert">
        <app-bilingual-text [eu]="loadFailed.eu" [fr]="loadFailed.fr" />
      </p>
    } @else if (!chapter.value()) {
      <p role="alert">
        <app-bilingual-text [eu]="notPublished.eu" [fr]="notPublished.fr" />
      </p>
    } @else if (position(); as position) {
      @let chapter = position.chapter;
      @let sequence = position.sequence;
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
                  <ol class="items">
                    @switch (content.kind) {
                      @case ('gap-fill') {
                        @for (item of content.items; track item.id) {
                          <li>
                            <app-bilingual-text [eu]="item.prompt.eu" [fr]="item.prompt.fr" />
                          </li>
                        }
                      }
                      @case ('translation') {
                        @for (item of content.items; track item.id) {
                          <li class="stack">
                            @if (item.direction === 'eu-fr') {
                              <app-bilingual-text
                                class="muted"
                                eu="Euskaratik frantsesera"
                                fr="Du basque vers le français"
                              />
                              <span lang="eu">{{ item.source }}</span>
                            } @else {
                              <app-bilingual-text
                                class="muted"
                                eu="Frantsesetik euskarara"
                                fr="Du français vers le basque"
                              />
                              <span lang="fr">{{ item.source }}</span>
                            }
                          </li>
                        }
                      }
                      @case ('multiple-choice') {
                        @for (item of content.items; track item.id) {
                          <li class="stack">
                            <app-bilingual-text [eu]="item.prompt.eu" [fr]="item.prompt.fr" />
                            <span class="chips">
                              @for (choice of item.choices; track choice.id) {
                                <span class="chip" [lang]="choice.lang">{{ choice.text }}</span>
                              }
                            </span>
                          </li>
                        }
                      }
                      @case ('word-order') {
                        @for (item of content.items; track item.id) {
                          <li class="stack">
                            <app-bilingual-text [eu]="item.prompt.eu" [fr]="item.prompt.fr" />
                            <span class="chips">
                              @for (word of item.words; track $index) {
                                <span class="chip" lang="eu">{{ word }}</span>
                              }
                            </span>
                          </li>
                        }
                      }
                    }
                  </ol>
                  <p class="muted">
                    <app-bilingual-text
                      eu="Laster jarduera honi erantzun ahal izango diozu."
                      fr="Vous pourrez bientôt répondre à cette activité."
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
          </a>
        }
      </nav>
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
      previous: chapter.sequences[index - 1],
      next: chapter.sequences[index + 1],
    };
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  protected readonly kindLabels = contentKindLabels;
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly loadFailed = loadFailedMessage;
}
