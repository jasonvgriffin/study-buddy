import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('uploading a PDF lands on a focused Start studying button with no extra tap', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  const offer = page.getByTestId('start-offer');
  await expect(offer).toBeVisible();
  await expect(page.getByTestId('start-offer-cue')).toHaveText("You're all set — tap Start studying to begin");
  await expect(page.getByTestId('start-offer-test')).toHaveText('Practice Test 1');
  await expect(page.getByTestId('import-added')).toContainText('sample-three-tests.pdf');
  await expect(page.getByTestId('save-tests')).toHaveCount(0);
  await expect(offer.getByTestId('organize-tests')).toHaveText('Rename tests');
  const button = page.getByTestId('start-saved');
  await expect(button).toHaveText('Start studying');
  await expect(button).toBeFocused();
  await expect(button).toHaveClass(/btn-primary/);
  await expect(button).toHaveClass(/btn-block/);
  await expect(button).toHaveClass(/btn-start/);

  const placed = await button.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const offer = el.closest('[data-testid="start-offer"]')?.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      offerWidth: offer?.width ?? rect.width,
      viewportHeight: window.innerHeight,
      background: style.backgroundColor,
      color: style.color,
    };
  });
  expect(placed.top).toBeGreaterThanOrEqual(0);
  expect(placed.bottom).toBeLessThanOrEqual(placed.viewportHeight);
  expect(placed.width).toBeGreaterThan(placed.offerWidth * 0.8);
  expect(placed.background).not.toBe(placed.color);

  await button.click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
});

test('organize stays optional and can be opened later from the library', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await expect(page.getByTestId('save-tests')).toHaveCount(0);

  await page.locator('[data-testid="organize-tests"][data-source-id]').click();
  await expect(page.getByRole('heading', { name: 'Rename tests' })).toBeVisible();
  await expect(page.getByTestId('test-name').first()).toHaveValue('Practice Test 1');
  await page.getByTestId('test-name').first().fill('Rivers combined');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="Rivers combined"]')).toHaveCount(0);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await page.getByTestId('start-saved').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
});
