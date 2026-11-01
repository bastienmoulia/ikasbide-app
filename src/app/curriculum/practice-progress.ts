import type { AttemptOutcome } from './attempt.service';

export interface PracticeFeedback {
  itemId: string;
  outcome: AttemptOutcome;
  answer: string;
  attemptId: string;
  occurredAt: number;
  sessionId: string;
}

export interface LegacyPracticeProgress {
  version: 1;
  queue: string[];
  completedItemIds: string[];
  feedback: PracticeFeedback | null;
  journey?: {
    queue: string[];
    visited: string[];
    reviewIndex: number | null;
  };
}

export interface PracticeProgress {
  version: 2;
  queue: string[];
  attemptedItemIds: string[];
  completedItemIds: string[];
  incorrectItemIds: string[];
  skippedStepIds: string[];
  feedback: PracticeFeedback | null;
  journey: {
    queue: string[];
    visited: string[];
    reviewIndex: number | null;
  };
}

export interface SyncedPracticeProgress {
  visitedStepIds: string[];
  successfulItemIds: string[];
  incorrectItemIds: string[];
  skippedStepIds: string[];
}

export type StoredPracticeProgress = LegacyPracticeProgress | PracticeProgress;

export interface PracticeProgressResult {
  progress: StoredPracticeProgress | null;
  error: { eu: string; fr: string } | null;
}

const invalidProgressMessage = {
  eu: 'Ibilbidearen aurrerapena ezin izan da irakurri. Berriro has zaitezke.',
  fr: 'La progression du parcours n’a pas pu être lue. Vous pouvez recommencer.',
};

const unavailableStorageMessage = {
  eu: 'Aurrerapena gailu honetan gordetzea ez dago erabilgarri.',
  fr: 'La sauvegarde de la progression sur cet appareil est indisponible.',
};

export function practiceProgressKey(learnerId: string, chapterId: string, sequenceId: string) {
  return [
    'ikasbide:practice:v1',
    encodeURIComponent(learnerId),
    encodeURIComponent(chapterId),
    encodeURIComponent(sequenceId),
  ].join(':');
}

export function readPracticeProgress(
  key: string,
  itemIds: ReadonlySet<string>,
  stepIds?: ReadonlySet<string>,
): PracticeProgressResult {
  let stored: string | null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    return { progress: null, error: unavailableStorageMessage };
  }
  if (stored === null) return { progress: null, error: null };
  try {
    const value: unknown = JSON.parse(stored);
    return isStoredPracticeProgress(value, itemIds, stepIds)
      ? { progress: value, error: null }
      : { progress: null, error: invalidProgressMessage };
  } catch {
    return { progress: null, error: invalidProgressMessage };
  }
}

export function writePracticeProgress(
  key: string,
  progress: PracticeProgress,
): { eu: string; fr: string } | null {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
    return null;
  } catch {
    return unavailableStorageMessage;
  }
}

export function createPracticeProgress(itemIds: string[]): PracticeProgress {
  return {
    version: 2,
    queue: itemIds,
    attemptedItemIds: [],
    completedItemIds: [],
    incorrectItemIds: [],
    skippedStepIds: [],
    feedback: null,
    journey: { queue: [], visited: [], reviewIndex: null },
  };
}

export function toSyncedPracticeProgress(progress: PracticeProgress): SyncedPracticeProgress {
  const pendingItemId = progress.feedback?.itemId;
  return {
    visitedStepIds: progress.journey.visited,
    successfulItemIds: progress.completedItemIds.filter((id) => id !== pendingItemId),
    incorrectItemIds: progress.incorrectItemIds.filter((id) => id !== pendingItemId),
    skippedStepIds: progress.skippedStepIds,
  };
}

