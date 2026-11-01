import { Injectable } from '@angular/core';
import type { DocumentReference, DocumentSnapshot } from 'firebase/firestore';
import { loadFirestore } from '../firestore';
import type { Chapter, PublishedBook, PublishedChapter } from './curriculum.model';
import { CurriculumUnavailableOfflineError } from './curriculum-unavailable-offline';

export interface BookOverview extends PublishedBook {
  id: string;
}

/**
 * Reads the published curriculum. Writes are reserved to the maintainer import.
 * Content read online is kept in Firestore's persistent cache so it can be reread offline.
 */
@Injectable({ providedIn: 'root' })
export class CurriculumService {
  async books(): Promise<BookOverview[]> {
    const { db, sdk } = await loadFirestore();
    const query = sdk.collection(db, 'books');
    const snapshot = await (navigator.onLine ? sdk.getDocs(query) : sdk.getDocsFromCache(query));
    // An empty cached result means "never loaded here", not "nothing published".
    if (snapshot.metadata.fromCache && snapshot.empty) {
      throw new CurriculumUnavailableOfflineError();
    }
    return snapshot.docs.map((book) => ({ id: book.id, ...(book.data() as PublishedBook) }));
  }

  /** Returns `null` when the chapter is not published in the requested book. */
  async chapter(bookId: string, id: string): Promise<(Chapter & { bookId: string }) | null> {
    const { db, sdk } = await loadFirestore();
    const read = async (ref: DocumentReference): Promise<DocumentSnapshot> => {
      try {
        return await (navigator.onLine ? sdk.getDoc(ref) : sdk.getDocFromCache(ref));
      } catch (error) {
        // The SDK's cache miss is a FirebaseError that is not an instance of FirestoreError.
        if (error instanceof Error && 'code' in error && error.code === 'unavailable') {
          throw new CurriculumUnavailableOfflineError();
        }
        throw error;
      }
    };

    const book = await read(sdk.doc(db, 'books', bookId));
    if (!book.exists()) return null;
    const overview = book.data() as PublishedBook;
    if (!overview.chapters.some((chapter) => chapter.id === id)) return null;

    const scoped = await read(sdk.doc(db, 'books', bookId, 'chapters', id));
    if (scoped.exists()) {
      const chapter = scoped.data() as PublishedChapter;
      if (chapter.bookId !== bookId) {
        throw new Error(`Published chapter "${id}" has an inconsistent book ID.`);
      }
      return { id, ...chapter };
    }

    const legacy = await read(sdk.doc(db, 'chapters', id));
    if (!legacy.exists()) return null;
    const chapter = legacy.data() as PublishedChapter;
    return chapter.bookId === bookId ? { id, ...chapter } : null;
  }
}
