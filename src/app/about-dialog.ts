import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import packageJson from '../../package.json';
import { BilingualText } from './bilingual-text';
import { ContentVersionService } from './curriculum/content-version.service';

@Component({
  imports: [BilingualText, MatButtonModule, MatDialogModule],
  selector: 'app-about-dialog',
  styleUrl: './about-dialog.css',
  template: `
    <h2 mat-dialog-title>
      <app-bilingual-text mode="stacked" eu="Honi buruz" fr="À propos" />
    </h2>
    <mat-dialog-content class="about-dialog-content">
      <h3>Ikasbide</h3>
      <p>
        <app-bilingual-text
          mode="stacked"
          eu="Ikasi, praktikatu, konfiantza hartu."
          fr="Apprendre, pratiquer, prendre confiance."
        />
      </p>
      <p class="about-dialog-version">
        <app-bilingual-text
          mode="stacked"
          eu="Aplikazioaren bertsioa"
          fr="Version de l’application"
        />
        <span>{{ version }}</span>
      </p>
      <p class="about-dialog-version">
        <app-bilingual-text mode="stacked" eu="Edukiaren bertsioa" fr="Version du contenu" />
        <span data-testid="content-version">{{ contentVersion() ?? '—' }}</span>
      </p>
      <a
        mat-button
        href="https://github.com/bastienmoulia/ikasbide-app"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub
      </a>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>
        <app-bilingual-text mode="stacked" eu="Itxi" fr="Fermer" />
      </button>
    </mat-dialog-actions>
  `,
})
export class AboutDialog {
  protected readonly version = packageJson.version;
  protected readonly contentVersion = signal<string | null>(null);

  constructor() {
    void inject(ContentVersionService)
      .version()
      .then((version) => this.contentVersion.set(version));
  }
}
