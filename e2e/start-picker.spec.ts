import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** A PDF holding Practice Exam A, B, and C (the three-tests fixture with exam-style headings). */
async function multiExamPdf(outPath: string): Promise<string> {
  const text = readFileSync('fixtures/three-tests.txt', 'utf8')
    .replace(/^Practice Test 1$/m, 'Practice Exam A')
    .replace(/^Practice Test 2$/m, 'Practice Exam B')
    .replace(/^Practice Test 3$/m, 'Practice Exam C');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  let y = 740;
  for (const line of text.split(/\r?\n/)) {
    if (y < 70) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    if (line.trim()) page.drawText(line, { x: 54, y, size: 12, font });
    y -= 16;
  }
  writeFileSync(outPath, await doc.save());
  return outPath;
}

async function importExams(page: Page, pdf: string) {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Exams');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(pdf);
  await expect(page.getByTestId('start-saved')).toBeVisible();
}

test('after an import Home shows one Start studying card with an exam picker that starts the picked exam', async ({ page }, info) => {
  const pdf = await multiExamPdf(info.outputPath('practice-exams.pdf'));
  await importExams(page, pdf);

  await expect(page.getByRole('button', { name: 'Start studying', exact: true })).toHaveCount(1);
  await expect(page.locator('[data-testid="start-studying"]')).toHaveCount(0);
  const offer = page.getByTestId('start-offer');
  await expect(offer.getByTestId('import-added')).toContainText('practice-exams.pdf');
  await expect(offer.getByTestId('organize-tests')).toHaveText('Rename tests');
  await expect(offer.getByText('Choose an exam')).toBeVisible();

  const select = offer.getByTestId('start-deck');
  await expect(select).toHaveAccessibleName('Choose an exam');
  await expect(select.locator('option')).toHaveText(['Practice Exam A', 'Practice Exam B', 'Practice Exam C']);
  await expect(select.locator('option:checked')).toHaveText('Practice Exam A');
  await expect(page.getByTestId('start-saved')).toBeFocused();

  await select.selectOption({ label: 'Practice Exam B' });
  await expect(offer.getByTestId('start-offer-test')).toHaveText('Practice Exam B');
  await expect(page.getByRole('button', { name: 'Start studying', exact: true })).toHaveCount(1);
  await page.getByTestId('start-saved').click();
  await expect(page.getByRole('heading', { name: 'What does a barometer measure?' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('resume-test-name')).toHaveText('Practice Exam B');
});

test('without a fresh import the standalone Start studying card still lets you pick the exam', async ({ page }, info) => {
  const pdf = await multiExamPdf(info.outputPath('practice-exams.pdf'));
  await importExams(page, pdf);
  await page.reload();

  await expect(page.getByTestId('start-offer')).toHaveCount(0);
  const hero = page.getByTestId('study-hero');
  await expect(page.getByRole('button', { name: 'Start studying', exact: true })).toHaveCount(1);
  const select = hero.getByTestId('start-deck');
  await expect(select.locator('option')).toHaveText(['Practice Exam A', 'Practice Exam B', 'Practice Exam C']);
  await expect(select.locator('option:checked')).toHaveText('Practice Exam A');
  await select.selectOption({ label: 'Practice Exam C' });
  await expect(hero.getByTestId('start-deck-label')).toHaveText('Practice Exam C');
  await hero.getByTestId('start-studying').click();
  await expect(page.getByRole('heading', { name: 'How many sides does a hexagon have?' })).toBeVisible();
});

test('Timing picker: Untimed is the default and starts with no countdown', async ({ page }, info) => {
  const pdf = await multiExamPdf(info.outputPath('practice-exams.pdf'));
  await importExams(page, pdf);

  const offer = page.getByTestId('start-offer');
  const timing = offer.getByTestId('start-timing');
  await expect(timing).toHaveAccessibleName('Timing');
  await expect(timing.locator('option')).toHaveText(['Untimed', 'Timed (90 minutes)']);
  await expect(timing.locator('option:checked')).toHaveText('Untimed');
  await expect(offer.getByTestId('start-timing-label')).toHaveText('Untimed');
  await expect(page.getByTestId('start-timed-home')).toHaveCount(0);

  await page.getByTestId('start-saved').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await expect(page.getByTestId('time-left')).toHaveCount(0);
  await expect(page.getByText(/Time left/)).toHaveCount(0);
});

test('Timing picker: Timed starts the 90-minute exam and the choice is remembered', async ({ page }, info) => {
  const pdf = await multiExamPdf(info.outputPath('practice-exams.pdf'));
  await importExams(page, pdf);

  await page.getByTestId('start-offer').getByTestId('start-timing').selectOption({ label: 'Timed (90 minutes)' });
  await expect(page.getByTestId('start-timing-label')).toHaveText('Timed (90 minutes)');
  await page.reload();

  const hero = page.getByTestId('study-hero');
  await expect(hero.getByTestId('start-timing').locator('option:checked')).toHaveText('Timed (90 minutes)');
  await hero.getByTestId('start-deck').selectOption({ label: 'Practice Exam B' });
  await hero.getByTestId('start-studying').click();
  await expect(page.getByRole('heading', { name: 'What does a barometer measure?' })).toBeVisible();
  await expect(page.getByTestId('time-left')).toHaveText(/^Time left (90:00|89:[0-5]\d)$/);
});

test('Drill missed cards follows the exam picked on the Home card', async ({ page }, info) => {
  const pdf = await multiExamPdf(info.outputPath('practice-exams.pdf'));
  await importExams(page, pdf);

  await page.getByTestId('start-saved').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await page.getByTestId('i-dont-know').click();
    await page.getByTestId('next').click();
  }
  await expect(page).toHaveURL(/#\/results\//);
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  const hero = page.getByTestId('study-hero');
  const pick = hero.getByTestId('start-deck');
  await expect(pick.locator('option:checked')).toHaveText('Practice Exam A');
  const studyTab = page.getByTestId('home-tab-study');
  if ((await studyTab.getAttribute('aria-selected')) !== 'true') await studyTab.click();
  await expect(page.getByTestId('exam-deck')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toHaveCount(0);

  await pick.selectOption({ label: 'Practice Exam C' });
  await page.getByTestId('drill-home').click();
  await expect(page.getByTestId('app-status')).toContainText('No missed cards in this test yet.');
  await expect(page).not.toHaveURL(/session/);

  await pick.selectOption({ label: 'Practice Exam A' });
  await page.getByTestId('drill-home').click();
  await expect(page).toHaveURL(/#\/session\//);
  await expect(page.getByTestId('position')).toHaveText(/Question 1 of 3/);
});
