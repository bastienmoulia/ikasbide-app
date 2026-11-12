import type { Sequence } from './curriculum.model';
import { practiceSteps } from './practice-steps';
import { readPracticeProgress } from './practice-progress';

/** A pending illustrated journey keeps its authored questions, including asset versions. */
export function pinnedPracticeSequence(key: string, latest: Sequence): Sequence {
  const saved = localStorage.getItem(key + ':content');
  if (!saved) return latest;
  const sequence: Sequence = JSON.parse(saved);
  if (sequence.id !== latest.id || !Array.isArray(sequence.contents)) {
    throw new Error('Invalid saved practice content.');
  }
  const steps = practiceSteps(sequence);
  const result = readPracticeProgress(
    key,
    new Set(steps.flatMap((step) => (step.kind === 'question' ? [step.question.item.id] : []))),
    new Set(steps.map(({ id }) => id)),
  );
  if (result.error) throw new Error(result.error.fr);
  const progress = result.progress;
  return progress?.journey?.queue.length ? sequence : latest;
}

export function pinPracticeSequence(key: string, sequence: Sequence): void {
  if (
    sequence.contents.some(
      (content) => content.kind === 'image-choice' || content.kind === 'image-write',
    )
  ) {
    localStorage.setItem(key + ':content', JSON.stringify(sequence));
  }
}
