import { Injectable } from '@angular/core';
import { loadFirestore } from '../firestore';

/** Reads the version of the latest successful content publication, written by the sync CLI. */
@Injectable({ providedIn: 'root' })
export class ContentVersionService {
  /** Resolves `null` when no version is published or it cannot be read (e.g. offline cache miss). */
  async version(): Promise<string | null> {
    try {
      const { db, sdk } = await loadFirestore();
      const ref = sdk.doc(db, 'curriculumVersions', 'ikasbide-content');
      const snapshot = await (navigator.onLine ? sdk.getDoc(ref) : sdk.getDocFromCache(ref));
      const version: unknown = snapshot.data()?.['version'];
      return typeof version === 'string' ? version : null;
    } catch {
      return null;
    }
  }
}
