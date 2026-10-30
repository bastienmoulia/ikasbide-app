import { expect, test } from '@playwright/test';
import {
  attemptSummary,
  learnerId,
  signInWithGoogle,
  startPractice,
  storedAttempts,
} from './support.ts';

const sequenceUrl = '/chapitres/chapter-2/sequences/family-words';

test('attempts stay immutable and shared while local practice progress stays on one device', async ({
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
  await page.getByRole('button', { name: 'ama', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 4 · en attente : 0');

  const uid = await learnerId(email);
  const firstItemAttempts = (await storedAttempts(uid)).filter(
    ({ fields }) => fields['itemId'] === 'family-choice-1',
  );
  expect(firstItemAttempts).toHaveLength(2);
  expect(firstItemAttempts.map(({ fields }) => fields['outcome']).sort()).toEqual([
    'correct',
    'incorrect',
  ]);
  expect(firstItemAttempts[0].fields['sessionId']).toBe(firstItemAttempts[1].fields['sessionId']);
  for (const { fields } of firstItemAttempts) {
    expect(Object.keys(fields).sort()).toEqual([
      'chapterId',
      'itemId',
      'occurredAt',
      'outcome',
      'sessionId',
    ]);
    expect(fields).toMatchObject({ chapterId: 'chapter-2', itemId: 'family-choice-1' });
    expect(JSON.stringify(fields)).not.toContain('aita');
  }

  await page.reload();
  await startPractice(page);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await page.getByRole('button', { name: /Recommencer/ }).click();
  await page.getByRole('button', { name: 'ama', exact: true }).click();
  await page.clock.fastForward(600);
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 5 · en attente : 0');
  const allFirstItemAttempts = (await storedAttempts(uid)).filter(
    ({ fields }) => fields['itemId'] === 'family-choice-1',
  );
  expect(allFirstItemAttempts).toHaveLength(3);
  expect(new Set(allFirstItemAttempts.map(({ fields }) => fields['sessionId'])).size).toBe(2);

  const otherDevice = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    const otherPage = await otherDevice.newPage();
    await otherPage.goto(sequenceUrl);
    await signInWithGoogle(otherPage, 'Apprenant fictif', email);
    await expect(attemptSummary(otherPage)).toContainText('Tentatives synchronisées : 5');
    await expect(otherPage.getByRole('button', { name: /Commencer les exercices/ })).toBeVisible();
    await expect(otherPage.getByRole('button', { name: /Reprendre les exercices/ })).toHaveCount(0);

    await startPractice(otherPage);
    await otherPage.getByRole('button', { name: 'ama', exact: true }).click();
    await expect(otherPage.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 6');
  } finally {
    await otherDevice.close();
  }
});
