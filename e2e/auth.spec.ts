import { expect, test } from '@playwright/test';
import { expectBilingualPresentation, signInWithGoogle } from './support.ts';

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
  await expect(
    page.locator('header').getByRole('button', { name: 'Se déconnecter' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Chapitre 1/ })).toBeVisible();
  await expectBilingualPresentation(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Votre parcours' })).toBeVisible();
  await expect(page.locator('header .account-name')).toHaveText('Apprenant');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
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
    await expect(name).toHaveText(expectedName);
    await expect(account).not.toContainText(email);
    await expect(account.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    await expectBilingualPresentation(page);
    if (expectedName.length === 100) {
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
