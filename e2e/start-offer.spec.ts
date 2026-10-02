import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('saving tests lands on a focused Start studying button', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();

  const offer = page.getByTestId('start-offer');
  await expect(offer).toBeVisible();
  await expect(page.getByTestId('start-offer-cue')).toHaveText("You're all set — tap Start studying to begin");
  await expect(page.getByTestId('start-offer-test')).toHaveText('Practice Test 1');
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
