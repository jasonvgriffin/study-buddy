import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openSubjects } from './homeSections';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const shots = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  if (test.info().project.name !== 'chromium-mobile') return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

async function showTab(page: Page, id: 'study' | 'library' | 'settings') {
  const tab = page.getByTestId(`home-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function storedStudy(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('study-buddy');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const read = <T>(store: string) =>
      new Promise<T>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      });
    const sessions = await read<Array<{ id: string; kind: string; status: string; deckName: string }>>('sessions');
    const reviews = await read<unknown[]>('reviews');
    const decks = await read<Array<{ name: string }>>('decks');
    db.close();
    return {
      sessions,
      reviewCount: reviews.length,
      deckNames: decks.map((deck) => deck.name),
    };
  });
}

async function importSample(page: Page, subject: string) {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill(subject);
  await page.getByTestId('add-subject').click();
  await expect(page.locator(`[data-subject-name="${subject}"]`)).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await openSubjects(page);
}

test('drill missed cards confirms beside the button when a sitting is open', async ({ page }) => {
  await importSample(page, 'Drill');
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('resume')).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  await showTab(page, 'study');
  await expect(page.getByTestId('resume-card').first()).toContainText('Question 2 of 3');
  const before = await storedStudy(page);
  const exam = before.sessions.find((session) => session.kind === 'exam' && session.status !== 'finished');
  expect(exam).toBeTruthy();

  const button = page.getByTestId('drill-home');
  await button.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await button.evaluate((el: HTMLButtonElement) => el.click());
  const prompt = page.getByTestId('drill-replace');
  await expect(prompt).toBeVisible();
  await expect(prompt.getByTestId('drill-replace-text')).toHaveText(
    'Practice Test 1 is still open. End it and start the drill?',
  );
  await expect(prompt.getByTestId('drill-replace-start')).toBeVisible();
  await expect(prompt.getByTestId('drill-replace-cancel')).toBeVisible();
  const beside = await button.evaluate((el) => el.nextElementSibling?.getAttribute('data-testid') ?? '');
  expect(beside).toBe('drill-replace');
  const buttonBox = await button.boundingBox();
  const promptBox = await prompt.boundingBox();
  if (!buttonBox || !promptBox) throw new Error('The drill confirm was not on screen next to the button.');
  expect(promptBox.y).toBeGreaterThan(buttonBox.y);
  expect(promptBox.y).toBeLessThan(buttonBox.y + buttonBox.height + 40);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBeGreaterThan(200);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(160);
  await expect(page.getByTestId('app-status')).not.toContainText('session in progress');
  await shot(page, 'drill-replace-prompt');

  await prompt.getByTestId('drill-replace-cancel').click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId('resume-card').first()).toContainText('Question 2 of 3');
  const afterCancel = await storedStudy(page);
  expect(afterCancel.sessions.find((session) => session.id === exam?.id)?.status).not.toBe('finished');

  // With a sitting open, Home offers Resume instead of a second way to start the same test.
  await expect(page.getByRole('button', { name: 'Start studying', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('start-timed-home')).toHaveCount(0);
  await expect(page).not.toHaveURL(/session/);
  await expect(page.getByTestId('resume')).toBeVisible();

  await showTab(page, 'library');
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  const deckButton = page.getByTestId('drill-missed');
  await deckButton.click();
  const deckPrompt = page.getByTestId('drill-replace');
  await expect(deckPrompt.getByTestId('drill-replace-text')).toHaveText(
    'Practice Test 1 is still open. End it and start the drill?',
  );
  const deckBeside = await deckButton.evaluate((el) => el.nextElementSibling?.getAttribute('data-testid') ?? '');
  expect(deckBeside).toBe('drill-replace');
  await deckPrompt.getByTestId('drill-replace-cancel').click();
  await expect(deckPrompt).toHaveCount(0);
  await expect(page.getByTestId('deck-resume')).toBeVisible();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await showTab(page, 'study');
  await page.getByTestId('drill-home').click();
  await page.getByTestId('drill-replace-start').click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 1');
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  const started = await storedStudy(page);
  expect(started.sessions.find((session) => session.id === exam?.id)).toBeUndefined();
  expect(started.sessions.some((session) => session.kind === 'drill' && session.status !== 'finished')).toBe(true);
  expect(started.reviewCount).toBeGreaterThan(0);
  expect(started.deckNames).toContain('Practice Test 1');

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await showTab(page, 'study');
  await expect(page.getByTestId('resume')).toHaveCount(1);
  await expect(page.getByTestId('resume-card').first()).toContainText('Question 1 of 1');

  // The Settings section is the whole Settings screen now, so its backup reminder shows there too.
  await showTab(page, 'settings');
  await expect(page.getByTestId('home-section-settings').getByTestId('backup-reminder')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('backup-reminder')).toBeVisible();
  await expect(page.getByTestId('backup-reminder-export')).toBeVisible();
  await expect(page.getByTestId('backup-reminder-dismiss')).toBeVisible();
  await shot(page, 'settings-backup-reminder');
  await page.getByTestId('backup-reminder-dismiss').click();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
});

test('drill with no missed cards still reports that, even if a sitting is open', async ({ page }) => {
  await importSample(page, 'Empty');
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('pause')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await showTab(page, 'study');
  await page.getByTestId('drill-home').click();
  await expect(page.getByTestId('drill-replace')).toHaveCount(0);
  await expect(page.getByTestId('app-status')).toContainText('No missed cards in this test yet.');
  await expect(page.getByTestId('resume')).toBeVisible();

  await showTab(page, 'library');
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('drill-missed').click();
  await expect(page.getByTestId('drill-replace')).toHaveCount(0);
  await expect(page.getByTestId('app-status')).toContainText('No missed cards in this test yet.');
});
