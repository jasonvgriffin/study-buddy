import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

test('start a new subject, name it, then import its PDF', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('start-studying')).toHaveText('Start a new subject');
  await expect(page.getByTestId('pdf-file')).toHaveCount(0);
  await expect(page.getByTestId('load-sample-three')).toHaveCount(0);
  await expect(page.getByTestId('load-sample-notes')).toHaveCount(0);
  await expect(page.getByText('Samples are labeled practice files')).toHaveCount(0);

  await page.getByTestId('start-studying').click();
  await expect(page.getByRole('heading', { name: 'Subjects', exact: true })).toBeVisible();
  await expect(page.getByTestId('subject-name')).toBeVisible();
  await expect(page.getByTestId('pdf-file')).toHaveCount(0);
  await expect(page.getByTestId('start-subject')).toHaveCount(0);

  await page.getByTestId('subject-name').fill('Biology');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Biology"]')).toHaveClass(/on/);
  await expect(page.getByTestId('subject-name')).toHaveCount(0);
  const importer = page.getByTestId('import-for-subject');
  await expect(importer).toBeVisible();
  await expect(importer).toContainText('Import a PDF into Biology');
  await expect(importer).toContainText('saved in Biology');
  await expect(page.getByTestId('pdf-file')).toBeEnabled();

  await page.getByRole('button', { name: 'Subjects:' }).click();
  await expect(page.getByTestId('pdf-file')).toHaveCount(0);
  await expect(page.getByTestId('pick-subject-hint')).toBeVisible();
  await page.locator('[data-subject-name="Biology"]').click();
  await expect(page.getByTestId('import-for-subject')).toContainText('Biology');
  await expect(page.getByTestId('pdf-file')).toBeEnabled();

  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await expect(page.getByTestId('start-offer-cue')).toHaveText("You're all set — tap Start studying to begin");
  await expect(page.getByTestId('save-tests')).toHaveCount(0);
});
