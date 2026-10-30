import { expect, test } from '@playwright/test';
import { expectBilingualPresentation, signInWithGoogle, waitForOfflineShell } from './support.ts';

test.use({ serviceWorkers: 'allow' });

test('a learner reads previously consulted curriculum offline', async ({ page, context }) => {
  await page.goto('/');
  await signInWithGoogle(page);
  await expect(page.getByRole('link', { name: /Chapitre 2/ })).toBeVisible();
  await waitForOfflineShell(page);

  await page.goto('/chapitres/chapter-1/sequences/origin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Nongoa zara? D’où es-tu ?',
  );
  await expect(page.getByRole('status').filter({ hasText: 'hors ligne' })).toHaveCount(0);

  await context.setOffline(true);
  const displayModes = page.getByRole('group', { name: /Mode d’affichage/ });
  await displayModes.getByRole('radio', { name: /Iluna Sombre/ }).check();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.reload();

  await expect(page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible();
  await expect(displayModes.getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#202124');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.getByText('Apprenant', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Nongoa zara? D’où es-tu ?',
  );
  await expect(page.getByRole('article')).toHaveCount(5);
  const audio = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /Enregistrements audio/ }) });
  await expect(audio).toContainText('Indisponible hors ligne');
  await expectBilingualPresentation(page);

  await page.getByRole('link', { name: /Retour au chapitre/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Aurkezpenak Les présentations',
  );
  await page.getByRole('link', { name: /Retour au parcours/ }).click();
  await expect(page.getByRole('link', { name: /Chapitre 1/ })).toBeVisible();

  // Chapter 2 was never opened on this device: it must not look empty or unpublished.
  await page.getByRole('link', { name: /Chapitre 2/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('pas encore été consulté sur cet appareil');
  await expect(alert).not.toContainText('n’est pas publié');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  await expectBilingualPresentation(page);

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' })).toHaveCount(0);
});
