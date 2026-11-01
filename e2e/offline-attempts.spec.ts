import { expect, test } from '@playwright/test';
import {
  attemptSummary,
  learnerId,
  signInWithGoogle,
  startPractice,
  storedAttempts,
  waitForOfflineShell,
} from './support.ts';

test.use({ serviceWorkers: 'allow' });

const sequenceUrl = '/a1/chapter-1/greetings';

test('a submitted answer is restored offline and synchronized exactly once', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await page.clock.install();
  await page.goto(sequenceUrl);
  const email = await signInWithGoogle(page);
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');
  await waitForOfflineShell(page);

  const otherDevice = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    const otherPage = await otherDevice.newPage();
    await otherPage.goto(sequenceUrl);
    await signInWithGoogle(otherPage, 'Apprenant fictif', email);
    await expect(attemptSummary(otherPage)).toContainText('Tentatives synchronisées : 0');

    await startPractice(page);
    await context.setOffline(true);
    await page.getByRole('textbox').fill('secret-answer');
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 0 · en attente : 1',
    );

    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' }),
    ).toBeVisible();
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 0 · en attente : 1',
    );
    await startPractice(page);
    await expect(page.getByText('secret-answer', { exact: true })).toBeVisible();
    await expect(page.locator('.correction')).toContainText('naiz');
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 0 · en attente : 1',
    );

    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByRole('textbox').fill('koa');
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
    await page.clock.fastForward(600);
    await expect(attemptSummary(page)).toContainText('en attente : 2');
    await expect(attemptSummary(otherPage)).toContainText('Tentatives synchronisées : 0');

    await context.setOffline(false);
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 2 · en attente : 0',
      { timeout: 30_000 },
    );
    await expect(attemptSummary(otherPage)).toContainText(
      'Tentatives synchronisées : 2 · en attente : 0',
    );
  } finally {
    await otherDevice.close();
  }

  const attempts = await storedAttempts(await learnerId(email));
  expect(attempts.map(({ fields }) => [fields['itemId'], fields['outcome']]).sort()).toEqual([
    ['greetings-gap-1', 'incorrect'],
    ['greetings-gap-2', 'correct'],
  ]);
  expect(attempts.map(({ fields }) => fields['sessionId'])).toEqual([
    expect.any(String),
    expect.any(String),
  ]);
  expect(attempts[0].fields['sessionId']).not.toBe(attempts[1].fields['sessionId']);
  expect(JSON.stringify(attempts)).not.toContain('secret-answer');
});
