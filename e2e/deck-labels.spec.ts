import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const messerPdf = path.resolve('fixtures/professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf');
const dionPdf = path.resolve('fixtures/dion-training-comptia-a-plus-core-1-practice-exams.pdf');
const shots = '/opt/cursor/artifacts';

const messerLabel = 'Practice Exam A, Messer';
const dionLabel = 'Practice Exam A, Dion';

async function showTab(page: Page, id: 'study' | 'library' | 'progress' | 'settings') {
  const tab = page.getByTestId(`home-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function storedDecks(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('study-buddy');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const rows = await new Promise<Array<{ name: string; sourceFileName: string; deckName?: string }>>((resolve, reject) => {
      const request = db.transaction('decks', 'readonly').objectStore('decks').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ name: string; sourceFileName: string }>);
      request.onerror = () => reject(request.error);
    });
    const sessions = await new Promise<Array<{ deckName: string; kind: string }>>((resolve, reject) => {
      const request = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ deckName: string; kind: string }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { decks: rows, sessions };
  });
}

test('two PDFs with the same test name stay distinct in one subject', async ({ page }) => {
  await page.goto('./');
  await showTab(page, 'library');
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Core 1"]')).toHaveClass(/on/);

  await page.getByTestId('pdf-file').setInputFiles(messerPdf);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await showTab(page, 'library');
  await page.getByTestId('pdf-file').setInputFiles(dionPdf);
  await expect(page.getByTestId('start-offer-test')).toHaveText(dionLabel);

  const stored = await storedDecks(page);
  expect(stored.decks.map((deck) => deck.name).sort()).toEqual(['Practice Exam A', 'Practice Exam A']);
  expect(stored.decks.map((deck) => deck.sourceFileName).sort()).toEqual([
    'dion-training-comptia-a-plus-core-1-practice-exams.pdf',
    'professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf',
  ]);

  await showTab(page, 'library');
  await expect(page.locator('[data-testid="deck-link"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="deck-link"]').filter({ hasText: messerLabel })).toBeVisible();
  await expect(page.locator('[data-testid="deck-link"]').filter({ hasText: dionLabel })).toBeVisible();
  await expect(page.locator('[data-deck-name="Practice Exam A"]')).toHaveCount(2);

  await showTab(page, 'study');
  const select = page.getByTestId('exam-deck');
  const optionText = await select.locator('option').allTextContents();
  expect(optionText.slice().sort()).toEqual([dionLabel, messerLabel]);

  if (test.info().project.name === 'chromium-mobile') {
    mkdirSync(shots, { recursive: true });
    await select.evaluate((el: HTMLSelectElement) => {
      el.size = el.options.length;
    });
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'deck-label-picker.png'), fullPage: true });
    await select.evaluate((el: HTMLSelectElement) => {
      el.size = 1;
    });
  }

  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByTestId('by-test')).toContainText(messerLabel);
  await expect(page.getByTestId('by-test')).toContainText(dionLabel);
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  await showTab(page, 'study');
  await select.selectOption({ label: messerLabel });
  await page.getByTestId('practice-exam').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  const resume = page.getByTestId('resume-card').first();
  await expect(resume.getByTestId('resume-test-name')).toHaveText(messerLabel);
  await expect(resume).toContainText(`Resume ${messerLabel}`);
  const afterStart = await storedDecks(page);
  expect(afterStart.sessions.some((session) => session.kind === 'exam' && session.deckName === 'Practice Exam A')).toBe(
    true,
  );

  await showTab(page, 'study');
  await page.getByTestId('drill-home').click();
  await expect(page.getByTestId('drill-replace-text')).toHaveText(`${messerLabel} is still open. End it and start the drill?`);
});
