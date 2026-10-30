import { expect, test } from '@playwright/test';
import type { Sequence } from '../src/app/curriculum/curriculum.model';
import {
  createPracticeProgress,
  type PracticeProgress,
} from '../src/app/curriculum/practice-progress';
import {
  advancePracticeStep,
  practiceSteps,
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

test('steps preserve course order and incorrect items retry after the remaining content', () => {
  let state = withPracticeSteps(createPracticeProgress(['one', 'two']), practiceSteps(sequence));
  expect(state.journey?.queue).toEqual(['content:note', 'item:one', 'item:two', 'content:oral']);
  state = advancePracticeStep(state);
  expect(state.completedItemIds).toEqual([]);
  expect(state.feedback).toBeNull();
  state = advancePracticeStep(feedback(state, 'incorrect'));
  expect(state.queue).toEqual(['two', 'one']);
  expect(state.journey?.queue).toEqual(['item:two', 'content:oral', 'item:one']);
  state = advancePracticeStep(feedback(state, 'correct-with-warning'));
  expect(state.completedItemIds).toEqual(['two']);
  state = advancePracticeStep(state);
  expect(state.journey?.queue).toEqual(['item:one']);
  state = advancePracticeStep(feedback(state, 'correct'));
  expect(state.journey?.queue).toEqual([]);
  expect(state.completedItemIds).toEqual(['two', 'one']);
  expect(state.journey?.visited).toEqual([
    'content:note',
    'item:one',
    'item:two',
    'content:oral',
    'item:one',
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
  const legacy: PracticeProgress = {
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
