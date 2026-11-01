import { expect, type Locator, type Page } from '@playwright/test';

export async function expectBilingualPresentation(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'eu');
  const texts = page.locator('app-bilingual-text:visible');
  expect(await texts.count()).toBeGreaterThan(0);
  for (const text of await texts.all()) {
    const basque = text.locator('[lang="eu"]');
    const french = text.locator('[lang="fr"]');
    await expect(basque).not.toBeEmpty();
    await expect(french).not.toBeEmpty();
    const layout = await text.evaluate((element) => {
      const basque = element.querySelector<HTMLElement>('[lang="eu"]');
      const french = element.querySelector<HTMLElement>('[lang="fr"]');
      if (!basque || !french) throw new Error('Both languages must be present.');
      return {
        basqueBottom: basque.getBoundingClientRect().bottom,
        frenchTop: french.getBoundingClientRect().top,
        basqueSize: Number.parseFloat(getComputedStyle(basque).fontSize),
        frenchSize: Number.parseFloat(getComputedStyle(french).fontSize),
      };
    });
    expect(layout.frenchTop).toBeGreaterThanOrEqual(layout.basqueBottom);
    expect(layout.frenchSize).toBeLessThan(layout.basqueSize);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/**
 * Signs in through the Auth emulator's Google popup with a synthetic identity.
 * Reuse the returned email to sign the same account in from another browser context.
 */
export async function signInWithGoogle(
  page: Page,
  displayName = 'Apprenant fictif',
  email = `learner-${crypto.randomUUID()}@example.test`,
): Promise<string> {
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^http:\/\/127\.0\.0\.1:9099\//);
  await popup.waitForLoadState('domcontentloaded');
  await popup.getByRole('button', { name: 'Add new account' }).click();
  await popup.locator('#email-input').fill(email);
  await popup.locator('#display-name-input').fill(displayName);
  await popup.getByRole('button', { name: /Sign in with Google/i }).click();
  await expect(page.locator('header .account-trigger')).toBeVisible();
  return email;
}

const projectId = 'demo-ikasbide';
const firestoreEmulator = `http://${process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080'}`;

/** Looks up an emulator account by email; tests use it to inspect their own learner data. */
export async function learnerId(email: string): Promise<string> {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    },
  );
  const { users } = (await response.json()) as { users?: { localId: string }[] };
  if (!users?.length) throw new Error(`No emulator account for ${email}.`);
  return users[0].localId;
}

export interface StoredAttempt {
  id: string;
  fields: Record<string, string>;
}

/** Reads a learner's stored attempts from the emulator, bypassing security rules. */
export async function storedAttempts(uid: string): Promise<StoredAttempt[]> {
  const response = await fetch(
    `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/learners/${uid}/attempts?pageSize=300`,
    { headers: { authorization: 'Bearer owner' } },
  );
  const { documents = [] } = (await response.json()) as {
    documents?: { name: string; fields: Record<string, Record<string, string>> }[];
  };
  return documents.map(({ name, fields }) => ({
    id: name.split('/').at(-1)!,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Object.values(value)[0]]),
    ),
  }));
}

/** Waits until the service worker controls the page and has cached the app shell. */
export async function waitForOfflineShell(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(async () => (await fetch('/ngsw/state')).text()), {
      timeout: 30_000,
    })
    .toMatch(/Driver state: NORMAL[\s\S]*Latest manifest hash: [0-9a-f]+/);
}

export async function startCourse(page: Page): Promise<void> {
  const start = page.getByRole('button', {
    name: /Commencer le parcours|Reprendre le parcours|Voir le bilan/,
  });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('.practice, .completion')).toBeVisible();
}

export async function skipReadings(page: Page): Promise<void> {
  while (await page.locator('app-reading-player').isVisible()) {
    const reading = await page.locator('app-reading-player').elementHandle();
    await page.getByRole('button', { name: /Hurrengoa Suivant/ }).click();
    await page.waitForFunction((element) => !element?.isConnected, reading);
    await reading?.dispose();
  }
}

/** Existing correction tests start at the first unanswered Item, after any introductory readings. */
export async function startPractice(page: Page): Promise<void> {
  await startCourse(page);
  await skipReadings(page);
}

/** Submits a free-response Item and advances through its brief correct-answer feedback. */
export async function answerCurrentText(
  page: Page,
  answer: string,
  useEnter = false,
): Promise<void> {
  await expect(page.locator('app-activity-player:visible, app-reading-player')).toBeVisible();
  await skipReadings(page);
  const input = page.getByRole('textbox');
  await input.fill(answer);
  if (useEnter) {
    await input.press('Enter');
  } else {
    await page.getByRole('button', { name: /Vérifier/ }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: /Correct|Zuzena/ })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.locator('app-activity-feedback')).toHaveCount(0);
  await skipReadings(page);
}

/** Submits a multiple-choice Item and advances through its brief correct-answer feedback. */
export async function answerCurrentChoice(page: Page, choice: string): Promise<void> {
  await expect(page.locator('app-activity-player:visible, app-reading-player')).toBeVisible();
  await skipReadings(page);
  await page.getByRole('button', { name: choice, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Correct|Zuzena/ })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.locator('app-activity-feedback')).toHaveCount(0);
  await skipReadings(page);
}

export function attemptSummary(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: 'Tentatives synchronisées' });
}
