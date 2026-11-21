import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { expect, test } from '@playwright/test';
import type {
  MultipleChoiceItem,
  PublishedBook,
  PublishedChapter,
} from '../src/app/curriculum/curriculum.model.ts';
import {
  answerCurrentText,
  expectBilingualPresentation,
  learnerId,
  signInWithGoogle,
  startCourse,
  startPractice,
  storedAttempts,
} from './support.ts';

const screenshotOptions = {
  fullPage: true,
  style: '.firebase-emulator-warning { visibility: hidden; }',
};

test('the next-step title is visually separated from its bilingual label', async ({ page }) => {
  await page.goto('/a1/chapter-1/greetings');
  await signInWithGoogle(page);
  const label = page.locator('.journey-overview strong');
  const title = page.locator('.journey-overview strong + app-bilingual-text');
  await expect(title).toBeVisible();
  const labelBox = await label.boundingBox();
  const titleBox = await title.boundingBox();
  expect(titleBox!.y - (labelBox!.y + labelBox!.height)).toBeGreaterThanOrEqual(8);
});

test('French gap-fill prompts are visible immediately and on the next item', async ({ page }) => {
  await page.clock.install();
  await page.goto('/a1/chapter-1/greetings');
  const uid = await learnerId(await signInWithGoogle(page));
  await startPractice(page);
  const translation = page.locator('app-activity-player .prompt-translation');
  await expect(translation).toHaveText('Bonjour, je suis Jon.');
  await expect(translation).toBeVisible({ timeout: 1_000 });
  await expect(translation).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('textbox')).toHaveAccessibleDescription('Bonjour, je suis Jon.', {
    timeout: 1_000,
  });
  expect(await storedAttempts(uid)).toHaveLength(0);
  await answerCurrentText(page, 'naiz');
  await expect(translation).toHaveText('Je suis de Bayonne.');
  await expect(translation).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveAccessibleDescription('Je suis de Bayonne.');
  await expect(page.getByRole('textbox')).toBeFocused();
});

test('a French-only multiple-choice prompt does not reveal the Basque answer', async ({ page }) => {
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  const bookId = `choice-prompt-${randomUUID()}`;
  const title = { eu: 'Proba', fr: 'Démonstration' };
  const frenchOnlyItem: MultipleChoiceItem = {
    id: 'french-only',
    objectiveIds: [],
    promptLanguage: 'fr',
    prompt: { eu: 'Autoa berdea da.', fr: 'La voiture est verte.' },
    choices: [
      { id: 'green', lang: 'eu', text: 'berdea' },
      { id: 'blue', lang: 'eu', text: 'urdina' },
    ],
    correctChoiceIds: ['green'],
  };
  const defaultItem: MultipleChoiceItem = {
    id: 'default',
    objectiveIds: [],
    prompt: { eu: 'Zein zenbaki da?', fr: 'Quel nombre ?' },
    choices: [
      { id: 'one', lang: 'eu', text: 'bat' },
      { id: 'two', lang: 'eu', text: 'bi' },
    ],
    correctChoiceIds: ['one'],
  };
  const book: PublishedBook = {
    title,
    chapters: [{ id: 'chapter', number: 1, title }],
  };
  const chapter: PublishedChapter = {
    bookId,
    number: 1,
    title,
    objectives: [],
    sequences: [
      {
        id: 'practice',
        letter: 'A',
        title,
        contents: [
          {
            type: 'activity',
            kind: 'multiple-choice',
            id: 'choices',
            title,
            instructions: { eu: 'Aukeratu erantzuna.', fr: 'Choisissez la réponse.' },
            items: [frenchOnlyItem, defaultItem],
          },
        ],
      },
    ],
  };
  try {
    await Promise.all([
      db.doc(`books/${bookId}`).set(book),
      db.doc(`books/${bookId}/chapters/chapter`).set(chapter),
    ]);
    await page.clock.install();
    await page.goto(`/${bookId}/chapter/practice`);
    await signInWithGoogle(page);
    await startPractice(page);

    const player = page.locator('app-activity-player');
    await expect(player.getByText('Autoa berdea da.', { exact: true })).toHaveCount(0, {
      timeout: 1_000,
    });
    const frenchPrompt = player.locator('p[lang="fr"]');
    await expect(frenchPrompt).toHaveText('La voiture est verte.');
    await expect(frenchPrompt).toBeVisible();
    const choices = player.getByRole('group', { name: 'Erantzun-aukerak / Choix de réponse' });
    await expect(choices).toHaveAccessibleDescription('La voiture est verte.', { timeout: 1_000 });
    await player.getByRole('button', { name: 'berdea', exact: true }).click();
    await expect(player.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
    await expect(player.getByText('Autoa berdea da.', { exact: true })).toHaveCount(0);

    await page.clock.fastForward(600);
    const defaultPrompt = player
      .locator('app-bilingual-text')
      .filter({ hasText: 'Zein zenbaki da?' });
    await expect(defaultPrompt).toHaveAttribute('data-mode', 'reveal');
    await expect(defaultPrompt.locator('[lang="eu"]')).toHaveText('Zein zenbaki da?');
    await expect(choices).not.toHaveAttribute('aria-describedby');
  } finally {
    await Promise.all([
      db.doc(`books/${bookId}/chapters/chapter`).delete(),
      db.doc(`books/${bookId}`).delete(),
    ]);
    await db.terminate();
  }
});

test('retrying is optional, keeps the same step and preserves immutable attempt evidence', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/a1/chapter-1/greetings');
  const uid = await learnerId(await signInWithGoogle(page));
  await startPractice(page);
  await page.getByRole('textbox').fill('incorrect');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect.poll(async () => (await storedAttempts(uid)).length).toBe(1);
  await page.reload();
  await startPractice(page);
  await page.getByRole('button', { name: /Réessayer/ }).click();
  await expect(page.getByRole('textbox')).toBeFocused();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2');
  await answerCurrentText(page, 'naiz');
  await expect(page.locator('.practice-toolbar .success-count')).toHaveText('1');
  await expect(page.locator('.practice-toolbar .success-count')).toHaveAccessibleName(
    '1 ariketa gaindituta / 1 exercice réussi',
  );
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3');
  await expect.poll(async () => (await storedAttempts(uid)).length).toBe(2);
  const attempts = await storedAttempts(uid);
  expect(attempts.map(({ fields }) => fields['outcome']).sort()).toEqual(['correct', 'incorrect']);
  expect(new Set(attempts.map(({ fields }) => fields['itemId'])).size).toBe(1);
  for (const { fields } of attempts) expect(fields).not.toHaveProperty('answer');
});

