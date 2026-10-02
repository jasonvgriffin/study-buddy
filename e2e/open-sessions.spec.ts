import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const shots = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  if (test.info().project.name !== 'chromium-mobile') return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

test('every open session is listed on the top card and each button resumes that test', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.getByTestId('choice').filter({ hasText: 'Nile' }).click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 2"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByRole('heading', { name: 'What does a barometer measure?' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  const card = page.getByTestId('resume-card');
  await expect(card).toHaveCount(1);
  const names = card.getByTestId('resume-test-name');
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toHaveText('Practice Test 2');
  await expect(names.nth(1)).toHaveText('Practice Test 1');
  await expect(card).toContainText(/Resume Practice Test 2: Question 1 of 2, .* elapsed/);
  await expect(card).toContainText(/Resume Practice Test 1: Question 2 of 3, .* elapsed/);
  await expect(card.getByTestId('resume')).toHaveCount(2);
  await expect(card.getByTestId('resume').nth(0)).toHaveText('Resume Practice Test 2');
  await expect(card.getByTestId('resume').nth(1)).toHaveText('Resume Practice Test 1');
  await expect(card.getByTestId('today-line')).toHaveCount(1);
  await expect(page.getByTestId('today-line')).toHaveCount(1);

  await page.getByTestId('home-tab-study').click();
  const panel = page.locator('#home-panel');
  await expect(panel.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await expect(panel.getByTestId('resume')).toHaveCount(0);
  await expect(panel.getByTestId('resume-test-name')).toHaveCount(0);
  await expect(panel).not.toContainText('Resume Practice Test');
  await expect(panel.getByTestId('discard')).toHaveCount(1);
  await expect(panel.getByTestId('discard')).toHaveText('Discard and start over');
  await expect(panel.getByTestId('practice-exam')).toBeVisible();
  await expect(panel.getByTestId('exam-deck')).toBeVisible();
  await shot(page, 'two-open-sessions');

  await card.getByRole('button', { name: 'Resume Practice Test 1' }).click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await expect(page.getByRole('heading', { name: 'Which two of these rivers are in Europe?' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await expect(card.getByTestId('resume-test-name').nth(0)).toHaveText('Practice Test 1');
  await expect(card.getByTestId('resume-test-name').nth(1)).toHaveText('Practice Test 2');
  await card.getByRole('button', { name: 'Resume Practice Test 2' }).click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 2');
  await expect(page.getByRole('heading', { name: 'What does a barometer measure?' })).toBeVisible();

  await page.getByTestId('pause').click();
  await expect(page.getByTestId('resume')).toHaveText('Resume Practice Test 2');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await expect(page.getByTestId('deck-resume').getByTestId('resume')).toHaveText('Resume Practice Test 1');
  await page.getByTestId('deck-resume').getByTestId('resume').click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await expect(page.getByRole('heading', { name: 'Which two of these rivers are in Europe?' })).toBeVisible();
});
