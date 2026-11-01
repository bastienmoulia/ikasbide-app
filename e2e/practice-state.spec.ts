import { expect, test } from '@playwright/test';
import type { Sequence } from '../src/app/curriculum/curriculum.model';
import {
  createPracticeProgress,
  mergeSyncedPracticeProgress,
  toSyncedPracticeProgress,
  type LegacyPracticeProgress,
  type PracticeProgress,
} from '../src/app/curriculum/practice-progress';
import {
  advancePracticeStep,
  practiceSteps,
  skipPracticeStep,
  withPracticeSteps,
} from '../src/app/curriculum/practice-steps';

const text = { eu: 'Kaixo', fr: 'Bonjour' };
const sequence: Sequence = {
  id: 'reading-and-practice',
  letter: 'A',
  title: text,
  contents: [
    { type: 'resource', kind: 'note', id: 'note', title: text, body: text },
    {
      type: 'activity',
      kind: 'gap-fill',
      id: 'gaps',
      title: text,
      instructions: text,
      items: ['one', 'two'].map((id) => ({
        id,
        objectiveIds: [],
        prompt: text,
        acceptedAnswers: ['naiz'],
      })),
    },
    { type: 'activity', kind: 'oral-prompt', id: 'oral', title: text, instructions: text },
  ],
};

function feedback(
  progress: PracticeProgress,
  outcome: 'correct' | 'incorrect' | 'correct-with-warning',
): PracticeProgress {
  return {
    ...progress,
    completedItemIds:
      outcome === 'correct'
        ? [...progress.completedItemIds, progress.queue[0]]
        : progress.completedItemIds,
    feedback: {
      itemId: progress.queue[0],
      outcome,
      answer: 'naiz',
      attemptId: 'attempt',
      occurredAt: 1,
      sessionId: 'visit',
    },
  };
}

test('steps preserve course order and wrong answers remain distinct from successes', () => {
  let state = withPracticeSteps(createPracticeProgress(['one', 'two']), practiceSteps(sequence));
  expect(state.journey?.queue).toEqual(['content:note', 'item:one', 'item:two', 'content:oral']);
  state = advancePracticeStep(state);
  expect(state.completedItemIds).toEqual([]);
  expect(state.feedback).toBeNull();
  state = advancePracticeStep(feedback(state, 'incorrect'));
  expect(state.queue).toEqual(['two']);
  expect(state.attemptedItemIds).toEqual(['one']);
  expect(state.incorrectItemIds).toEqual(['one']);
  expect(state.journey?.queue).toEqual(['item:two', 'content:oral']);
  state = advancePracticeStep(feedback(state, 'correct-with-warning'));
  expect(state.completedItemIds).toEqual(['two']);
  state = advancePracticeStep(state);
  expect(state.journey?.queue).toEqual([]);
  expect(state.completedItemIds).toEqual(['two']);
  expect(state.journey?.visited).toEqual(['content:note', 'item:one', 'item:two', 'content:oral']);
});

test('learners can skip a question and the next step stays in editorial order', () => {
  let state = withPracticeSteps(createPracticeProgress(['one', 'two']), practiceSteps(sequence));
  state = advancePracticeStep(state);
  state = skipPracticeStep(state);
  expect(state.skippedStepIds).toEqual(['item:one']);
  expect(state.queue).toEqual(['two']);
  expect(state.journey.queue).toEqual(['item:two', 'content:oral']);
  state = advancePracticeStep(feedback(state, 'correct'));
  state = advancePracticeStep(state);
  expect(state.journey.queue).toEqual([]);
  expect(state.completedItemIds).toEqual(['two']);
});

test('sync merges visited steps and successes without storing submitted answers', () => {
  let local = withPracticeSteps(createPracticeProgress(['one', 'two']), practiceSteps(sequence));
  local = advancePracticeStep(local);
  local = advancePracticeStep(feedback(local, 'incorrect'));

  const merged = mergeSyncedPracticeProgress(
    local,
    {
      visitedStepIds: ['item:two'],
      successfulItemIds: ['two'],
      incorrectItemIds: [],
      skippedStepIds: [],
    },
    practiceSteps(sequence).map(({ id }) => id),
  );
  expect(merged.incorrectItemIds).toEqual(['one']);
  expect(merged.completedItemIds).toEqual(['two']);
  expect(merged.journey.queue).toEqual(['content:oral']);
  expect(merged.journey.visited).toEqual(['content:note', 'item:one', 'item:two']);
  expect(Object.keys(toSyncedPracticeProgress(local)).sort()).toEqual([
    'incorrectItemIds',
    'skippedStepIds',
    'successfulItemIds',
    'visitedStepIds',
  ]);
});

test('read-only sequences work without graded items and cannot advance during review', () => {
  const readingOnly: Sequence = {
    ...sequence,
    contents: sequence.contents.filter((content) => content.type === 'resource'),
  };
  const state = withPracticeSteps(createPracticeProgress([]), practiceSteps(readingOnly));
  expect(state.journey?.queue).toEqual(['content:note']);
  expect(advancePracticeStep(state).journey?.queue).toEqual([]);
  const reviewing: PracticeProgress = {
    ...state,
    journey: { queue: [], visited: ['content:note'], reviewIndex: 0 },
  };
  expect(advancePracticeStep(reviewing)).toBe(reviewing);
});

test('legacy completion retains completed items without claiming that readings were visited', () => {
  const legacy: LegacyPracticeProgress = {
    version: 1,
    queue: [],
    completedItemIds: ['one', 'two'],
    feedback: null,
  };
  const state = withPracticeSteps(legacy, practiceSteps(sequence));
  expect(state.completedItemIds).toEqual(['one', 'two']);
  expect(state.journey?.queue).toEqual(['content:note', 'content:oral']);
  expect(state.journey?.visited).toEqual(['item:one', 'item:two']);
});
