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
