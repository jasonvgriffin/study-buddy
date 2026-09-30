import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const sampleFigure = path.resolve('public/samples/sample-figure.pdf');

test('a correct choice stays on the card without the explanation', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.getByTestId('watch-lesson')).toHaveCount(0);
  await expect(page.getByTestId('why')).toHaveCount(0);
  await expect(page.getByText('Cairo sits on the Nile')).toHaveCount(0);
  await page.getByTestId('choice').nth(0).click();
  await expect(page.getByTestId('result')).toHaveText('Correct');
  await expect(page.getByTestId('choice').nth(0)).toHaveClass(/correct/);
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.getByTestId('next')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('position')).toHaveText(/question 1 of/);
  await page.getByTestId('why').click();
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
});

test('a wrong choice shows the correct answer, the PDF explanation, and the lesson', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').nth(1).click();
  await expect(page.getByTestId('result')).toHaveText('Incorrect');
  await expect(page.getByTestId('choice').nth(1)).toHaveClass(/wrong/);
  await expect(page.getByTestId('choice').nth(0)).toHaveClass(/correct/);
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
  const lesson = page.getByTestId('watch-lesson');
  await expect(lesson).toHaveAttribute('target', '_blank');
  await expect(lesson).toHaveAttribute('rel', /noopener/);
  await expect(lesson).toHaveAttribute('href', /example\.com\/lessons\/nile/);
});

test('multi-select waits for submit, and a card with no explanation stays quiet', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').nth(0).click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await page.getByTestId('choice').nth(0).click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await page.getByTestId('choice').nth(2).click();
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('result')).toHaveText('Correct');
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await page.getByTestId('next').click();
  await page.getByTestId('choice').nth(1).click();
  await expect(page.getByTestId('result')).toHaveText('Incorrect');
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.getByText('No explanation provided in your PDF.')).toHaveCount(0);
  await expect(page.getByTestId('choice').nth(0)).toHaveClass(/correct/);
});

test('a question figure from the PDF is shown before the answer', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('subject-name').fill('Color');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Color"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleFigure);
  await page.getByTestId('save-tests').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('explanation-figure')).toHaveCount(0);
  await page.getByTestId('choice').nth(1).click();
  await expect(page.getByTestId('result')).toHaveText('Incorrect');
  await expect(page.getByTestId('explanation')).toContainText('square in the figure is green');
  await expect(page.getByTestId('question-figure')).toBeVisible();
});
