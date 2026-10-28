import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('Hosting serves an installable Ikasbide PWA and client-side routes', async ({
  page,
  context,
}) => {
  await page.goto('/parcours');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await context.newCDPSession(page);
  const { data, errors } = await cdp.send('Page.getAppManifest');
  expect(errors).toEqual([]);
  if (!data) throw new Error('The browser did not find a web app manifest.');
  expect(JSON.parse(data)).toMatchObject({
    name: 'Ikasbide — compagnon de basque',
    short_name: 'Ikasbide',
    display: 'standalone',
    theme_color: '#9c3434',
    background_color: '#faf8f5',
  });
  await expect
    .poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors)
    .toEqual([]);
  const response = await page.request.get('/firebase-config.json');
  expect(response.headers()['cache-control']).toContain('no-store');
});
