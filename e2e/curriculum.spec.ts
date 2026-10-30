import { expect, test, type Locator } from '@playwright/test';
import { expectBilingualPresentation, signInWithGoogle } from './support.ts';

const red = 'rgb(179, 38, 30)';
const purple = 'rgb(107, 63, 160)';

function accent(marker: Locator): Promise<string> {
  return marker.evaluate((element) => getComputedStyle(element).backgroundColor);
}

test('a learner browses units, chapters and sequences in book order', async ({ page }) => {
  await page.goto('/');
  await signInWithGoogle(page);

  const unit = page.getByRole('region', { name: /Unité 1/ });
  await expect(unit.getByRole('heading', { level: 2 })).toHaveAccessibleName(
    '1. unitatea Unité 1 Lehen urratsak Premiers pas',
  );
  const chapters = unit.getByRole('listitem');
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
    /Note.*Le suffixe -ko.*on ajoute -ko au nom de la ville/,
    /Ressource externe.*Enregistrements audio/,
    /Traduction.*Traduisez.*2 questions dans la série/,
    /Remise en ordre.*Remettez les mots dans l’ordre.*2 questions dans la série/,
    /Activité orale facultative.*Dialogue à deux/,
  ]);
  const oralPrompt = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Dialogue à deux/ }) });
  await expect(oralPrompt.getByRole('textbox')).toHaveCount(0);
  await expect(oralPrompt.getByRole('radio')).toHaveCount(0);
  await expect(oralPrompt.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Enregistrements audio/ })).toHaveAttribute(
    'href',
    'https://example.org/ikasbide-audio',
  );
  // Accepted answers are never revealed while browsing.
  await expect(page.getByText('Baionakoa naiz.')).toHaveCount(0);
  await expectBilingualPresentation(page);

  await page.getByRole('link', { name: /Séquence précédente/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Kaixo! Bonjour !');
  await expect(page.getByRole('article')).toHaveText([
    /Note.*Les salutations/,
    /Dialogue.*Miren.*Bonjour ! Je suis Miren\. Et toi \?.*Jon/,
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
  await page.getByRole('button', { name: /Commencer les exercices/ }).click();

  await page.getByRole('textbox').fill('faux');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect(page.locator('app-activity-feedback [aria-hidden="true"]')).toHaveText('✕');
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
    page.getByRole('button', { name: /Hasi ariketak|Commencer les exercices/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Hasi ariketak|Commencer les exercices/ }).click();
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
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.clock.fastForward(600);
  await expect(page.getByText('Je suis de Bayonne.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Complétez les phrases/ })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(1);
});

test('a learner can answer a multiple-choice item', async ({ page }) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/greetings');
  await signInWithGoogle(page);

  await page.getByRole('button', { name: /Commencer les exercices/ }).click();
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
  await page.getByRole('button', { name: /Commencer les exercices/ }).click();

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
  await page.getByRole('button', { name: /Commencer les exercices/ }).click();

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
