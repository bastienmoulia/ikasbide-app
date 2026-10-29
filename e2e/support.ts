import { expect, type Page } from '@playwright/test';

export async function expectBilingualPresentation(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'eu');
  const texts = page.locator('app-bilingual-text:visible');
  expect(await texts.count()).toBeGreaterThan(0);
  for (const text of await texts.all()) {
    const basque = text.locator('[lang="eu"]');
    const french = text.locator('[lang="fr"]');
    await expect(basque).not.toBeEmpty();
    await expect(french).not.toBeEmpty();
    const layout = await text.evaluate((element) => {
      const basque = element.querySelector<HTMLElement>('[lang="eu"]');
      const french = element.querySelector<HTMLElement>('[lang="fr"]');
      if (!basque || !french) throw new Error('Both languages must be present.');
      return {
        basqueBottom: basque.getBoundingClientRect().bottom,
        frenchTop: french.getBoundingClientRect().top,
        basqueSize: Number.parseFloat(getComputedStyle(basque).fontSize),
        frenchSize: Number.parseFloat(getComputedStyle(french).fontSize),
      };
    });
    expect(layout.frenchTop).toBeGreaterThanOrEqual(layout.basqueBottom);
    expect(layout.frenchSize).toBeLessThan(layout.basqueSize);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** Signs in through the Auth emulator's Google popup with a synthetic identity. */
export async function signInWithGoogle(
  page: Page,
  displayName = 'Apprenant fictif',
): Promise<void> {
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^http:\/\/127\.0\.0\.1:9099\//);
  await popup.waitForLoadState('domcontentloaded');
  await popup.getByRole('button', { name: 'Add new account' }).click();
  await popup.locator('#email-input').fill(`learner-${crypto.randomUUID()}@example.test`);
  await popup.locator('#display-name-input').fill(displayName);
  await popup.getByRole('button', { name: /Sign in with Google/i }).click();
}
