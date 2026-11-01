import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import packageJson from '../../package.json';
import { BilingualText } from './bilingual-text';

@Component({
  imports: [BilingualText, MatButtonModule, MatDialogModule],
  selector: 'app-about-dialog',
  styleUrl: './about-dialog.css',
  template: `
    <h2 mat-dialog-title>
      <app-bilingual-text eu="Honi buruz" fr="À propos" />
    </h2>
    <mat-dialog-content class="about-dialog-content">
      <h3>Ikasbide</h3>
      <p>
        <app-bilingual-text
          eu="Ikasi, praktikatu, konfiantza hartu."
          fr="Apprendre, pratiquer, prendre confiance."
        />
      </p>
      <p class="about-dialog-version">
        <app-bilingual-text eu="Bertsioa" fr="Version" />
        <span>{{ version }}</span>
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
        <app-bilingual-text eu="Itxi" fr="Fermer" />
      </button>
    </mat-dialog-actions>
  `,
})
export class AboutDialog {
  protected readonly version = packageJson.version;
}
