import type { ExerciseQuestion } from './activity-player';
import type { OralPromptActivity, Resource, Sequence } from './curriculum.model';
import type { PracticeProgress } from './practice-progress';

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
    }
  });
}

/** Legacy saves keep their item queue and feedback; previously untracked readings remain to visit. */
export function withPracticeSteps(
  progress: PracticeProgress,
  steps: readonly PracticeStep[],
): PracticeProgress {
  if (progress.journey) return progress;
  const pending = new Set(progress.queue.map((id) => 'item:' + id));
  const before = new Map<string, string[]>();
  const trailing: string[] = [];
  for (const [index, step] of steps.entries()) {
    if (step.kind !== 'reading') continue;
    const next = steps.slice(index + 1).find((candidate) => pending.has(candidate.id));
    const readings = next ? (before.get(next.id) ?? []) : trailing;
    readings.push(step.id);
    if (next) before.set(next.id, readings);
  }
  const queue = progress.queue.flatMap((id) => [...(before.get('item:' + id) ?? []), 'item:' + id]);
  queue.push(...trailing);
  if (progress.feedback) {
    const currentId = 'item:' + progress.feedback.itemId;
    queue.splice(queue.indexOf(currentId), 1);
    queue.unshift(currentId);
  }
  return {
    ...progress,
    journey: {
      queue,
      visited: steps
        .filter((step) => step.kind === 'question' && !pending.has(step.id))
        .map(({ id }) => id),
      reviewIndex: null,
    },
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
  const nextQueue = progress.queue.slice(1);
  const accepted = feedback.outcome === 'correct' || feedback.outcome === 'correct-with-warning';
  if (!accepted) {
    nextQueue.push(feedback.itemId);
    nextSteps.push(stepId);
  }
  return {
    ...progress,
    queue: nextQueue,
    completedItemIds: accepted
      ? [...new Set([...progress.completedItemIds, feedback.itemId])]
      : progress.completedItemIds,
    feedback: null,
    journey: { queue: nextSteps, visited, reviewIndex: null },
  };
}
