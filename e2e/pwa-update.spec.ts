import { expect, test } from '@playwright/test';
import { pwaDeployment } from './pwa-deployment.ts';
import {
  attemptSummary,
  learnerId,
  signInWithGoogle,
  skipReadings,
  startCourse,
  waitForOfflineShell,
} from './support.ts';

test.use({ serviceWorkers: 'allow' });
test.setTimeout(90_000);

test('a foregrounded app silently loads a ready release without changing its location', async ({
  page,
}) => {
  const deployment = await pwaDeployment();
  try {
    await page.goto(`${deployment.url}/a1/chapter-1`);
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    await waitForOfflineShell(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    deployment.deploy();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '2', {
      timeout: 45_000,
    });

    await expect(page).toHaveURL(`${deployment.url}/a1/chapter-1`);
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  } finally {
    await deployment.close();
  }
});

test('a ready release waits for leaving learning content and confirming offline saves', async ({
  page,
  context,
}) => {
  await page.clock.install();
  const deployment = await pwaDeployment();
  try {
    await page.goto(`${deployment.url}/a1/chapter-1/greetings`);
    await signInWithGoogle(page);
    await waitForOfflineShell(page);
    await page.reload();
    await startCourse(page);
    await expect(page.locator('app-reading-player')).toBeVisible();
    deployment.deploy();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const ready = (event: MessageEvent) => {
            if (event.data?.type !== 'VERSION_READY') return;
            navigator.serviceWorker.removeEventListener('message', ready);
            resolve();
          };
          navigator.serviceWorker.addEventListener('message', ready);
          document.dispatchEvent(new Event('visibilitychange'));
        }),
    );
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await skipReadings(page);
    await page.getByRole('textbox').fill('not-an-answer');
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');

    await context.setOffline(true);
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await expect(attemptSummary(page)).toContainText('en attente : 1');
    await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
    await expect(page.getByRole('banner')).toBeVisible();
    await page.clock.fastForward(31 * 60 * 1000);
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await page.getByRole('link', { name: /Retour au chapitre/ }).click();
    await expect(page).toHaveURL(`${deployment.url}/a1/chapter-1`);
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');

    await context.setOffline(false);
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '2', {
      timeout: 30_000,
    });

    await expect(page).toHaveURL(`${deployment.url}/a1/chapter-1`);
    await page.locator('header .account-trigger').click();
    await page.getByRole('button', { name: /À propos/ }).click();
    await expect(page.getByRole('dialog')).toContainText('99.0.0-pwa-update-test');
    await page.getByRole('button', { name: /Fermer/ }).click();
    await page.getByRole('link', { name: /Bonjour/ }).click();
    await expect(attemptSummary(page)).toContainText(
      'Tentatives synchronisées : 1 · en attente : 0',
    );
    await startCourse(page);
    await expect(page.getByText('not-an-answer', { exact: true })).toBeVisible();
  } finally {
    await deployment.close();
  }
});

test('an incomplete release shows a non-blocking bilingual failure and can be retried', async ({
  page,
}) => {
  const deployment = await pwaDeployment();
  try {
    await page.goto(deployment.url);
    await waitForOfflineShell(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    deployment.deploy(true);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const alert = page.getByRole('alert').filter({ hasText: /mise à jour/i });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert.locator('p [lang="eu"]')).not.toBeEmpty();
    await expect(alert.locator('p [lang="fr"]')).not.toBeEmpty();
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeEnabled();
    deployment.repair();
    await alert.getByRole('button', { name: /Réessayer/ }).click();
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '2', {
      timeout: 30_000,
    });
    await expect(alert).toHaveCount(0);
  } finally {
    await deployment.close();
  }
});

test('a visible app checks at 30 minutes, not before', async ({ page }) => {
  await page.clock.install();
  const deployment = await pwaDeployment();
  try {
    await page.goto(deployment.url);
    await waitForOfflineShell(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    // Finish the startup check before deploying, so it cannot stand in for the periodic check.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const checked = (event: MessageEvent) => {
            if (event.data?.type !== 'NO_NEW_VERSION_DETECTED') return;
            navigator.serviceWorker.removeEventListener('message', checked);
            resolve();
          };
          navigator.serviceWorker.addEventListener('message', checked);
          document.dispatchEvent(new Event('visibilitychange'));
        }),
    );
    deployment.deploy();
    await page.clock.fastForward(29 * 60 * 1000);
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await page.clock.fastForward(60 * 1000);
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '2', {
      timeout: 30_000,
    });
  } finally {
    await deployment.close();
  }
});

