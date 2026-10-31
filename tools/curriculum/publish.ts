import type { Firestore } from 'firebase-admin/firestore';
import type {
  CurriculumSource,
  PublishedBook,
  PublishedChapter,
} from '../../src/app/curriculum/curriculum.model.ts';
import { maxPublishedDocuments } from './validate.ts';

export interface PublishSummary {
  bookId: string;
  chapters: number;
  removed: number;
}

/**
 * Atomically replaces one published book and its chapters. Legacy units are removed during
 * the v2 transition; chapters belonging to other books are left untouched.
 */
export async function publishCurriculum(
  db: Firestore,
  curriculum: CurriculumSource,
): Promise<PublishSummary> {
  const books = db.collection('books');
  const chapters = db.collection('chapters');
  const units = db.collection('units');
  const sourceChapterIds = new Set(curriculum.chapters.map(({ id }) => id));
  const [chapterSnapshot, unitReferences] = await Promise.all([
    chapters.get(),
    units.listDocuments(),
  ]);
  const batch = db.batch();
  const staleChapters: FirebaseFirestore.DocumentReference[] = [];

  for (const chapter of chapterSnapshot.docs) {
    const data = chapter.data();
    if (
      sourceChapterIds.has(chapter.id) &&
      Object.hasOwn(data, 'bookId') &&
      data['bookId'] !== curriculum.id
    ) {
      throw new Error(
        `Cannot publish chapter "${chapter.id}": it is already assigned to book "${String(data['bookId'])}".`,
      );
    }
    const belongsToBook = data['bookId'] === curriculum.id || !Object.hasOwn(data, 'bookId');
    if (belongsToBook && !sourceChapterIds.has(chapter.id)) {
      staleChapters.push(chapter.ref);
    }
  }

  const writeCount = 1 + curriculum.chapters.length + staleChapters.length + unitReferences.length;
  if (writeCount > maxPublishedDocuments) {
    throw new Error(
      `Cannot publish book "${curriculum.id}" atomically: ${writeCount} writes exceed the ${maxPublishedDocuments}-document limit.`,
    );
  }

  const book: PublishedBook = {
    title: curriculum.title,
    chapters: curriculum.chapters.map(({ id, number, title }) => ({ id, number, title })),
  };
  batch.set(books.doc(curriculum.id), book);

  for (const { id, ...chapter } of curriculum.chapters) {
    const published: PublishedChapter = { bookId: curriculum.id, ...chapter };
    batch.set(chapters.doc(id), published);
  }
  for (const reference of staleChapters) batch.delete(reference);
  for (const reference of unitReferences) batch.delete(reference);

  await batch.commit();
  return {
    bookId: curriculum.id,
    chapters: curriculum.chapters.length,
    removed: staleChapters.length + unitReferences.length,
  };
}
