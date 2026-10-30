import type { AttemptOutcome } from './attempt.service';

export interface PracticeFeedback {
  itemId: string;
  outcome: AttemptOutcome;
  answer: string;
  attemptId: string;
  occurredAt: number;
  sessionId: string;
}

export interface PracticeProgress {
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

export interface PracticeProgressResult {
  progress: PracticeProgress | null;
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
    return isPracticeProgress(value, itemIds, stepIds)
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
  return { version: 1, queue: itemIds, completedItemIds: [], feedback: null };
}

function isPracticeProgress(
  value: unknown,
  itemIds: ReadonlySet<string>,
  stepIds?: ReadonlySet<string>,
): value is PracticeProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<PracticeProgress>;
  if (
    progress.version !== 1 ||
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
