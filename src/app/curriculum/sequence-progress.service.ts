import { Injectable, signal } from '@angular/core';
import { loadFirestore } from '../firestore';
import type { BilingualText } from './curriculum.model';
import type { PracticeProgress, SyncedPracticeProgress } from './practice-progress';
import { toSyncedPracticeProgress } from './practice-progress';

const syncUnavailableMessage: BilingualText = {
  eu: 'Ezin izan da ibilbidearen aurrerapena sinkronizatu. Konexioa berrezartzean berriro saiatuko gara.',
  fr: 'La progression n’a pas pu être synchronisée. Un nouvel essai aura lieu au rétablissement de la connexion.',
};

const invalidSyncMessage: BilingualText = {
  eu: 'Sinkronizatutako aurrerapena ezin izan da irakurri.',
  fr: 'La progression synchronisée n’a pas pu être lue.',
};

@Injectable({ providedIn: 'root' })
export class SequenceProgressService {
  readonly error = signal<BilingualText | null>(null);

  watch(
    learnerId: string,
    chapterId: string,
    sequenceId: string,
    stepIds: ReadonlySet<string>,
    itemIds: ReadonlySet<string>,
    onProgress: (progress: SyncedPracticeProgress | null) => void,
  ): () => void {
    let stopped = false;
    let unsubscribe = () => {};
    void loadFirestore().then(
      ({ db, sdk }) => {
        if (stopped) return;
        const reference = sdk.doc(
          db,
          'learners',
          learnerId,
          'sequenceProgress',
          progressDocumentId(chapterId, sequenceId),
        );
        unsubscribe = sdk.onSnapshot(
          reference,
          (snapshot) => {
            if (!snapshot.exists()) {
              onProgress(null);
              return;
            }
            const progress = parseSyncedProgress(
              snapshot.data(),
              chapterId,
              sequenceId,
              stepIds,
              itemIds,
            );
            if (!progress) {
              console.error('Synchronized sequence progress has an invalid shape.');
              this.error.set(invalidSyncMessage);
              return;
            }
            this.error.set(null);
            onProgress(progress);
          },
          (error) => {
            console.error('Sequence progress could not be followed.', error);
            this.error.set(syncUnavailableMessage);
          },
        );
      },
      (error: unknown) => {
        console.error('Sequence progress could not be followed.', error);
        this.error.set(syncUnavailableMessage);
      },
    );
    return () => {
      stopped = true;
      unsubscribe();
    };
  }

  async record(
    learnerId: string,
    chapterId: string,
    sequenceId: string,
    progress: PracticeProgress,
  ): Promise<void> {
    try {
      const { db, sdk } = await loadFirestore();
      const reference = sdk.doc(
        db,
        'learners',
        learnerId,
        'sequenceProgress',
        progressDocumentId(chapterId, sequenceId),
      );
      const synchronized = toSyncedPracticeProgress(progress);
      await sdk.setDoc(
        reference,
        {
          schemaVersion: 1,
          chapterId,
          sequenceId,
          visitedStepIds: sdk.arrayUnion(...synchronized.visitedStepIds),
          successfulItemIds: sdk.arrayUnion(...synchronized.successfulItemIds),
          incorrectItemIds: sdk.arrayUnion(...synchronized.incorrectItemIds),
          skippedStepIds: sdk.arrayUnion(...synchronized.skippedStepIds),
        },
        { merge: true },
      );
      this.error.set(null);
    } catch (error) {
      console.error('Sequence progress could not be saved.', error);
      this.error.set(syncUnavailableMessage);
    }
  }
}

function progressDocumentId(chapterId: string, sequenceId: string): string {
  const chapterKey = encodeURIComponent(chapterId);
  return `${chapterKey.length}:${chapterKey}${encodeURIComponent(sequenceId)}`;
}

function parseSyncedProgress(
  value: Record<string, unknown>,
  chapterId: string,
  sequenceId: string,
  stepIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string>,
): SyncedPracticeProgress | null {
  if (
    value['schemaVersion'] !== 1 ||
    value['chapterId'] !== chapterId ||
    value['sequenceId'] !== sequenceId
  ) {
    return null;
  }
  const visitedStepIds = validateIds(value['visitedStepIds'], stepIds);
  const successfulItemIds = validateIds(value['successfulItemIds'], itemIds);
  const incorrectItemIds = validateIds(value['incorrectItemIds'], itemIds);
  const skippedStepIds = validateIds(value['skippedStepIds'], stepIds);
  if (!visitedStepIds || !successfulItemIds || !incorrectItemIds || !skippedStepIds) return null;
  return { visitedStepIds, successfulItemIds, incorrectItemIds, skippedStepIds };
}

function validateIds(value: unknown, validIds: ReadonlySet<string>): string[] | null {
  return Array.isArray(value) &&
    value.every((id) => typeof id === 'string' && validIds.has(id)) &&
    new Set(value).size === value.length
    ? value
    : null;
}
