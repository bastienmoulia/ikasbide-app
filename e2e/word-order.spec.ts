import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { expect, test, type Page } from '@playwright/test';
import type {
  PublishedBook,
  PublishedChapter,
  WordOrderItem,
} from '../src/app/curriculum/curriculum.model.ts';
import { learnerId, signInWithGoogle, startPractice, storedAttempts } from './support.ts';

async function withWordOrder(
  page: Page,
  answers: Pick<WordOrderItem, 'words' | 'acceptedAnswers' | 'warningAnswers'>,
  run: (email: string) => Promise<void>,
): Promise<void> {
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  const bookId = `word-order-${randomUUID()}`;
  const title = { eu: 'Esaldia osatu', fr: 'Construire la phrase' };
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
        id: 'words',
        letter: 'A',
        title,
        contents: [
          {
            id: 'order',
            type: 'activity',
            kind: 'word-order',
            title,
            instructions: {
              eu: 'Aukeratu hitz egokiak.',
              fr: 'Choisissez les mots utiles.',
            },
            items: [
              {
                id: 'sentence',
                objectiveIds: [],
                prompt: title,
                ...answers,
              },
            ],
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
    await page.goto(`/${bookId}/chapter/words`);
    const email = await signInWithGoogle(page);
    await startPractice(page);
    await run(email);
  } finally {
    await Promise.all([
      db.doc(`books/${bookId}/chapters/chapter`).delete(),
      db.doc(`books/${bookId}`).delete(),
    ]);
    await db.terminate();
  }
}

test('a correct reconstruction waits for Continue, resumes after reload and records one attempt', async ({
  page,
}) => {
  await withWordOrder(
    page,
    {
      words: ['etorri', 'Ane', 'da', 'dira'],
      acceptedAnswers: ['Ane etorri da.'],
    },
    async (email) => {
      const uid = await learnerId(email);
      await selectWords(page, ['Ane', 'etorri', 'da']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      const correct = page.locator('app-activity-feedback[data-result="correct"]');
      await expect(correct).toBeVisible();
      await expect(page.locator('.answer')).toHaveText('Ane etorri da.');
      await page.clock.fastForward(10_000);
      await expect(correct).toBeVisible();
      await expect(page.getByRole('heading', { name: /Bravo/ })).toHaveCount(0);
      await expect.poll(async () => (await storedAttempts(uid)).length).toBe(1);
      const [original] = await storedAttempts(uid);

      await page.reload();
      await startPractice(page);
      await expect(correct).toBeVisible();
      await expect(page.locator('.answer')).toHaveText('Ane etorri da.');
      await page.clock.fastForward(10_000);
      await expect(correct).toBeVisible();
      expect(await storedAttempts(uid)).toEqual([original]);
      const next = page.getByRole('button', { name: /Continuer/ });
      await next.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
      expect(await storedAttempts(uid)).toEqual([original]);
      await page.reload();
      await startPractice(page);
      await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
      expect(await storedAttempts(uid)).toEqual([original]);
    },
  );
});

async function selectWords(page: Page, words: string[]): Promise<void> {
  for (const word of words) {
    await page
      .locator('.word-bank')
      .getByRole('button', { name: word, exact: true })
      .first()
      .click();
  }
}

test('terminal hints disappear, lexical capitals and commas remain, and the chosen alternative is restored', async ({
  page,
}) => {
  await withWordOrder(
    page,
    {
      words: ['Ane,', 'etorri', 'hona!', 'bihar'],
      acceptedAnswers: ['Ane, etorri hona!', 'Etorri hona, Ane!'],
    },
    async () => {
      await expect(page.locator('.word-bank .word')).toHaveText([
        'Ane,',
        'etorri',
        'hona',
        'bihar',
      ]);
      const verify = page.getByRole('button', { name: /Vérifier/ });
      await expect(verify).toBeDisabled();
      await selectWords(page, ['etorri', 'hona', 'Ane,']);
      await expect(page.locator('.word-answer .word')).toHaveText(['etorri', 'hona', 'Ane,']);
      await expect(page.locator('.word-bank .word')).toHaveText(['bihar']);
      await expect(verify).toBeEnabled();
      await verify.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Etorri hona, Ane!');
      await expect(page.locator('.correction')).toHaveCount(0);
    },
  );
});

test('repeated occurrences can be removed independently and unused distractors do not block success', async ({
  page,
}) => {
  await withWordOrder(
    page,
    {
      words: ['oso', 'ondo', 'oso', 'dago', 'dira', 'gaizki', 'ez'],
      acceptedAnswers: ['Oso oso ondo dago!'],
    },
    async () => {
      await selectWords(page, ['oso', 'oso']);
      await page.locator('.word-answer .word').first().click();
      await expect(page.locator('.word-answer .word')).toHaveText(['oso']);
      await expect(
        page.locator('.word-bank').getByRole('button', { name: 'oso', exact: true }),
      ).toHaveCount(1);
      await page.getByRole('button', { name: /Recommencer/ }).click();
      await expect(page.locator('.word-answer .word')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Vérifier/ })).toBeDisabled();
      await selectWords(page, ['oso', 'oso', 'ondo', 'dago']);
      await expect(page.locator('.word-bank .word')).toHaveText(['dira', 'gaizki', 'ez']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Oso oso ondo dago!');
    },
  );
});

test('warning variants leave unused words, restore their spelling and survive reload', async ({
  page,
}) => {
  await withWordOrder(
    page,
    {
      words: ['Ane', 'etorri', 'joan', 'da', 'dira'],
      acceptedAnswers: ['Ane etorri da.'],
      warningAnswers: ['Joan da Ane.', 'Ane joan da!'],
    },
    async () => {
      await selectWords(page, ['Ane', 'joan', 'da']);
      await expect(page.locator('.word-bank .word')).toHaveText(['etorri', 'dira']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      const warning = page.locator('app-activity-feedback[data-result="correct-with-warning"]');
      await expect(warning).toBeVisible();
      await expect(page.locator('.answer')).toHaveText('Ane joan da!');
      await expect(page.locator('.correction > span')).toHaveText('Ane etorri da.');
      await page.clock.fastForward(2_000);
      await expect(warning).toBeVisible();
      await page.reload();
      await startPractice(page);
      await expect(warning).toBeVisible();
      await expect(page.locator('.answer')).toHaveText('Ane joan da!');
      await expect(page.locator('.correction > span')).toHaveText('Ane etorri da.');
      await page.getByRole('button', { name: /Continuer/ }).click();
      await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
    },
  );
});

test('using a distractor is still incorrect', async ({ page }) => {
  await withWordOrder(
    page,
    {
      words: ['Ane', 'etorri', 'da', 'dira'],
      acceptedAnswers: ['Ane etorri da.'],
    },
    async () => {
      await selectWords(page, ['Ane', 'etorri', 'dira']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute(
        'data-result',
        'incorrect',
      );
      await expect(page.locator('.answer')).toHaveText('Ane etorri dira');
      await expect(page.locator('.correction > span')).toHaveText('Ane etorri da.');
    },
  );
});

for (const ending of ['.', '?', '!', '?!', '...', '…']) {
  test(`legacy ending ${ending} preserves abbreviations and ellipses`, async ({ page }) => {
    const lastWord = ending === '...' || ending === '…' ? `da${ending}` : 'da';
    await withWordOrder(
      page,
      {
        words: ['Dr.', 'Ane', 'etorri', `da${ending}`],
        acceptedAnswers: [`Dr. Ane etorri da${ending}`],
      },
      async () => {
        await expect(page.locator('.word-bank .word')).toHaveText([
          'Dr.',
          'Ane',
          'etorri',
          lastWord,
        ]);
        await selectWords(page, ['Dr.', 'Ane', 'etorri', lastWord]);
        await page.getByRole('button', { name: /Vérifier/ }).click();
        await expect(page.locator('app-activity-feedback')).toHaveAttribute(
          'data-result',
          'correct',
        );
        await expect(page.locator('.answer')).toHaveText(`Dr. Ane etorri da${ending}`);
      },
    );
  });
}

for (const ending of ['.', '?', '!', '?!']) {
  test(`an isolated terminal ${ending} does not leave an empty button`, async ({ page }) => {
    await withWordOrder(
      page,
      {
        words: ['mot', ending],
        acceptedAnswers: [`Mot${ending}`],
      },
      async () => {
        await expect(page.locator('.word-bank .word')).toHaveText(['mot']);
        await page.locator('.word-bank').getByRole('button', { name: 'mot', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.word-answer .word')).toHaveText(['mot']);
        await page.clock.fastForward(1);
        await expect(page.getByRole('button', { name: /Vérifier/ })).toBeFocused();
        await page.getByRole('button', { name: /Vérifier/ }).click();
        await expect(page.locator('app-activity-feedback')).toHaveAttribute(
          'data-result',
          'correct',
        );
        await expect(page.locator('.answer')).toHaveText(`Mot${ending}`);
      },
    );
  });
}

test('isolated internal punctuation, commas and ellipses remain visible', async ({ page }) => {
  await withWordOrder(
    page,
    {
      words: ['Ane', '?', 'etorri', 'da', '!', ',', '...', '…'],
      acceptedAnswers: ['Ane ? etorri da!'],
    },
    async () => {
      await expect(page.locator('.word-bank .word')).toHaveText([
        'Ane',
        '?',
        'etorri',
        'da',
        ',',
        '...',
        '…',
      ]);
    },
  );
});

test('an internal abbreviation does not keep a separate terminal dot visible', async ({ page }) => {
  await withWordOrder(
    page,
    {
      words: ['Dr.', 'Ane', '.'],
      acceptedAnswers: ['Dr. Ane.'],
    },
    async () => {
      await expect(page.locator('.word-bank .word')).toHaveText(['Dr.', 'Ane']);
      await selectWords(page, ['Dr.', 'Ane']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Dr. Ane.');
    },
  );
});

test('an intact multi-word label can be selected and submitted', async ({ page }) => {
  await withWordOrder(
    page,
    {
      words: ['da', 'Ane etorri', 'dira'],
      acceptedAnswers: ['Ane etorri da.'],
    },
    async () => {
      await selectWords(page, ['Ane etorri', 'da']);
      await expect(page.locator('.word-answer .word')).toHaveText(['Ane etorri', 'da']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Ane etorri da.');
    },
  );
});

for (const answer of ['Etorri da!', 'Etorri da !']) {
  test(`a multi-word label hides the ending in ${answer}`, async ({ page }) => {
    await withWordOrder(
      page,
      {
        words: ['etorri da!', 'bihar'],
        acceptedAnswers: [answer],
      },
      async () => {
        await expect(page.locator('.word-bank .word')).toHaveText(['etorri da', 'bihar']);
        await selectWords(page, ['etorri da']);
        await page.getByRole('button', { name: /Vérifier/ }).click();
        await expect(page.locator('app-activity-feedback')).toHaveAttribute(
          'data-result',
          'correct',
        );
        await expect(page.locator('.answer')).toHaveText(answer);
      },
    );
  });
}

test('a compound final label keeps its internal abbreviation', async ({ page }) => {
  await withWordOrder(
    page,
    {
      words: ['Dr. Ane etorri da!', 'bihar'],
      acceptedAnswers: ['Dr. Ane etorri da !'],
    },
    async () => {
      await expect(page.locator('.word-bank .word')).toHaveText(['Dr. Ane etorri da', 'bihar']);
      await selectWords(page, ['Dr. Ane etorri da']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Dr. Ane etorri da !');
    },
  );
});

for (const [label, answer] of [
  ['«bonjour!»', '«Bonjour!»'],
  ['“bonjour?”', '“Bonjour?”'],
  ['"bonjour."', '"Bonjour."'],
  ['(bonjour!)', '(Bonjour!)'],
  ['[bonjour?]', '[Bonjour?]'],
]) {
  test(`a terminal sign before closing quotes is hidden in ${label}`, async ({ page }) => {
    const visible = label.replace(/[.!?]/u, '');
    await withWordOrder(
      page,
      {
        words: [label, 'bihar'],
        acceptedAnswers: [answer],
      },
      async () => {
        await expect(page.locator('.word-bank .word')).toHaveText([visible, 'bihar']);
        await selectWords(page, [visible]);
        await page.getByRole('button', { name: /Vérifier/ }).click();
        await expect(page.locator('app-activity-feedback')).toHaveAttribute(
          'data-result',
          'correct',
        );
        await expect(page.locator('.answer')).toHaveText(answer);
      },
    );
  });
}

test('a lexical ending is hidden even when the accepted answer has no punctuation', async ({
  page,
}) => {
  await withWordOrder(
    page,
    {
      words: ['alpha', 'beta?', 'gamma'],
      acceptedAnswers: ['Alpha beta'],
    },
    async () => {
      await expect(page.locator('.word-bank .word')).toHaveText(['alpha', 'beta', 'gamma']);
      await selectWords(page, ['alpha', 'beta']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Alpha beta');
    },
  );
});

test('an isolated ending is hidden even when the accepted answer has no punctuation', async ({
  page,
}) => {
  await withWordOrder(
    page,
    {
      words: ['alpha', 'beta', '?', '.', '!', ',', '...', '…'],
      acceptedAnswers: ['Alpha beta'],
    },
    async () => {
      await expect(page.locator('.word-bank .word')).toHaveText(['alpha', 'beta', ',', '...', '…']);
      await selectWords(page, ['alpha', 'beta']);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
      await expect(page.locator('.answer')).toHaveText('Alpha beta');
    },
  );
});

for (const { acceptedAnswers, words, selected, expected } of [
  {
    acceptedAnswers: ['Hemen zara zu.', 'Zu hemen zara?'],
    words: ['zu', 'zara', 'hemen', 'zira'],
    selected: ['zu', 'hemen', 'zira'],
    expected: 'Zu hemen zira?',
  },
  {
    acceptedAnswers: ['Zara zu?'],
    words: ['zu', 'zara', 'zira'],
    selected: ['zira', 'zu'],
    expected: 'Zira zu?',
  },
]) {
  test(`the automatic dialect warning restores ${expected}`, async ({ page }) => {
    await withWordOrder(page, { words, acceptedAnswers }, async () => {
      await selectWords(page, selected);
      await page.getByRole('button', { name: /Vérifier/ }).click();
      const warning = page.locator('app-activity-feedback[data-result="correct-with-warning"]');
      await expect(warning).toBeVisible();
      await expect(page.locator('.answer')).toHaveText(expected);
      await expect(page.locator('.correction > span')).toHaveText(acceptedAnswers[0]);
      await page.reload();
      await startPractice(page);
      await expect(warning).toBeVisible();
      await expect(page.locator('.answer')).toHaveText(expected);
      await expect(page.locator('.correction > span')).toHaveText(acceptedAnswers[0]);
      await page.getByRole('button', { name: /Continuer/ }).click();
      await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
    });
  });
}
