import { expect, test } from '@playwright/test';
import {
  answerCurrentChoice,
  answerCurrentText,
  expectBilingualPresentation,
  signInWithGoogle,
  startPractice,
} from './support.ts';

const greetings = '/chapitres/chapter-1/sequences/greetings';
const family = '/chapitres/chapter-2/sequences/family-words';

test('practice keeps only a compact toolbar and restores the shell on exit or navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(greetings);
  await signInWithGoogle(page);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await page.getByRole('radio', { name: /Iluna Sombre/ }).click();

  await startPractice(page);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Retour au chapitre/ })).toHaveCount(0);
  const toolbar = page.locator('.practice-toolbar');
  await expect(toolbar.getByRole('button', { name: /Arrêter pour le moment/ })).toBeVisible();
  await expect(toolbar.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'dark');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await expectBilingualPresentation(page);

  const answer = page.getByRole('textbox', { name: /Erantzuna.*Réponse/ });
  await expect(answer).toBeFocused();
  await expect(answer).toHaveAttribute('autocomplete', 'off');
  await expect(page.locator('form')).toHaveAttribute('autocomplete', 'off');
  expect(
    await page.locator('label app-bilingual-text').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width <= 1 && bounds.height <= 1;
    }),
  ).toBe(true);

  await answer.fill('naiz');
  await expect(answer).toHaveValue('naiz');
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'dark');
  await toolbar.getByRole('button', { name: /Arrêter pour le moment/ }).click();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();

  await page.getByRole('link', { name: /Retour au chapitre/ }).click();
  await page
    .getByRole('region', { name: /Séquences/ })
    .getByRole('link')
    .first()
    .click();
  await startPractice(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/chapitres\/chapter-1$/);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('each written question receives focus and QCM questions never inherit a focused choice', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(greetings);
  await signInWithGoogle(page);
  await startPractice(page);
  for (const answer of ['naiz', 'koa', 'on', 'Kaixo']) {
    await expect(page.getByRole('textbox')).toBeFocused();
    await expect(page.getByRole('textbox')).toHaveValue('');
    await answerCurrentText(page, answer, true);
  }
  const player = page.locator('app-activity-player');
  await expect(player).toBeFocused();
  await expect(player.locator('.choice:focus')).toHaveCount(0);
  await answerCurrentChoice(page, 'Agur');
  await expect(player).toBeFocused();
  await expect(player.locator('.choice:focus')).toHaveCount(0);
  await expect(player.locator('.choice[aria-pressed="true"]')).toHaveCount(0);
});

test('previous and continue buttons share a row during question feedback', async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(greetings);
  await signInWithGoogle(page);
  await startPractice(page);
  await answerCurrentText(page, 'naiz');

  await page.getByRole('textbox').fill('incorrect answer');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Incorrect|Oker/ })).toBeVisible();

  const navigation = page.locator('.step-navigation');
  const previous = navigation.getByRole('button', { name: /Précédent/ });
  const continueButton = navigation.getByRole('button', { name: /Continuer/ });
  await expect(previous).toBeVisible();
  await expect(continueButton).toBeVisible();
  const [previousBounds, continueBounds] = await Promise.all([
    previous.boundingBox(),
    continueButton.boundingBox(),
  ]);
  expect(previousBounds).not.toBeNull();
  expect(continueBounds).not.toBeNull();
  expect(Math.abs(previousBounds!.y - continueBounds!.y)).toBeLessThanOrEqual(1);
});

test('QCM choices shuffle per presentation, stay stable during answers and grade by id', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(family);
  await signInWithGoogle(page);
  await page.evaluate(() => (Math.random = () => 0));
  await startPractice(page);
  const player = page.locator('app-activity-player');
  const choices = player.locator('.choice');
  await expect(choices).toHaveText(['aita', 'ama']);
  await expect(choices).toHaveText(['aita', 'ama']);
  await page.getByRole('button', { name: 'aita', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expect(choices).toHaveText(['aita', 'ama']);
  await page.getByRole('button', { name: /Continuer/ }).click();
  await answerCurrentChoice(page, 'aita');
  await page.evaluate(() => (Math.random = () => 0.999));
  await answerCurrentChoice(page, 'anaia');

  await expect(choices).toHaveText(['ama', 'aita']);
  await expect(player).toBeFocused();
  await page.evaluate(() => (Math.random = () => 0));
  await page.getByRole('button', { name: 'aita', exact: true }).click();
  await page.getByRole('button', { name: /Continuer/ }).click();
  // The final retry has the same item id but is a new presentation.
  await expect(choices).toHaveText(['aita', 'ama']);
  await expect(player).toBeFocused();
  await expect(player.locator('.choice[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('app-activity-feedback')).toHaveCount(0);
  await answerCurrentChoice(page, 'ama');
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeFocused();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await page.getByRole('button', { name: /Recommencer/ }).click();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(player).toBeFocused();
});

test('translation inputs autofocus and word-order questions receive neutral focus', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/chapitres/chapter-1/sequences/origin');
  await signInWithGoogle(page);
  await startPractice(page);
  for (const answer of ['Ni Baionakoa naiz.', 'J’habite à Bilbao.']) {
    const input = page.getByRole('textbox', { name: /Erantzuna.*Réponse/ });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('autocomplete', 'off');
    await answerCurrentText(page, answer);
  }
  await expect(page.locator('app-activity-player')).toBeFocused();
  await expect(page.locator('.word:focus')).toHaveCount(0);
});

test('question transitions are brief and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto(greetings);
  await signInWithGoogle(page);
  await startPractice(page);
  const player = page.locator('app-activity-player');
  await expect(player).toHaveCSS('animation-name', 'question-enter');
  await expect(player).toHaveCSS('animation-duration', '0.18s');
  await answerCurrentText(page, 'naiz');
  await expect(player).toHaveCSS('animation-name', 'question-enter');
  await expect(page.getByRole('textbox')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(player).toHaveCSS('animation-name', 'none');
  await answerCurrentText(page, 'koa');
  await expect(player).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('textbox')).toBeFocused();
});
