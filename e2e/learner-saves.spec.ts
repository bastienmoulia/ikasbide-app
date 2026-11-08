import { expect, test } from '@playwright/test';
import { LearnerSaves } from '../src/app/learner-saves.ts';

test('every concurrent learner save must be confirmed, independently of the current route', () => {
  const saves = new LearnerSaves();
  const progress = saves.begin('progress/first-sequence');
  const attempt = saves.begin('attempt/first-sequence');
  expect(saves.unconfirmed()).toBe(true);
  progress.confirmed();
  expect(saves.unconfirmed()).toBe(true);
  attempt.confirmed();
  expect(saves.unconfirmed()).toBe(false);
});

test('a failed save blocks reload until a successful retry covers it', () => {
  const saves = new LearnerSaves();
  const failed = saves.begin('progress/first-sequence');
  failed.failed();
  const other = saves.begin('progress/second-sequence');
  other.confirmed();
  expect(saves.unconfirmed()).toBe(true);
  const retry = saves.begin('progress/first-sequence');
  retry.confirmed();
  expect(saves.unconfirmed()).toBe(false);
});

test('an older confirmation cannot clear a newer failed save', () => {
  const saves = new LearnerSaves();
  const older = saves.begin('progress/sequence');
  const newer = saves.begin('progress/sequence');
  newer.failed();
  older.confirmed();
  expect(saves.unconfirmed()).toBe(true);
  saves.begin('progress/sequence').confirmed();
  expect(saves.unconfirmed()).toBe(false);
});
