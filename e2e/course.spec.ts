import { expect, test } from '@playwright/test';
import {
  answerCurrentText,
  attemptSummary,
  expectBilingualPresentation,
  learnerId,
  signInWithGoogle,
  skipReadings,
  startCourse,
  storedAttempts,
} from './support.ts';

const greetings = '/chapitres/chapter-1/sequences/greetings';

test('reading steps resume across devices and never become attempts', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(greetings);
  const email = await signInWithGoogle(page);
  const uid = await learnerId(email);
  await expect(page.getByRole('region', { name: /Résumé du parcours/ })).toBeVisible();
  await expect(page.getByText('Bonjour ! Je suis Miren. Et toi ?')).toHaveCount(0);
  await startCourse(page);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Les salutations/ })).toBeVisible();
  await expect(page.locator('app-reading-player')).toBeFocused();
  await expect(page.getByRole('button', { name: /Vérifier/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Précédent/ })).toHaveCount(0);
  await expectBilingualPresentation(page);
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('heading', { name: /Modèle de dialogue/ })).toBeVisible();
  await expect(page.locator('dt')).toHaveText(['Miren', 'Jon']);
  await expect(page.locator('.practice-toolbar')).toContainText('1 / 8 étapes');

  await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
  await expect(page.getByRole('banner')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Reprendre le parcours/ })).toBeVisible();
  await startCourse(page);
  await expect(page.getByRole('heading', { name: /Modèle de dialogue/ })).toBeVisible();
  await page.getByRole('button', { name: /Précédent/ }).click();
  await expect(page.getByRole('heading', { name: /Les salutations/ })).toBeVisible();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('heading', { name: /Modèle de dialogue/ })).toBeVisible();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('textbox')).toBeFocused();
  await expect(page.locator('.practice-toolbar')).toContainText('2 / 8 étapes');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');
  expect(await storedAttempts(uid)).toHaveLength(0);
});

test('reviewing keeps the current draft and does not create new attempts', async ({ page }) => {
  await page.clock.install();
  await page.goto(greetings);
  const email = await signInWithGoogle(page);
  const uid = await learnerId(email);
  await startCourse(page);
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: /Suivant/ }).click();
  }
  await page.getByRole('textbox').fill('draft');
  await expect(page.getByRole('button', { name: /Suivant/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Précédent/ }).click();
  await expect(page.getByRole('heading', { name: /Modèle de dialogue/ })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('textbox')).toHaveValue('draft');
  await expect(page.getByRole('textbox')).toBeFocused();
  await answerCurrentText(page, 'naiz');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');
  await page.getByRole('button', { name: /Précédent/ }).click();
  await expect(page.locator('.question-review')).toContainText('Kaixo, Jon ___.');
  await expect(page.getByRole('button', { name: /Vérifier/ })).toHaveCount(0);
  await page.reload();
  await startCourse(page);
  await expect(page.locator('.question-review')).toBeVisible();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByText('Je suis de Bayonne.')).toBeVisible();
  await expect(page.getByRole('textbox')).toBeFocused();
  expect(await storedAttempts(uid)).toHaveLength(1);
});

test('skipping exercises completes the journey without counting success or recording attempts', async ({
  page,
}) => {
  await page.goto(greetings);
  const email = await signInWithGoogle(page);
  const uid = await learnerId(email);
  await startCourse(page);
  await skipReadings(page);

  for (let index = 0; index < 6; index++) {
    await page.getByRole('button', { name: /Passer cette étape/ }).click();
  }

  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expect(page.locator('.completion')).toContainText('0 / 6 exercices réussis');
  await expect(page.locator('.completion')).toContainText('6 étapes ignorées');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '8');
  expect(await storedAttempts(uid)).toHaveLength(0);
});

test('legacy item progress migrates without losing an answer or its pending feedback', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(greetings);
  const email = await signInWithGoogle(page);
  const uid = await learnerId(email);
  await startCourse(page);
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: /Suivant/ }).click();
  }
  await page.getByRole('textbox').fill('faux');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('ikasbide:practice:v1:'))!;
    const progress = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        queue: progress.queue,
        completedItemIds: [],
        feedback: progress.feedback,
      }),
    );
  });
  await page.reload();
  await startCourse(page);
  await expect(page.locator('app-activity-feedback')).toContainText('Incorrect');
  await expect(page.locator('app-activity-player .prompt')).toContainText('Kaixo, Jon faux.');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('textbox')).toBeFocused();
  await expect(page.getByText('Je suis de Bayonne.')).toBeVisible();
  expect(await storedAttempts(uid)).toHaveLength(1);
});

test('invalid local reading positions fall back to synchronized progress', async ({ page }) => {
  await page.goto(greetings);
  await signInWithGoogle(page);
  await startCourse(page);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('ikasbide:practice:v1:'))!;
    const progress = JSON.parse(localStorage.getItem(key)!);
    progress.journey.reviewIndex = 99;
    localStorage.setItem(key, JSON.stringify(progress));
  });
  await page.reload();
  await startCourse(page);
  await expect(page.locator('app-reading-player')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Les salutations/ })).toBeVisible();
});

test('links and oral prompts are optional full-page steps and the final review is read-only', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);
  await startCourse(page);
  await page.getByRole('button', { name: /Suivant/ }).click();
  const link = page.getByRole('link', { name: /Enregistrements audio/ });
  await expect(link).toHaveAttribute('href', 'https://example.org/ikasbide-audio');
  await expect(link).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('textbox')).toBeVisible();
  await answerCurrentText(page, 'Ni Baionakoa naiz.');
  await answerCurrentText(page, 'J’habite à Bilbao.');
  for (const words of [
    ['Zu', 'nongoa', 'zara'],
    ['Bilbon', 'bizi', 'naiz'],
  ]) {
    for (const word of words) {
      await page.getByRole('button', { name: word, exact: true }).click();
    }
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
    await page.clock.fastForward(600);
    await expect(page.locator('app-activity-feedback')).toHaveCount(0);
  }
  await page.getByRole('textbox').fill('zara');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
  await page.clock.fastForward(600);
  await expect(page.getByRole('heading', { name: /Dialogue à deux/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vérifier/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeFocused();
  await expect(page.locator('.completion')).toContainText('5 / 5 exercices réussis');
  await expect(page.locator('.completion')).toContainText('3 / 3 lectures parcourues, sans score.');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 5');
  await page.getByRole('button', { name: /Relire le parcours/ }).click();
  await expect(page.getByRole('heading', { name: /Dialogue à deux/ })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await page.getByRole('button', { name: /Précédent/ }).click();
  await expect(page.locator('.question-review')).toBeFocused();
  await expect(page.locator('.question-review')).toContainText('Pantxoa');
  await page.getByRole('button', { name: /Précédent/ }).click();
  await expect(page.locator('.question-review')).toBeFocused();
  await expect(page.locator('.question-review')).toContainText('Bilbon');
  await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 5');
});

test('a failed local save explains the limitation and keeps the reading navigation usable', async ({
  page,
}) => {
  await page.goto(greetings);
  await signInWithGoogle(page);
  await expect(page.getByRole('button', { name: /Commencer le parcours/ })).toBeVisible();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('ikasbide:practice:v1:')) {
        throw new DOMException('Storage is unavailable', 'QuotaExceededError');
      }
      setItem.call(this, key, value);
    };
  });
  await startCourse(page);
  await expect(page.getByRole('alert')).toContainText('sauvegarde de la progression');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('heading', { name: /Modèle de dialogue/ })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('indisponible');
});
