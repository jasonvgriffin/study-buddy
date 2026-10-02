import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const tagline =
  'An experimental tool to help you study. Create a subject, upload a pdf of test questions and this tool will quiz you.';

async function examPdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const leading = 16;
  let page = doc.addPage([612, 792]);
  let y = 740;
  const lines = [
    'Practice Exam A',
    'A1. Which connector is shown in picture 1?',
    'a) Lightning',
    'b) USB-C',
    'A2. Which connector is shown in picture 2?',
    'a) RJ-45',
    'b) HDMI',
    'A12. Which port carries analog video?',
    'a) VGA',
    'b) USB',
    'A100. Which cable is used for Ethernet?',
    'a) Cat 6',
    'b) SATA',
    'Practice Exam B',
    'B1. What does RAM stand for?',
    'a) Random access memory',
    'b) Read only memory',
    'Practice Exam C',
    'C1. What does SSD stand for?',
    'a) Solid state drive',
    'b) Serial storage disk',
    'Answer Key',
    'A1. a',
    'A2. a',
    'A12. a',
    'A100. a',
    'B1. a',
    'C1. a',
  ];
  for (const line of lines) {
    if (y < 70) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    page.drawText(line, { x: 54, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= leading;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'study-buddy-'));
  const file = path.join(dir, 'practice-exams.pdf');
  writeFileSync(file, await doc.save());
  return file;
}

async function rowIsClipped(page: import('@playwright/test').Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((row) => {
    const rowClipped = row.scrollWidth > row.clientWidth + 2;
    const chipClipped = [...row.querySelectorAll('.chip')].some((chip) => {
      const el = chip as HTMLElement;
      return el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
    });
    return rowClipped || chipClipped;
  });
}

test('home title, feedback link, subject panel, upload status, and review chips', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Study Buddy Beta');
  await expect(page.getByRole('heading', { name: 'Study Buddy Beta', exact: true })).toBeVisible();
  await expect(page.getByTestId('tagline')).toHaveText(tagline);

  const note = page.getByTestId('feedback-note');
  const noteBox = await note.boundingBox();
  const taglineBox = await page.getByTestId('tagline').boundingBox();
  expect(noteBox && taglineBox && noteBox.y > taglineBox.y).toBe(true);
  expect(noteBox!.height).toBeLessThan(100);
  expect(await note.evaluate((el) => el.scrollWidth > el.clientWidth + 2)).toBe(false);

  const href = await page.getByTestId('feedback-mail').getAttribute('href');
  expect(href?.startsWith('mailto:eve.chief_of_staff@agentmail.to?')).toBe(true);
  const params = new URLSearchParams(href!.slice(href!.indexOf('?') + 1));
  expect(params.get('subject')).toBe('Study Buddy feedback');
  expect(params.get('body')).toContain('What happened:');
  expect(params.get('body')).toContain('App version:');
  expect(params.get('body')).toMatch(/Build: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);

  await page.getByTestId('start-studying').click();
  const panel = page.getByTestId('new-subject-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('subject-name')).toBeFocused();
  await expect(page.getByTestId('start-subject')).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const form = document.querySelector('[data-testid="new-subject-panel"]');
      const hero = document.querySelector('[data-testid="study-hero"]');
      if (!form || !hero) return false;
      return form.getBoundingClientRect().top < hero.getBoundingClientRect().top;
    }),
  ).toBe(true);

  await page.getByTestId('add-subject').click();
  await expect(panel.getByRole('alert')).toHaveText('Name the subject first.');
  await expect(panel).toBeVisible();

  await page.getByTestId('demand-cancel').click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('start-subject')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const hero = document.querySelector('[data-testid="study-hero"]');
      const tabs = document.querySelector('.home-tabs');
      if (!hero || !tabs) return false;
      return hero.getBoundingClientRect().top < tabs.getBoundingClientRect().top;
    }),
  ).toBe(true);

  await page.getByTestId('start-subject').click();
  await expect(page.getByTestId('subject-name')).toBeFocused();
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-subject-name="Core 1"]')).toHaveClass(/on/);

  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __status: string[] }).__status = log;
    const read = () => {
      const el = document.querySelector('[data-testid="app-status"]');
      const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && log[log.length - 1] !== text) log.push(text);
    };
    read();
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  await page.getByTestId('pdf-file').setInputFiles(await examPdf());
  await expect(page.getByTestId('pdf-file')).toBeDisabled();
  await expect(page.getByTestId('import-status')).toContainText(/Uploading…|Reading questions… please wait/);
  await expect(page.getByTestId('app-status')).toContainText('Added 6 questions from practice-exams.pdf');
  await expect(page.getByTestId('save-tests')).toBeEnabled();
  await expect(page.getByTestId('save-tests-top')).toBeEnabled();

  const seen = await page.evaluate(() => (window as unknown as { __status: string[] }).__status);
  expect(seen.some((line) => line.includes('Uploading…'))).toBe(true);
  expect(seen.some((line) => line.includes('Reading questions… please wait'))).toBe(true);

  await expect(page.getByTestId('test-chip')).toHaveText([
    '1. Practice Exam A (4)',
    '2. Practice Exam B (1)',
    '3. Practice Exam C (1)',
  ]);
  expect(await rowIsClipped(page, 'test-chip-row')).toBe(false);
  await expect(page.getByTestId('test-chip').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('test-chip').nth(1).click();
  await expect(page.getByTestId('test-chip').nth(1)).toHaveClass(/on/);
  await expect(page.getByTestId('test-chip').first()).not.toHaveClass(/on/);

  await expect(page.getByTestId('card-chip')).toHaveText(['B1']);
  await page.getByTestId('test-chip').first().click();
  await expect(page.getByTestId('card-chip')).toHaveText(['A1', 'A2', 'A12', 'A100']);
  expect(await rowIsClipped(page, 'card-chip-row')).toBe(false);
  const wrap = await page.getByTestId('card-chip-row').evaluate((row) => getComputedStyle(row).flexWrap);
  expect(wrap).toBe('wrap');
  await page.getByTestId('card-chip').last().click();
  await expect(page.getByTestId('card-chip').last()).toHaveClass(/on/);
  await expect(page.getByTestId('card-chip').last()).toHaveText('A100');

  await page.getByTestId('save-tests').click();
  await page.locator('[data-deck-name="Practice Exam A"]').click();
  await page.getByRole('button', { name: /^A1\./ }).click();
  const editor = page.getByTestId('card-editor-panel');
  await expect(editor).toBeVisible();
  await expect(editor.locator('textarea').first()).toBeFocused();
  expect(
    await page.evaluate(() => {
      const form = document.querySelector('[data-testid="card-editor-panel"]');
      const start = document.querySelector('[data-testid="start-untimed"]');
      if (!form || !start) return false;
      return form.getBoundingClientRect().top < start.getBoundingClientRect().top;
    }),
  ).toBe(true);
  await editor.getByTestId('demand-cancel').click();
  await expect(editor).toHaveCount(0);
});
