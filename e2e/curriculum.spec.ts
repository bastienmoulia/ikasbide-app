import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  answerCurrentChoice,
  answerCurrentText,
  attemptSummary,
  expectBilingualPresentation,
  learnerId,
  signInWithGoogle,
  skipReadings,
  startPractice,
  storedAttempts,
} from './support.ts';

const red = 'rgb(179, 38, 30)';
const purple = 'rgb(107, 63, 160)';

function accent(marker: Locator): Promise<string> {
  return marker.evaluate((element) => getComputedStyle(element).backgroundColor);
}

async function expectFeedbackIconBesideText(page: Page): Promise<void> {
  const layout = await page.locator('app-activity-feedback').evaluate((element) => {
    const icon = element.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    const text = element.querySelector<HTMLElement>('app-bilingual-text')!;
    return {
      iconRight: icon.getBoundingClientRect().right,
      textLeft: text.getBoundingClientRect().left,
    };
  });
  expect(layout.textLeft).toBeGreaterThan(layout.iconRight);
}

test('a learner browses a book, chapters and sequences in book order', async ({ page }) => {
  await page.goto('/');
  await signInWithGoogle(page);

  const book = page.getByRole('region', { name: /Lehen urratsak/ });
  const bookTitle = book.getByRole('heading', { level: 2 });
  await expect(bookTitle).toHaveAccessibleName('Lehen urratsak');
  await expect(bookTitle.locator('[lang="fr"]')).toHaveCount(0);
  const chapters = book.getByRole('listitem');
  await expect(chapters).toHaveText([/Chapitre 1.*Les présentations/, /Chapitre 2.*La famille/]);
  // Colour follows the book's cycle but the chapter number always accompanies it.
  const chapter1Marker = chapters.nth(0).locator('.chapter-marker');
  await expect(chapter1Marker).toHaveText('1');
  expect(await accent(chapter1Marker)).toBe(red);
  const chapter2Marker = chapters.nth(1).locator('.chapter-marker');
  await expect(chapter2Marker).toHaveText('2');
  expect(await accent(chapter2Marker)).toBe(purple);
  await expectBilingualPresentation(page);

  await chapters.nth(0).getByRole('link').click();
  await expect(page).toHaveURL(/\/chapitres\/chapter-1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Aurkezpenak Les présentations',
  );
  expect(await accent(page.locator('.chapter-marker'))).toBe(red);
  await expect(
    page.getByRole('region', { name: /Carte de progression/ }).getByRole('listitem'),
  ).toHaveText([/Saluer et se présenter/, /Dire d’où l’on vient et où l’on habite/]);
  const sequences = page.getByRole('region', { name: /Séquences/ }).getByRole('listitem');
  await expect(sequences).toHaveText([/A.*Bonjour !/, /B.*D’où es-tu ?/]);
  await expectBilingualPresentation(page);

  // No score-based lock: the second sequence opens without practising the first.
  await sequences.nth(1).getByRole('link').click();
  await expect(page).toHaveURL(/\/chapitres\/chapter-1\/sequences\/origin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Nongoa zara? D’où es-tu ?',
  );
  await expect(page.getByRole('article')).toHaveText([
    /Note.*Le suffixe -ko/,
    /Ressource externe.*Enregistrements audio/,
    /Traduction.*2 questions dans la série/,
    /Remise en ordre.*2 questions dans la série/,
    /Activité orale facultative.*Dialogue à deux/,
  ]);
  const oralPrompt = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Dialogue à deux/ }) });
  await expect(oralPrompt.getByRole('textbox')).toHaveCount(0);
  await expect(oralPrompt.getByRole('radio')).toHaveCount(0);
  await expect(oralPrompt.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Enregistrements audio/ })).toHaveCount(0);
  // Accepted answers are never revealed while browsing.
  await expect(page.getByText('Baionakoa naiz.')).toHaveCount(0);
  await expectBilingualPresentation(page);

  await page.getByRole('link', { name: /Séquence précédente/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Kaixo! Bonjour !');
  await expect(page.getByRole('article')).toHaveText([
    /Note.*Les salutations/,
    /Dialogue.*Modèle de dialogue/,
    /Texte à trous.*Complétez les phrases.*4 questions dans la série/,
    /QCM.*Choisissez la salutation.*2 questions dans la série/,
  ]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Kaixo! Bonjour !');
  await page.getByRole('link', { name: /Retour au chapitre/ }).click();
  await page.getByRole('link', { name: /Retour au parcours/ }).click();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
});

test('a learner gets item-level feedback for gap-fill answers', async ({ page }) => {
  await page.goto('/chapitres/chapter-1/sequences/greetings');
  await signInWithGoogle(page);
  await startPractice(page);

  await page.getByRole('textbox').fill('faux');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect(page.locator('app-activity-feedback [aria-hidden="true"]')).toHaveText('✕');
  await expectFeedbackIconBesideText(page);
  await expect(page.getByText('faux', { exact: true })).toBeVisible();
  await expect(page.getByText('naiz', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('textbox')).toHaveCount(1);
});

test('a learner starts a sequence practice with one item and advances after a correct answer', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/greetings');
  await signInWithGoogle(page);

  await expect(
    page.getByRole('button', { name: /Hasi ibilbidea|Commencer le parcours/ }),
  ).toBeVisible();
  await startPractice(page);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '6');
  await expect(page.getByRole('heading', { name: /Complétez les phrases/ })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /Choisissez la salutation/ })).toHaveCount(0);
  await expect(page.getByText('Bonjour, je suis Jon.')).toBeVisible();

  await page.getByRole('textbox').fill('naiz');
  await page.getByRole('button', { name: /Egiaztatu|Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Zuzena|Correct/ })).toBeVisible();
  await expect(page.locator('app-activity-feedback [aria-hidden="true"]')).toHaveText('✓');
  await expectFeedbackIconBesideText(page);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.clock.fastForward(600);
  await expect(page.getByText('Je suis de Bayonne.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Complétez les phrases/ })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(1);
});

