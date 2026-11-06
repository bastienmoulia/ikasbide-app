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
    theme_color: '#faf7f2',
    background_color: '#faf7f2',
  });
  await expect
    .poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors)
    .toEqual([]);
  const response = await page.request.get('/firebase-config.json');
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('all installable and Apple icons use the current identity at their declared sizes', async ({
  page,
}) => {
  await page.goto('/');
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  const manifest: { icons: { src: string; sizes: string; purpose: string }[] } =
    await manifestResponse.json();
  const icons = [
    ...manifest.icons.map(({ src, sizes, purpose }) => {
      expect(purpose).toBe('maskable any');
      return { src, size: Number(sizes.split('x')[0]), background: [185, 201, 243, 255] };
    }),
    {
      src: await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),
      size: 180,
      background: [185, 201, 243, 255],
    },
    {
      src: await page.locator('link[rel="icon"][type="image/png"]').getAttribute('href'),
      size: 32,
      background: null,
    },
  ];
  expect(icons).toHaveLength(10);
  for (const { src, size, background } of icons) {
    if (!src) throw new Error('Missing icon URL.');
    const response = await page.request.get(`/${src}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    const image = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        corner: [...context.getImageData(0, 0, 1, 1).data],
      };
    }, src);
    expect(image.width).toBe(size);
    expect(image.height).toBe(size);
    if (background) expect(image.corner).toEqual(background);
  }
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    'favicon.svg',
  );
});
