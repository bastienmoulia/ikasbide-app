import { Injectable } from '@angular/core';
import { loadFirestore } from '../firestore';
import type { Chapter, PublishedChapter, PublishedUnit } from './curriculum.model';
import { CurriculumUnavailableOfflineError } from './curriculum-unavailable-offline';

export interface UnitOverview extends PublishedUnit {
  id: string;
}

/**
 * Reads the published curriculum. Writes are reserved to the maintainer import.
 * Content read online is kept in Firestore's persistent cache so it can be reread offline.
 */
@Injectable({ providedIn: 'root' })
export class CurriculumService {
  async units(): Promise<UnitOverview[]> {
    const { db, sdk } = await loadFirestore();
    const query = sdk.query(sdk.collection(db, 'units'), sdk.orderBy('number'));
    const snapshot = await (navigator.onLine ? sdk.getDocs(query) : sdk.getDocsFromCache(query));
    // An empty cached result means "never loaded here", not "nothing published".
    if (snapshot.metadata.fromCache && snapshot.empty) {
      throw new CurriculumUnavailableOfflineError();
    }
    return snapshot.docs.map((unit) => ({ id: unit.id, ...(unit.data() as PublishedUnit) }));
  }

  /** Returns `null` when no chapter with this identifier is published. */
  async chapter(id: string): Promise<(Chapter & { unitId: string }) | null> {
    const { db, sdk } = await loadFirestore();
    const ref = sdk.doc(db, 'chapters', id);
    let snapshot: import('firebase/firestore').DocumentSnapshot;
    try {
      snapshot = await (navigator.onLine ? sdk.getDoc(ref) : sdk.getDocFromCache(ref));
    } catch (error) {
      // The SDK's cache miss is a FirebaseError that is not an instance of FirestoreError.
      if (error instanceof Error && 'code' in error && error.code === 'unavailable') {
        throw new CurriculumUnavailableOfflineError();
      }
      throw error;
    }
    // A cache miss throws above; a cached absence was confirmed by the server earlier.
    return snapshot.exists() ? { id, ...(snapshot.data() as PublishedChapter) } : null;
  }
}
