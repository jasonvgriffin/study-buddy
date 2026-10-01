import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('keyboard grading, missed review, domain scores, and the backup reminder', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Finish');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Finish"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();

  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await expect(page.getByTestId('open-navigator')).toHaveCount(0);
  await expect(page.getByTestId('end-session')).toHaveCount(0);
  await expect(page.getByTestId('pause')).toBeVisible();
  await expect(page.getByTestId('see-results')).toHaveCount(0);
  const desktopPointer = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (desktopPointer) await expect(page.getByTestId('kbd-hint')).toBeVisible();
  else await expect(page.getByTestId('kbd-hint')).toBeHidden();
  await page.keyboard.press('b');
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await expect(page.getByTestId('choice').filter({ hasText: 'Amazon' })).toHaveClass(/wrong/);
  await expect(page.getByTestId('choice').filter({ hasText: 'Nile' })).toHaveClass(/correct/);
  await expect(page.getByTestId('flag-card')).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await page.keyboard.press('a');
  await expect(page.getByTestId('choose-count')).toContainText('1 of 2');
  await page.keyboard.press('a');
  await expect(page.getByTestId('choose-count')).toContainText('0 of 2');
  await page.keyboard.press('a');
  await expect(page.getByTestId('choose-count')).toContainText('1 of 2');
  await page.keyboard.press('c');
  await expect(page.getByTestId('choose-count')).toContainText('2 of 2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('result')).toHaveText('✓ Correct');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('position')).toHaveText('Question 3 of 3');
  await page.keyboard.press('b');
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('missed-review')).toBeVisible();
  await expect(page.getByTestId('missed-card')).toHaveCount(2);
  const cairo = page.getByTestId('missed-card').filter({ hasText: 'Cairo' });
  await expect(cairo.getByTestId('your-answer')).toContainText('Amazon');
  await expect(cairo.getByTestId('right-answer')).toContainText('Nile');
  await expect(cairo.getByTestId('missed-explanation')).toContainText('Cairo sits on the Nile');
  await expect(page.getByTestId('domain-scores')).toContainText('No domain');
  await expect(page.getByTestId('domain-scores')).toContainText('1 right, 2 wrong');
  await cairo.getByTestId('open-card').click();
  await expect(page.locator('[data-card-id]').filter({ hasText: 'Which river runs through Cairo?' })).toBeVisible();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByTestId('domain-stats')).toContainText('No domain');
  await expect(page.getByTestId('domain-stats')).toContainText('1 right, 2 wrong');

  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByTestId('backup-reminder')).toBeVisible();
  await expect(page.getByTestId('backup-reminder-export')).toBeVisible();
  await page.getByTestId('backup-reminder-dismiss').click();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('shuffle-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('shuffle-toggle').click();
  await expect(page.getByTestId('shuffle-toggle')).toHaveAttribute('aria-pressed', 'false');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/study-buddy-backup-/);
  await download.delete();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('choice').nth(0)).toContainText('Nile');
  await expect(page.getByTestId('choice').nth(1)).toContainText('Amazon');
  await expect(page.getByTestId('choice').nth(2)).toContainText('Danube');
  await expect(page.getByTestId('choice').nth(3)).toContainText('Rhine');
  await page.keyboard.press('1');
  await expect(page.getByTestId('result')).toHaveText('✓ Correct');
  await expect(page.getByTestId('choice').nth(0)).toHaveClass(/correct/);
});
