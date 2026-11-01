import { Injectable, signal } from '@angular/core';
import { loadFirestore } from '../firestore';
import type { ItemAttempt } from './activity-player';
import type { BilingualText } from './curriculum.model';
import { legacyChapterOwner } from './legacy-chapter-owner';

export type AttemptOutcome = 'correct' | 'correct-with-warning' | 'almost' | 'incorrect';

/** A corrected response, without the submitted answer. */
export interface Attempt extends ItemAttempt {
  bookId: string;
  chapterId: string;
  /** Practice session in which the Item was answered (ADR 0004). */
  sessionId: string;
  /** Stable local identifiers let a restored response safely retry its immutable write. */
  attemptId?: string;
  occurredAt?: number;
}

/** Stored attempt evidence; `pending` while it is only queued on this device. */
export interface RecordedAttempt extends Pick<Attempt, 'itemId' | 'outcome' | 'sessionId'> {
  pending: boolean;
}

export interface AttemptSummary {
  synced: number;
  pending: number;
}

export const attemptNotSavedMessage: BilingualText = {
  eu: 'Saiakera bat ezin izan da gorde. Egiaztatu konexioa eta erantzun berriro.',
  fr: 'Une tentative n’a pas pu être enregistrée. Vérifiez votre connexion puis répondez à nouveau.',
};

const attemptHistoryUnavailableMessage: BilingualText = {
  eu: 'Ezin izan da saiakeren historia kargatu.',
  fr: 'Impossible de charger l’historique des tentatives.',
};

/**
 * Keeps the learner's attempt evidence in `learners/{uid}/attempts`. Writes go through
 * Firestore's persistent queue, so attempts made offline survive reloads and are sent once
 * the connection returns; the client-generated document id makes resends idempotent.
 */
@Injectable({ providedIn: 'root' })
export class AttemptService {
  readonly error = signal<BilingualText | null>(null);
  readonly historyError = signal<BilingualText | null>(null);

  async record(learnerId: string, attempt: Attempt): Promise<void> {
    try {
      const { db, sdk } = await loadFirestore();
      const ref = sdk.doc(
        db,
        'learners',
        learnerId,
        'attempts',
        attempt.attemptId ?? crypto.randomUUID(),
      );
      // Resolves only once the server confirms; the write is already queued locally.
      await sdk.setDoc(ref, {
        bookId: attempt.bookId,
        chapterId: attempt.chapterId,
        itemId: attempt.itemId,
        outcome: attempt.outcome,
        sessionId: attempt.sessionId,
        occurredAt: attempt.occurredAt
          ? sdk.Timestamp.fromMillis(attempt.occurredAt)
          : sdk.Timestamp.now(),
      });
    } catch (error) {
      console.error('Attempt could not be saved.', error);
      this.error.set(attemptNotSavedMessage);
    }
  }

  /** Follows how many attempts on the given Items are synchronized or still queued. */
  watch(
    learnerId: string,
    bookId: string,
    chapterId: string,
    itemIds: ReadonlySet<string>,
    onSummary: (summary: AttemptSummary) => void,
  ): () => void {
    return this.watchChapter(learnerId, bookId, chapterId, (attempts) => {
      const summary = { synced: 0, pending: 0 };
      for (const attempt of attempts) {
        if (!itemIds.has(attempt.itemId)) continue;
        if (attempt.pending) summary.pending += 1;
        else summary.synced += 1;
      }
      onSummary(summary);
    });
  }

  /** Follows every attempt of the chapter, including those still queued on this device. */
  watchChapter(
    learnerId: string,
    bookId: string,
    chapterId: string,
    onAttempts: (attempts: RecordedAttempt[]) => void,
  ): () => void {
    let stopped = false;
    let unsubscribe = () => {};
    this.historyError.set(null);
    const reportWatchError = (error: unknown) => {
      if (stopped) return;
      console.error('Attempt history could not be followed.', error);
      this.historyError.set(attemptHistoryUnavailableMessage);
    };
    void loadFirestore()
      .then(async (connection) => {
        const owner = await legacyChapterOwner(connection, chapterId);
        if (stopped) return;
        const { db, sdk } = connection;
        const attempts = sdk.query(
          sdk.collection(db, 'learners', learnerId, 'attempts'),
          sdk.where('chapterId', '==', chapterId),
        );
        unsubscribe = sdk.onSnapshot(
          attempts,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (stopped) return;
            this.historyError.set(null);
            const matching = snapshot.docs.filter((attempt) => {
              const attemptBookId: unknown = attempt.get('bookId');
              return attemptBookId === bookId || (attemptBookId === undefined && owner === bookId);
            });
            onAttempts(
              matching.map((attempt) => ({
                itemId: attempt.get('itemId'),
                outcome: attempt.get('outcome'),
                sessionId: attempt.get('sessionId'),
                pending: attempt.metadata.hasPendingWrites,
              })),
            );
          },
          reportWatchError,
        );
      })
      .catch(reportWatchError);
    return () => {
      stopped = true;
      unsubscribe();
    };
  }
}
