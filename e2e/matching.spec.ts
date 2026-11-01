import { expect, test, type Page } from '@playwright/test';
import { signInWithGoogle, startCourse } from './support.ts';

const matching = '/chapitres/chapter-2/sequences/family-matching';

async function openMatching(page: Page): Promise<void> {
  await page.goto(matching);
  await signInWithGoogle(page);
  await startCourse(page);
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.locator('app-activity-player .matching-board')).toBeVisible();
}

async function link(page: Page, eu: string, fr: string): Promise<void> {
  const board = page.locator('.matching-board');
  await board.getByRole('button', { name: eu, exact: true }).click();
  await board.getByRole('button', { name: fr, exact: true }).click();
}

test('a Markdown note renders formatted content without running scripts', async ({ page }) => {
  await page.goto(matching);
  await signInWithGoogle(page);
  await startCourse(page);

  const note = page.locator('app-reading-player .markdown-note');
  await expect(note.getByRole('table')).toBeVisible();
  await expect(note.getByRole('cell', { name: 'mère' })).toBeVisible();
  await expect(note.locator('strong').first()).toHaveText('ama');
  await expect(note.locator('blockquote')).toContainText('les parents');
  await expect(note.locator('script')).toHaveCount(0);
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
});

test('linking every Basque expression to its French translation is correct', async ({ page }) => {
  await page.clock.install();
  await openMatching(page);

  const verify = page.getByRole('button', { name: /Vérifier/ });
  await link(page, 'ama', 'mère');
  await expect(verify).toBeDisabled();
  await link(page, 'aita', 'père');
  await link(page, 'anaia', 'frère');
  await expect(page.locator('.matching-badge')).toHaveCount(6);
  await verify.click();

  await expect(page.getByRole('status').filter({ hasText: /Correct/ })).toBeVisible();
});

test('a wrong link is unlinked by picking it again and corrected after checking', async ({
  page,
}) => {
  await openMatching(page);
  const board = page.locator('.matching-board');

  await link(page, 'ama', 'père');
  await board.getByRole('button', { name: /père/ }).click();
  await expect(page.locator('.matching-badge')).toHaveCount(0);
  await expect(board.getByRole('button', { name: 'père', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await board.getByRole('button', { name: 'père', exact: true }).click();

  await link(page, 'ama', 'père');
  await link(page, 'aita', 'mère');
  await link(page, 'anaia', 'frère');
  await page.getByRole('button', { name: /Vérifier/ }).click();

  await expect(page.getByRole('status').filter({ hasText: /Incorrect/ })).toBeVisible();
  const rows = page.locator('.matching-result li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveClass(/answer-error/);
  await expect(rows.nth(0).locator('s')).toHaveText('père');
  await expect(rows.nth(0).locator('strong')).toHaveText('mère');
  await expect(rows.nth(2)).not.toHaveClass(/answer-error/);
  await expect(page.locator('.correction')).toHaveCount(0);
});
