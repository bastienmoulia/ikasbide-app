import { Injectable } from '@angular/core';
import { loadFirebaseApp } from '../firebase-app';
import type { Chapter, PublishedChapter, PublishedUnit } from './curriculum.model';

export interface UnitOverview extends PublishedUnit {
  id: string;
}

/** Reads the published curriculum. Writes are reserved to the maintainer import. */
@Injectable({ providedIn: 'root' })
export class CurriculumService {
  private firestore?: Promise<{
    db: import('firebase/firestore').Firestore;
    sdk: typeof import('firebase/firestore');
  }>;

  async units(): Promise<UnitOverview[]> {
    const { db, sdk } = await this.connect();
    const snapshot = await sdk.getDocs(
      sdk.query(sdk.collection(db, 'units'), sdk.orderBy('number')),
    );
    return snapshot.docs.map((unit) => ({ id: unit.id, ...(unit.data() as PublishedUnit) }));
  }

  /** Returns `null` when no chapter with this identifier is published. */
  async chapter(id: string): Promise<(Chapter & { unitId: string }) | null> {
    const { db, sdk } = await this.connect();
    const snapshot = await sdk.getDoc(sdk.doc(db, 'chapters', id));
    return snapshot.exists() ? { id, ...(snapshot.data() as PublishedChapter) } : null;
  }

  private connect() {
    this.firestore ??= (async () => {
      const [{ app, config }, sdk] = await Promise.all([
        loadFirebaseApp(),
        import('firebase/firestore'),
      ]);
      const db = sdk.getFirestore(app);
      if (config.useEmulators) sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      return { db, sdk };
    })();
    this.firestore.catch(() => (this.firestore = undefined));
    return this.firestore;
  }
}