test('a warning waits for Continue, survives reload and resolves without retrying', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/greetings');
  const email = await signInWithGoogle(page);
  await startPractice(page);
  for (const answer of ['naiz', 'koa', 'on']) await answerCurrentText(page, answer);
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 3');
  const uid = await learnerId(email);

  await page.getByRole('textbox').fill('  EGUN   ON!! ');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  const warning = page.locator('app-activity-feedback[data-result="correct-with-warning"]');
  await expect(warning).toContainText('Réponse acceptée, mais une autre était attendue.');
  await expect(warning.locator('[aria-hidden="true"]')).toHaveText('⚠');
  await expect(page.locator('.correction')).toContainText('Kaixo');
  await expectFeedbackIconBesideText(page);
  await expectBilingualPresentation(page);
  await page.clock.fastForward(2_000);
  await expect(warning).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3');
  expect(await storedAttempts(uid)).toHaveLength(3);

  await page.reload();
  await startPractice(page);
  await expect(warning).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3');
  expect(await storedAttempts(uid)).toHaveLength(3);

  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '4');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 4');
  const attempts = await storedAttempts(uid);
  expect(
    attempts.filter(({ fields }) => fields['outcome'] === 'correct-with-warning'),
  ).toHaveLength(1);
  for (const { fields } of attempts) expect(fields).not.toHaveProperty('answer');

  await answerCurrentChoice(page, 'Agur');
  await answerCurrentChoice(page, 'Egun on');
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '6');
  await page.reload();
  await startPractice(page);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 6');
});

test('translation and word-order warning variants show the canonical expected answer', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);
  await startPractice(page);
  await answerCurrentText(page, 'Ni Baionakoa naiz.');
  await page.getByRole('textbox').fill('Je réside à Bilbao.');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  const warning = page.locator('app-activity-feedback[data-result="correct-with-warning"]');
  await expect(warning).toBeVisible();
  await expect(page.locator('.correction > span')).toHaveText('J’habite à Bilbao.');
  await expect(page.locator('.correction > span')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: /Continuer/ }).click();

  for (const word of ['Zu', 'nongoa', 'zara']) {
    await page.getByRole('button', { name: word, exact: true }).click();
  }
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await page.clock.fastForward(600);
  for (const word of ['bizi', 'naiz', 'Bilbon']) {
    await page.getByRole('button', { name: word, exact: true }).click();
  }
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(warning).toBeVisible();
  await expect(page.locator('.correction > span')).toHaveText('Bilbon bizi naiz.');
  await expect(page.locator('.correction > span')).toHaveAttribute('lang', 'eu');
  await page.clock.fastForward(2_000);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.locator('app-reading-player')).toBeVisible();
  await skipReadings(page);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 4');
});

