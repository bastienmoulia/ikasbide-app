import { Component, effect, ElementRef, inject, input } from '@angular/core';
import { BilingualText } from '../bilingual-text';
import { NetworkStatus } from '../network-status';
import {
  contentKindLabels,
  externalLinkNeedsNetworkMessage,
  externalLinkOfflineMessage,
} from './content-labels';
import type { ReadingContent } from './practice-steps';

@Component({
  selector: 'app-reading-player',
  imports: [BilingualText],
  styleUrls: ['./sequence-page.css'],
  styles: `
    :host {
      display: block;
      outline: none;
    }

    .reading-body {
      white-space: pre-line;
    }
  `,
  host: {
    tabindex: '-1',
    role: 'region',
    'aria-labelledby': 'reading-heading',
  },
  template: `
    @let reading = content();
    <article>
      <p class="kind">
        <app-bilingual-text [eu]="labels[reading.kind].eu" [fr]="labels[reading.kind].fr" />
      </p>
      <h2 id="reading-heading">
        <app-bilingual-text [eu]="reading.title.eu" [fr]="reading.title.fr" />
      </h2>
      @switch (reading.kind) {
        @case ('note') {
          <p>
            <app-bilingual-text
              class="reading-body"
              [eu]="reading.body.eu"
              [fr]="reading.body.fr"
            />
          </p>
        }
        @case ('dialogue') {
          <dl class="dialogue">
            @for (line of reading.lines; track $index) {
              <dt>{{ line.speaker }}</dt>
              <dd><app-bilingual-text [eu]="line.text.eu" [fr]="line.text.fr" /></dd>
            }
          </dl>
        }
        @case ('external-link') {
          <p>
            <app-bilingual-text [eu]="reading.description.eu" [fr]="reading.description.fr" />
          </p>
          <a [href]="reading.url" target="_blank" rel="noopener noreferrer">
            <app-bilingual-text
              [eu]="reading.title.eu + ' (kanpoko orria)'"
              [fr]="reading.title.fr + ' (page externe)'"
            />
          </a>
          <p>
            @let availability = network.online() ? needsNetwork : offline;
            <app-bilingual-text [eu]="availability.eu" [fr]="availability.fr" />
          </p>
        }
        @case ('oral-prompt') {
          <p>
            <app-bilingual-text [eu]="reading.instructions.eu" [fr]="reading.instructions.fr" />
          </p>
          <p>
            <app-bilingual-text
              eu="Nahi baduzu egiteko jarduera; ez da automatikoki zuzentzen."
              fr="Activité à faire si vous le souhaitez ; elle n’est pas corrigée automatiquement."
            />
          </p>
        }
      }
    </article>
  `,
})
export class ReadingPlayer {
  readonly content = input.required<ReadingContent>();
  protected readonly labels = contentKindLabels;
  protected readonly network = inject(NetworkStatus);
  protected readonly needsNetwork = externalLinkNeedsNetworkMessage;
  protected readonly offline = externalLinkOfflineMessage;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect((onCleanup) => {
      this.content();
      const timer = setTimeout(() => {
        this.element.nativeElement.focus();
        this.element.nativeElement.scrollIntoView({ block: 'start' });
      }, 0);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
