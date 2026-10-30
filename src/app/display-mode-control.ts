import { Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { BilingualText } from './bilingual-text';
import { DisplayModeService, type DisplayMode } from './display-mode.service';
import { Icon } from './icon';

@Component({
  selector: 'app-display-mode-control',
  imports: [MatButtonToggleModule, BilingualText, Icon],
  styleUrl: './display-mode-control.css',
  template: `
    <mat-button-toggle-group
      aria-label="Bistaratzeko modua / Mode d’affichage"
      [hideSingleSelectionIndicator]="true"
      [value]="displayMode.mode()"
      (change)="displayMode.setMode($event.value)"
      (keydown.escape)="tooltip.set(null)"
    >
      @for (option of options; track option.value) {
        <span
          class="mode-option"
          (mouseenter)="tooltip.set(option.value)"
          (mouseleave)="tooltip.set(null)"
          (focusin)="tooltip.set(option.value)"
          (focusout)="tooltip.set(null)"
        >
          <mat-button-toggle [value]="option.value" [aria-label]="option.eu + ' ' + option.fr">
            <app-icon [name]="option.icon" />
          </mat-button-toggle>
          @if (tooltip() === option.value) {
            <span class="mode-tooltip" role="tooltip">
              <app-bilingual-text [eu]="option.eu" [fr]="option.fr" />
            </span>
          }
        </span>
      }
    </mat-button-toggle-group>
  `,
})
export class DisplayModeControl {
  protected readonly displayMode = inject(DisplayModeService);
  protected readonly tooltip = signal<DisplayMode | null>(null);
  protected readonly options = [
    { value: 'light', icon: 'sun', eu: 'Argia', fr: 'Clair' },
    { value: 'dark', icon: 'moon', eu: 'Iluna', fr: 'Sombre' },
    { value: 'system', icon: 'system', eu: 'Sistema', fr: 'Système' },
  ] as const;
}
