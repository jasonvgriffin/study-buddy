import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openSubjects } from './homeSections';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const shots = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  if (test.info().project.name !== 'chromium-mobile') return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

async function showTab(page: Page, id: 'study' | 'library') {
  const tab = page.getByTestId(`home-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test('every open session is listed on the top card and each button resumes that test', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await openSubjects(page);

  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.getByTestId('choice').filter({ hasText: 'Nile' }).click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await showTab(page, 'library');
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

  await showTab(page, 'study');
  const panel = page.locator('#home-panel');
  await expect(panel).toHaveCount(0);
  // With open sittings, Drill and Recommended sit on the Resume card, and the Study tab has no panel.
  await expect(card.getByTestId('drill-home')).toBeVisible();
  await expect(card.getByTestId('review-due-home')).toBeVisible();
  await expect(page.getByTestId('discard')).toHaveCount(0);
  await expect(page.getByTestId('start-timed-home')).toHaveCount(0);
  await expect(page.getByTestId('practice-exam')).toHaveCount(0);
  await expect(page.getByTestId('exam-deck')).toHaveCount(0);
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

  await showTab(page, 'library');
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await expect(page.getByTestId('deck-resume').getByTestId('resume')).toHaveText('Resume Practice Test 1');
  await page.getByTestId('deck-resume').getByTestId('resume').click();
  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await expect(page.getByRole('heading', { name: 'Which two of these rivers are in Europe?' })).toBeVisible();
});
