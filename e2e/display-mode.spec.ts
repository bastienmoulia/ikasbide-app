import { expect, test } from '@playwright/test';
import { signInWithGoogle } from './support.ts';

const groupName = /Mode d’affichage/;

function displayModeControl(page: import('@playwright/test').Page) {
  return page.getByRole('group', { name: groupName });
}

async function expectAppearance(page: import('@playwright/test').Page, mode: 'light' | 'dark') {
  const background = mode === 'dark' ? 'rgb(32, 33, 36)' : 'rgb(250, 248, 245)';
  await expect(page.locator('body')).toHaveCSS('background-color', background);
  await expect(page.locator('html')).toHaveCSS('color-scheme', mode);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', mode);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    mode === 'dark' ? '#202124' : '#faf8f5',
  );
  const card = page.locator('mat-card').first();
  if (await card.count()) {
    await expect(card).toHaveCSS(
      'background-color',
      mode === 'dark' ? 'rgb(43, 44, 47)' : 'rgb(255, 255, 255)',
    );
  }
}

test('system mode follows the initial and changing device preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  const control = displayModeControl(page);
  await expect(control.getByRole('radio', { name: /Sistema Système/ })).toBeChecked();
  await expectAppearance(page, 'dark');

  await page.emulateMedia({ colorScheme: 'light' });
  await expectAppearance(page, 'light');
  await expect(control.getByRole('radio', { name: /Sistema Système/ })).toBeChecked();
});

test('manual choices override the device and persist when a page is reopened', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  const control = displayModeControl(page);
  const light = control.getByRole('radio', { name: /Argia Clair/ });
  await light.check();
  await expectAppearance(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAppearance(page, 'light');

  const reopenedPage = await page.context().newPage();
  await reopenedPage.emulateMedia({ colorScheme: 'light' });
  await reopenedPage.goto('/');
  const reopenedControl = displayModeControl(reopenedPage);
  await expect(reopenedControl.getByRole('radio', { name: /Argia Clair/ })).toBeChecked();
  await expectAppearance(reopenedPage, 'light');

  await reopenedControl.getByRole('radio', { name: /Iluna Sombre/ }).check();
  await reopenedPage.emulateMedia({ colorScheme: 'light' });
  await expectAppearance(reopenedPage, 'dark');
  await reopenedPage.reload();
  await expect(reopenedControl.getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();
  await expectAppearance(reopenedPage, 'dark');

  await reopenedControl.getByRole('radio', { name: /Sistema Système/ }).check();
  await reopenedPage.emulateMedia({ colorScheme: 'dark' });
  await expectAppearance(reopenedPage, 'dark');
  await reopenedPage.emulateMedia({ colorScheme: 'light' });
  await expectAppearance(reopenedPage, 'light');
});

test('the device choice remains available across sign-in and sign-out', async ({ page }) => {
  await page.goto('/');
  await displayModeControl(page)
    .getByRole('radio', { name: /Iluna Sombre/ })
    .check();
  await signInWithGoogle(page);

  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Chapitre 1/ })).toHaveCSS(
    'background-color',
    'rgb(43, 44, 47)',
  );
  await expect(displayModeControl(page).getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();
  await expectAppearance(page, 'dark');

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(displayModeControl(page).getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();
  await expectAppearance(page, 'dark');
});

test('the selector is keyboard-operable and fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const control = displayModeControl(page);
  const system = control.getByRole('radio', { name: /Sistema Système/ });
  await expect(system).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(control.getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();

  await expect(control).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a failed local save keeps the current mode and explains the limitation bilingually', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is unavailable', 'QuotaExceededError');
    };
  });
  await page.goto('/');

  await displayModeControl(page)
    .getByRole('radio', { name: /Iluna Sombre/ })
    .check();
  await expectAppearance(page, 'dark');
  const warning = page
    .getByRole('alert')
    .filter({ hasText: 'Le choix n’a pas pu être enregistré' });
  await expect(warning).toContainText('Le choix n’a pas pu être enregistré');
  await expect(warning.locator('[lang="eu"]')).toContainText('Ezin izan da aukera gorde');
  await expect(warning.locator('[lang="fr"]')).toContainText('Le choix n’a pas pu être enregistré');
});