test('home resumes the last started sequence after reload without resetting progress', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/a1/chapter-1/greetings');
  await signInWithGoogle(page);
  await startPractice(page);
  await answerCurrentText(page, 'naiz');
  await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
  await expect(page.locator('.journey-overview')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sequence.png'), ...screenshotOptions });
  await page.getByRole('link', { name: /Retour au chapitre/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Aurkezpenak Les présentations',
  );
  await page.screenshot({ path: testInfo.outputPath('chapter.png'), ...screenshotOptions });
  await page.locator('header .brand').click();
  const resume = page.getByRole('link', { name: /Reprendre ma séquence/ });
  await expect(resume).toHaveAttribute('href', '/a1/chapter-1/greetings');
  await page.reload();
  await expect(resume).toBeVisible();
  await expectBilingualPresentation(page);
  const [action, book] = await Promise.all([
    resume.boundingBox(),
    page.getByRole('heading', { name: 'Lehen urratsak' }).boundingBox(),
  ]);
  expect(action!.y + action!.height).toBeLessThanOrEqual(book!.y);
  await expect(page.locator('app-curriculum-home')).not.toContainText(
    /Erronka laburrak|Pausoz pauso|Euskara, zure erritmoan|Jarraitu gomendatutako/,
  );
  await page.screenshot({ path: testInfo.outputPath('home.png'), ...screenshotOptions });
  await resume.click();
  await startPractice(page);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3');
  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '8');
  await page.screenshot({ path: testInfo.outputPath('activity.png'), ...screenshotOptions });
});

test('bookmark is account-scoped and malformed or unpublished locations do not block browsing', async ({
  page,
}) => {
  await page.goto('/');
  const uid = await learnerId(await signInWithGoogle(page));
  const key = `ikasbide:last-practice:v1:${encodeURIComponent(uid)}:a1`;
  await page.evaluate((key) => localStorage.setItem(key, '{invalid'), key);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'La dernière séquence n’a pas pu être retrouvée',
  );
  await expect(page.getByRole('link', { name: /Passer à la pratique/ })).toBeVisible();

  for (const bookmark of [
    { chapterId: 'unpublished', sequenceId: 'missing' },
    { chapterId: 'chapter-1', sequenceId: 'missing' },
  ]) {
    await page.evaluate(
      ({ key, bookmark }) => localStorage.setItem(key, JSON.stringify(bookmark)),
      {
        key,
        bookmark,
      },
    );
    await page.reload();
    await expect(page.getByRole('link', { name: /Passer à la pratique/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          chapterId: 'chapter-1',
          sequenceId: 'greetings',
        }),
      ),
    key,
  );
  await page.reload();
  await expect(page.getByRole('link', { name: /Reprendre ma séquence/ })).toBeVisible();
  await page.locator('header .account-trigger').click();
  await page.getByRole('button', { name: /Se déconnecter/ }).click();
  await signInWithGoogle(page);
  await expect(page.getByRole('link', { name: /Passer à la pratique/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Reprendre ma séquence/ })).toHaveCount(0);
});

