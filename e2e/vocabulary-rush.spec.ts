import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { PublishedBook, PublishedChapter } from '../src/app/curriculum/curriculum.model.ts';
import { learnerId, signInWithGoogle } from './support.ts';

async function slotContents(column: Locator): Promise<(string | null)[]> {
  return column
    .locator('.word-slot')
    .evaluateAll((slots) =>
      slots.map((slot) => slot.querySelector('button')?.textContent?.trim() ?? null),
    );
}

async function match(page: Page, eu: string, fr: string): Promise<void> {
  const board = page.locator('.rush-board');
  await board.getByRole('button', { name: eu, exact: true }).click();
  await board.getByRole('button', { name: fr, exact: true }).click();
}

test('a learner quickly matches chapter vocabulary and saves a personal record', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/a1/chapter-1');
  const email = await signInWithGoogle(page);
  await expect(page.getByRole('link', { name: /Défi d’association/ })).toHaveCount(0);
  await page.goto('/a1/chapter-2');
  await page.getByRole('link', { name: /Défi d’association/ }).click();
  await expect(page).toHaveURL(/\/a1\/chapter-2\/vocabulary-rush$/);
  const board = page.locator('.rush-board');

  await expect(board).toBeVisible();
  await page.getByRole('button', { name: /Commencer/ }).click();
  await page.clock.fastForward(3_000);
  await expect(board.getByRole('button', { name: 'ama', exact: true })).toBeEnabled();

  await board.getByRole('button', { name: 'ama', exact: true }).click();
  await board.getByRole('button', { name: 'père', exact: true }).click();
  await expect(board.locator('.word-option.wrong')).toHaveCount(2);
  await expect(page.locator('.score strong')).toHaveText('0');
  await page.clock.fastForward(700);
  await expect(board.locator('.word-option.wrong')).toHaveCount(0);

  for (const [eu, fr] of [
    ['ama', 'mère'],
    ['aita', 'père'],
    ['anaia', 'frère'],
  ]) {
    await board.getByRole('button', { name: eu, exact: true }).click();
    await board.getByRole('button', { name: fr, exact: true }).click();
    await page.clock.fastForward(700);
  }

  await expect(page.locator('.score strong')).toHaveText('3');
  await expect(page.locator('.game-message')).toContainText('Vous avez trouvé toutes les paires');
  await expect(page.locator('.best-score')).toContainText('3 paires');

  const uid = await learnerId(email);
  const url =
    `http://${process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080'}` +
    `/v1/projects/demo-ikasbide/databases/(default)/documents/learners/${uid}` +
    '/books/a1/chapters/chapter-2/vocabularyRush/3';
  await expect
    .poll(async () => {
      const response = await page.request.get(url, {
        headers: { authorization: 'Bearer owner' },
      });
      if (!response.ok()) return null;
      const document = (await response.json()) as {
        fields?: { bestScore?: { integerValue?: string } };
      };
      return document.fields?.bestScore?.integerValue ?? null;
    })
    .toBe('3');
});

