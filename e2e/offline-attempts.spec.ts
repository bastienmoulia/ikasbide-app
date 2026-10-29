import { expect, test } from '@playwright/test';
import {
  answerGap,
  attemptSummary,
  learnerId,
  signInWithGoogle,
  storedAttempts,
  waitForOfflineShell,
} from './support.ts';

test.use({ serviceWorkers: 'allow' });

const sequenceUrl = '/chapitres/chapter-1/sequences/greetings';

test('attempts made offline are queued, kept across reloads and synchronized once', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
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

    await context.setOffline(true);
    await answerGap(page, 0, 'naiz');
    await answerGap(page, 1, 'ko');
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 0 · en attente : 2',
    );

    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' }),
    ).toBeVisible();
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 0 · en attente : 2',
    );
    await answerGap(page, 2, 'on');
    await expect(attemptSummary(page)).toContainText('en attente : 3');
    await expect(attemptSummary(otherPage)).toContainText('Tentatives synchronisées : 0');

    // The connection drops again right after returning, so the queue is sent more than once.
    await context.setOffline(false);
    await context.setOffline(true);
    await context.setOffline(false);

    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 3 · en attente : 0',
      { timeout: 30_000 },
    );
    await expect(attemptSummary(otherPage)).toContainText(
      'Tentatives synchronisées : 3 · en attente : 0',
    );
  } finally {
    await otherDevice.close();
  }

  const attempts = await storedAttempts(await learnerId(email));
  expect(attempts.map(({ fields }) => [fields['itemId'], fields['outcome']]).sort()).toEqual([
    ['greetings-gap-1', 'correct'],
    ['greetings-gap-2', 'incorrect'],
    ['greetings-gap-3', 'correct'],
  ]);
  const [first, second, third] = [...attempts].sort((a, b) =>
    a.fields['occurredAt'].localeCompare(b.fields['occurredAt']),
  );
  expect(first.fields['sessionId']).toBe(second.fields['sessionId']);
  expect(third.fields['sessionId']).not.toBe(first.fields['sessionId']);
});
