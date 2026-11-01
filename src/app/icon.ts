import { Component, input } from '@angular/core';

const paths = {
  previous: 'm15 18-6-6 6-6',
  next: 'm9 6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  restart: 'M3 10a9 9 0 1 1 1 7M3 4v6h6',
  play: 'm8 5 11 7-11 7Z',
  hint: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4m0-15.6-1.4 1.4M5.6 18.4l-1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  system: 'M3 4h18v13H3Zm5 17h8m-4-4v4',
} as const;

export type IconName = keyof typeof paths;

@Component({
  selector: 'app-icon',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: 1.5rem;
      height: 1.5rem;
      vertical-align: middle;
    }
    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  template: `<svg viewBox="0 0 24 24" focusable="false"><path [attr.d]="paths[name()]" /></svg>`,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly paths = paths;
}
