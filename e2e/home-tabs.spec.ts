import { expect, test } from '@playwright/test';
import path from 'node:path';
import { openSubjects } from './homeSections';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('a fresh open shows the four tabs and remembers nothing on reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  for (const id of ['study', 'library', 'settings']) {
    await expect(page.getByTestId(`home-tab-${id}`)).toHaveAttribute('aria-selected', 'false');
  }
  await expect(page.getByTestId('home-tab-stats')).toHaveText('Stats');
  await expect(page.getByText('Scores', { exact: true })).toHaveCount(0);

  await page.getByTestId('home-tab-study').click();
  await expect(page.locator('#home-panel')).toHaveAttribute('aria-labelledby', 'home-tab-study');
  await expect(page.locator('#home-panel')).toContainText('Add a test in Subjects');
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'false');
});

test('a tab deep link opens that tab, and deck or a finished session returns do too', async ({ page }) => {
  await page.goto('./#/?tab=progress');
  await expect(page.getByTestId('home-section-stats')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By test', exact: true })).toBeVisible();
  await expect(page.getByText('No tests in this view.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Domain breakdown' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Missed questions' })).toHaveCount(0);
  await expect(page.getByTestId('domain-stats')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toHaveCount(0);

  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await expect(page.getByTestId('rename-subject-form')).toHaveCount(0);
  const renameToggle = page.getByTestId('rename-subject-toggle');
  await expect(renameToggle).toHaveClass(/btn-primary/);
  await expect(renameToggle).not.toHaveClass(/btn-ghost/);
  const startBg = await page.getByTestId('start-subject').evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(renameToggle).toHaveCSS('background-color', startBg);
  await renameToggle.click();
  await expect(page.getByLabel('Subject name')).toHaveValue('Rivers');
  await page.getByTestId('rename-subject-toggle').click();
  await expect(page.getByTestId('rename-subject-form')).toHaveCount(0);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await openSubjects(page);
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await expect(page.getByTestId('start-untimed')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Subjects', exact: true })).toBeVisible();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toHaveCount(0);
  await page.getByTestId('subject-picker').selectOption({ label: 'Rivers' });
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
  // With tests saved, the Study tab has no panel; Drill and Recommended live on the Home card.
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByTestId('study-hero').getByTestId('drill-home')).toBeVisible();
  await expect(page.getByTestId('study-hero').getByTestId('review-due-home')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('exam-deck')).toHaveCount(0);
  await expect(page.getByTestId('start-timed-home')).toHaveCount(0);
  await expect(page.getByTestId('practice-exam')).toHaveCount(0);
});

test('tapping the open tab collapses it, and another tap shows only that tab', async ({ page }) => {
  await page.goto('./');
  for (const id of ['study', 'library', 'settings'] as const) {
    await page.getByTestId(`home-tab-${id}`).click();
    await expect(page.locator('#home-panel')).toBeVisible();
    await expect(page.getByTestId(`home-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId(`home-tab-${id}`).click();
    await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);
    await expect(page.locator('#home-panel')).toHaveCount(0);
    await expect(page.getByTestId(`home-tab-${id}`)).toHaveAttribute('aria-selected', 'false');
  }

  await page.getByTestId('home-tab-study').click();
  await page.getByTestId('home-tab-library').click();
  await expect(page.getByRole('heading', { name: 'Subjects', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-tab-study')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('home-tab-library')).toHaveAttribute('aria-selected', 'true');

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Domain breakdown' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Missed questions' })).toHaveCount(0);
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await page.getByTestId('home-tab-stats').click();
  await expect(page.getByTestId('home-section-stats')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible();
  await expect(page.locator('#home-panel')).toHaveAttribute('data-testid', 'home-section-stats');
  await expect(page.getByRole('heading', { name: 'By test', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By domain', exact: true })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);
  await expect(page).toHaveURL(/\/(#\/)?$/);
  await page.reload();
  await expect(page.getByTestId('home-tab-hint')).toHaveCount(0);
  await expect(page.getByTestId('home-tab-stats')).toHaveText('Stats');
});

test('every section opens in the top spot above the four tabs, and old Stats and Settings links land there', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  const panelAboveTabs = () =>
    page.evaluate(() => {
      const panel = document.getElementById('home-panel');
      const tabs = document.querySelector('.home-tabs');
      if (!panel || !tabs) return null;
      const after = (panel.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return { after, below: panel.getBoundingClientRect().bottom <= tabs.getBoundingClientRect().top + 1 };
    });

  for (const [id, heading] of [
    ['library', 'Subjects'],
    ['stats', 'Stats'],
    ['settings', 'Settings'],
  ] as const) {
    await page.getByTestId(`home-tab-${id}`).click();
    await expect(page.getByTestId(`home-section-${id}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    // The section replaces the Start studying card; nothing else opens below the tabs.
    await expect(page.getByTestId('study-hero')).toHaveCount(0);
    await expect(page.locator('#home-panel')).toHaveCount(1);
    expect(await panelAboveTabs()).toEqual({ after: true, below: true });
    await expect(page).toHaveURL(/\/(#\/)?$/);
  }
  await expect(page.getByTestId('home-section-settings').getByRole('button', { name: 'Export backup' })).toBeVisible();
  await expect(page.getByTestId('home-section-settings').getByTestId('haptics-note')).toBeVisible();

  await page.getByTestId('home-tab-study').click();
  await expect(page.getByTestId('study-hero')).toBeVisible();
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByTestId('home-section-settings')).toHaveCount(0);

  await page.goto('./#/stats');
  await expect(page).toHaveURL(/#\/\?tab=stats$/);
  await expect(page.getByTestId('home-section-stats')).toBeVisible();
  await expect(page.getByTestId('home-tab-stats')).toHaveAttribute('aria-selected', 'true');
  await page.goto('./#/settings');
  await expect(page).toHaveURL(/#\/\?tab=settings$/);
  await expect(page.getByTestId('home-section-settings')).toBeVisible();
  await expect(page.getByTestId('home-tab-settings')).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('navigation').getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByTestId('home-section-stats')).toBeVisible();
  await expect(page.getByTestId('home-section-settings')).toHaveCount(0);
});