test('a full board replenishes without placing a new word in the removed slot', async ({
  page,
}) => {
  const bookId = `rush-${randomUUID()}`;
  const chapterId = 'chapter-1';
  const title = { eu: 'Proba', fr: 'Test' };
  const pairs = Array.from({ length: 9 }, (_, index) => ({
    eu: `hitz-${index}`,
    fr: `mot-${index}`,
  }));
  pairs.push({ eu: 'HITZ-0', fr: 'mot-1' });
  const book: PublishedBook = {
    title,
    chapters: [{ id: chapterId, number: 1, title }],
  };
  const chapter: PublishedChapter = {
    bookId,
    number: 1,
    title,
    objectives: [],
    sequences: [
      {
        id: 'matching',
        letter: 'A',
        title,
        contents: [
          {
            type: 'activity',
            kind: 'matching',
            id: 'pairs',
            title,
            instructions: title,
            items: [{ id: 'pairs-1', objectiveIds: [], pairs }],
          },
        ],
      },
    ],
  };
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await Promise.all([
      db.doc(`books/${bookId}`).set(book),
      db.doc(`books/${bookId}/chapters/${chapterId}`).set(chapter),
    ]);
    await page.clock.install();
    await page.goto(`/${bookId}/${chapterId}/vocabulary-rush`);
    await signInWithGoogle(page);
    const start = page.getByRole('button', { name: /Commencer/ });
    // Make the first refill reuse the French label just removed.
    await start.evaluate((button) => {
      button.addEventListener(
        'click',
        () => {
          let state = 9;
          Math.random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 2 ** 32;
          };
        },
        { capture: true, once: true },
      );
    });
    await start.click();
    await page.clock.fastForward(3_000);
    const board = page.locator('.rush-board');
    const french = board.getByRole('group', { name: 'Frantsesa / Français' });
    const basque = board.getByRole('group', { name: 'Euskara / Basque' });
    await expect(board.locator('[role="group"]').first()).toHaveAttribute(
      'aria-label',
      'Frantsesa / Français',
    );
    await expect(french.getByRole('button')).toHaveCount(6);
    await expect(basque.getByRole('button')).toHaveCount(6);
    const beforeEu = await slotContents(basque);
    const beforeFr = await slotContents(french);
    const first = pairs.find(({ eu }) => beforeEu.includes(eu));
    if (!first) throw new Error('The board contains no known pair.');
    await match(page, first.eu, first.fr);
    await expect(basque.getByRole('button')).toHaveCount(5);
    await expect(french.getByRole('button')).toHaveCount(5);
    await page.clock.fastForward(700);
    await expect(basque.getByRole('button')).toHaveCount(6);
    await expect(french.getByRole('button')).toHaveCount(6);

    const afterEu = await slotContents(basque);
    const afterFr = await slotContents(french);
    const added = pairs.find(({ eu }) => afterEu.includes(eu) && !beforeEu.includes(eu));
    if (!added) throw new Error('The board was not replenished with a new pair.');
    expect(added.fr).toBe(first.fr);
    expect(afterEu.indexOf(added.eu)).not.toBe(beforeEu.indexOf(first.eu));
    expect(afterFr.indexOf(added.fr)).not.toBe(beforeFr.indexOf(first.fr));
    for (const { before, after, removed } of [
      { before: beforeEu, after: afterEu, removed: first.eu },
      { before: beforeFr, after: afterFr, removed: first.fr },
    ]) {
      expect(
        before.filter(
          (word, index) =>
            word !== null && word !== removed && after.includes(word) && after[index] !== word,
        ),
      ).toHaveLength(1);
    }

    const matched = new Set([first.eu]);
    while (matched.size < pairs.length) {
      const current = await slotContents(basque);
      const currentFrench = await slotContents(french);
      for (const column of [current, currentFrench]) {
        const words = column.filter((word): word is string => word !== null);
        expect(new Set(words.map((word) => word.trim().toLowerCase())).size).toBe(words.length);
      }
      const next = pairs.find(({ eu }) => current.includes(eu) && !matched.has(eu));
      if (!next) throw new Error('No unmatched pair is available.');
      await match(page, next.eu, next.fr);
      matched.add(next.eu);
      await page.clock.fastForward(700);
    }
    await expect(page.locator('.score strong')).toHaveText('10');
    await expect(page.locator('.game-message')).toContainText('Vous avez trouvé toutes les paires');
  } finally {
    await db.terminate();
  }
});

test('the round expires after 60 seconds even if browser timers are delayed', async ({ page }) => {
  await page.clock.install();
  await page.goto('/a1/chapter-2/vocabulary-rush');
  await signInWithGoogle(page);
  await page.getByRole('button', { name: /Commencer/ }).click();
  await page.clock.fastForward(3_000);
  await expect(page.locator('.rush-board').getByRole('button').first()).toBeEnabled();

  await page.clock.fastForward(60_000);
  await expect(page.locator('.timer strong')).toHaveText('0 s');
  await expect(page.locator('.game-message')).toContainText('Temps écoulé');
  await expect(page.locator('.rush-board').getByRole('button').first()).toBeDisabled();
});

test('an offline score does not overwrite a higher score saved on another device', async ({
  page,
  context,
}) => {
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await page.clock.install();
    await page.goto('/a1/chapter-2/vocabulary-rush');
    const email = await signInWithGoogle(page);
    const uid = await learnerId(email);
    const scores = `learners/${uid}/books/a1/chapters/chapter-2/vocabularyRush`;
    await page.getByRole('button', { name: /Commencer/ }).click();
    await page.clock.fastForward(3_000);
    await expect(page.locator('.rush-board').getByRole('button').first()).toBeEnabled();

    await context.setOffline(true);
    await db.doc(`${scores}/5`).set({
      schemaVersion: 1,
      bookId: 'a1',
      chapterId: 'chapter-2',
      bestScore: 5,
    });
    for (const [eu, fr] of [
      ['ama', 'mère'],
      ['aita', 'père'],
      ['anaia', 'frère'],
    ]) {
      await match(page, eu, fr);
      await page.clock.fastForward(700);
    }
    await expect(page.locator('.best-score')).toContainText('3 paires');
    await context.setOffline(false);
    await expect(page.locator('.best-score')).toContainText('5 paires', { timeout: 30_000 });
    await expect.poll(async () => (await db.doc(`${scores}/3`).get()).exists).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await db.terminate();
  }
});
