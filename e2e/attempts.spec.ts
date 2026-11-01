import { expect, test } from '@playwright/test';
import {
  answerCurrentText,
  attemptSummary,
  learnerId,
  signInWithGoogle,
  startPractice,
  storedAttempts,
} from './support.ts';

const sequenceUrl = '/a1/chapter-2/family-words';

test('attempt evidence stays immutable and sequence progress resumes on another device', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.clock.install();
  await page.goto(sequenceUrl);
  const email = await signInWithGoogle(page);
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');

  await startPractice(page);
  await page.getByRole('button', { name: 'aita', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect(page.locator('.correction')).toContainText('ama');
  await page.getByRole('button', { name: /Continuer/ }).click();

  await page.getByRole('button', { name: 'aita', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await page.getByRole('button', { name: 'anaia', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 3 · en attente : 0');

  const uid = await learnerId(email);
  const firstItemAttempts = (await storedAttempts(uid)).filter(
    ({ fields }) => fields['itemId'] === 'family-choice-1',
  );
  expect(firstItemAttempts).toHaveLength(1);
  expect(firstItemAttempts[0].fields['outcome']).toBe('incorrect');
  for (const { fields } of firstItemAttempts) {
    expect(Object.keys(fields).sort()).toEqual([
      'bookId',
      'chapterId',
      'itemId',
      'occurredAt',
      'outcome',
      'sessionId',
    ]);
    expect(fields).toMatchObject({
      bookId: 'a1',
      chapterId: 'chapter-2',
      itemId: 'family-choice-1',
    });
    expect(JSON.stringify(fields)).not.toContain('aita');
  }

  await page.reload();
  await startPractice(page);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await page.getByRole('button', { name: /Recommencer/ }).click();
  await page.getByRole('button', { name: 'ama', exact: true }).click();
  await page.clock.fastForward(600);
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 4 · en attente : 0');
  const allFirstItemAttempts = (await storedAttempts(uid)).filter(
    ({ fields }) => fields['itemId'] === 'family-choice-1',
  );
  expect(allFirstItemAttempts).toHaveLength(2);
  expect(allFirstItemAttempts.map(({ fields }) => fields['outcome']).sort()).toEqual([
    'correct',
    'incorrect',
  ]);
  expect(new Set(allFirstItemAttempts.map(({ fields }) => fields['sessionId'])).size).toBe(2);

  const otherDevice = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    const sharedSequence = '/a1/chapter-1/greetings';
    await page.goto(sharedSequence);
    await startPractice(page);
    await answerCurrentText(page, 'naiz');
    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');

    const otherPage = await otherDevice.newPage();
    await otherPage.goto(sharedSequence);
    await signInWithGoogle(otherPage, 'Apprenant fictif', email);
    await expect(attemptSummary(otherPage)).toContainText('Tentatives synchronisées : 1');
    await expect(otherPage.getByRole('button', { name: /Reprendre le parcours/ })).toBeVisible();

    await startPractice(otherPage);
    await expect(otherPage.getByText('Je suis de Bayonne.')).toBeVisible();
  } finally {
    await otherDevice.close();
  }
});
