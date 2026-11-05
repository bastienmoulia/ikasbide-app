import { Injectable, signal } from '@angular/core';
import type { BilingualText } from './curriculum.model';

interface PracticeBookmark {
  chapterId: string;
  sequenceId: string;
}

@Injectable({ providedIn: 'root' })
export class PracticeBookmarkStore {
  readonly error = signal<BilingualText | null>(null);

  read(learnerId: string, bookId: string): PracticeBookmark | null {
    this.error.set(null);
    try {
      const stored = localStorage.getItem(this.key(learnerId, bookId));
      if (!stored) return null;
      const value: unknown = JSON.parse(stored);
      if (
        typeof value !== 'object' ||
        value === null ||
        !('chapterId' in value) ||
        typeof value.chapterId !== 'string' ||
        !value.chapterId ||
        !('sequenceId' in value) ||
        typeof value.sequenceId !== 'string' ||
        !value.sequenceId
      ) {
        throw new Error('Invalid practice bookmark.');
      }
      return { chapterId: value.chapterId, sequenceId: value.sequenceId };
    } catch (error) {
      console.warn('The last practice location could not be read.', error);
      this.error.set({
        eu: 'Ezin izan da azken sekuentzia irakurri. Kapituluetatik jarrai dezakezu.',
        fr: 'La dernière séquence n’a pas pu être retrouvée. Vous pouvez continuer depuis les chapitres.',
      });
      return null;
    }
  }

  remember(learnerId: string, bookId: string, bookmark: PracticeBookmark): void {
    try {
      localStorage.setItem(this.key(learnerId, bookId), JSON.stringify(bookmark));
      this.error.set(null);
    } catch (error) {
      console.warn('The last practice location could not be saved.', error);
      this.error.set({
        eu: 'Ezin izan da azken sekuentzia gailu honetan gorde.',
        fr: 'La dernière séquence n’a pas pu être mémorisée sur cet appareil.',
      });
    }
  }

  private key(learnerId: string, bookId: string): string {
    return `ikasbide:last-practice:v1:${encodeURIComponent(learnerId)}:${encodeURIComponent(bookId)}`;
  }
}
