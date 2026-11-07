import { expect, test, type Page } from '@playwright/test';
import { expectBilingualPresentation, signInWithGoogle, startPractice } from './support.ts';

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

for (const width of [320, 390, 1280]) {
  for (const mode of ['light', 'dark']) {
    test(`shared surfaces stay compact and usable at ${width}px in ${mode} mode`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((mode) => localStorage.setItem('ikasbide.display-mode', mode), mode);
      const capture = async (name: string) => {
        await expectNoOverflow(page);
        await page.screenshot({
          path: testInfo.outputPath(`${name}.png`),
          fullPage: true,
          style: '.firebase-emulator-warning { visibility: hidden; }',
        });
      };

      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-display-mode', mode);
      await expect(page.locator('.brand-icon')).toBeVisible();
      await expect(page.locator('.sign-in-action')).toBeVisible();
      await expect(page.locator('.sign-in-action')).toHaveCSS(
        'background-color',
        'rgb(212, 239, 118)',
      );
      await expect(page.locator('mat-button-toggle.mat-button-toggle-checked')).toHaveCSS(
        'background-color',
        'rgb(185, 201, 243)',
      );
      await capture('welcome');
      await signInWithGoogle(page);
      const action = page.locator('.practice-action');
      await expect(action).toBeVisible();
      const chapterLink = page.locator('.cards a').first();
      await expect(chapterLink).toHaveCSS('border-top-width', '0px');
      await expect(chapterLink.locator('app-icon')).toHaveAttribute('aria-hidden', 'true');
      await expectBilingualPresentation(page);
      await capture('home');
      await chapterLink.click();

      await expect(page.locator('.progress-details')).toBeVisible();
      await page.locator('.progress-details summary').click();
      await expect(page.locator('.objective-map li').first()).toBeVisible();
      await expect(page.locator('.objective-map li').first()).toHaveCSS('border-top-width', '0px');
      await capture('chapter');
      await page.locator('.cards a').first().click();
      const overview = page.locator('.journey-overview');
      await expect(overview).toBeVisible();
      await capture('sequence');
      await page.getByRole('button', { name: /Commencer le parcours/ }).click();
      await expect(page.locator('app-reading-player')).toBeVisible();
      await capture('reading');
      await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
      await startPractice(page);

      const exercise = page.locator('.exercise-item');
      await expect(exercise).toBeVisible();
      const geometry = await exercise.evaluate((element) => {
        const style = getComputedStyle(element);
        const main = document.querySelector('main')!;
        return {
          padding: Number.parseFloat(style.paddingLeft),
          gap: Number.parseFloat(style.rowGap),
          outerBorder: getComputedStyle(main).borderWidth,
          width: element.getBoundingClientRect().width,
        };
      });
      expect(geometry.padding).toBeLessThanOrEqual(24);
      expect(geometry.gap).toBeGreaterThanOrEqual(16);
      expect(geometry.outerBorder).toBe('0px');
      expect(geometry.width).toBeGreaterThanOrEqual(Math.min(width - 24, 768) - 1);
      const input = page.getByRole('textbox');
      const inputBox = await input.boundingBox();
      const exerciseBox = await exercise.boundingBox();
      expect(inputBox!.x).toBeGreaterThan(exerciseBox!.x);
      expect(inputBox!.x + inputBox!.width).toBeLessThan(exerciseBox!.x + exerciseBox!.width);
      expect(inputBox!.height).toBeGreaterThanOrEqual(44);
      await expectBilingualPresentation(page);
      await capture('exercise');

      const memo = page.locator('.practice-memo');
      await memo.locator('summary').click();
      const memoArticle = memo.locator('article');
      await expect(memoArticle).toHaveCSS('border-width', '0px');
      await expect(memoArticle).toHaveCSS('box-shadow', 'none');
      await capture('memo');
      await memo.locator('summary').click();
      await input.fill('incorrect');
      await page.getByRole('button', { name: /Vérifier/ }).click();
      await expect(page.locator('.correction')).toBeVisible();
      await expect(page.locator('app-activity-feedback app-icon')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      await capture('correction');

      await page.goto('/a1/chapter-1/origin');
      await startPractice(page);
      const translationBox = await page.getByRole('textbox').boundingBox();
      const translationFrame = await page.locator('.exercise-item').boundingBox();
      expect(translationBox!.x + translationBox!.width).toBeLessThan(
        translationFrame!.x + translationFrame!.width,
      );
      await capture('translation');

      await page.goto('/a1/chapter-2/family-words');
      await startPractice(page);
      const choiceBox = await page.locator('.choice').first().boundingBox();
      expect(choiceBox!.height).toBeGreaterThanOrEqual(56);
      await capture('choices');
    });
  }
}
