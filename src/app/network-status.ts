import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Tracks whether the browser reports a network connection. */
@Injectable({ providedIn: 'root' })
export class NetworkStatus {
  private readonly state = signal(navigator.onLine);
  readonly online = this.state.asReadonly();

  constructor() {
    const update = () => this.state.set(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    });
  }
}
