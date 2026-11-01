import type { FirestoreConnection } from '../firestore';

/** Legacy chapter documents are frozen to preserve ownership of older learner data. */
export async function legacyChapterOwner(
  { db, sdk }: FirestoreConnection,
  chapterId: string,
): Promise<string | null> {
  const reference = sdk.doc(db, 'chapters', chapterId);
  const snapshot = await (navigator.onLine
    ? sdk.getDoc(reference)
    : sdk.getDocFromCache(reference));
  const owner: unknown = snapshot.data()?.['bookId'];
  return typeof owner === 'string' ? owner : null;
}
