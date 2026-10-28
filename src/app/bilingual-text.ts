import { Component, input } from '@angular/core';

@Component({
  selector: 'app-bilingual-text',
  styleUrl: './bilingual-text.css',
  template: `
    <span lang="eu">{{ eu() }}</span>
    <span class="translation" lang="fr">{{ fr() }}</span>
  `,
})
export class BilingualText {
  readonly eu = input.required<string>();
  readonly fr = input.required<string>();
}