test('a learner can answer a multiple-choice item', async ({ page }) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/greetings');
  await signInWithGoogle(page);

  await startPractice(page);
  for (const answer of ['naiz', 'koa', 'on', 'Kaixo']) {
    await page.getByRole('textbox').fill(answer);
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
    await page.clock.fastForward(600);
  }

  const player = page.locator('app-activity-player');
  await expect(player.getByRole('radio')).toHaveCount(0);
  await expect(player.getByRole('button', { name: /Vérifier/ })).toHaveCount(0);
  await player.getByRole('button', { name: 'Kaixo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect(player.getByRole('button', { name: 'Kaixo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.correction')).toContainText('Agur');
  await page.getByRole('button', { name: /Continuer/ }).click();

  await expect(player.getByRole('button', { name: 'Egun on' })).toBeVisible();
  await player.getByRole('button', { name: 'Egun on' }).focus();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await player.getByRole('button', { name: 'Agur' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '6');
  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '6');
  await expect(page.getByRole('link', { name: /Séquence suivante/ })).toBeVisible();
});

test('translation answers accept listed variants and preserve diacritic distinctions', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);
  await startPractice(page);

  const answer = page.getByRole('textbox');
  await expect(page.locator('app-activity-player .source')).toHaveAttribute('lang', 'fr');
  await expect(page.getByText('Je suis de Bayonne.')).toBeVisible();
  await answer.fill('  Ni Baionakoa  naiz!! ');
  await answer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);

  await expect(page.getByText('Bilbon bizi naiz.')).toBeVisible();
  await answer.fill('J’habite a Bilbao.');
  await answer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect(page.getByText('J’habite à Bilbao.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('button', { name: 'Zu', exact: true })).toBeVisible();
});

test('a learner can build a word-order answer from the offered words', async ({ page }) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);
  await startPractice(page);

  for (const answer of ['Ni Baionakoa naiz.', 'J’habite à Bilbao.']) {
    await page.getByRole('textbox').fill(answer);
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
    await page.clock.fastForward(600);
  }

  await page.getByRole('button', { name: 'Zu', exact: true }).click();
  await page.getByRole('button', { name: 'nongoa', exact: true }).click();
  await page.getByRole('button', { name: 'zara', exact: true }).focus();
  await page.keyboard.press('Enter');
  const verify = page.getByRole('button', { name: /Vérifier/ });
  await expect(verify).toBeFocused();
  await expect(page.locator('app-activity-feedback')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);

  await page.getByRole('button', { name: 'Bilbon', exact: true }).click();
  await page.getByRole('button', { name: 'bizi', exact: true }).click();
  await page.getByRole('button', { name: 'naiz', exact: true }).click();
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await expect(page.locator('app-reading-player')).toBeVisible();
  await skipReadings(page);
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
});

test('unknown curriculum addresses show an explicit not-found state', async ({ page }) => {
  await page.goto('/');
  await signInWithGoogle(page);
  await expect(page.getByRole('link', { name: /Chapitre 1/ })).toBeVisible();
  await page.goto('/chapitres/chapter-99');
  await expect(page.getByRole('alert')).toContainText('Ce chapitre n’est pas publié.');
  await page.goto('/chapitres/chapter-1/sequences/missing');
  await expect(page.getByRole('alert')).toContainText(
    'Cette séquence n’existe pas dans ce chapitre.',
  );
  await expect(page.getByRole('link', { name: /Retour au chapitre/ })).toBeVisible();
});

test('a signed-out visitor following a curriculum link sees only the sign-in entry point', async ({
  page,
}) => {
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.getByText('D’où es-tu ?')).toHaveCount(0);
});
