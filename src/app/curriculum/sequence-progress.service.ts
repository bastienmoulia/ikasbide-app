import { computed, Injectable, signal } from '@angular/core';
import type { DocumentReference, DocumentSnapshot } from 'firebase/firestore';
import { loadFirestore } from '../firestore';
import type { BilingualText } from './curriculum.model';
import { legacyChapterOwner } from './legacy-chapter-owner';
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
  private readonly watchError = signal<BilingualText | null>(null);
  private readonly writeError = signal<BilingualText | null>(null);
  private readonly loadingState = signal(true);
  readonly error = computed(() => this.watchError() ?? this.writeError());
  readonly loading = this.loadingState.asReadonly();

  resetErrors(): void {
    this.watchError.set(null);
    this.writeError.set(null);
    this.loadingState.set(true);
  }

  watch(
    learnerId: string,
    bookId: string,
    chapterId: string,
    sequenceId: string,
    stepIds: ReadonlySet<string>,
    itemIds: ReadonlySet<string>,
    onProgress: (progress: SyncedPracticeProgress | null) => void,
  ): () => void {
    let stopped = false;
    const unsubscribe: (() => void)[] = [];
    this.watchError.set(null);
    this.loadingState.set(true);
    const reportError = (error: unknown) => {
      if (stopped) return;
      console.error('Sequence progress could not be followed.', error);
      this.watchError.set(syncUnavailableMessage);
      this.loadingState.set(false);
    };
    void loadFirestore()
      .then(async (connection) => {
        const owner = await legacyChapterOwner(connection, chapterId);
        if (stopped) return;
        const { db, sdk } = connection;
        let scopedLoaded = false;
        let legacyLoaded = owner !== bookId;
        let scopedProgress: SyncedPracticeProgress | null = null;
        let legacyProgress: SyncedPracticeProgress | null = null;
        let scopedError: BilingualText | null = null;
        let legacyError: BilingualText | null = null;
        const updateError = () => this.watchError.set(scopedError ?? legacyError);
        const setSourceError = (legacy: boolean, message: BilingualText) => {
          if (legacy) legacyError = message;
          else scopedError = message;
          updateError();
        };
        const publish = () => {
          if (stopped || !scopedLoaded || !legacyLoaded) return;
          onProgress(combineSyncedProgress(scopedProgress, legacyProgress));
          this.loadingState.set(false);
        };
        const reportSnapshotError = (legacy: boolean) => (error: unknown) => {
          if (stopped) return;
          console.error('Sequence progress could not be followed.', error);
          if (legacy) {
            legacyLoaded = false;
          } else {
            scopedLoaded = false;
          }
          setSourceError(legacy, syncUnavailableMessage);
          this.loadingState.set(false);
        };
        const read = (snapshot: DocumentSnapshot, legacy: boolean) => {
          if (stopped) return;
          const progress = snapshot.exists()
            ? parseSyncedProgress(
                snapshot.data(),
                chapterId,
                sequenceId,
                stepIds,
                itemIds,
                legacy ? undefined : bookId,
              )
            : null;
          if (snapshot.exists() && !progress) {
            console.error('Synchronized sequence progress has an invalid shape.');
            if (legacy) {
              legacyLoaded = false;
            } else {
              scopedLoaded = false;
            }
            setSourceError(legacy, invalidSyncMessage);
            this.loadingState.set(false);
            return;
          }
          if (legacy) {
            legacyProgress = progress;
            legacyLoaded = true;
            legacyError = null;
          } else {
            scopedProgress = progress;
            scopedLoaded = true;
            scopedError = null;
          }
          updateError();
          publish();
        };
        const follow = async (reference: DocumentReference, legacy: boolean) => {
          let waitForServer = false;
          try {
            // A live listener can emit stale cached progress before the server responds.
            const snapshot = await (navigator.onLine
              ? sdk.getDoc(reference)
              : sdk.getDocFromCache(reference));
            if (stopped) return;
            read(snapshot, legacy);
            if (navigator.onLine && snapshot.metadata.fromCache) {
              console.warn('Synchronized sequence progress is only available from cache.');
              waitForServer = true;
              setSourceError(legacy, syncUnavailableMessage);
            }
          } catch (error) {
            if (stopped) return;
            waitForServer = true;
            reportSnapshotError(legacy)(error);
          }
          if (stopped) return;
          unsubscribe.push(
            sdk.onSnapshot(
              reference,
              { includeMetadataChanges: true },
              (snapshot) => {
                if (waitForServer && snapshot.metadata.fromCache) return;
                waitForServer = false;
                read(snapshot, legacy);
              },
              reportSnapshotError(legacy),
            ),
          );
        };
        const reference = sdk.doc(
          db,
          'learners',
          learnerId,
          'books',
          bookId,
          'chapters',
          chapterId,
          'sequenceProgress',
          sequenceId,
        );
        void follow(reference, false).catch(reportSnapshotError(false));
        if (owner === bookId) {
          const legacyReference = sdk.doc(
            db,
            'learners',
            learnerId,
            'sequenceProgress',
            progressDocumentId(chapterId, sequenceId),
          );
          void follow(legacyReference, true).catch(reportSnapshotError(true));
        }
      })
      .catch(reportError);
    return () => {
      stopped = true;
      for (const stop of unsubscribe) stop();
    };
  }

  async record(
    learnerId: string,
    bookId: string,
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
        'books',
        bookId,
        'chapters',
        chapterId,
        'sequenceProgress',
        sequenceId,
      );
      const synchronized = toSyncedPracticeProgress(progress);
      await sdk.setDoc(
        reference,
        {
          schemaVersion: 2,
          bookId,
          chapterId,
          sequenceId,
          visitedStepIds: sdk.arrayUnion(...synchronized.visitedStepIds),
          successfulItemIds: sdk.arrayUnion(...synchronized.successfulItemIds),
          incorrectItemIds: sdk.arrayUnion(...synchronized.incorrectItemIds),
          skippedStepIds: sdk.arrayUnion(...synchronized.skippedStepIds),
        },
        { merge: true },
      );
      this.writeError.set(null);
    } catch (error) {
      console.error('Sequence progress could not be saved.', error);
      this.writeError.set(syncUnavailableMessage);
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
  bookId?: string,
): SyncedPracticeProgress | null {
  if (
    (bookId
      ? value['schemaVersion'] !== 2 || value['bookId'] !== bookId
      : value['schemaVersion'] !== 1 || Object.hasOwn(value, 'bookId')) ||
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

function combineSyncedProgress(
  scoped: SyncedPracticeProgress | null,
  legacy: SyncedPracticeProgress | null,
): SyncedPracticeProgress | null {
  if (!scoped) return legacy;
  if (!legacy) return scoped;
  return {
    visitedStepIds: [...new Set([...legacy.visitedStepIds, ...scoped.visitedStepIds])],
    successfulItemIds: [...new Set([...legacy.successfulItemIds, ...scoped.successfulItemIds])],
    incorrectItemIds: [...new Set([...legacy.incorrectItemIds, ...scoped.incorrectItemIds])],
    skippedStepIds: [...new Set([...legacy.skippedStepIds, ...scoped.skippedStepIds])],
  };
}

function validateIds(value: unknown, validIds: ReadonlySet<string>): string[] | null {
  return Array.isArray(value) &&
    value.every((id) => typeof id === 'string' && validIds.has(id)) &&
    new Set(value).size === value.length
    ? value
    : null;
}
