import { DestroyRef, Injectable, signal } from '@angular/core';

export type DisplayMode = 'light' | 'dark' | 'system';

const storageKey = 'ikasbide.display-mode';

@Injectable({ providedIn: 'root' })
export class DisplayModeService {
  readonly mode = signal<DisplayMode>(this.readMode());
  readonly persistenceUnavailable = signal(false);

  private readonly darkPreference = window.matchMedia('(prefers-color-scheme: dark)');

  constructor(destroyRef: DestroyRef) {
    this.apply();
    const updateSystemMode = () => {
      if (this.mode() === 'system') this.apply();
    };
    this.darkPreference.addEventListener('change', updateSystemMode);
    destroyRef.onDestroy(() => this.darkPreference.removeEventListener('change', updateSystemMode));
  }

  setMode(mode: DisplayMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'system') {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, mode);
      }
      this.persistenceUnavailable.set(false);
    } catch {
      this.persistenceUnavailable.set(true);
    }
    this.apply();
  }

  private readMode(): DisplayMode {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(): void {
    const effectiveMode =
      this.mode() === 'system' ? (this.darkPreference.matches ? 'dark' : 'light') : this.mode();
    const root = document.documentElement;
    root.dataset['displayMode'] = effectiveMode;
    root.style.colorScheme = effectiveMode;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', effectiveMode);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', effectiveMode === 'dark' ? '#202124' : '#faf8f5');
  }
}
