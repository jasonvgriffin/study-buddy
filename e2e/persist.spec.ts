import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const sampleNotes = path.resolve('public/samples/sample-notes.pdf');

async function context(userData: string) {
  return chromium.launchPersistentContext(userData, {
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2.625,
  });
}

test('paused progress survives a full browser restart', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'study-buddy-e2e-'));
  const first = await context(userData);
  const page = first.pages()[0] ?? (await first.newPage());
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await expect(page.getByTestId('pdf-file')).toBeEnabled();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').filter({ hasText: 'Nile' }).click();
  await expect(page.getByTestId('result')).toHaveText('✓ Correct');
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
  await expect(page.getByText('No explanation provided in your PDF.')).toHaveCount(0);
  await expect(page.getByTestId('elapsed')).not.toHaveText('0:00', { timeout: 5000 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await expect(page.getByTestId('resume')).toBeVisible();
  const elapsed = (await page.getByTestId('elapsed').innerText()).trim();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('elapsed')).toHaveText(elapsed);
  await first.close();

  const second = await context(userData);
  const again = second.pages()[0] ?? (await second.newPage());
  await again.goto('./');
  const card = again.getByTestId('resume-card').first();
  await expect(card).toContainText('Practice Test 1');
  await expect(card).toContainText(`${elapsed} elapsed`);
  const label = await card.innerText();
  const where = label.match(/Question \d+ of \d+/);
  await card.getByTestId('resume').click();
  await expect(again.getByTestId('elapsed')).toHaveText(elapsed);
  if (where) await expect(again.getByTestId('position')).toHaveText(where[0]);
  await again.getByRole('button', { name: 'Back' }).click();
  await again.getByTestId('home-tab-library').click();
  await again.locator('[data-deck-name="Practice Test 2"]').click();
  await expect(again.getByText('no answers yet')).toBeVisible();
  await expect(again.getByTestId('deck-resume')).toHaveCount(0);
  await second.close();
  await rm(userData, { recursive: true, force: true });
});

test('two subjects keep their PDFs apart', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'study-buddy-subjects-'));
  const browser = await context(userData);
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await expect(page.getByTestId('pdf-file')).toBeEnabled();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('subject-name').fill('Soil');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Soil"]')).toHaveClass(/on/);
  await expect(page.getByTestId('pdf-file')).toBeEnabled();
  await page.getByTestId('pdf-file').setInputFiles(sampleNotes);
  await page.getByTestId('save-tests').click();
  await page.locator('[data-subject-name="Rivers"]').click();
  await page.getByTestId('home-tab-library').click();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toHaveCount(0);
  await page.locator('[data-subject-name="Soil"]').click();
  await expect(page.locator('[data-deck-name="sample-notes"]')).toBeVisible();
  await expect(page.locator('[data-deck-name="Practice Test 1"]')).toHaveCount(0);
  await browser.close();
  await rm(userData, { recursive: true, force: true });
});
