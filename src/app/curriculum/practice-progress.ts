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
}

export interface PracticeProgressResult {
  progress: PracticeProgress | null;
  error: { eu: string; fr: string } | null;
}

const invalidProgressMessage = {
  eu: 'Ariketaren aurrerapena ezin izan da irakurri. Berriro has zaitezke.',
  fr: 'La progression de la série n’a pas pu être lue. Vous pouvez recommencer.',
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
    return isPracticeProgress(value, itemIds)
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
  const representedItemIds = new Set([...queue, ...completedItemIds]);
  if (representedItemIds.size !== itemIds.size) return false;
  if (feedback === null) {
    return queue.every((id) => !completedItemIds.includes(id));
  }
  return (
    !!feedback &&
    typeof feedback === 'object' &&
    feedback.itemId === queue[0] &&
    ['correct', 'almost', 'incorrect'].includes(feedback.outcome) &&
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
