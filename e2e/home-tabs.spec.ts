import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('a fresh open shows the four tabs and remembers nothing on reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('home-tab-hint')).toHaveText('Pick a tab to start');
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  for (const id of ['study', 'library', 'progress', 'settings']) {
    await expect(page.getByTestId(`home-tab-${id}`)).toHaveAttribute('aria-selected', 'false');
  }

  await page.getByTestId('home-tab-study').click();
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('home-tab-hint')).toBeVisible();
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'false');
});

test('a tab deep link opens that tab, and deck or a finished session returns do too', async ({ page }) => {
  await page.goto('./#/?tab=progress');
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);

  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await expect(page.getByTestId('start-untimed')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toBeVisible();

  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('pause')).toBeVisible();
  await expect(page.getByTestId('end-session')).toHaveCount(0);
  await expect(page.getByTestId('open-navigator')).toHaveCount(0);
  await page.reload();
  await page.getByTestId('resume').click();
  await page.getByTestId('choice').first().click();
  await page.getByTestId('next').click();
  await page.getByTestId('choice').nth(0).click();
  await page.getByTestId('choice').nth(1).click();
  await page.getByTestId('submit').click();
  await page.getByTestId('next').click();
  await page.getByTestId('choice').first().click();
  await page.getByTestId('next').click();
  await expect(page).toHaveURL(/#\/results\//);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await expect(page.getByTestId('practice-exam')).toBeVisible();
});

test('tapping the open tab collapses it, and another tap shows only that tab', async ({ page }) => {
  await page.goto('./');
  for (const id of ['study', 'library', 'progress', 'settings'] as const) {
    await page.getByTestId(`home-tab-${id}`).click();
    await expect(page.locator('#home-panel')).toBeVisible();
    await expect(page.getByTestId(`home-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId(`home-tab-${id}`).click();
    await expect(page.getByTestId('home-tab-hint')).toHaveText('Pick a tab to start');
    await expect(page.locator('#home-panel')).toHaveCount(0);
    await expect(page.getByTestId(`home-tab-${id}`)).toHaveAttribute('aria-selected', 'false');
  }

  await page.getByTestId('home-tab-study').click();
  await page.getByTestId('home-tab-library').click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('home-tab-library')).toHaveAttribute('aria-selected', 'true');

  await page.goto('./#/?tab=progress');
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
  await page.getByTestId('home-tab-progress').click();
  await expect(page.getByTestId('home-tab-hint')).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await page.reload();
  await expect(page.getByTestId('home-tab-hint')).toBeVisible();
});
