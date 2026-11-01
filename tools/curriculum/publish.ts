import type { DocumentData, Firestore } from '@google-cloud/firestore';
import type {
  CurriculumSource,
  PublishedBook,
  PublishedChapter,
} from '../../src/app/curriculum/curriculum.model.ts';

// Firestore atomic writes are limited to 500 operations; deletions share the publication budget.
const maxPublishedDocuments = 400;

export interface PublishSummary {
  bookId: string;
  chapters: number;
  removed: number;
}

/**
 * Atomically publishes one book and either all of its chapters or the selected chapters.
 */
export async function publishCurriculum(
  db: Firestore,
  curriculum: CurriculumSource,
  chapterIds?: readonly string[],
): Promise<PublishSummary> {
  const books = db.collection('books');
  const chapters = db.collection('chapters');
  const units = db.collection('units');
  const sourceChapterIds = new Set(curriculum.chapters.map(({ id }) => id));
  const selectedIds = chapterIds ? new Set(chapterIds) : undefined;
  if (selectedIds?.size === 0) {
    throw new Error('Select at least one chapter for partial publication.');
  }
  for (const id of selectedIds ?? []) {
    if (!sourceChapterIds.has(id)) {
      throw new Error(
        `Cannot publish chapter "${id}": it is not listed in book "${curriculum.id}".`,
      );
    }
  }
  const selectedChapters = selectedIds
    ? curriculum.chapters.filter(({ id }) => selectedIds.has(id))
    : curriculum.chapters;
  const bookReference = books.doc(curriculum.id);
  const chapterReferences = curriculum.chapters.map(({ id }) => chapters.doc(id));

  return db.runTransaction(async (transaction) => {
    // Serialize publications of the same book, including its initial creation.
    await transaction.get(bookReference);
    // Read missing chapters too, so different books cannot claim the same IDs concurrently.
    const sourceSnapshots = chapterReferences.length
      ? await transaction.getAll(...chapterReferences)
      : [];
    const chapterSnapshot = selectedIds ? undefined : await transaction.get(chapters);
    const unitSnapshot = selectedIds ? undefined : await transaction.get(units);
    const publishedChapters = new Map<string, DocumentData>();

    for (const chapter of sourceSnapshots) {
      const data = chapter.data();
      if (!data) continue;
      publishedChapters.set(chapter.id, data);
      if (Object.hasOwn(data, 'bookId') && data['bookId'] !== curriculum.id) {
        throw new Error(
          `Cannot publish chapter "${chapter.id}": it is already assigned to book "${String(data['bookId'])}".`,
        );
      }
    }

    if (selectedIds) {
      for (const chapter of curriculum.chapters) {
        if (selectedIds.has(chapter.id)) continue;
        const published = publishedChapters.get(chapter.id);
        if (!published || published['bookId'] !== curriculum.id) {
          throw new Error(
            `Cannot publish book "${curriculum.id}" partially: chapter "${chapter.id}" is not published for this book; select it or publish the complete book.`,
          );
        }
        const title: unknown = published['title'];
        if (
          published['number'] !== chapter.number ||
          typeof title !== 'object' ||
          title === null ||
          !('eu' in title) ||
          !('fr' in title) ||
          title.eu !== chapter.title.eu ||
          title.fr !== chapter.title.fr
        ) {
          throw new Error(
            `Cannot publish book "${curriculum.id}" partially: chapter "${chapter.id}" has a different number or title; select it or publish the complete book.`,
          );
        }
      }
    }

    const staleChapters =
      chapterSnapshot?.docs
        .filter((chapter) => {
          const data = chapter.data();
          const belongsToBook = data['bookId'] === curriculum.id || !Object.hasOwn(data, 'bookId');
          return belongsToBook && !sourceChapterIds.has(chapter.id);
        })
        .map((chapter) => chapter.ref) ?? [];
    const unitReferences = unitSnapshot?.docs.map((unit) => unit.ref) ?? [];
    const writeCount = 1 + selectedChapters.length + staleChapters.length + unitReferences.length;
    if (writeCount > maxPublishedDocuments) {
      throw new Error(
        `Cannot publish book "${curriculum.id}" atomically: ${writeCount} writes exceed the ${maxPublishedDocuments}-document limit.`,
      );
    }

    const book: PublishedBook = {
      title: curriculum.title,
      chapters: curriculum.chapters.map(({ id, number, title }) => ({ id, number, title })),
    };
    transaction.set(bookReference, book);

    for (const { id, ...chapter } of selectedChapters) {
      const published: PublishedChapter = { bookId: curriculum.id, ...chapter };
      transaction.set(chapters.doc(id), published);
    }
    for (const reference of staleChapters) transaction.delete(reference);
    for (const reference of unitReferences) transaction.delete(reference);

    return {
      bookId: curriculum.id,
      chapters: selectedChapters.length,
      removed: staleChapters.length + unitReferences.length,
    };
  });
}
