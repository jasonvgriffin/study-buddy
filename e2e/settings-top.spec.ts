import { expect, test } from '@playwright/test';

test('Open settings lands at the top and backup buttons are green', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-settings').click();
  const exportButton = page.locator('#home-panel').getByRole('button', { name: 'Export backup' });
  await expect(exportButton).toHaveClass(/btn-primary/);
  await expect(page.locator('#home-panel label', { hasText: 'Import backup' })).toHaveClass(/btn-primary/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('label', { hasText: 'Import backup' })).toHaveClass(/btn-primary/);
});

test('Settings explains where the answer buzz works; Home does not', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('haptics-note')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  const note = page.getByTestId('haptics-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText(
    "Heads up: the little buzz when you answer doesn't work on iPhone in any browser. On Android it depends on the browser: Chrome buzzes, Firefox doesn't. The colors and animations always show.",
  );
  await expect(note).toHaveClass(/muted/);
});
