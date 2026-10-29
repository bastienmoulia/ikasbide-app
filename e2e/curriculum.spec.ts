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
    page.getByRole('region', { name: /Objectifs d’apprentissage/ }).getByRole('listitem'),
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
    /Traduction.*Traduisez.*Je suis de Bayonne\..*Bilbon bizi naiz\./,
    /Remise en ordre.*Remettez les mots dans l’ordre.*Demandez d’où vient la personne\./,
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
  await expect(page.getByText('Je suis de Bayonne.')).toHaveAttribute('lang', 'fr');
  await expect(page.getByText('Bilbon bizi naiz.')).toHaveAttribute('lang', 'eu');
  // Accepted answers are never revealed while browsing.
  await expect(page.getByText('Baionakoa naiz.')).toHaveCount(0);
  await expectBilingualPresentation(page);

  await page.getByRole('link', { name: /Séquence précédente/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Kaixo! Bonjour !');
  await expect(page.getByRole('article')).toHaveText([
    /Note.*Les salutations/,
    /Dialogue.*Miren.*Bonjour ! Je suis Miren\. Et toi \?.*Jon/,
    /Texte à trous.*Complétez les phrases.*Kaixo, Jon.*Bonjour, je suis Jon\./,
    /QCM.*Choisissez la salutation.*Agur.*Kaixo.*Eskerrik asko/,
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

  const activity = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Complétez les phrases/ }) });
  await activity.getByRole('textbox').first().fill('NAIZ');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .first()
    .click();
  await expect(activity.getByRole('status').first()).toContainText('Correct');

  await activity.getByRole('textbox').nth(1).fill('ko');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(1)
    .click();
  await expect(activity.getByRole('status').nth(1)).toContainText('Incorrect');

  await activity.getByRole('textbox').nth(2).fill('on');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(2)
    .click();
  await expect(activity.getByRole('status').nth(2)).toContainText('Correct');

  await activity.getByRole('textbox').nth(3).fill('Kiaxo');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(3)
    .click();
  await expect(activity.getByRole('status').nth(3)).toContainText('Presque');
});

test('a learner can answer a multiple-choice item', async ({ page }) => {
  await page.goto('/chapitres/chapter-1/sequences/greetings');
  await signInWithGoogle(page);

  const activity = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Choisissez la salutation/ }) });
  await activity.getByRole('radio', { name: 'Agur' }).check();
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .first()
    .click();
  await expect(activity.getByRole('status').first()).toContainText('Correct');

  await activity.getByRole('radio', { name: 'Egun on' }).check();
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(1)
    .click();
  await expect(activity.getByRole('status').nth(1)).toContainText('Correct');
});

test('translation answers accept listed variants and preserve diacritic distinctions', async ({
  page,
}) => {
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);

  const activity = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Traduisez/ }) });
  await activity.getByRole('textbox').nth(0).fill('  Ni Baionakoa  naiz!! ');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(0)
    .click();
  await expect(activity.getByRole('status').nth(0)).toContainText('Correct');

  await activity.getByRole('textbox').nth(1).fill('J’habite a Bilbao.');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(1)
    .click();
  await expect(activity.getByRole('status').nth(1)).toContainText('Incorrect');

  await activity.getByRole('textbox').nth(1).fill('Jhabite à Bilbao.');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(1)
    .click();
  await expect(activity.getByRole('status').nth(1)).toContainText('Incorrect');

  await activity.getByRole('textbox').nth(1).fill('J’habite a\u0300 Bilbao');
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(1)
    .click();
  await expect(activity.getByRole('status').nth(1)).toContainText('Correct');
});

test('a learner can build a word-order answer from the offered words', async ({ page }) => {
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);

  const activity = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Remettez les mots dans l’ordre/ }) });
  await activity.getByRole('button', { name: 'Zu' }).click();
  await activity.getByRole('button', { name: 'nongoa' }).click();
  await activity.getByRole('button', { name: 'zara' }).click();
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .first()
    .click();
  await expect(activity.getByRole('status').first()).toContainText('Correct');

  await activity.getByRole('button', { name: 'Bilbon' }).click();
  await activity.getByRole('button', { name: 'bizi' }).click();
  await activity.getByRole('button', { name: 'naiz' }).click();
  await activity
    .getByRole('button', { name: /Vérifier/ })
    .nth(1)
    .click();
  await expect(activity.getByRole('status').nth(1)).toContainText('Correct');
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
