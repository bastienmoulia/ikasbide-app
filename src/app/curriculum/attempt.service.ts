import { Injectable, signal } from '@angular/core';
import { loadFirestore } from '../firestore';
import type { ItemAttempt } from './activity-player';
import type { BilingualText } from './curriculum.model';

export type AttemptOutcome = 'correct' | 'almost' | 'incorrect';

/** A corrected response, without the submitted answer. */
export interface Attempt extends ItemAttempt {
  chapterId: string;
  /** Practice session in which the Item was answered (ADR 0004). */
  sessionId: string;
}

export interface AttemptSummary {
  synced: number;
  pending: number;
}

export const attemptNotSavedMessage: BilingualText = {
  eu: 'Saiakera bat ezin izan da gorde. Egiaztatu konexioa eta erantzun berriro.',
  fr: 'Une tentative n’a pas pu être enregistrée. Vérifiez votre connexion puis répondez à nouveau.',
};

/**
 * Keeps the learner's attempt evidence in `learners/{uid}/attempts`. Writes go through
 * Firestore's persistent queue, so attempts made offline survive reloads and are sent once
 * the connection returns; the client-generated document id makes resends idempotent.
 */
@Injectable({ providedIn: 'root' })
export class AttemptService {
  readonly error = signal<BilingualText | null>(null);

  async record(learnerId: string, attempt: Attempt): Promise<void> {
    try {
      const { db, sdk } = await loadFirestore();
      const ref = sdk.doc(db, 'learners', learnerId, 'attempts', crypto.randomUUID());
      // Resolves only once the server confirms; the write is already queued locally.
      await sdk.setDoc(ref, { ...attempt, occurredAt: sdk.Timestamp.now() });
    } catch (error) {
      console.error('Attempt could not be saved.', error);
      this.error.set(attemptNotSavedMessage);
    }
  }

  /** Follows how many attempts on the given Items are synchronized or still queued. */
  watch(
    learnerId: string,
    chapterId: string,
    itemIds: ReadonlySet<string>,
    onSummary: (summary: AttemptSummary) => void,
  ): () => void {
    let stopped = false;
    let unsubscribe = () => {};
    void loadFirestore().then(({ db, sdk }) => {
      if (stopped) return;
      const attempts = sdk.query(
        sdk.collection(db, 'learners', learnerId, 'attempts'),
        sdk.where('chapterId', '==', chapterId),
      );
      unsubscribe = sdk.onSnapshot(
        attempts,
        { includeMetadataChanges: true },
        (snapshot) => {
          const summary = { synced: 0, pending: 0 };
          for (const attempt of snapshot.docs) {
            if (!itemIds.has(attempt.get('itemId'))) continue;
            if (attempt.metadata.hasPendingWrites) summary.pending += 1;
            else summary.synced += 1;
          }
          onSummary(summary);
        },
        reportWatchError,
      );
    }, reportWatchError);
    return () => {
      stopped = true;
      unsubscribe();
    };
  }
}

function reportWatchError(error: unknown): void {
  console.error('Attempt history could not be followed.', error);
}
