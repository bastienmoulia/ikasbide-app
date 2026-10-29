import type { Firestore } from 'firebase-admin/firestore';
import type {
  CurriculumSource,
  PublishedChapter,
  PublishedUnit,
} from '../../src/app/curriculum/curriculum.model.ts';

export interface PublishSummary {
  units: number;
  chapters: number;
  removed: number;
}

/**
 * Replaces the published curriculum in a single atomic batch so learners never observe a
 * partially imported curriculum. Documents absent from the source are removed.
 */
export async function publishCurriculum(
  db: Firestore,
  curriculum: CurriculumSource,
): Promise<PublishSummary> {
  const batch = db.batch();
  const units = db.collection('units');
  const chapters = db.collection('chapters');
  const keptUnits = new Set<string>();
  const keptChapters = new Set<string>();

  for (const { id, number, title, chapters: unitChapters } of curriculum.units) {
    keptUnits.add(id);
    const unit: PublishedUnit = {
      number,
      title,
      chapters: unitChapters.map((chapter) => ({
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
      })),
    };
    batch.set(units.doc(id), unit);
    for (const { id: chapterId, ...chapter } of unitChapters) {
      keptChapters.add(chapterId);
      const published: PublishedChapter = { unitId: id, ...chapter };
      batch.set(chapters.doc(chapterId), published);
    }
  }

  let removed = 0;
  for (const [collection, kept] of [
    [units, keptUnits],
    [chapters, keptChapters],
  ] as const) {
    for (const reference of await collection.listDocuments()) {
      if (!kept.has(reference.id)) {
        batch.delete(reference);
        removed++;
      }
    }
  }

  await batch.commit();
  return { units: keptUnits.size, chapters: keptChapters.size, removed };
}
