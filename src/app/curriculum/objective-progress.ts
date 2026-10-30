import type { RecordedAttempt } from './attempt.service';
import type { BilingualText, Chapter } from './curriculum.model';

export type ObjectiveStatus = 'to-discover' | 'in-progress' | 'acquired';

/** Mastery evidence required before an objective is shown as acquired (README, ADR 0004). */
const acquiredDistinctItems = 3;
const acquiredDistinctSessions = 2;

export const objectiveStatusLabels: Record<ObjectiveStatus, BilingualText> = {
  'to-discover': { eu: 'Aurkitzeko', fr: 'À découvrir' },
  'in-progress': { eu: 'Lantzen', fr: 'En cours' },
  acquired: { eu: 'Eskuratua', fr: 'Acquis' },
};

/**
 * Estimates each communication objective of the chapter from attempt evidence. Every
 * attempt counts only for the objectives of its Item; "almost" outcomes are not correct.
 */
export function objectiveProgress(
  chapter: Pick<Chapter, 'objectives' | 'sequences'>,
  attempts: readonly Pick<RecordedAttempt, 'itemId' | 'outcome' | 'sessionId'>[],
): Map<string, ObjectiveStatus> {
  const objectivesByItem = new Map<string, string[]>();
  for (const sequence of chapter.sequences) {
    for (const content of sequence.contents) {
      if (content.type !== 'activity' || !('items' in content)) continue;
      for (const item of content.items) objectivesByItem.set(item.id, item.objectiveIds);
    }
  }

  const evidence = new Map(
    chapter.objectives.map(({ id }) => [
      id,
      { practised: false, correctItems: new Set<string>(), correctSessions: new Set<string>() },
    ]),
  );
  for (const attempt of attempts) {
    for (const objectiveId of objectivesByItem.get(attempt.itemId) ?? []) {
      const objective = evidence.get(objectiveId);
      if (!objective) continue;
      objective.practised = true;
      if (attempt.outcome !== 'correct' && attempt.outcome !== 'correct-with-warning') continue;
      objective.correctItems.add(attempt.itemId);
      objective.correctSessions.add(attempt.sessionId);
    }
  }

  return new Map(
    [...evidence].map(([id, { practised, correctItems, correctSessions }]) => [
      id,
      correctItems.size >= acquiredDistinctItems && correctSessions.size >= acquiredDistinctSessions
        ? 'acquired'
        : practised
          ? 'in-progress'
          : 'to-discover',
    ]),
  );
}
