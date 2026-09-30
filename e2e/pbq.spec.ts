import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const pdfPath = path.resolve('uploads/messer-aplus-core1-practice-exams_5c83.pdf');
const shots = process.env.E2E_SHOTS ?? path.resolve('test-results/shots');
mkdirSync(shots, { recursive: true });

async function openDeck(page: Page, name: string) {
  await page.locator(`[data-deck-name="${name}"]`).click();
  await expect(page.getByTestId('start-untimed')).toBeVisible();
  await expect(page.getByTestId('figure-status')).toHaveAttribute('data-count', /^[1-9]/);
  await expect(page.getByTestId('reimport-figures')).toHaveCount(0);
}

async function expectQuiet(page: Page) {
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.getByTestId('pbq-item-result')).toHaveCount(0);
  await expect(page.getByTestId('correct-answer')).toHaveCount(0);
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByText(/Answer Page/i)).toHaveCount(0);
  await expect(page.getByText(/The Answer:/i)).toHaveCount(0);
}

test.skip(!existsSync(pdfPath), 'real exam PDF is not in this workspace');

test('phone import shows PBQ figures and hides answers until submit', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Core 1"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(pdfPath);
  await expect(page.getByTestId('save-tests')).toBeVisible({ timeout: 240_000 });
  // The import check must not spoil the answer, and it shows the captured diagram.
  await expect(page.getByTestId('review-notice')).toBeVisible();
  await expect(page.getByTestId('review-answer')).toHaveCount(0);
  await expect(page.getByTestId('review-explanation')).toHaveCount(0);
  await expect(page.getByText(/Answer from the PDF/)).toHaveCount(0);
  await expect(page.getByTestId('review-figure').first()).toBeVisible();
  await page.getByTestId('review-show-answer').click();
  await expect(page.getByTestId('review-answer')).toBeVisible();
  await page.getByTestId('review-show-answer').click();
  await expect(page.getByTestId('review-answer')).toHaveCount(0);
  await page.getByTestId('save-tests').click();
  await expect(page.locator('[data-deck-name="Practice Exam A"]')).toBeVisible();

  await openDeck(page, 'Practice Exam A');
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('position')).toHaveText(/question 1 of 90/);
  await expect(page.getByTestId('pbq-form')).toHaveAttribute('data-format', 'match-two');
  await expect(page.getByTestId('pbq-select')).toHaveCount(12);
  await expectQuiet(page);
  const figure = page.getByTestId('question-figure').first();
  await expect(figure).toBeVisible();
  const box = await figure.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.height ?? 0).toBeGreaterThan(120);
  await page.getByTestId('zoom-figure').first().click();
  await expect(page.getByTestId('zoom-close')).toBeVisible();
  await page.getByTestId('zoom-close').click();
  await expect(page.getByTestId('zoom-close')).toHaveCount(0);
  await page.screenshot({ path: `${shots}/a1-before-submit.png`, fullPage: true });

  await page.getByTestId('submit').click();
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('pbq-item-result')).toHaveCount(6);
  await expect(page.getByTestId('correct-answer')).toHaveCount(6);
  await expect(page.getByTestId('explanation')).toBeVisible();
  await page.screenshot({ path: `${shots}/a1-after-submit.png`, fullPage: true });

  for (let step = 0; step < 4; step += 1) {
    await page.getByTestId('next').click();
    await expect(page.getByTestId('question-figure').first()).toBeVisible();
    await expectQuiet(page);
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('explanation')).toBeVisible();
  }

  await page.getByTestId('next').click();
  await expect(page.getByTestId('position')).toHaveText(/question 6 of 90/);
  await expect(page.getByTestId('choice').first()).toBeVisible();
  await expectQuiet(page);
  const multi = (await page.getByTestId('submit').count()) > 0;
  await page.getByTestId('choice').first().click();
  if (multi) await page.getByTestId('submit').click();
  await expect(page.getByTestId('result')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await openDeck(page, 'Practice Exam B');
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('position')).toHaveText(/question 1 of 90/);
  await expect(page.getByTestId('pbq-form')).toHaveAttribute('data-format', 'select');
  await expect(page.getByTestId('pbq-select')).toHaveCount(6);
  await expect(page.getByTestId('question-figure').first()).toBeVisible();
  await expectQuiet(page);

  await page.getByRole('button', { name: 'Back' }).click();
  await openDeck(page, 'Practice Exam C');
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('position')).toHaveText(/question 1 of 90/);
  await expect(page.getByTestId('pbq-form')).toHaveAttribute('data-format', 'select');
  await expect(page.getByTestId('pbq-select')).toHaveCount(8);
  await expect(page.getByTestId('question-figure').first()).toBeVisible();
  await expectQuiet(page);
});
