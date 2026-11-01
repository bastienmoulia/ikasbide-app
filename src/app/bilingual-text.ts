import { Component, effect, ElementRef, inject, input, Renderer2, signal } from '@angular/core';

@Component({
  selector: 'app-bilingual-text',
  styleUrl: './bilingual-text.css',
  host: {
    '[attr.data-mode]': 'mode()',
    '[attr.tabindex]': "mode() === 'reveal' ? 0 : null",
    '[class.is-revealed]': 'revealed()',
    '(pointerdown)': 'rememberPointer($event)',
    '(click)': 'toggleOnTouch()',
    '(pointerleave)': 'closeOnPointerLeave($event)',
  },
  template: `
    <span class="basque" lang="eu">{{ eu() }}</span>
    <span class="translation" lang="fr">{{ fr() }}</span>
  `,
})
export class BilingualText {
  readonly eu = input.required<string>();
  readonly fr = input.required<string>();
  readonly mode = input<'reveal' | 'stacked'>('reveal');
  protected readonly revealed = signal(false);
  private readonly renderer = inject(Renderer2);
  private lastPointerType: string | null = null;

  constructor() {
    effect((onCleanup) => {
      if (!this.revealed()) return;
      const unlisten = this.renderer.listen('document', 'pointerdown', (event: PointerEvent) =>
        this.closeOnOutsidePointer(event),
      );
      onCleanup(unlisten);
    });
  }

  protected rememberPointer(event: PointerEvent): void {
    if (this.mode() !== 'reveal') return;
    this.lastPointerType = event.pointerType;
  }

  protected toggleOnTouch(): void {
    if (this.mode() !== 'reveal' || this.lastPointerType !== 'touch') return;
    this.revealed.update((revealed) => !revealed);
    this.lastPointerType = null;
  }

  protected closeOnPointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'touch') this.revealed.set(false);
  }

  protected closeOnOutsidePointer(event: PointerEvent): void {
    if (!this.elementContains(event.target)) this.revealed.set(false);
  }

  private elementContains(target: EventTarget | null): boolean {
    return target instanceof Node && this.element.nativeElement.contains(target);
  }

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
}