export function mergeSyncedPracticeProgress(
  progress: PracticeProgress,
  remote: SyncedPracticeProgress,
  stepIds: readonly string[],
): PracticeProgress {
  const visited = new Set([...progress.journey.visited, ...remote.visitedStepIds]);
  const completed = new Set([...progress.completedItemIds, ...remote.successfulItemIds]);
  const skipped = new Set([...progress.skippedStepIds, ...remote.skippedStepIds]);
  const incorrect = new Set([...progress.incorrectItemIds, ...remote.incorrectItemIds]);
  for (const id of completed) {
    visited.add('item:' + id);
    skipped.delete('item:' + id);
    incorrect.delete(id);
  }
  for (const id of incorrect) {
    visited.add('item:' + id);
    skipped.delete('item:' + id);
  }
  for (const id of visited) skipped.delete(id);
  const queue = stepIds.filter((id) => !visited.has(id) && !skipped.has(id));
  const feedback =
    progress.feedback && queue[0] === 'item:' + progress.feedback.itemId ? progress.feedback : null;
  const visitedStepIds = stepIds.filter((id) => visited.has(id));
  const previousReviewId =
    progress.journey.reviewIndex === null
      ? null
      : progress.journey.visited[progress.journey.reviewIndex];
  return {
    version: 2,
    queue: queue.filter((id) => id.startsWith('item:')).map((id) => id.slice(5)),
    attemptedItemIds: visitedStepIds
      .filter((id) => id.startsWith('item:'))
      .map((id) => id.slice(5)),
    completedItemIds: [...completed],
    incorrectItemIds: [...incorrect].filter((id) => !completed.has(id)),
    skippedStepIds: stepIds.filter((id) => skipped.has(id)),
    feedback,
    journey: {
      queue,
      visited: visitedStepIds,
      reviewIndex: previousReviewId ? visitedStepIds.indexOf(previousReviewId) : null,
    },
  };
}

export function isStoredPracticeProgress(
  value: unknown,
  itemIds: ReadonlySet<string>,
  stepIds?: ReadonlySet<string>,
): value is StoredPracticeProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<StoredPracticeProgress>;
  if (progress.version === 1) return isLegacyPracticeProgress(progress, itemIds, stepIds);
  if (progress.version === 2) return isCurrentPracticeProgress(progress, itemIds, stepIds);
  return false;
}

function isLegacyPracticeProgress(
  progress: Partial<LegacyPracticeProgress>,
  itemIds: ReadonlySet<string>,
  stepIds?: ReadonlySet<string>,
): progress is LegacyPracticeProgress {
  if (
    !Array.isArray(progress.queue) ||
    !progress.queue.every((id) => typeof id === 'string' && itemIds.has(id)) ||
    new Set(progress.queue).size !== progress.queue.length ||
    !Array.isArray(progress.completedItemIds) ||
    !progress.completedItemIds.every((id) => typeof id === 'string' && itemIds.has(id)) ||
    new Set(progress.completedItemIds).size !== progress.completedItemIds.length
  ) {
    return false;
  }
  const queue = progress.queue;
  const completedItemIds = progress.completedItemIds;
  const feedback = progress.feedback;
  if (progress.journey !== undefined) {
    const journey = progress.journey;
    if (
      !journey ||
      typeof journey !== 'object' ||
      !Array.isArray(journey.queue) ||
      !Array.isArray(journey.visited) ||
      ![...journey.queue, ...journey.visited].every(
        (id) => typeof id === 'string' && (!stepIds || stepIds.has(id)),
      ) ||
      new Set(journey.queue).size !== journey.queue.length ||
      (journey.reviewIndex !== null &&
        (!Number.isInteger(journey.reviewIndex) ||
          journey.reviewIndex < 0 ||
          journey.reviewIndex >= journey.visited.length))
    ) {
      return false;
    }
    const questionQueue = journey.queue
      .filter((id) => id.startsWith('item:'))
      .map((id) => id.slice(5));
    const visitedReadings = journey.visited.filter((id) => id.startsWith('content:'));
    if (
      questionQueue.length !== queue.length ||
      questionQueue.some((id, index) => id !== queue[index]) ||
      new Set(visitedReadings).size !== visitedReadings.length ||
      visitedReadings.some((id) => journey.queue.includes(id)) ||
      (stepIds && new Set([...journey.queue, ...journey.visited]).size !== stepIds.size) ||
      (feedback && journey.queue[0] !== 'item:' + feedback.itemId)
    ) {
      return false;
    }
  }
  const representedItemIds = new Set([...queue, ...completedItemIds]);
  if (representedItemIds.size !== itemIds.size) return false;
  if (feedback === null) {
    return queue.every((id) => !completedItemIds.includes(id));
  }
  return (
    !!feedback &&
    typeof feedback === 'object' &&
    feedback.itemId === queue[0] &&
    ['correct', 'correct-with-warning', 'almost', 'incorrect'].includes(feedback.outcome) &&
    typeof feedback.answer === 'string' &&
    typeof feedback.attemptId === 'string' &&
    feedback.attemptId.length > 0 &&
    typeof feedback.occurredAt === 'number' &&
    Number.isFinite(feedback.occurredAt) &&
    typeof feedback.sessionId === 'string' &&
    feedback.sessionId.length > 0 &&
    (feedback.outcome === 'correct'
      ? completedItemIds.includes(feedback.itemId)
      : !completedItemIds.includes(feedback.itemId)) &&
    queue.slice(1).every((id) => !completedItemIds.includes(id))
  );
}

