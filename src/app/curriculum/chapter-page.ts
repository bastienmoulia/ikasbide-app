import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import { AttemptService, type RecordedAttempt } from './attempt.service';
import { chapterColor } from './chapter-color';
import { chapterNotPublishedMessage, loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';
import {
  objectiveProgress,
  objectiveStatusLabels,
  type ObjectiveStatus,
} from './objective-progress';

@Component({
  selector: 'app-chapter-page',
  imports: [BilingualText, Icon, MatProgressBarModule, RouterLink],
  styleUrls: ['./curriculum.css', './chapter-page.css'],
  host: { '[style.--chapter-accent]': 'accent()' },
  template: `
    <a class="back" routerLink="/">
      <app-icon name="previous" />
      <app-bilingual-text mode="stacked" eu="Ibilbidera itzuli" fr="Retour au parcours" />
    </a>
    @if (chapter.isLoading()) {
      <p id="chapter-loading" role="status">
        <app-bilingual-text mode="stacked" [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="chapter-loading" />
    } @else if (chapter.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text mode="stacked" [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (chapter.value(); as chapter) {
      <p class="eyebrow">
        <span class="chapter-marker" aria-hidden="true">{{ chapter.number }}</span>
        <app-bilingual-text
          mode="stacked"
          [eu]="chapter.number + '. kapitulua'"
          [fr]="'Chapitre ' + chapter.number"
        />
      </p>
      <h1>
        <app-bilingual-text mode="stacked" [eu]="chapter.title.eu" [fr]="chapter.title.fr" />
      </h1>
      <section aria-labelledby="objectives-heading">
        <h2 id="objectives-heading">
          <app-bilingual-text mode="stacked" eu="Aurrerapen-mapa" fr="Carte de progression" />
        </h2>
        <p class="muted">
          <app-bilingual-text
            mode="stacked"
            eu="Zure erantzunetatik ateratako estimazioa, ez nota bat. Helburu bat eskuratua da hiru item ezberdin ondo erantzun dituzunean, gutxienez bi saiotan."
            fr="Estimation tirée de vos réponses, pas une note. Un objectif est acquis quand trois items différents sont réussis, sur au moins deux sessions de pratique."
          />
        </p>
        @let statuses = progress();
        <ul class="objective-map">
          @for (objective of chapter.objectives; track objective.id) {
            @let status = statuses.get(objective.id) ?? 'to-discover';
            <li [class]="status">
              <span class="objective-stage" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
              <span class="stack">
                <strong>
                  <app-bilingual-text
                    mode="stacked"
                    [eu]="objective.label.eu"
                    [fr]="objective.label.fr"
                  />
                </strong>
                <span class="objective-status">
                  <app-bilingual-text
                    mode="stacked"
                    [eu]="statusLabels[status].eu"
                    [fr]="statusLabels[status].fr"
                  />
                </span>
              </span>
            </li>
          }
        </ul>
      </section>
      <section aria-labelledby="sequences-heading">
        <h2 id="sequences-heading">
          <app-bilingual-text mode="stacked" eu="Sekuentziak" fr="Séquences" />
        </h2>
        <p class="muted">
          <app-bilingual-text
            mode="stacked"
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
                  <app-bilingual-text
                    mode="stacked"
                    [eu]="sequence.title.eu"
                    [fr]="sequence.title.fr"
                  />
                </strong>
              </a>
            </li>
          }
        </ol>
      </section>
    } @else {
      <p role="alert">
        <app-bilingual-text mode="stacked" [eu]="notPublished.eu" [fr]="notPublished.fr" />
      </p>
    }
  `,
})
export class ChapterPage {
  readonly chapterId = input.required<string>();
  private readonly curriculum = inject(CurriculumService);
  private readonly auth = inject(AuthService);
  private readonly attempts = inject(AttemptService);
  protected readonly chapter = resource({
    params: () => this.chapterId(),
    loader: ({ params }) => this.curriculum.chapter(params),
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  private readonly chapterAttempts = signal<RecordedAttempt[]>([]);
  protected readonly progress = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter
      ? objectiveProgress(chapter, this.chapterAttempts())
      : new Map<string, ObjectiveStatus>();
  });
  protected readonly statusLabels = objectiveStatusLabels;
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;

  constructor() {
    effect((onCleanup) => {
      const learner = this.auth.user();
      const chapterId = this.chapterId();
      this.chapterAttempts.set([]);
      if (!learner) return;
      onCleanup(
        this.attempts.watchChapter(learner.uid, chapterId, (attempts) =>
          this.chapterAttempts.set(attempts),
        ),
      );
    });
  }
}
