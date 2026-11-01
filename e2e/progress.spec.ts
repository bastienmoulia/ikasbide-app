import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  answerCurrentChoice,
  answerCurrentText,
  attemptSummary,
  expectBilingualPresentation,
  signInWithGoogle,
  startPractice,
} from './support.ts';

const chapterUrl = '/a1/chapter-1';
const sequenceUrl = '/a1/chapter-1/greetings';

function objective(page: Page, name: RegExp): Locator {
  return page
    .getByRole('region', { name: /Carte de progression/ })
    .getByRole('listitem')
    .filter({ hasText: name });
}

const greet = (page: Page) => objective(page, /Saluer et se présenter/);
const origin = (page: Page) => objective(page, /Dire d’où l’on vient/);

const red = 'rgb(179, 38, 30)';

function filledStages(objective: Locator): Promise<number> {
  return objective
    .locator('.objective-stage span')
    .evaluateAll(
      (stages) =>
        stages.filter((stage) => getComputedStyle(stage).backgroundColor !== 'rgba(0, 0, 0, 0)')
          .length,
    );
}

async function openChapter(page: Page): Promise<void> {
  await page.goto(chapterUrl);
}

async function expectSynced(page: Page, count: number): Promise<void> {
  await expect(attemptSummary(page)).toContainText(
    `Tentatives synchronisées : ${count} · en attente : 0`,
  );
}

test('a wrong answer records practice without counting as objective mastery', async ({ page }) => {
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await expectSynced(page, 0);

  await startPractice(page);
  await page.getByRole('textbox').fill('faux');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible();
  await expectSynced(page, 1);
  await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
  await page.getByRole('link', { name: /Retour au chapitre/ }).click();
  await expect(greet(page)).toContainText('En cours');
  await expect(origin(page)).toContainText('À découvrir');
});

test('a near match shows the correction and does not advance the series progress', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await startPractice(page);

  for (const answer of ['naiz', 'koa', 'on']) {
    await answerCurrentText(page, answer);
  }
  await page.getByRole('textbox').fill('Kiaxo');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Presque' })).toBeVisible();
  await expect(page.locator('app-activity-feedback [aria-hidden="true"]')).toHaveText('≈');
  await expect(page.locator('.correction')).toContainText('Kaixo');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '5');
  await expectSynced(page, 4);

  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(
    page.locator('app-activity-player').getByRole('button', { name: 'Agur' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
  await page.getByRole('link', { name: /Retour au chapitre/ }).click();
  await expect(greet(page)).toContainText('En cours');
});

test('objective mastery still needs three distinct correct Items across two practice sessions', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await startPractice(page);

  for (const answer of ['naiz', 'koa', 'on', 'Kaixo']) {
    await answerCurrentText(page, answer);
  }
  await answerCurrentChoice(page, 'Agur');
  await answerCurrentChoice(page, 'Egun on');
  await expect(page.getByRole('heading', { name: /Bravo/ })).toBeVisible();
  await expectSynced(page, 6);

  await openChapter(page);
  await expect(greet(page)).toContainText('En cours');
  await expect(origin(page)).toContainText('En cours');

  await page.goto(sequenceUrl);
  await startPractice(page);
  await page.getByRole('button', { name: /Recommencer/ }).click();
  await answerCurrentText(page, 'naiz');
  await expectSynced(page, 7);
  await openChapter(page);
  await expect(greet(page)).toContainText('Acquis');
  await expect(origin(page)).toContainText('En cours');

  const status = greet(page).locator('.objective-status');
  expect(await status.evaluate((element) => getComputedStyle(element).color)).toBe(red);
  expect(await filledStages(greet(page))).toBe(3);
  expect(await filledStages(origin(page))).toBe(1);
  await expect(page.getByText(/\d+ ?(%|points?|\/)/)).toHaveCount(0);
  await expectBilingualPresentation(page);
});

test('a confirmed warning counts as a correct Item for objective mastery', async ({ page }) => {
  await page.clock.install();
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await startPractice(page);
  for (const answer of ['naiz', 'koa', 'on']) await answerCurrentText(page, answer);
  await expectSynced(page, 3);
  await openChapter(page);
  await expect(greet(page)).toContainText('En cours');

  await page.goto(sequenceUrl);
  await startPractice(page);
  await page.getByRole('textbox').fill('Egun on');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.locator('app-activity-feedback')).toHaveAttribute(
    'data-result',
    'correct-with-warning',
  );
  await expectSynced(page, 3);
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expectSynced(page, 4);
  await openChapter(page);
  await expect(greet(page)).toContainText('Acquis');
});
