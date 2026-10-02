import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('today recap is quiet until a session, then shows the day on home', async ({ page }) => {
  await page.goto('./');
  const today = page.getByTestId('today-recap');
  await expect(today).toBeVisible();
  await expect(page.getByTestId('today-empty')).toHaveText(/Nothing yet today/);
  await expect(page.getByTestId('today-counts')).toHaveCount(0);
  const emptyBox = await today.boundingBox();
  expect(emptyBox && emptyBox.height).toBeLessThan(220);

  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  const panelTop = await page.getByTestId('new-subject-panel').evaluate((el) => el.getBoundingClientRect().top);
  const todayTop = await today.evaluate((el) => el.getBoundingClientRect().top);
  expect(panelTop).toBeLessThan(todayTop);

  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await expect(page.getByTestId('start-offer-cue')).toHaveText("You're all set — tap Start studying to begin");
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

  await expect(page.getByTestId('today-counts')).toHaveText('3 answered, 1 right, 33%');
  await expect(page.getByTestId('today-unknown')).toHaveText("I don't know: 1");
  await expect(page.getByTestId('today-subjects')).toContainText('Rivers');
  await expect(page.getByTestId('today-subjects')).toContainText('1 of 3');
  await expect(page.getByTestId('today-test').filter({ hasText: 'Practice Test 1' })).toContainText('1 of 3');
  await expect(page.getByTestId('today-encouragement')).toBeVisible();
  await expect(page.getByTestId('today-streak')).toHaveText('1-day streak');
  const back = await page.getByTestId('today-recap').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
  });
  expect(back.top).toBeLessThan(120);
  expect(back.bottom).toBeLessThan(back.height);
  const order = await page.evaluate(() => {
    const recap = document.querySelector('[data-testid="today-recap"]');
    const hero = document.querySelector('[data-testid="study-hero"]');
    if (!recap || !hero) return false;
    return recap.getBoundingClientRect().top < hero.getBoundingClientRect().top;
  });
  expect(order).toBe(true);
  await expect(page.getByTestId('start-studying')).toHaveClass(/btn-start/);
  await expect(page.getByTestId('start-studying')).toHaveClass(/btn-primary/);
});
