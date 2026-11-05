import { Component, computed, inject, resource } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { BookContext } from './book-context';
import { chapterColor } from './chapter-color';
import { bookNotPublishedMessage, loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';
import { PracticeBookmarkStore } from './practice-bookmark';

@Component({
  selector: 'app-curriculum-home',
  imports: [BilingualText, MatCardModule, MatProgressBarModule, RouterLink],
  styleUrls: ['./curriculum.css', './curriculum-home.css'],
  template: `
    <div class="home-intro">
      <p class="eyebrow">
        <app-bilingual-text mode="stacked" eu="Erronka laburrak" fr="Défis express" />
      </p>
      <h1>
        <app-bilingual-text mode="stacked" eu="Zure ibilbidea" fr="Votre parcours" />
      </h1>
      <p class="home-lead">
        <app-bilingual-text
          mode="stacked"
          eu="Euskara, zure erritmoan."
          fr="Le basque, à votre rythme."
        />
      </p>
    </div>
    @if (books.isLoading()) {
      <p id="curriculum-loading" role="status">
        <app-bilingual-text mode="stacked" [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="curriculum-loading" />
    } @else if (books.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text mode="stacked" [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (books.value()?.length) {
      @if (book(); as book) {
        <section class="practice-entry" aria-labelledby="practice-entry-heading">
          <div class="practice-entry-copy">
            <p class="entry-label">
              <app-bilingual-text mode="stacked" eu="Pausoz pauso" fr="Un pas après l’autre" />
            </p>
            <h2 id="practice-entry-heading">
              <app-bilingual-text
                mode="stacked"
                eu="Praktika pixka bat?"
                fr="Un peu de pratique ?"
              />
            </h2>
            @if (lastPractice.isLoading()) {
              <p role="status">
                <app-bilingual-text mode="stacked" [eu]="loading.eu" [fr]="loading.fr" />
              </p>
            } @else if (lastPractice.hasValue() && lastPractice.value(); as last) {
              <p class="last-sequence">
                <app-bilingual-text
                  mode="stacked"
                  [eu]="last.sequence.title.eu"
                  [fr]="last.sequence.title.fr"
                />
              </p>
              <a
                class="practice-action"
                [routerLink]="['/', book.id, last.chapterId, last.sequence.id]"
              >
                <app-bilingual-text mode="stacked" eu="Jarraitu" fr="Reprendre ma séquence" />
                <span aria-hidden="true">↗</span>
              </a>
            } @else if (book.chapters[0]; as firstChapter) {
              <p>
                <app-bilingual-text
                  mode="stacked"
                  eu="Aukeratu sekuentzia bat, eta hasi zure erritmoan."
                  fr="Choisissez une séquence et lancez-vous à votre rythme."
                />
              </p>
              <a class="practice-action" [routerLink]="['/', book.id, firstChapter.id]">
                <app-bilingual-text
                  mode="stacked"
                  eu="Hasi praktikatzen"
                  fr="Passer à la pratique"
                />
                <span aria-hidden="true">↗</span>
              </a>
            }
          </div>
        </section>
        @if (bookmarks.error(); as error) {
          <p role="alert">
            <app-bilingual-text mode="stacked" [eu]="error.eu" [fr]="error.fr" />
          </p>
        }
        @if (lastPractice.error(); as error) {
          @let message = errorMessage(error);
          <p role="alert">
            <app-bilingual-text mode="stacked" [eu]="message.eu" [fr]="message.fr" />
          </p>
        }
        <p class="muted browse-intro">
          <app-bilingual-text
            mode="stacked"
            eu="Jarraitu gomendatutako ordena edo ireki nahi duzun kapitulua."
            fr="Suivez l’ordre recommandé ou ouvrez le chapitre de votre choix."
          />
        </p>
        <section [attr.aria-labelledby]="'book-' + book.id">
          <h2 [id]="'book-' + book.id">
            @if (book.title.fr; as titleFr) {
              <app-bilingual-text mode="stacked" [eu]="book.title.eu" [fr]="titleFr" />
            } @else {
              <span lang="eu">{{ book.title.eu }}</span>
            }
          </h2>
          <ol class="cards">
            @for (chapter of book.chapters; track chapter.id) {
              <li [style.--chapter-accent]="color(chapter.number)">
                <a [routerLink]="['/', book.id, chapter.id]">
                  <span class="chapter-marker" aria-hidden="true">{{ chapter.number }}</span>
                  <span class="stack">
                    <app-bilingual-text
                      mode="stacked"
                      [eu]="chapter.number + '. kapitulua'"
                      [fr]="'Chapitre ' + chapter.number"
                    />
                    <strong>
                      <app-bilingual-text
                        mode="stacked"
                        [eu]="chapter.title.eu"
                        [fr]="chapter.title.fr"
                      />
                    </strong>
                  </span>
                </a>
              </li>
            }
          </ol>
        </section>
      } @else {
        <p role="alert">
          <app-bilingual-text
            mode="stacked"
            [eu]="bookNotPublished.eu"
            [fr]="bookNotPublished.fr"
          />
        </p>
      }
    } @else {
      <mat-card appearance="outlined">
        <mat-card-content>
          <h2>
            <app-bilingual-text
              mode="stacked"
              eu="Ibilbidea prestatzen ari gara"
              fr="Le parcours se prépare"
            />
          </h2>
          <p>
            <app-bilingual-text
              mode="stacked"
              eu="Oraindik ez dago argitaratutako kapitulurik."
              fr="Aucun chapitre publié pour le moment."
            />
          </p>
        </mat-card-content>
      </mat-card>
    }
  `,
})
export class CurriculumHome {
  private readonly curriculum = inject(CurriculumService);
  private readonly context = inject(BookContext);
  private readonly auth = inject(AuthService);
  protected readonly bookmarks = inject(PracticeBookmarkStore);
  protected readonly bookId = this.context.restore(inject(Router));
  protected readonly books = resource({ loader: () => this.curriculum.books() });
  protected readonly book = computed(() =>
    this.books.value()?.find(({ id }) => id === this.bookId),
  );
  protected readonly lastPractice = resource({
    params: () => {
      const book = this.books.hasValue() ? this.book() : null;
      const learner = this.auth.user();
      return book && learner ? { book, learnerId: learner.uid } : undefined;
    },
    loader: async ({ params }) => {
      const bookmark = this.bookmarks.read(params.learnerId, params.book.id);
      if (!bookmark || !params.book.chapters.some(({ id }) => id === bookmark.chapterId)) {
        return null;
      }
      const chapter = await this.curriculum.chapter(params.book.id, bookmark.chapterId);
      const sequence = chapter?.sequences.find(({ id }) => id === bookmark.sequenceId);
      return sequence ? { chapterId: bookmark.chapterId, sequence } : null;
    },
  });
  protected readonly color = chapterColor;
  protected readonly loading = loadingMessage;
  protected readonly bookNotPublished = bookNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;
}
