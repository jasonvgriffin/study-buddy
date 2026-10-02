import path from 'node:path';
import { expect, test } from '@playwright/test';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('the Study tab has no Exam simulation button, even for a CompTIA subject', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('A+ Core 1 220-1201');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  const study = page.getByTestId('home-tab-study');
  if ((await study.getAttribute('aria-selected')) !== 'true') await study.click();
  await expect(page.getByTestId('practice-exam')).toBeVisible();
  await expect(page.getByTestId('exam-sim')).toHaveCount(0);
  await expect(page.getByText('Exam simulation')).toHaveCount(0);
});
