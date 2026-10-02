import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const sampleNotes = path.resolve('public/samples/sample-notes.pdf');
const shots = '/opt/cursor/artifacts';

async function shot(page: Page, name: string) {
  if (test.info().project.name !== 'chromium-mobile') return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

async function storeCounts(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('study-buddy');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const stores = ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts', 'figures', 'meta'] as const;
    const counts: Record<string, number> = {};
    for (const store of stores) {
      counts[store] = await new Promise<number>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db.close();
    return counts;
  });
}

test('discard and start over clears every saved study record', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('app-footer')).toHaveText('Built by Jason Griffin with GrokBot/cursor');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('A+');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="A+"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').filter({ hasText: 'Amazon' }).click();
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('text-size-large').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-tab-study').click();
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  await expect(page.getByTestId('review-due-home')).toContainText(/\(/);
  await expect(page.getByTestId('discard').first()).toBeVisible();

  await page.getByTestId('discard').first().click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Discard and start over?');
  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  await expect(page.locator('[data-subject-name="A+"]')).toBeVisible();

  await page.getByTestId('discard').first().click();
  await page.getByTestId('confirm-destructive').click();
  await expect(page.getByTestId('home-tab-hint')).toHaveText('Pick a tab to start');
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  await expect(page.locator('[data-subject-name="A+"]')).toHaveCount(0);
  await expect(page.getByTestId('resume-card')).toHaveCount(0);
  await expect(page.getByTestId('study-hero')).toContainText('Name a subject, then import its PDF.');
  await expect(page.getByTestId('start-studying')).toHaveText('Start a new subject');
  await shot(page, 'fresh-after-reset');
  await expect(page.getByTestId('app-footer')).toHaveText('Built by Jason Griffin with GrokBot/cursor');
  await page.getByTestId('app-footer').evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - 220));
  });
  await shot(page, 'footer');

  await page.getByTestId('home-tab-study').click();
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  await expect(page.getByTestId('practice-exam')).toHaveCount(0);
  await expect(page.getByTestId('discard')).toHaveCount(0);
  await page.getByTestId('home-tab-library').click();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toHaveCount(0);
  await expect(page.getByTestId('delete-subject')).toHaveCount(0);
  await page.getByTestId('home-tab-stats').click();
  await expect(page).toHaveURL(/#\/stats$/);
  await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible();
  await expect(page.getByText('A+')).toHaveCount(0);
  await expect(page.getByText('Which river runs through Cairo?')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();

  const counts = await storeCounts(page);
  for (const count of Object.values(counts)) expect(count).toBe(0);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');

  await page.reload();
  await expect(page.getByTestId('home-tab-hint')).toHaveText('Pick a tab to start');
  await expect(page.locator('#home-panel')).toHaveCount(0);
  await expect(page.locator('[data-subject-name="A+"]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await page.getByTestId('home-tab-library').click();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toHaveCount(0);
});

test('library can delete one PDF and an entire subject', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('A+');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="A+"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await page.getByTestId('pdf-file').setInputFiles(sampleNotes);
  await expect(page.getByTestId('import-added')).toContainText('sample-notes.pdf');

  await expect(page.getByTestId('delete-subject')).toHaveText('Delete A+ and all its PDFs');
  await expect(page.getByTestId('delete-source')).toHaveCount(2);
  await expect(page.getByTestId('delete-source').first()).toHaveText('Delete this PDF only');
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toBeVisible();
  await page.getByTestId('delete-subject').scrollIntoViewIfNeeded();
  await shot(page, 'library-delete-actions');

  const notes = page.getByTestId('source-file').filter({ hasText: 'sample-notes.pdf' });
  await notes.getByTestId('delete-source').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Delete sample-notes.pdf?');
  await expect(page.getByTestId('confirm-dialog')).toContainText('A+');
  await expect(page.getByTestId('confirm-destructive')).toHaveText('Delete this PDF only');
  await page.getByTestId('confirm-cancel').click();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toBeVisible();
  await notes.getByTestId('delete-source').click();
  await page.getByTestId('confirm-destructive').click();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toHaveCount(0);
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="Practice Test 2"]')).toBeVisible();
  await expect(page.getByTestId('delete-source')).toHaveCount(1);

  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Network+');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Network+"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleNotes);
  await expect(page.getByTestId('import-added')).toContainText('sample-notes.pdf');
  await page.locator('[data-subject-name="A+"]').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').filter({ hasText: 'Amazon' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('home-tab-library')).toBeVisible();
  if ((await page.getByTestId('home-tab-library').getAttribute('aria-selected')) !== 'true') {
    await page.getByTestId('home-tab-library').click();
  }

  await page.getByTestId('delete-subject').click();
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toContainText('Delete A+?');
  await expect(dialog).toContainText('questions, metrics, progress, test sessions, and source files');
  await expect(page.getByTestId('confirm-destructive')).toHaveText('Delete A+ and all its PDFs');
  await expect(page.getByTestId('confirm-destructive')).toHaveClass(/btn-clay/);
  await shot(page, 'delete-subject-confirmation');
  await page.getByTestId('confirm-cancel').click();
  await expect(page.locator('[data-subject-name="A+"]')).toBeVisible();
  await page.getByTestId('delete-subject').click();
  await page.getByTestId('confirm-destructive').click();

  await expect(page.locator('[data-subject-name="A+"]')).toHaveCount(0);
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toHaveCount(0);
  await expect(page.getByText('Which river runs through Cairo?')).toHaveCount(0);
  await expect(page.locator('[data-subject-name="Network+"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toBeVisible();

  await page.getByTestId('home-tab-study').click();
  await expect(page.getByText('A+', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('practice-exam')).toBeVisible();
  await expect(page.getByTestId('exam-deck')).toContainText('sample-notes');
  await expect(page.getByRole('heading', { name: 'What to study next' })).toHaveCount(0);
  await expect(page.locator('#home-panel')).not.toContainText('A+');
  await page.getByTestId('home-tab-stats').click();
  await expect(page).toHaveURL(/#\/stats$/);
  await expect(page.locator('main')).not.toContainText('A+');
  await expect(page.locator('main')).not.toContainText('Which river runs through Cairo?');
  await expect(page.getByRole('heading', { name: 'By test', exact: true })).toBeVisible();
  await expect(page.getByTestId('by-test')).toContainText('sample-notes');
  await expect(page.getByRole('heading', { name: 'Domain breakdown' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Missed questions' })).toHaveCount(0);
  await expect(page.getByTestId('domain-stats')).toHaveCount(0);

  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-tab-library').click();
  await expect(page.locator('[data-subject-name="A+"]')).toHaveCount(0);
  await expect(page.locator('[data-subject-name="Network+"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toHaveCount(0);
});
