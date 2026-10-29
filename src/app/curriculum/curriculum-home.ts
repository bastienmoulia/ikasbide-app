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
      <app-bilingual-text eu="Zure ikasteko gunea" fr="Votre espace d’apprentissage" />
    </p>
    <h1>
      <app-bilingual-text eu="Zure ibilbidea" fr="Votre parcours" />
    </h1>
    @if (units.isLoading()) {
      <p id="curriculum-loading" role="status">
        <app-bilingual-text [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="curriculum-loading" />
    } @else if (units.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (units.value()?.length) {
      <p class="muted">
        <app-bilingual-text
          eu="Jarraitu gomendatutako ordena edo ireki nahi duzun kapitulua."
          fr="Suivez l’ordre recommandé ou ouvrez le chapitre de votre choix."
        />
      </p>
      @for (unit of units.value(); track unit.id) {
        <section [attr.aria-labelledby]="'unit-' + unit.id">
          <h2 [id]="'unit-' + unit.id" class="stack">
            <app-bilingual-text [eu]="unit.number + '. unitatea'" [fr]="'Unité ' + unit.number" />
            <app-bilingual-text [eu]="unit.title.eu" [fr]="unit.title.fr" />
          </h2>
          <ol class="cards">
            @for (chapter of unit.chapters; track chapter.id) {
              <li [style.--chapter-accent]="color(chapter.number)">
                <a [routerLink]="['/chapitres', chapter.id]">
                  <span class="chapter-marker" aria-hidden="true">{{ chapter.number }}</span>
                  <span class="stack">
                    <app-bilingual-text
                      [eu]="chapter.number + '. kapitulua'"
                      [fr]="'Chapitre ' + chapter.number"
                    />
                    <strong>
                      <app-bilingual-text [eu]="chapter.title.eu" [fr]="chapter.title.fr" />
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
            <app-bilingual-text eu="Ibilbidea prestatzen ari gara" fr="Le parcours se prépare" />
          </h2>
          <p>
            <app-bilingual-text
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
  protected readonly units = resource({ loader: () => this.curriculum.units() });
  protected readonly color = chapterColor;
  protected readonly loading = loadingMessage;
  protected readonly errorMessage = loadErrorMessage;
}
