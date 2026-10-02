import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('home keeps today on the primary card and stays quiet when the day is empty', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('today-recap')).toHaveCount(0);
  await expect(page.getByTestId('today-line')).toHaveCount(0);
  await expect(page.getByText('Nothing yet today')).toHaveCount(0);
  await expect(page.getByTestId('study-hero')).toBeVisible();
  await expect(page.getByTestId('start-studying')).toHaveText('Start a new subject');

  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  const panelTop = await page.getByTestId('new-subject-panel').evaluate((el) => el.getBoundingClientRect().top);
  const heroTop = await page.getByTestId('study-hero').evaluate((el) => el.getBoundingClientRect().top);
  expect(panelTop).toBeLessThan(heroTop);

  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await expect(page.getByTestId('start-offer-cue')).toHaveText("You're all set — tap Start studying to begin");
  await page.getByTestId('start-saved').click();

  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  const resume = page.getByTestId('resume-card');
  await expect(resume).toBeVisible();
  await expect(resume.getByTestId('hero-kicker')).toHaveCount(0);
  await expect(resume.getByTestId('resume-test-name')).toHaveText('Practice Test 1');
  await expect(resume).toContainText(/Resume Practice Test 1: Question 1 of 3/);
  await expect(resume.getByTestId('resume')).toHaveText('Resume Practice Test 1');
  await expect(page.getByTestId('today-line')).toHaveCount(0);
  await expect(page.getByTestId('today-recap')).toHaveCount(0);
  await expect(page.getByText('Nothing yet today')).toHaveCount(0);
  await expect(page.getByTestId('study-hero')).toHaveCount(0);

  await page.getByTestId('resume').click();
  await page.getByTestId('i-dont-know').click();
  await page.getByTestId('next').click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(resume).toContainText(/Resume Practice Test 1: Question 2 of 3/);
  await expect(resume.getByTestId('today-line')).toHaveText('Today: 1 answered · 0 right (0%) · 1-day streak');
  await expect(page.getByTestId('today-recap')).toHaveCount(0);
  await expect(page.getByTestId('today-subjects')).toHaveCount(0);

  await page.getByTestId('resume').click();
  await page.getByTestId('choice').filter({ hasText: 'Danube' }).click();
  await page.getByTestId('choice').filter({ hasText: 'Rhine' }).click();
  await page.getByTestId('submit').click();
  await page.getByTestId('next').click();
  await page.getByTestId('choice').filter({ hasText: 'Madrid' }).click();
  await page.getByTestId('next').click();
  await expect(page).toHaveURL(/#\/results\//);
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  const hero = page.getByTestId('study-hero');
  await expect(hero.getByTestId('today-line')).toHaveText('Today: 3 answered · 1 right (33%) · 1-day streak');
  await expect(hero.getByTestId('today-unknown')).toHaveText("I don't know: 1");
  await expect(hero.getByTestId('today-subjects')).toContainText('Rivers');
  await expect(hero.getByTestId('today-subjects')).toContainText('1 of 3');
  await expect(hero.getByTestId('today-test').filter({ hasText: 'Practice Test 1' })).toContainText('1 of 3');
  await expect(hero.getByTestId('today-encouragement')).toBeVisible();
  await expect(page.getByTestId('today-streak')).toHaveCount(0);
  await expect(page.getByTestId('resume-card')).toHaveCount(0);
  await expect(hero.getByTestId('start-studying')).toHaveText('Start studying');
  await expect(hero.getByTestId('start-studying')).toHaveClass(/btn-start/);
  await expect(hero.getByTestId('start-studying')).toHaveClass(/btn-primary/);
  const back = await hero.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
  });
  expect(back.top).toBeLessThan(120);
  expect(back.bottom).toBeLessThan(back.height);
  const inside = await page.evaluate(() => {
    const recap = document.querySelector('[data-testid="today-recap"]');
    const card = document.querySelector('[data-testid="study-hero"]');
    return !!recap && !!card && card.contains(recap);
  });
  expect(inside).toBe(true);
});

test('today recap follows the subject chip and stays quiet for a subject with no answers', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('start-saved').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.getByTestId('i-dont-know').click();
  await page.getByTestId('next').click();
  await page.getByTestId('choice').filter({ hasText: 'Danube' }).click();
  await page.getByTestId('choice').filter({ hasText: 'Rhine' }).click();
  await page.getByTestId('submit').click();
  await page.getByTestId('next').click();
  await page.getByTestId('choice').filter({ hasText: 'Madrid' }).click();
  await page.getByTestId('next').click();
  await expect(page).toHaveURL(/#\/results\//);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('today-line')).toHaveText('Today: 3 answered · 1 right (33%) · 1-day streak');

  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Weather');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Weather"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  // "Subjects:" is a plain label now; clear the subject focus from the Subjects panel picker.
  await page.getByTestId('subject-picker').selectOption('');
  const all = page.getByTestId('study-hero');
  await expect(all.getByTestId('today-line')).toHaveText('Today: 3 answered · 1 right (33%) · 1-day streak');
  await expect(all.getByTestId('today-subjects')).toContainText('Rivers');
  await expect(all.getByTestId('today-subjects')).not.toContainText('Weather');

  await page.locator('[data-subject-name="Weather"]').click();
  await expect(page.getByTestId('today-recap')).toHaveCount(0);
  await expect(page.getByTestId('study-hero')).not.toContainText('Nothing yet today');
  await expect(page.getByTestId('study-hero')).not.toContainText('3 answered');
  // The fresh Weather import still owns the card, so its one Start studying button is the import's.
  await expect(page.getByTestId('study-hero').getByRole('button', { name: 'Start studying', exact: true })).toHaveCount(1);

  await page.locator('[data-subject-name="Rivers"]').click();
  await expect(page.getByTestId('study-hero').getByTestId('today-subjects')).toContainText('Rivers');
  await expect(page.getByTestId('study-hero').getByTestId('today-subjects')).not.toContainText('Weather');
});
