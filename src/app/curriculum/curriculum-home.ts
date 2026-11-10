import { Component, computed, inject, resource } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { Icon } from '../icon';
import { BookContext } from './book-context';
import { chapterColor } from './chapter-color';
import { bookNotPublishedMessage, loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';
import { PracticeBookmarkStore } from './practice-bookmark';

@Component({
  selector: 'app-curriculum-home',
  imports: [BilingualText, Icon, MatCardModule, MatProgressBarModule, RouterLink],
  styleUrls: ['./curriculum.css', './curriculum-home.css'],
  template: `
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
        @if (lastPractice.isLoading()) {
          <p role="status">
            <app-bilingual-text mode="stacked" [eu]="loading.eu" [fr]="loading.fr" />
          </p>
        } @else if (lastPractice.hasValue() && lastPractice.value(); as last) {
          <a
            class="practice-action"
            [routerLink]="['/', book.id, last.chapterId, last.sequence.id]"
          >
            <app-bilingual-text mode="stacked" eu="Jarraitu" fr="Reprendre ma séquence" />
            <app-icon name="arrow-up-right" />
          </a>
        } @else if (book.chapters[0]; as firstChapter) {
          <a class="practice-action" [routerLink]="['/', book.id, firstChapter.id]">
            <app-bilingual-text mode="stacked" eu="Hasi praktikatzen" fr="Passer à la pratique" />
            <app-icon name="arrow-up-right" />
          </a>
        }
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
        <section [attr.aria-labelledby]="'book-' + book.id">
          <h1 [id]="'book-' + book.id">
            @if (book.title.fr; as titleFr) {
              <app-bilingual-text mode="stacked" [eu]="book.title.eu" [fr]="titleFr" />
            } @else {
              <span lang="eu">{{ book.title.eu }}</span>
            }
          </h1>
          <ol class="cards">
            @for (chapter of book.chapters; track chapter.id) {
              <li [style.--chapter-accent]="color(chapter.number)">
                <a [routerLink]="['/', book.id, chapter.id]">
                  <span
                    class="chapter-marker"
                    role="img"
                    [attr.aria-label]="chapter.number + '. kapitulua / Chapitre ' + chapter.number"
                    >{{ chapter.number }}</span
                  >
                  <strong>
                    <app-bilingual-text
                      mode="stacked"
                      [eu]="chapter.title.eu"
                      [fr]="chapter.title.fr"
                    />
                  </strong>
                  <app-icon class="list-arrow" name="arrow-up-right" />
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
  protected readonly loading = loadingMessage;
  protected readonly color = chapterColor;
  protected readonly bookNotPublished = bookNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;
}
