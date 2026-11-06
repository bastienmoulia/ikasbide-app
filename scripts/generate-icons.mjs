import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const icon = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const favicon = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const assets = [
    ...[72, 96, 128, 144, 152, 192, 384, 512].map((size) => ({
      size,
      source: icon,
      file: `icon-${size}x${size}.png`,
    })),
    { size: 180, source: icon, file: 'apple-touch-icon.png' },
    { size: 32, source: favicon, file: 'favicon-32x32.png' },
  ];
  for (const { size, source, file } of assets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${source}`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`../public/icons/${file}`, import.meta.url)),
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}
