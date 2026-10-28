import { expect, test } from '@playwright/test';

test('missing configuration is shown as unavailable, not signed out', async ({ page }) => {
  await page.route('**/firebase-config.json', (route) =>
    route.fulfill({ status: 404, body: 'Not configured' }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connexion indisponible' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('configuration Firebase');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toHaveCount(0);
  await page.unroute('**/firebase-config.json');
  await page.getByRole('link', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeEnabled();
});

test('a malformed Firebase configuration cannot expose a working-looking sign-in', async ({
  page,
}) => {
  await page.route('**/firebase-config.json', (route) =>
    route.fulfill({ json: { projectId: 'demo-ikasbide' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connexion indisponible' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toHaveCount(0);
});

test('the emulator cannot be combined with a real project', async ({ page }) => {
  await page.route('**/firebase-config.json', async (route) => {
    const response = await route.fetch();
    const config: unknown = await response.json();
    if (typeof config !== 'object' || config === null) throw new Error('Missing test config.');
    await route.fulfill({ json: { ...config, projectId: 'not-a-demo-project' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connexion indisponible' })).toBeVisible();
});

test('a cancelled Google popup offers a retry without authenticating', async ({ page }) => {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^http:\/\/127\.0\.0\.1:9099\//);
  await popup.waitForLoadState('domcontentloaded');
  await popup.close();
  // Firebase waits before treating a closed provider window as a cancellation.
  await expect(page.getByRole('alert')).toHaveText('Connexion annulée. Vous pouvez réessayer.', {
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toHaveCount(0);
});
