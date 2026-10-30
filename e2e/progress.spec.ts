import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  answerGap,
  attemptSummary,
  expectBilingualPresentation,
  gapFillItem,
  signInWithGoogle,
} from './support.ts';

const chapterUrl = '/chapitres/chapter-1';
const sequenceUrl = '/chapitres/chapter-1/sequences/greetings';

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

test('objectives are to discover before practice and in progress after incorrect attempts only', async ({
  page,
}) => {
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await expectSynced(page, 0);
  await openChapter(page);
  await expect(greet(page)).toContainText('À découvrir');
  await expect(origin(page)).toContainText('À découvrir');

  await page.goto(sequenceUrl);
  await answerGap(page, 0, 'faux');
  await answerGap(page, 2, 'faux');
  await answerGap(page, 3, 'faux');
  await expectSynced(page, 3);
  await openChapter(page);
  await expect(greet(page)).toContainText('En cours');
  // Each Item counts only for its own objective.
  await expect(origin(page)).toContainText('À découvrir');
});

test('correct answers on three distinct Items within one practice session are not enough', async ({
  page,
}) => {
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await answerGap(page, 0, 'naiz');
  await answerGap(page, 2, 'on');
  await answerGap(page, 3, 'Kaixo');
  await expectSynced(page, 3);
  await openChapter(page);
  await expect(greet(page)).toContainText('En cours');
});

test('an objective is acquired only from three distinct correct Items across two sessions', async ({
  page,
}) => {
  await page.goto(sequenceUrl);
  await signInWithGoogle(page);
  await answerGap(page, 0, 'naiz');
  await answerGap(page, 2, 'on');
  await expectSynced(page, 2);

  // Second session: repeating an Item and a near match add no distinct correct Item.
  await page.reload();
  await answerGap(page, 0, 'naiz');
  await answerGap(page, 3, 'Kiaxo');
  await expect(gapFillItem(page, 3).getByRole('status')).toContainText('Presque !');
  await expectSynced(page, 4);
  await openChapter(page);
  await expect(greet(page)).toContainText('En cours');

  await page.goto(sequenceUrl);
  await answerGap(page, 3, 'Kaixo');
  await expectSynced(page, 5);
  await openChapter(page);
  await expect(greet(page)).toContainText('Acquis');
  await expect(origin(page)).toContainText('À découvrir');

  // The chapter accent marks progress, but the status text and filled stages also tell it.
  const status = greet(page).locator('.objective-status');
  expect(await status.evaluate((element) => getComputedStyle(element).color)).toBe(red);
  expect(await filledStages(greet(page))).toBe(3);
  expect(await filledStages(origin(page))).toBe(0);
  await expect(page.getByText(/\d+ ?(%|points?|\/)/)).toHaveCount(0);
  await expectBilingualPresentation(page);
});
