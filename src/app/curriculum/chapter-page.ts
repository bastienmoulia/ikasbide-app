import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import { AttemptService, type RecordedAttempt } from './attempt.service';
import { BookContext } from './book-context';
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
    <a class="back" routerLink="/" [state]="{ bookId: bookId() }">
      <app-icon name="previous" />
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
          <app-bilingual-text eu="Aurrerapen-mapa" fr="Carte de progression" />
        </h2>
        <p class="muted">
          <app-bilingual-text
            eu="Zure erantzunetatik ateratako estimazioa, ez nota bat. Helburu bat eskuratua da hiru item ezberdin ondo erantzun dituzunean, gutxienez bi saiotan."
            fr="Estimation tirée de vos réponses, pas une note. Un objectif est acquis quand trois items différents sont réussis, sur au moins deux sessions de pratique."
          />
        </p>
        @if (attempts.historyError(); as error) {
          <p role="alert">
            <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
          </p>
        } @else if (!chapterAttempts()) {
          <p role="status">
            <app-bilingual-text
              eu="Saiakeren historia kargatzen…"
              fr="Chargement de l’historique des tentatives…"
            />
          </p>
        } @else {
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
                    <app-bilingual-text [eu]="objective.label.eu" [fr]="objective.label.fr" />
                  </strong>
                  <span class="objective-status">
                    <app-bilingual-text
                      [eu]="statusLabels[status].eu"
                      [fr]="statusLabels[status].fr"
                    />
                  </span>
                </span>
              </li>
            }
          </ul>
        }
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
              <a [routerLink]="['/', bookId(), chapter.id, sequence.id]">
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
  readonly bookId = input.required<string>();
  readonly chapterId = input.required<string>();
  private readonly curriculum = inject(CurriculumService);
  private readonly auth = inject(AuthService);
  protected readonly attempts = inject(AttemptService);
  private readonly bookContext = inject(BookContext);
  protected readonly chapter = resource({
    params: () => ({ bookId: this.bookId(), chapterId: this.chapterId() }),
    loader: ({ params }) => this.curriculum.chapter(params.bookId, params.chapterId),
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  protected readonly chapterAttempts = signal<RecordedAttempt[] | null>(null);
  protected readonly progress = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter
      ? objectiveProgress(chapter, this.chapterAttempts() ?? [])
      : new Map<string, ObjectiveStatus>();
  });
  protected readonly statusLabels = objectiveStatusLabels;
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;

  constructor() {
    effect(() => this.bookContext.select(this.bookId()));
    effect((onCleanup) => {
      const learner = this.auth.user();
      const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
      this.chapterAttempts.set(null);
      if (!learner || !chapter) return;
      onCleanup(
        this.attempts.watchChapter(learner.uid, this.bookId(), chapter.id, (attempts) =>
          this.chapterAttempts.set(attempts),
        ),
      );
    });
  }
}
