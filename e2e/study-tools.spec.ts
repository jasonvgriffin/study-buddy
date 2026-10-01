import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('skip, text size, and the question navigator', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Tools');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Tools"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await expect(page.getByTestId('flagged-link')).toHaveCount(0);
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();

  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  const fill = page.getByTestId('progress').locator('span');
  await expect(fill).toHaveAttribute('style', /33\.3/);
  const choiceBox = await page.getByTestId('choice').first().boundingBox();
  expect(choiceBox?.height ?? 0).toBeGreaterThanOrEqual(56);
  await expect(page.getByTestId('flag-card')).toHaveCount(0);
  await expect(page.getByTestId('edit-card')).toHaveCount(0);
  await expect(page.getByTestId('skip-for-later')).toBeVisible();
  await expect(page.getByTestId('finish')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByTestId('card-editor')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();

  await page.reload();
  await page.getByTestId('resume').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await expect(page.getByTestId('edit-card')).toHaveCount(0);

  await page.getByTestId('open-navigator').click();
  await expect(page.getByTestId('navigator')).toBeVisible();
  await expect(page.getByTestId('nav-filter-flagged')).toHaveCount(0);
  await expect(page.getByTestId('nav-jump')).toHaveCount(3);
  await page.getByTestId('nav-filter-skipped').click();
  await expect(page.getByTestId('nav-empty')).toBeVisible();
  await page.getByTestId('open-navigator').click();

  await page.getByTestId('skip-for-later').click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await page.getByTestId('open-navigator').click();
  await page.getByTestId('nav-filter-skipped').click();
  await expect(page.getByTestId('nav-jump')).toHaveCount(1);
  await page.getByTestId('nav-jump').click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('home-tab-library').click();
  await expect(page.getByTestId('flagged-link')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('text-size-large').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.getByTestId('text-size-large')).toHaveAttribute('aria-pressed', 'true');
});
