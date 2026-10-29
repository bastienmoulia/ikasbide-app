import { expect, test } from '@playwright/test';
import {
  answerGap,
  attemptSummary,
  gapFillItem,
  learnerId,
  signInWithGoogle,
  storedAttempts,
} from './support.ts';

const sequenceUrl = '/chapitres/chapter-1/sequences/greetings';

test('attempts are kept per practice session and shared with the learner’s other devices', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto(sequenceUrl);
  const email = await signInWithGoogle(page);
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');

  await answerGap(page, 0, 'secret-wrong');
  await answerGap(page, 0, 'naiz');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 2');
  // Checking an unchanged answer again is not a new attempt.
  await gapFillItem(page, 0)
    .getByRole('button', { name: /Vérifier/ })
    .dblclick();
  // Writes are sent in order, so any duplicate would be synchronized before this attempt.
  await answerGap(page, 1, 'koa');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 3 · en attente : 0');

  // Reopening the sequence starts a new practice session.
  await page.reload();
  await answerGap(page, 0, 'naiz');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 4');

  const attempts = (await storedAttempts(await learnerId(email))).filter(
    ({ fields }) => fields['itemId'] === 'greetings-gap-1',
  );
  expect(attempts).toHaveLength(3);
  for (const { fields } of attempts) {
    expect(Object.keys(fields).sort()).toEqual([
      'chapterId',
      'itemId',
      'occurredAt',
      'outcome',
      'sessionId',
    ]);
    expect(fields).toMatchObject({ chapterId: 'chapter-1', itemId: 'greetings-gap-1' });
    expect(JSON.stringify(fields)).not.toContain('secret-wrong');
  }
  const byDate = [...attempts].sort((a, b) =>
    a.fields['occurredAt'].localeCompare(b.fields['occurredAt']),
  );
  expect(byDate.map(({ fields }) => fields['outcome'])).toEqual([
    'incorrect',
    'correct',
    'correct',
  ]);
  expect(byDate[0].fields['sessionId']).toBe(byDate[1].fields['sessionId']);
  expect(byDate[2].fields['sessionId']).not.toBe(byDate[0].fields['sessionId']);

  const otherDevice = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    const otherPage = await otherDevice.newPage();
    await otherPage.goto(sequenceUrl);
    await signInWithGoogle(otherPage, 'Apprenant fictif', email);
    await expect(attemptSummary(otherPage)).toContainText('Tentatives synchronisées : 4');

    await answerGap(otherPage, 2, 'on');
    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 5');
  } finally {
    await otherDevice.close();
  }
});
