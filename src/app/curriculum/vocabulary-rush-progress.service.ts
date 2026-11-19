import { Injectable, inject, signal } from '@angular/core';
import { loadFirestore } from '../firestore';
import { LearnerSaves } from '../learner-saves';
import type { BilingualText } from './curriculum.model';

const syncUnavailableMessage: BilingualText = {
  eu: 'Ezin izan da puntuazioa sinkronizatu. Egiaztatu konexioa.',
  fr: 'Le record n’a pas pu être synchronisé. Vérifiez votre connexion.',
};

const invalidRecordMessage: BilingualText = {
  eu: 'Gordetako puntuazioa ezin izan da irakurri.',
  fr: 'Le record enregistré n’a pas pu être lu.',
};

@Injectable({ providedIn: 'root' })
export class VocabularyRushProgressService {
  private readonly saves = inject(LearnerSaves);
  readonly writeError = signal<BilingualText | null>(null);

  watchBestScore(
    learnerId: string,
    bookId: string,
    chapterId: string,
    onScore: (score: number | null) => void,
    onError: (message: BilingualText) => void,
  ): () => void {
    let stopped = false;
    let unsubscribe = () => {};
    void loadFirestore()
      .then(({ db, sdk }) => {
        if (stopped) return;
        const scores = sdk.collection(
          db,
          'learners',
          learnerId,
          'books',
          bookId,
          'chapters',
          chapterId,
          'vocabularyRush',
        );
        const best = sdk.query(scores, sdk.orderBy('bestScore', 'desc'), sdk.limit(1));
        unsubscribe = sdk.onSnapshot(
          best,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (stopped) return;
            if (snapshot.empty) {
              onScore(null);
              return;
            }
            const data = snapshot.docs[0].data();
            const score: unknown = data['bestScore'];
            if (
              data['schemaVersion'] !== 1 ||
              data['bookId'] !== bookId ||
              data['chapterId'] !== chapterId ||
              typeof score !== 'number' ||
              !Number.isSafeInteger(score) ||
              score < 1
            ) {
              console.error('Vocabulary rush record has an invalid shape.');
              onError(invalidRecordMessage);
              return;
            }
            onScore(score);
          },
          (error) => {
            if (stopped) return;
            console.error('Vocabulary rush record could not be followed.', error);
            onError(syncUnavailableMessage);
          },
        );
      })
      .catch((error: unknown) => {
        if (stopped) return;
        console.error('Vocabulary rush record could not be followed.', error);
        onError(syncUnavailableMessage);
      });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }

  async recordBestScore(
    learnerId: string,
    bookId: string,
    chapterId: string,
    score: number,
  ): Promise<void> {
    if (score < 1) return;
    this.writeError.set(null);
    const fields = { schemaVersion: 1, bookId, chapterId, bestScore: score };
    const recordId = score.toString();
    const save = this.saves.begin(
      JSON.stringify(['vocabulary-rush', learnerId, bookId, chapterId, recordId]),
      {
        path: [
          'learners',
          learnerId,
          'books',
          bookId,
          'chapters',
          chapterId,
          'vocabularyRush',
          recordId,
        ],
        fields,
      },
    );
    try {
      await save.persist();
      const { db, sdk } = await loadFirestore();
      await sdk.setDoc(
        this.recordReference(sdk, db, learnerId, bookId, chapterId, recordId),
        fields,
      );
      save.confirmed();
    } catch (error) {
      save.failed();
      console.error('Vocabulary rush record could not be saved.', error);
      this.writeError.set(syncUnavailableMessage);
    }
  }

  private recordReference(
    sdk: typeof import('firebase/firestore'),
    db: import('firebase/firestore').Firestore,
    learnerId: string,
    bookId: string,
    chapterId: string,
    recordId: string,
  ) {
    return sdk.doc(
      db,
      'learners',
      learnerId,
      'books',
      bookId,
      'chapters',
      chapterId,
      'vocabularyRush',
      recordId,
    );
  }
}
