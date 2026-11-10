import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { expect, test, type Page } from '@playwright/test';
import { publishCurriculum } from '../tools/curriculum/publish.ts';
import {
  catImage,
  dogImage,
  imageReference,
  illustratedCurriculum,
} from '../tests/fixtures/illustrated-curriculum.ts';
import { signInWithGoogle, startCourse, waitForOfflineShell } from './support.ts';

async function openImages(page: Page, missingCat = false, writtenWord = 'txakur') {
  const bookId = `images-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    const curriculum = illustratedCurriculum(bookId);
    const written = curriculum.chapters[0].sequences[0].contents.find(
      (content) => content.kind === 'image-write',
    )!;
    written.items[0].word = { ...written.items[0].word, eu: writtenWord };
    written.items[0].acceptedAnswers = [writtenWord];
    await publishCurriculum(db, curriculum);
  } finally {
    await db.terminate();
  }
  await page.context().route('https://images.example.test/**', async (route) => {
    const cat = route.request().url() === imageReference(catImage).url;
    if (cat && missingCat) await route.abort();
    else await route.fulfill({ contentType: 'image/png', body: cat ? catImage : dogImage });
  });
  await page.goto(`/${bookId}/objects/images`);
  await signInWithGoogle(page);
  await startCourse(page);
  return bookId;
}

test('illustrated QCM shows six Basque choices in the responsive grid and corrects without retry', async ({
  page,
  isMobile,
}) => {
  await openImages(page);
  const image = page.locator('.vocabulary-image');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  const choices = page.locator('.image-choices button');
  await expect(choices).toHaveCount(6);
  const positions = await choices.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { x: Math.round(x), y: Math.round(y) };
    }),
  );
  expect(new Set(positions.map(({ x }) => x)).size).toBe(isMobile ? 2 : 3);
  expect(new Set(positions.map(({ y }) => y)).size).toBe(isMobile ? 3 : 2);
  await expect(page.locator('.correction')).toHaveCount(0);
  await choices.filter({ hasText: /^katu$/ }).click();
  await expect(page.locator('.correction')).toContainText('txakur');
  await expect(page.locator('.correction')).toContainText('chien');
  await expect(page.getByRole('button', { name: /Réessayer/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByRole('button', { name: 'katu', exact: true }).click();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByRole('textbox').fill('txakur.');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'incorrect');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.locator('.completion')).toContainText('1 / 3');
});

test('missing images leave questions pending and resume only those questions with the original content', async ({
  page,
}) => {
  const bookId = await openImages(page, true);
  await expect(page.locator('.image-availability')).toContainText('1 sans image');
  await page.getByRole('button', { name: 'txakur', exact: true }).click();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByRole('textbox').fill(' TXAKUR ');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'correct');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.locator('.partial-practice')).toBeVisible();
  await expect(page.locator('.completion')).toHaveCount(0);

  const changed = illustratedCurriculum(bookId);
  changed.chapters[0].sequences[0].contents = [];
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await db
      .doc(`books/${bookId}/chapters/objects`)
      .update({ sequences: changed.chapters[0].sequences });
  } finally {
    await db.terminate();
  }
  await page.context().unroute('https://images.example.test/**');
  let dogDownloads = 0;
  await page.route('https://images.example.test/**', async (route) => {
    if (route.request().url() === imageReference(dogImage).url) dogDownloads++;
    await route.fulfill({ contentType: 'image/png', body: catImage });
  });
  await page.reload();
  await startCourse(page);
  await expect(page.locator('.image-choices')).toBeVisible();
  await expect(page.locator('.progress-label')).toContainText('2 / 3');
  await page.getByRole('button', { name: 'katu', exact: true }).click();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.locator('.completion')).toContainText('3 / 3');
  expect(dogDownloads).toBe(0);
});

test('a failed or hash-mismatched image never becomes a question or a completed journey', async ({
  page,
}) => {
  await page.route('https://images.example.test/**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('not the expected image'),
    });
  });
  const bookId = `broken-images-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await publishCurriculum(db, illustratedCurriculum(bookId));
  } finally {
    await db.terminate();
  }
  await page.goto(`/${bookId}/objects/images`);
  await signInWithGoogle(page);
  await page.getByRole('button', { name: /Commencer le parcours/ }).click();
  await expect(page.locator('.partial-practice')).toBeVisible();
  await expect(page.locator('.image-availability')).toContainText('3 sans image');
  await expect(page.locator('app-activity-player, .completion')).toHaveCount(0);
});

test.describe('offline image practice', () => {
  test.use({ serviceWorkers: 'allow' });
  test('cached illustrations work after an offline reload without new downloads', async ({
    page,
    context,
  }) => {
    await openImages(page);
    await waitForOfflineShell(page);
    await expect(page.locator('.vocabulary-image')).toBeVisible();
    await page.context().unroute('https://images.example.test/**');
    await context.setOffline(true);
    await page.reload();
    await startCourse(page);
    await expect(page.locator('.vocabulary-image')).toBeVisible();
    await page.getByRole('button', { name: 'txakur', exact: true }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByRole('button', { name: 'katu', exact: true }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByRole('textbox').fill(' TXAKUR ');
    await page.getByRole('button', { name: /Vérifier/ }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.locator('.completion')).toContainText('3 / 3');
  });
});

test('written vocabulary does not silently treat n as ñ', async ({ page }) => {
  await openImages(page, false, 'ñandu');
  await page.getByRole('button', { name: 'txakur', exact: true }).click();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByRole('button', { name: 'katu', exact: true }).click();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await page.getByRole('textbox').fill('nandu');
  await page.getByRole('button', { name: /Vérifier/ }).click();
  await expect(page.locator('app-activity-feedback')).toHaveAttribute('data-result', 'incorrect');
  await expect(page.locator('.correction')).toContainText('ñandu');
});

test('Firebase image downloads use the signed-in identity and cache failures are visible', async ({
  page,
}) => {
  const bookId = `private-images-${randomUUID().slice(0, 8)}`;
  const curriculum = illustratedCurriculum(bookId);
  for (const activity of curriculum.chapters[0].sequences[0].contents) {
    if (activity.kind !== 'image-choice' && activity.kind !== 'image-write') continue;
    for (const item of activity.items) {
      item.image.url = `https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/illustrations%2F${item.image.sha256}.png?alt=media`;
    }
  }
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await publishCurriculum(db, curriculum);
  } finally {
    await db.terminate();
  }
  await page.addInitScript(() => {
    Object.defineProperty(window, 'caches', {
      value: { open: () => Promise.reject(new Error('Synthetic cache quota failure')) },
    });
  });
  let authenticatedDownloads = 0;
  await page.route('https://firebasestorage.googleapis.com/**', async (route) => {
    const authenticated = route.request().headers()['authorization']?.startsWith('Firebase ');
    expect(authenticated).toBe(true);
    authenticatedDownloads++;
    await route.fulfill({
      contentType: 'image/png',
      body: route.request().url().includes(imageReference(dogImage).sha256) ? dogImage : catImage,
    });
  });
  await page.goto(`/${bookId}/objects/images`);
  await signInWithGoogle(page);
  await startCourse(page);
  await expect(page.locator('.vocabulary-image')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('ne peuvent pas être conservées');
  expect(authenticatedDownloads).toBe(2);
});
