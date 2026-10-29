import { expect, test } from '@playwright/test';
import { expectBilingualPresentation, signInWithGoogle } from './support.ts';

test('a visitor sees a clear Google sign-in entry point', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Le basque, à votre rythme.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Euskara, zure erritmoan. Le basque, à votre rythme.',
  );
  await expectBilingualPresentation(page);
});

test('a learner signs in with Google, keeps the session and signs out', async ({ page }) => {
  await page.goto('/');
  await signInWithGoogle(page);
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await expect(page.getByText('Apprenant fictif', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Chapitre 1/ })).toBeVisible();
  await expectBilingualPresentation(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});
