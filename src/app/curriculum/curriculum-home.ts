import { Component, inject, resource } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { BilingualText } from '../bilingual-text';
import { chapterColor } from './chapter-color';
import { loadErrorMessage, loadingMessage } from './content-labels';
import { CurriculumService } from './curriculum.service';

@Component({
  selector: 'app-curriculum-home',
  imports: [BilingualText, MatCardModule, MatProgressBarModule, RouterLink],
  styleUrl: './curriculum.css',
  template: `
    <p class="eyebrow">
      <app-bilingual-text
        mode="stacked"
        eu="Zure ikasteko gunea"
        fr="Votre espace d’apprentissage"
      />
    </p>
    <h1>
      <app-bilingual-text mode="stacked" eu="Zure ibilbidea" fr="Votre parcours" />
    </h1>
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
      <p class="muted">
        <app-bilingual-text
          mode="stacked"
          eu="Jarraitu gomendatutako ordena edo ireki nahi duzun kapitulua."
          fr="Suivez l’ordre recommandé ou ouvrez le chapitre de votre choix."
        />
      </p>
      @for (book of books.value()?.slice(0, 1); track book.id) {
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
                <a [routerLink]="['/chapitres', chapter.id]">
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
  protected readonly books = resource({ loader: () => this.curriculum.books() });
  protected readonly color = chapterColor;
  protected readonly loading = loadingMessage;
  protected readonly errorMessage = loadErrorMessage;
}
