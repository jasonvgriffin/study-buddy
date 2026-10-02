import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const shots = process.env.E2E_SHOTS ?? '/opt/cursor/artifacts';

/** The sample tests with a line naming Professor Messer added to the first page. */
async function messerSample(): Promise<string> {
  const doc = await PDFDocument.load(readFileSync(sampleThree));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.getPage(0).drawText('Practice questions from Professor Messer', { x: 54, y: 770, size: 10, font });
  const out = path.join(os.tmpdir(), `messer-sample-${Date.now()}.pdf`);
  writeFileSync(out, await doc.save());
  return out;
}

test('stats checklist lists facts and does not predict a pass', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(await messerSample());
  await expect(page.getByTestId('start-saved')).toBeVisible();

  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.getByRole('button', { name: 'B. Amazon' }).click();
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.getByTestId('next').click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'Stats', exact: true }).click();
  const checklist = page.getByTestId('readiness-checklist');
  await expect(checklist).toBeVisible();
  await expect(checklist.getByRole('heading', { name: 'Checklist', exact: true })).toBeVisible();
  await expect(page.getByTestId('by-test')).toBeVisible();
  await expect(checklist.getByTestId('checklist-due')).toHaveText('Due now: 1');
  await expect(checklist.getByTestId('checklist-streak')).toHaveText('Streak: 1 day');
  await expect(checklist.getByTestId('checklist-below')).toContainText('0 of 1');
  await expect(checklist.getByTestId('checklist-note')).toHaveText(
    'These are facts only. You decide when to book the exam.',
  );
  const text = await checklist.innerText();
  expect(text).not.toMatch(/percent[-\s]?ready|pass probability|probability of passing|you're ready|ready to pass/i);

  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'stats-checklist.png'), fullPage: true });

  await page.getByTestId('by-test-row').filter({ hasText: 'Practice Test 1' }).click();
  const link = page.getByTestId('domain-stats').getByTestId('messer-link');
  await expect(link).toHaveText('Watch the Messer video');
  await expect(link).toHaveAttribute(
    'href',
    'https://www.professormesser.com/free-a-plus-training/220-1201/220-1201-video/220-1201-training-course/',
  );
  await expect(link).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: path.join(shots, 'messer-domain-link.png'), fullPage: true });
});

test('Messer links stay hidden when the PDF never names Professor Messer', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByRole('button', { name: 'B. Amazon' }).click();
  await page.getByTestId('next').click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'Stats', exact: true }).click();
  await page.getByTestId('by-test-row').filter({ hasText: 'Practice Test 1' }).click();
  await expect(page.getByTestId('domain-stats')).toBeVisible();
  await expect(page.getByTestId('messer-link')).toHaveCount(0);
});