test('background checks are skipped and returning to the foreground checks immediately', async ({
  page,
}) => {
  await page.clock.install();
  const deployment = await pwaDeployment();
  try {
    await page.goto(deployment.url);
    await waitForOfflineShell(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const checked = (event: MessageEvent) => {
            if (event.data?.type !== 'NO_NEW_VERSION_DETECTED') return;
            navigator.serviceWorker.removeEventListener('message', checked);
            resolve();
          };
          navigator.serviceWorker.addEventListener('message', checked);
          document.dispatchEvent(new Event('visibilitychange'));
        }),
    );
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    deployment.deploy(true);
    await page.clock.fastForward(60 * 60 * 1000);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('alert').filter({ hasText: /mise à jour/i })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await deployment.close();
  }
});

test('a restored unconfirmed save blocks automatic updates even when the Firestore queue is empty', async ({
  page,
}) => {
  const deployment = await pwaDeployment();
  try {
    await page.goto(`${deployment.url}/a1/chapter-1`);
    const email = await signInWithGoogle(page);
    const uid = await learnerId(email);
    await waitForOfflineShell(page);
    // A previously rejected attempt has no remaining Firestore mutation, but is not saved.
    await page.evaluate((uid) => {
      localStorage.setItem(
        'ikasbide:unconfirmed-save:restored-failure',
        JSON.stringify({
          path: ['learners', uid, 'attempts', 'restored-failed-attempt'],
          fields: {
            bookId: 'a1',
            chapterId: 'chapter-1',
            itemId: 'greetings-gap-1',
            sessionId: 'previous-session',
            outcome: 'incorrect',
            occurredAt: 1,
          },
        }),
      );
    }, uid);
    await page.reload();
    await expect(page.getByRole('banner')).toBeVisible();
    deployment.deploy();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(
      page.getByRole('alert').filter({ hasText: /sauvegardes ne sont pas confirmées/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await page
      .getByRole('alert')
      .getByRole('button', { name: /Réessayer/ })
      .click();
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await expect(page.getByRole('link', { name: /Bonjour/ })).toBeEnabled();
  } finally {
    await deployment.close();
  }
});

test('signed-out clients keep a ready update deferred when an earlier account has unconfirmed saves', async ({
  page,
}) => {
  const deployment = await pwaDeployment();
  try {
    await page.goto(deployment.url);
    await waitForOfflineShell(page);
    await page.evaluate(() => {
      localStorage.setItem(
        'ikasbide:unconfirmed-save:signed-out',
        JSON.stringify({
          path: ['learners', 'earlier-account', 'attempts', 'not-confirmed'],
          fields: { outcome: 'incorrect' },
        }),
      );
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    deployment.deploy();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(
      page.getByRole('alert').filter({ hasText: /Connectez-vous pour synchroniser/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
  } finally {
    await deployment.close();
  }
});

test('the reload handoff waits for another tab to finish recording save evidence', async ({
  page,
  context,
}) => {
  const deployment = await pwaDeployment();
  const other = await context.newPage();
  try {
    await page.bringToFront();
    await page.goto(deployment.url);
    await waitForOfflineShell(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    await other.goto(`${deployment.url}/favicon.svg`);
    await other.evaluate(
      () =>
        new Promise<void>((acquired) => {
          void navigator.locks.request(
            'ikasbide:learner-save-confirmation',
            { mode: 'shared' },
            () =>
              new Promise<void>((release) => {
                window.addEventListener('save-evidence-recorded', () => release(), { once: true });
                acquired();
              }),
          );
        }),
    );
    await page.bringToFront();
    deployment.deploy();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const ready = (event: MessageEvent) => {
            if (event.data?.type !== 'VERSION_READY') return;
            navigator.serviceWorker.removeEventListener('message', ready);
            resolve();
          };
          navigator.serviceWorker.addEventListener('message', ready);
          document.dispatchEvent(new Event('visibilitychange'));
        }),
    );
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '1');
    await other.evaluate(() => window.dispatchEvent(new Event('save-evidence-recorded')));
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', '2', {
      timeout: 30_000,
    });
  } finally {
    await other.close();
    await deployment.close();
  }
});