test('unavailable bookmark storage reports an error while practice remains usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('ikasbide:last-practice:'))
        throw new DOMException('Unavailable', 'SecurityError');
      return read.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('ikasbide:last-practice:'))
        throw new DOMException('Unavailable', 'SecurityError');
      return write.call(this, key, value);
    };
  });
  await page.goto('/');
  await signInWithGoogle(page);
  await expect(page.getByRole('alert')).toContainText(
    'La dernière séquence n’a pas pu être retrouvée',
  );
  await page.getByRole('link', { name: /Les présentations/ }).click();
  const summary = page.locator('.progress-details summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: /Carte de progression/ })).toBeVisible();
  await summary.press('Enter');
  await expect(page.getByRole('region', { name: /Carte de progression/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Bonjour !/ }).click();
  await startPractice(page);
  await expect(page.getByRole('alert')).toContainText(
    'La dernière séquence n’a pas pu être mémorisée',
  );
  await page.getByRole('textbox').fill('naiz');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
});

test('all exercises count, corrected retries do not penalize the result and a memo needs no prior visit', async ({
  page,
}) => {
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  const bookId = `express-${randomUUID()}`;
  const title = { eu: 'Proba', fr: 'Démonstration' };
  const chapter: PublishedChapter = {
    bookId,
    number: 1,
    title,
    objectives: [],
    sequences: [
      {
        id: 'practice',
        letter: 'A',
        title,
        contents: [
          {
            type: 'activity',
            kind: 'multiple-choice',
            id: 'questions',
            title,
            instructions: { eu: 'A hautatu.', fr: 'Choisir A.' },
            items: Array.from({ length: 17 }, (_, index) => ({
              id: `item-${index}`,
              objectiveIds: [],
              prompt: { eu: `${index + 1}. galdera`, fr: `Question fictive ${index + 1}` },
              choices: [
                { id: 'a', lang: 'fr', text: 'A' },
                { id: 'b', lang: 'fr', text: 'B' },
              ],
              correctChoiceIds: ['a'],
            })),
          },
          {
            type: 'resource',
            kind: 'note',
            id: 'memo',
            title: { eu: 'Oharra', fr: 'Note fictive' },
            body: { eu: 'A aukera hautatu.', fr: 'Choisir la réponse A.' },
          },
        ],
      },
    ],
  };
  const book: PublishedBook = {
    title,
    chapters: [{ id: 'chapter', number: 1, title }],
  };
  try {
    await db.doc(`books/${bookId}`).set(book);
    await db.doc(`books/${bookId}/chapters/chapter`).set(chapter);
    await page.clock.install();
    await page.goto('/a1/chapter-2/family-words');
    await signInWithGoogle(page);
    await startPractice(page);
    await expect(page.locator('.practice-memo')).toHaveCount(0);
    await page.goto(`/${bookId}/chapter`);
    await expect(page.getByRole('link', { name: /17 exercices/ })).toBeVisible();
    await page.locator('header .brand').click();
    await expect(page.getByRole('link', { name: /Reprendre ma séquence/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Passer à la pratique/ })).toHaveAttribute(
      'href',
      `/${bookId}/chapter`,
    );
    await page.goto(`/${bookId}/chapter/practice`);
    await expect(page.locator('.mission-size')).toContainText('17 exercices · 1 ressource');
    await startCourse(page);
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
    const memo = page.locator('.practice-memo');
    await expect(memo).not.toHaveAttribute('open', '');
    await memo.locator('summary').click();
    await expect(memo.locator('app-reading-player')).toContainText('Choisir la réponse A.');
    await expect(memo.locator('summary')).toBeFocused();
    await expectBilingualPresentation(page);
    await page.getByRole('button', { name: 'B', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
    await page.getByRole('button', { name: /Réessayer/ }).click();
    for (let index = 0; index < 17; index++) {
      await expect(page.getByRole('progressbar')).toHaveAttribute('max', '18');
      await page.getByRole('button', { name: 'A', exact: true }).click();
      await page.clock.fastForward(600);
      if (index < 16) await expect(memo).not.toHaveAttribute('open', '');
    }
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '17');
    await page.getByRole('button', { name: /Hurrengoa Suivant/ }).click();
    await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
    await expect(page.locator('.completion .success-count')).toHaveText('17 / 17');
    await expect(page.locator('.completion .success-count')).toHaveAccessibleName(
      '17 / 17 ariketa gaindituta / 17 / 17 exercices réussis',
    );
    await expect(page.locator('.completion')).toContainText('0 exercices à revoir');
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '18');
  } finally {
    await db.doc(`books/${bookId}/chapters/chapter`).delete();
    await db.doc(`books/${bookId}`).delete();
    await db.terminate();
  }
});
