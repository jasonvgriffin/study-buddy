import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { openSubjects } from './homeSections';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const shots = process.env.E2E_SHOTS ?? '/opt/cursor/artifacts';

test('stats leads with each test and opens that test’s own numbers', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Exams');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await openSubjects(page);

  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  await page.keyboard.press('b');
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('resume-card')).toBeVisible();
  const library = page.getByTestId('home-tab-library');
  if ((await library.getAttribute('aria-selected')) !== 'true') await library.click();
  await page.locator('[data-deck-name="Practice Test 2"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 2');
  await page.keyboard.press('a');
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 2');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByTestId('home-section-stats').getByRole('heading', { level: 1 })).toHaveText('Stats');
  await expect(page.getByRole('heading', { name: 'By test', exact: true })).toBeVisible();
  await expect(page.getByText('Every subject on this device.')).toHaveCount(0);
  await expect(page.getByTestId('overall-accuracy')).toHaveCount(0);
  await expect(page.getByTestId('accuracy-by-day')).toHaveCount(0);
  await expect(page.getByTestId('domain-stats')).toHaveCount(0);
  await expect(page.getByTestId('weakest-cards')).toHaveCount(0);

  const test1 = page.getByTestId('by-test-row').filter({ hasText: 'Practice Test 1' });
  const test2 = page.getByTestId('by-test-row').filter({ hasText: 'Practice Test 2' });
  const test3 = page.getByTestId('by-test-row').filter({ hasText: 'Practice Test 3' });
  await expect(test1.getByTestId('in-progress')).toHaveText('In progress, question 2 of 3');
  await expect(test2.getByTestId('in-progress')).toHaveText('In progress, question 2 of 2');
  await expect(test3.getByTestId('in-progress')).toHaveCount(0);
  await expect(test1).toHaveRole('button');

  mkdirSync(shots, { recursive: true });
  const previous = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, 'stats-overview-360.png'), fullPage: true });
  if (previous) await page.setViewportSize(previous);

  await test1.click();
  await expect(page).toHaveURL(/#\/stats\/test\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Practice Test 1', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByTestId('by-test')).toHaveCount(0);
  await expect(page.getByTestId('deck-accuracy')).toContainText('0 right, 1 wrong, 1 answers.');
  await expect(page.getByTestId('deck-accuracy')).toContainText('Active study time');
  await expect(page.getByTestId('accuracy-by-day')).toContainText('0/1');
  await expect(page.getByTestId('accuracy-by-day')).not.toContainText('0/2');
  await expect(page.getByTestId('domain-stats')).toContainText('0 right, 1 wrong');
  await expect(page.getByTestId('weakest-cards')).toContainText('Cairo');
  await expect(page.getByTestId('weakest-cards')).not.toContainText('barometer');
  await expect(page.getByTestId('weakest-deck')).toHaveCount(0);
  await expect(page.getByTestId('stats-deck')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shots, 'stats-test-detail.png'), fullPage: true });

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('by-test')).toBeVisible();
  await expect(page.getByTestId('in-progress').first()).toHaveText('In progress, question 2 of 3');
  await expect(page.getByTestId('home-section-stats')).toBeVisible();
});
