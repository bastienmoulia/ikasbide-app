import { expect, test } from '@playwright/test';
import { chapterColor } from '../src/app/curriculum/chapter-color';
import { signInWithGoogle, startPractice } from './support.ts';

const groupName = /Mode d’affichage/;

function colorChannels(color: string): number[] {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16));
  }
  const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return color.startsWith('color(srgb ') ? channels.map((channel) => channel * 255) : channels;
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [red, green, blue] = colorChannels(color).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (first, second) => second - first,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function displayModeControl(page: import('@playwright/test').Page) {
  return page.getByRole('radiogroup', { name: groupName });
}

async function setDisplayMode(
  page: import('@playwright/test').Page,
  mode: 'light' | 'dark',
): Promise<void> {
  const names = { light: /Argia Clair/, dark: /Iluna Sombre/ };
  const option = displayModeControl(page).getByRole('radio', { name: names[mode] });
  await option.click();
  await expect(option).toBeChecked();
  await expectAppearance(page, mode);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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

async function expectContrast(
  foreground: import('@playwright/test').Locator,
  background: import('@playwright/test').Locator,
  minimum: number,
  foregroundProperty = 'color',
  backgroundProperty = 'background-color',
): Promise<void> {
  const [foregroundColor, backgroundColor] = await Promise.all([
    foreground.evaluate(
      (element, property) => getComputedStyle(element).getPropertyValue(property),
      foregroundProperty,
    ),
    background.evaluate(
      (element, property) => getComputedStyle(element).getPropertyValue(property),
      backgroundProperty,
    ),
  ]);
  expect(contrastRatio(foregroundColor, backgroundColor)).toBeGreaterThanOrEqual(minimum);
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
  await light.click();
  await expectAppearance(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAppearance(page, 'light');

  const reopenedPage = await page.context().newPage();
  await reopenedPage.emulateMedia({ colorScheme: 'light' });
  await reopenedPage.goto('/');
  const reopenedControl = displayModeControl(reopenedPage);
  await expect(reopenedControl.getByRole('radio', { name: /Argia Clair/ })).toBeChecked();
  await expectAppearance(reopenedPage, 'light');

  await reopenedControl.getByRole('radio', { name: /Iluna Sombre/ }).click();
  await reopenedPage.emulateMedia({ colorScheme: 'light' });
  await expectAppearance(reopenedPage, 'dark');
  await reopenedPage.reload();
  await expect(reopenedControl.getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();
  await expectAppearance(reopenedPage, 'dark');

  await reopenedControl.getByRole('radio', { name: /Sistema Système/ }).click();
  await reopenedPage.emulateMedia({ colorScheme: 'dark' });
  await expectAppearance(reopenedPage, 'dark');
  await reopenedPage.emulateMedia({ colorScheme: 'light' });
  await expectAppearance(reopenedPage, 'light');
});

test('the device choice remains available across sign-in and sign-out', async ({ page }) => {
  await page.goto('/');
  await displayModeControl(page)
    .getByRole('radio', { name: /Iluna Sombre/ })
    .click();
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

test('the learner journey keeps answers and progress usable in both modes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.clock.install();
  await page.goto('/');
  await signInWithGoogle(page);

  const homeChapter = page.getByRole('link', { name: /Chapitre 1/ });
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expect(homeChapter).toBeVisible();
    await expectContrast(page.locator('body'), page.locator('body'), 4.5);
    await expectContrast(page.getByRole('heading', { level: 1 }), page.locator('body'), 3);
    const focusColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--app-focus'),
    );
    const pageBackground = await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(contrastRatio(focusColor, pageBackground)).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }

  await homeChapter.click();
  const progressMap = page.getByRole('region', { name: /Carte de progression/ });
  await expect(progressMap.getByRole('listitem').first()).toContainText('À découvrir');
  const initialStatus = progressMap.getByRole('listitem').first().locator('.objective-status');
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expect(progressMap).toBeVisible();
    await expectContrast(initialStatus, progressMap.getByRole('listitem').first(), 4.5);
  }

  await page.goto('/chapitres/chapter-1/sequences/greetings');
  await startPractice(page);
  const player = page.locator('app-activity-player');
  const gapAnswer = player.getByRole('textbox');
  await gapAnswer.fill('naiz');
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expect(gapAnswer).toHaveValue('naiz');
    await expectContrast(gapAnswer, gapAnswer, 3, 'border-top-color');
  }
  await player.getByRole('button', { name: /Vérifier/ }).click();
  const feedback = page.getByRole('status').filter({ hasText: 'Correct' });
  await expect(feedback).toContainText('Correct');
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expect(feedback).toContainText('Correct');
    await expectContrast(feedback, player.locator('.exercise-item'), 4.5);
  }
  await expectContrast(
    player.getByRole('button', { name: /Vérifier/ }),
    player.locator('.exercise-item'),
    4.5,
  );
  await page.clock.fastForward(600);
  for (const answer of ['koa', 'on', 'Kaixo']) {
    await player.getByRole('textbox').fill(answer);
    await player.getByRole('button', { name: /Vérifier/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
    await page.clock.fastForward(600);
  }
  const choice = player.getByRole('button', { name: 'Agur', exact: true });
  await expect(choice).toBeVisible();
  await setDisplayMode(page, 'light');
  await setDisplayMode(page, 'dark');
  await choice.click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();

  await page.goto('/chapitres/chapter-1/sequences/origin');
  const resourceArticle = page.getByRole('article').first();
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expect(resourceArticle).toHaveCSS(
      'background-color',
      mode === 'dark' ? 'rgb(43, 44, 47)' : 'rgb(255, 255, 255)',
    );
  }
  await startPractice(page);
  const translationAnswer = page.locator('app-activity-player').getByRole('textbox');
  await translationAnswer.fill('Ni Baionakoa naiz.');
  await setDisplayMode(page, 'light');
  await expect(translationAnswer).toHaveValue('Ni Baionakoa naiz.');
  await setDisplayMode(page, 'dark');
  await expect(translationAnswer).toHaveValue('Ni Baionakoa naiz.');
  await translationAnswer.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);
  await page.locator('app-activity-player').getByRole('textbox').fill('J’habite à Bilbao.');
  await page
    .locator('app-activity-player')
    .getByRole('button', { name: /Vérifier/ })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct' })).toBeVisible();
  await page.clock.fastForward(600);

  await page.getByRole('button', { name: 'Zu', exact: true }).click();
  await page.getByRole('button', { name: 'nongoa', exact: true }).click();
  await setDisplayMode(page, 'light');
  await expect(page.getByRole('button', { name: 'Zu', exact: true })).toBeVisible();
  await setDisplayMode(page, 'dark');
  await expect(page.getByRole('button', { name: 'Zu', exact: true })).toBeVisible();

  await page.goto('/chapitres/chapter-1');
  const greetingObjective = progressMap
    .getByRole('listitem')
    .filter({ hasText: /Saluer et se présenter/ });
  await expect(greetingObjective).toContainText('En cours');
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expect(greetingObjective).toContainText('En cours');
    await expectContrast(greetingObjective.locator('.objective-status'), greetingObjective, 4.5);
  }

  for (let chapterNumber = 1; chapterNumber <= 5; chapterNumber += 1) {
    expect(contrastRatio('#ffffff', chapterColor(chapterNumber))).toBeGreaterThanOrEqual(4.5);
    const darkAccent = colorChannels(chapterColor(chapterNumber)).map((channel) =>
      Math.round((channel + 255) / 2),
    );
    const darkAccentHex = `#${darkAccent.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    expect(contrastRatio(darkAccentHex, '#2b2c2f')).toBeGreaterThanOrEqual(4.5);
  }

  await page.goto('/chapitres/chapter-99');
  const notPublishedError = page.getByRole('alert');
  await expect(notPublishedError).toBeVisible();
  for (const mode of ['light', 'dark'] as const) {
    await setDisplayMode(page, mode);
    await expectContrast(notPublishedError, notPublishedError, 4.5);
  }
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
  await expect(control.locator('app-icon')).toHaveCount(3);
  await expect(page.locator('.display-mode-label')).toHaveCount(0);
  const tooltip = page.locator('.display-mode-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText('Sistema\nSystème');
  await expect(tooltip.locator('.mat-mdc-tooltip-surface')).toHaveCSS('white-space', 'pre');
  const surface = tooltip.locator('.mat-mdc-tooltip-surface');
  const sizes = await surface.evaluate((element) => ({
    basque: Number.parseFloat(getComputedStyle(element, '::first-line').fontSize),
    french: Number.parseFloat(getComputedStyle(element).fontSize),
  }));
  expect(sizes.basque).toBeGreaterThan(sizes.french);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(control.getByRole('radio', { name: /Iluna Sombre/ })).toBeChecked();

  await expect(control).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Material tooltips describe each theme on hover', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch devices show Material tooltips on long press instead of hover.');
  await page.goto('/');

  for (const [eu, fr] of [
    ['Argia', 'Clair'],
    ['Iluna', 'Sombre'],
    ['Sistema', 'Système'],
  ]) {
    const option = displayModeControl(page).getByRole('radio', { name: `${eu} ${fr}` });
    await option.hover();
    const tooltip = page.locator('.display-mode-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(`${eu}\n${fr}`);
    await expect
      .poll(
        () =>
          tooltip.locator('.mat-mdc-tooltip-surface').evaluate((element) => {
            const text = element.firstChild;
            if (!(text instanceof Text)) throw new Error('Expected a plain-text Material tooltip.');
            const lines = new Set<number>();
            for (let index = 0; index < text.length; index += 1) {
              if (text.data[index] === '\n') continue;
              const range = document.createRange();
              range.setStart(text, index);
              range.setEnd(text, index + 1);
              lines.add(range.getBoundingClientRect().top);
            }
            return lines.size;
          }),
        { message: `${eu} / ${fr} must stay on exactly two lines` },
      )
      .toBe(2);
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
  }
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
    .click();
  await expectAppearance(page, 'dark');
  const warning = page
    .getByRole('alert')
    .filter({ hasText: 'Le choix n’a pas pu être enregistré' });
  await expect(warning).toContainText('Le choix n’a pas pu être enregistré');
  await expect(warning.locator('[lang="eu"]')).toContainText('Ezin izan da aukera gorde');
  await expect(warning.locator('[lang="fr"]')).toContainText('Le choix n’a pas pu être enregistré');
});