function isCurrentPracticeProgress(
  progress: Partial<PracticeProgress>,
  itemIds: ReadonlySet<string>,
  stepIds?: ReadonlySet<string>,
): progress is PracticeProgress {
  const journey = progress.journey;
  const arrays = [
    progress.queue,
    progress.attemptedItemIds,
    progress.completedItemIds,
    progress.incorrectItemIds,
    progress.skippedStepIds,
    journey?.queue,
    journey?.visited,
  ];
  if (
    arrays.some((values) => !Array.isArray(values)) ||
    !arrays.every(
      (values) =>
        Array.isArray(values) &&
        values.every((id) => typeof id === 'string') &&
        new Set(values).size === values.length,
    ) ||
    !journey ||
    ![...journey.queue, ...journey.visited, ...progress.skippedStepIds!].every(
      (id) => typeof id === 'string' && (!stepIds || stepIds.has(id)),
    ) ||
    !progress.queue!.every((id) => itemIds.has(id)) ||
    !progress.attemptedItemIds!.every((id) => itemIds.has(id)) ||
    !progress.completedItemIds!.every((id) => itemIds.has(id)) ||
    !progress.incorrectItemIds!.every((id) => itemIds.has(id)) ||
    (journey.reviewIndex !== null &&
      (!Number.isInteger(journey.reviewIndex) ||
        journey.reviewIndex < 0 ||
        journey.reviewIndex >= journey.visited.length))
  ) {
    return false;
  }

  const queuedQuestionIds = journey.queue
    .filter((id) => id.startsWith('item:'))
    .map((id) => id.slice(5));
  const visitedQuestionIds = journey.visited
    .filter((id) => id.startsWith('item:'))
    .map((id) => id.slice(5));
  const skippedQuestionIds = progress
    .skippedStepIds!.filter((id) => id.startsWith('item:'))
    .map((id) => id.slice(5));
  const representedIds = new Set([
    ...progress.queue!,
    ...progress.attemptedItemIds!,
    ...skippedQuestionIds,
  ]);
  const completedIds = new Set(progress.completedItemIds);
  const attemptedIds = new Set(progress.attemptedItemIds);
  const feedback = progress.feedback;

  return (
    (!stepIds ||
      new Set([...journey.queue, ...journey.visited, ...progress.skippedStepIds!]).size ===
        stepIds.size) &&
    queuedQuestionIds.length === progress.queue!.length &&
    queuedQuestionIds.every((id, index) => id === progress.queue![index]) &&
    visitedQuestionIds.length === attemptedIds.size &&
    visitedQuestionIds.every((id) => attemptedIds.has(id)) &&
    representedIds.size === itemIds.size &&
    progress.completedItemIds!.every((id) => attemptedIds.has(id)) &&
    progress.incorrectItemIds!.every((id) => attemptedIds.has(id) && !completedIds.has(id)) &&
    skippedQuestionIds.every((id) => !attemptedIds.has(id)) &&
    (feedback === null ||
      (!!feedback &&
        typeof feedback === 'object' &&
        feedback.itemId === progress.queue![0] &&
        journey.queue[0] === 'item:' + feedback.itemId &&
        ['correct', 'correct-with-warning', 'almost', 'incorrect'].includes(feedback.outcome) &&
        typeof feedback.answer === 'string' &&
        typeof feedback.attemptId === 'string' &&
        feedback.attemptId.length > 0 &&
        typeof feedback.occurredAt === 'number' &&
        Number.isFinite(feedback.occurredAt) &&
        typeof feedback.sessionId === 'string' &&
        feedback.sessionId.length > 0))
  );
}
