import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');

async function deckNamesInStorage(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const open = indexedDB.open('study-buddy');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const names = await new Promise<string[]>((resolve, reject) => {
      const request = db.transaction('decks', 'readonly').objectStore('decks').getAll();
      request.onsuccess = () => {
        const rows = request.result as { name: string }[];
        resolve(rows.map((row) => row.name));
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return names;
  });
}

async function showLibrary(page: Page) {
  await expect(page.getByTestId('home-tab-library')).toBeVisible();
  if ((await page.getByTestId('home-tab-library').getAttribute('aria-selected')) !== 'true') {
    await page.getByTestId('home-tab-library').click();
  }
}

test('practice exams list A, B, C, default to the imported test, then the last test used', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Exams');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Exams"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await showLibrary(page);

  const offered = await page.getByTestId('start-offer-test').textContent();
  const stored = await deckNamesInStorage(page);
  expect(stored).toHaveLength(3);
  const targets = ['Practice Exam B', 'Practice Exam C', 'Practice Exam A'];
  const offeredAfterRename = targets[stored.indexOf(offered ?? '')] ?? '';
  expect(offeredAfterRename).not.toBe('');
  for (let index = 0; index < stored.length; index += 1) {
    await page.locator(`[data-deck-name="${stored[index]}"]`).click();
    await page.getByLabel('Test name').fill(targets[index] ?? '');
    await page.getByRole('button', { name: 'Rename test' }).click();
    await expect(page.getByRole('heading', { name: targets[index] ?? '' })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await showLibrary(page);
  }

  expect(await deckNamesInStorage(page)).toEqual(['Practice Exam B', 'Practice Exam C', 'Practice Exam A']);
  await expect(page.locator('[data-testid="deck-link"]')).toHaveCount(3);
  const libraryNames = await page.locator('[data-testid="deck-link"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-deck-name')),
  );
  expect(libraryNames).toEqual(['Practice Exam A', 'Practice Exam B', 'Practice Exam C']);

  await page.getByTestId('home-tab-study').click();
  const select = page.getByTestId('start-deck');
  await expect(select.locator('option')).toHaveText(['Practice Exam A', 'Practice Exam B', 'Practice Exam C']);
  // While the import card is up, the picker defaults to the test the import offered (renamed above).
  await expect(select.locator('option:checked')).toHaveText(offeredAfterRename);
  await expect(page.getByTestId('study-hero')).toContainText(offeredAfterRename);

  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Exam C"]').click();
  await page.getByTestId('start-untimed').click();
  // Finish C so Home shows the picker again (an open sitting shows Resume instead).
  for (let step = 0; step < 6 && !/#\/results\//.test(page.url()); step += 1) {
    await page.getByTestId('i-dont-know').click();
    await page.getByTestId('next').click();
  }
  await expect(page).toHaveURL(/#\/results\//);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('start-deck').locator('option:checked')).toHaveText('Practice Exam C');

  await page.reload();
  await page.getByTestId('home-tab-study').click();
  await expect(page.getByTestId('start-deck').locator('option:checked')).toHaveText('Practice Exam C');

  await page.getByTestId('start-deck').selectOption({ label: 'Practice Exam B' });
  await page.reload();
  await page.getByTestId('home-tab-study').click();
  await expect(page.getByTestId('start-deck').locator('option:checked')).toHaveText('Practice Exam B');
  await expect(page.getByTestId('start-deck').locator('option')).toHaveText([
    'Practice Exam A',
    'Practice Exam B',
    'Practice Exam C',
  ]);
});
