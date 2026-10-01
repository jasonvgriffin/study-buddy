import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('skip for later comes back on a review list and a tap grades the question', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();

  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  await expect(page.getByText('Cairo sits on the Nile')).toHaveCount(0);
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  const skip = page.getByTestId('skip-for-later');
  const skipBox = await skip.boundingBox();
  expect(skipBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await skip.click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await expect(page.getByText('Which two of these rivers are in Europe?')).toBeVisible();
  await expect(page.getByTestId('live-score')).toContainText('1 skipped');

  await page.getByTestId('skip-for-later').click();
  await expect(page.getByTestId('position')).toHaveText('Question 3 of 3');
  await page.getByTestId('skip-for-later').click();
  await expect(page.getByTestId('skip-review')).toBeVisible();
  await expect(page.getByTestId('jump-skipped')).toHaveCount(3);
  await expect(page.getByTestId('unanswered-count')).toContainText('3 unanswered');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await expect(page.getByTestId('resume')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('skip-review')).toBeVisible();
  await expect(page.getByTestId('jump-skipped')).toHaveCount(3);
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('pause')).toBeVisible();

  await page.getByTestId('jump-skipped').nth(0).click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  await expect(page.getByText('Cairo sits on the Nile')).toHaveCount(0);
  await page.getByTestId('choice').filter({ hasText: 'Nile' }).click();
  await expect(page.getByTestId('result')).toHaveText('✓ Correct');
  await expect(page.getByTestId('choice').filter({ hasText: 'Nile' })).toHaveClass(/correct/);
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
  await page.getByTestId('next').click();

  await expect(page.getByTestId('skip-review')).toBeVisible();
  await expect(page.getByTestId('jump-skipped')).toHaveCount(2);
  await page.getByTestId('skip-review').getByTestId('end-session').click();
  await expect(page.getByTestId('score-counts')).toContainText('1 right, 0 wrong, 2 unanswered');
});
