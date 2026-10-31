import { Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DisplayModeService } from './display-mode.service';
import { Icon } from './icon';

@Component({
  selector: 'app-display-mode-control',
  imports: [MatButtonToggleModule, MatTooltipModule, Icon],
  styleUrl: './display-mode-control.css',
  template: `
    <mat-button-toggle-group
      aria-label="Bistaratzeko modua / Mode d’affichage"
      [hideSingleSelectionIndicator]="true"
      [value]="displayMode.mode()"
      (change)="displayMode.setMode($event.value)"
    >
      @for (option of options; track option.value) {
        <mat-button-toggle
          [value]="option.value"
          [aria-label]="option.eu + ' ' + option.fr"
          [matTooltip]="
            option.eu +
            '
' +
            option.fr
          "
          matTooltipClass="display-mode-tooltip"
          matTooltipPosition="below"
        >
          <app-icon [name]="option.icon" />
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
})
export class DisplayModeControl {
  protected readonly displayMode = inject(DisplayModeService);
  protected readonly options = [
    { value: 'light', icon: 'sun', eu: 'Argia', fr: 'Clair' },
    { value: 'dark', icon: 'moon', eu: 'Iluna', fr: 'Sombre' },
    { value: 'system', icon: 'system', eu: 'Sistema', fr: 'Système' },
  ] as const;
}
