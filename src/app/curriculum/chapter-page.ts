import { Component, computed, inject, input, resource } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { BilingualText } from '../bilingual-text';
import { chapterColor } from './chapter-color';
import { chapterNotPublishedMessage, loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';

@Component({
  selector: 'app-chapter-page',
  imports: [BilingualText, MatProgressBarModule, RouterLink],
  styleUrl: './curriculum.css',
  host: { '[style.--chapter-accent]': 'accent()' },
  template: `
    <a class="back" routerLink="/">
      <app-bilingual-text eu="Ibilbidera itzuli" fr="Retour au parcours" />
    </a>
    @if (chapter.isLoading()) {
      <p id="chapter-loading" role="status">
        <app-bilingual-text [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="chapter-loading" />
    } @else if (chapter.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (chapter.value(); as chapter) {
      <p class="eyebrow">
        <span class="chapter-marker" aria-hidden="true">{{ chapter.number }}</span>
        <app-bilingual-text
          [eu]="chapter.number + '. kapitulua'"
          [fr]="'Chapitre ' + chapter.number"
        />
      </p>
      <h1>
        <app-bilingual-text [eu]="chapter.title.eu" [fr]="chapter.title.fr" />
      </h1>
      <section aria-labelledby="objectives-heading">
        <h2 id="objectives-heading">
          <app-bilingual-text eu="Ikas-helburuak" fr="Objectifs d’apprentissage" />
        </h2>
        <ul>
          @for (objective of chapter.objectives; track objective.id) {
            <li>
              <app-bilingual-text [eu]="objective.label.eu" [fr]="objective.label.fr" />
            </li>
          }
        </ul>
      </section>
      <section aria-labelledby="sequences-heading">
        <h2 id="sequences-heading">
          <app-bilingual-text eu="Sekuentziak" fr="Séquences" />
        </h2>
        <p class="muted">
          <app-bilingual-text
            eu="Gomendatutako ordena. Sekuentzia guztiak beti daude eskuragarri."
            fr="Ordre recommandé. Toutes les séquences restent accessibles."
          />
        </p>
        <ol class="cards">
          @for (sequence of chapter.sequences; track sequence.id) {
            <li>
              <a [routerLink]="['/chapitres', chapter.id, 'sequences', sequence.id]">
                <span class="sequence-letter">{{ sequence.letter }}</span>
                <strong>
                  <app-bilingual-text [eu]="sequence.title.eu" [fr]="sequence.title.fr" />
                </strong>
              </a>
            </li>
          }
        </ol>
      </section>
    } @else {
      <p role="alert">
        <app-bilingual-text [eu]="notPublished.eu" [fr]="notPublished.fr" />
      </p>
    }
  `,
})
export class ChapterPage {
  readonly chapterId = input.required<string>();
  private readonly curriculum = inject(CurriculumService);
  protected readonly chapter = resource({
    params: () => this.chapterId(),
    loader: ({ params }) => this.curriculum.chapter(params),
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;
}
