import type { ExerciseQuestion } from './activity-player';
import type { OralPromptActivity, Resource, Sequence } from './curriculum.model';
import type { PracticeProgress, StoredPracticeProgress } from './practice-progress';

export type ReadingContent = Resource | OralPromptActivity;

export type PracticeStep =
  | { id: string; kind: 'reading'; content: ReadingContent }
  | { id: string; kind: 'question'; question: ExerciseQuestion };

export function practiceSteps(sequence: Sequence): PracticeStep[] {
  return sequence.contents.flatMap((content): PracticeStep[] => {
    if (content.type === 'resource' || content.kind === 'oral-prompt') {
      return [{ id: 'content:' + content.id, kind: 'reading', content }];
    }
    const step = (question: ExerciseQuestion): PracticeStep => ({
      id: 'item:' + question.item.id,
      kind: 'question',
      question,
    });
    switch (content.kind) {
      case 'gap-fill':
        return content.items.map((item) =>
          step({
            kind: 'gap-fill',
            title: content.title,
            instructions: content.instructions,
            item,
          }),
        );
      case 'translation':
        return content.items.map((item) =>
          step({
            kind: 'translation',
            title: content.title,
            instructions: content.instructions,
            item,
          }),
        );
      case 'multiple-choice':
        return content.items.map((item) =>
          step({
            kind: 'multiple-choice',
            title: content.title,
            instructions: content.instructions,
            item,
          }),
        );
      case 'word-order':
        return content.items.map((item) =>
          step({
            kind: 'word-order',
            title: content.title,
            instructions: content.instructions,
            item,
          }),
        );
      case 'matching':
        return content.items.map((item) =>
          step({
            kind: 'matching',
            title: content.title,
            instructions: content.instructions,
            item,
          }),
        );
    }
  });
}

/** Migrate v1 item saves while keeping visited and feedback state in curriculum order. */
export function withPracticeSteps(
  progress: StoredPracticeProgress,
  steps: readonly PracticeStep[],
): PracticeProgress {
  if (progress.version === 2) {
    if (
      progress.journey.queue.length ||
      progress.journey.visited.length ||
      progress.skippedStepIds.length
    ) {
      return progress;
    }
    return {
      ...progress,
      queue: steps.filter((step) => step.kind === 'question').map((step) => step.question.item.id),
      journey: { queue: steps.map(({ id }) => id), visited: [], reviewIndex: null },
    };
  }

  const completed = new Set(progress.completedItemIds);
  const feedbackItemId = progress.feedback?.itemId;
  const visited = progress.journey?.visited ?? [...completed].map((id) => 'item:' + id);
  const pendingFeedbackItemId =
    feedbackItemId && !visited.includes('item:' + feedbackItemId) ? feedbackItemId : null;
  const feedback = pendingFeedbackItemId ? progress.feedback : null;
  const attemptedItemIds = [
    ...new Set([
      ...visited.filter((id) => id.startsWith('item:')).map((id) => id.slice(5)),
      ...completed,
    ]),
  ].filter((id) => id !== pendingFeedbackItemId);
  const completedItemIds = [...completed].filter((id) => id !== pendingFeedbackItemId);
  const incorrectItemIds = attemptedItemIds.filter((id) => !completedItemIds.includes(id));
  const skippedStepIds: string[] = [];
  const journeyQueue = steps
    .filter(
      (step) =>
        !visited.includes(step.id) &&
        (step.kind !== 'question' || !completed.has(step.question.item.id)),
    )
    .map(({ id }) => id);
  if (feedback) {
    const feedbackStepId = 'item:' + pendingFeedbackItemId;
    journeyQueue.splice(journeyQueue.indexOf(feedbackStepId), 1);
    journeyQueue.unshift(feedbackStepId);
  }
  const visitedSteps = [...new Set(visited)].filter(
    (id) => id !== 'item:' + pendingFeedbackItemId && steps.some((step) => step.id === id),
  );
  const journey = {
    queue: journeyQueue,
    visited: visitedSteps,
    reviewIndex: null,
  };
  return {
    version: 2,
    queue: journeyQueue.filter((id) => id.startsWith('item:')).map((id) => id.slice(5)),
    attemptedItemIds,
    completedItemIds,
    incorrectItemIds,
    skippedStepIds,
    feedback,
    journey,
  };
}

export function advancePracticeStep(progress: PracticeProgress): PracticeProgress {
  const journey = progress.journey;
  const stepId = journey?.queue[0];
  if (!journey || !stepId || journey.reviewIndex !== null) return progress;
  const nextSteps = journey.queue.slice(1);
  const visited = [...journey.visited, stepId];
  if (stepId.startsWith('content:')) {
    return { ...progress, journey: { queue: nextSteps, visited, reviewIndex: null } };
  }
  const feedback = progress.feedback;
  if (!feedback || stepId !== 'item:' + feedback.itemId) return progress;
  const accepted = feedback.outcome === 'correct' || feedback.outcome === 'correct-with-warning';
  return {
    ...progress,
    queue: progress.queue.filter((id) => id !== feedback.itemId),
    attemptedItemIds: [...new Set([...progress.attemptedItemIds, feedback.itemId])],
    completedItemIds: accepted
      ? [...new Set([...progress.completedItemIds, feedback.itemId])]
      : progress.completedItemIds,
    incorrectItemIds: accepted
      ? progress.incorrectItemIds
      : [...new Set([...progress.incorrectItemIds, feedback.itemId])],
    feedback: null,
    journey: { queue: nextSteps, visited, reviewIndex: null },
  };
}

export function skipPracticeStep(progress: PracticeProgress): PracticeProgress {
  const journey = progress.journey;
  const stepId = journey.queue[0];
  if (!stepId || journey.reviewIndex !== null || progress.feedback || !stepId.startsWith('item:')) {
    return progress;
  }
  const itemId = stepId.slice(5);
  return {
    ...progress,
    queue: progress.queue.filter((id) => id !== itemId),
    skippedStepIds: [...new Set([...progress.skippedStepIds, stepId])],
    feedback: null,
    journey: { ...journey, queue: journey.queue.slice(1) },
  };
}
