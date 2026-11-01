import { Injectable, signal } from '@angular/core';
import type { Router } from '@angular/router';

export const defaultBookId = 'a1';
const currentBookStorageKey = 'ikasbide:current-book';

@Injectable({ providedIn: 'root' })
export class BookContext {
  readonly bookId = signal(defaultBookId);
  private hasCurrentBook = false;

  select(bookId: string): void {
    this.bookId.set(bookId);
    this.hasCurrentBook = true;
    try {
      sessionStorage.setItem(currentBookStorageKey, bookId);
    } catch (error) {
      console.warn('The current book could not be saved for this tab.', error);
    }
  }

  restore(router: Router): string {
    const state: unknown = router.getCurrentNavigation()?.extras.state ?? history.state;
    const navigationBookId =
      typeof state === 'object' &&
      state !== null &&
      'bookId' in state &&
      typeof state.bookId === 'string' &&
      state.bookId.length > 0
        ? state.bookId
        : null;
    let storedBookId: string | null = null;
    try {
      storedBookId = sessionStorage.getItem(currentBookStorageKey);
    } catch (error) {
      console.warn('The current book could not be restored for this tab.', error);
    }
    // A freshly opened window can receive a copy of its opener's session storage.
    const inheritedStorage = window.opener !== null && history.length === 1;
    const bookId =
      (this.hasCurrentBook ? this.bookId() : null) ||
      (inheritedStorage ? null : storedBookId) ||
      navigationBookId ||
      defaultBookId;
    this.select(bookId);
    return bookId;
  }
}
