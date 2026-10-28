import { expect, test } from '@playwright/test';

test('a visitor sees a clear Google sign-in entry point', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Le basque, à votre rythme.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a learner signs in with Google, keeps the session and signs out', async ({ page }) => {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^http:\/\/127\.0\.0\.1:9099\//);
  await popup.waitForLoadState('domcontentloaded');
  await popup.getByRole('button', { name: 'Add new account' }).click();
  await popup.locator('#email-input').fill(`learner-${crypto.randomUUID()}@example.test`);
  await popup.locator('#display-name-input').fill('Apprenant fictif');
  await popup.getByRole('button', { name: /Sign in with Google/i }).click();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await expect(page.getByText('Apprenant fictif', { exact: true })).toBeVisible();
  await expect(page.getByText('Aucun chapitre publié pour le moment.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});
