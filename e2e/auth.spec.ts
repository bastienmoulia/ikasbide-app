import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectBilingualPresentation, signInWithGoogle } from './support.ts';

async function openAccountMenu(page: import('@playwright/test').Page) {
  const trigger = page.locator('header .account-trigger');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return page.getByRole('dialog', { name: 'Kontua / Compte' });
}

test('a visitor sees a clear Google sign-in entry point', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Le basque, à votre rythme.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
  await expect(page.locator('header .account')).toHaveCount(0);
  await expect(page.locator('header')).not.toContainText('Euskara ikasteko laguna');
  await expect(page.getByText(/ne le remplace pas ; le livre est nécessaire/)).toBeVisible();
  await expect(page.locator('.legal-note')).not.toContainText(
    /autorisations nécessaires|beharrezko baimenarekin/,
  );
  for (const [name, url] of [
    ['AEK', 'https://www.aek.eus/'],
    ['IKAS', 'https://ikas.eus/'],
  ]) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Euskara, zure erritmoan. Le basque, à votre rythme.',
  );
  await expectBilingualPresentation(page);
});

test('a learner signs in with Google, keeps the session and signs out', async ({ page }) => {
  await page.goto('/');
  await signInWithGoogle(page);
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await expect(page.locator('header .account-name')).toHaveText('Apprenant');
  await expect(page.getByText('Apprenant fictif', { exact: true })).toHaveCount(0);
  await expect(page.locator('main .account')).toHaveCount(0);
  const accountMenu = await openAccountMenu(page);
  await expect(accountMenu.getByRole('radiogroup', { name: /Mode d’affichage/ })).toBeVisible();
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
  await expect(accountMenu.getByText('Bertsioa', { exact: true })).toBeVisible();
  await expect(accountMenu.getByText('Version', { exact: true })).toBeVisible();
  await expect(accountMenu.getByText(packageJson.version, { exact: true })).toBeVisible();
  await expect(accountMenu.getByRole('button', { name: packageJson.version })).toHaveCount(0);
  await expect(accountMenu.getByRole('button', { name: /Amaitu saioa/ })).toBeVisible();
  await expect(accountMenu.locator('[role="separator"]')).toHaveCount(1);
  await expectBilingualPresentation(page);
  await page.keyboard.press('Escape');
  await expect(accountMenu).toBeHidden();
  await expect(page.locator('header .account-trigger')).toBeFocused();
  await expect(page.getByRole('link', { name: /Chapitre 1/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await expect(page.locator('header .account-name')).toHaveText('Apprenant');
  const reopenedMenu = await openAccountMenu(page);
  await reopenedMenu.getByRole('button', { name: /Amaitu saioa/ }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toHaveCount(0);
  await expect(page.locator('header .account')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

for (const { displayName, expectedName } of [
  { displayName: '  Jean-Pierre   Dupont  ', expectedName: 'Jean-Pierre' },
  { displayName: '', expectedName: 'KontuaCompte' },
  { displayName: '   ', expectedName: 'KontuaCompte' },
  { displayName: `${'A'.repeat(100)} Dupont`, expectedName: 'A'.repeat(100) },
]) {
  test(`the header shows only the first name for ${JSON.stringify(displayName)}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    const email = await signInWithGoogle(page, displayName);
    const account = page.locator('header .account');
    const name = account.locator('.account-name');
    const trigger = account.locator('.account-trigger');
    await expect(name).toHaveText(expectedName);
    await expect(account).not.toContainText(email);
    await expect(trigger).toBeVisible();
    await expectBilingualPresentation(page);
    if (expectedName.length === 100) {
      await expect(trigger).toHaveAccessibleName(expectedName);
      expect(
        await name.evaluate(
          (element) =>
            element.scrollWidth > element.clientWidth &&
            getComputedStyle(element).textOverflow === 'ellipsis',
        ),
      ).toBe(true);
    }
  });
}

test('the account menu stays open while changing display mode and dismisses outside', async ({
  page,
}) => {
  await page.goto('/');
  await signInWithGoogle(page);

  const trigger = page.locator('header .account-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('dialog', { name: 'Kontua / Compte' });
  await expect(menu).toBeVisible();
  const dark = menu.getByRole('radio', { name: /Iluna Sombre/ });
  await dark.focus();
  await page.keyboard.press('Space');
  await expect(dark).toBeChecked();
  await expect(menu).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'dark');

  await page.locator('header .brand').click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(menu).toBeVisible();
});

test('the account menu does not trap keyboard focus', async ({ page }) => {
  await page.goto('/');
  await signInWithGoogle(page);

  const menu = await openAccountMenu(page);
  const signOut = menu.getByRole('button', { name: /Amaitu saioa/ });
  await signOut.focus();
  await page.keyboard.press('Tab');
  await expect(menu.locator(':focus')).toHaveCount(0);
});
