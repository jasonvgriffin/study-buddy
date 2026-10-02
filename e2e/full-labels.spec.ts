import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const messerPdf = path.resolve('fixtures/professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf');
const dionPdf = path.resolve('fixtures/dion-training-comptia-a-plus-core-1-practice-exams.pdf');
const shots = '/opt/cursor/artifacts';

const messerLabel = 'Practice Exam A, Messer';
const dionLabel = 'Practice Exam A, Dion';

async function showTab(page: Page, id: 'study' | 'library' | 'progress') {
  const tab = page.getByTestId(`home-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Full string is on screen: no ellipsis, no nowrap, no clipped overflow. */
async function showsFull(locator: Locator, expected: string) {
  await expect(locator).toContainText(expected);
  const fit = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const box = el.getBoundingClientRect();
    return {
      text,
      nowrap: style.whiteSpace === 'nowrap',
      ellipsis: style.textOverflow === 'ellipsis',
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      inView: box.left >= -1 && box.right <= document.documentElement.clientWidth + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(fit.text).toContain(expected);
  expect(fit.text.includes('…')).toBe(false);
  expect(fit.nowrap).toBe(false);
  expect(fit.ellipsis).toBe(false);
  expect(fit.clipped).toBe(false);
  expect(fit.inView).toBe(true);
  expect(fit.pageOverflow).toBe(false);
}

async function shot(page: Page, name: string) {
  if (test.info().project.name !== 'chromium-mobile') return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

test('long test names stay fully visible at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./');
  await showTab(page, 'library');
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();

  await page.getByTestId('pdf-file').setInputFiles(messerPdf);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await showTab(page, 'library');
  await page.getByTestId('pdf-file').setInputFiles(dionPdf);
  await expect(page.getByTestId('start-offer-test')).toHaveText(dionLabel);

  await showTab(page, 'library');
  const messerLink = page.getByTestId('deck-link').filter({ hasText: messerLabel });
  const dionLink = page.getByTestId('deck-link').filter({ hasText: dionLabel });
  await showsFull(messerLink, messerLabel);
  await showsFull(dionLink, dionLabel);
  const messerFile = page.locator('[data-testid="source-file"][data-file-name*="professor-messer"]');
  await showsFull(messerFile, 'professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf');
  await shot(page, 'labels-library-360');

  await showTab(page, 'study');
  const select = page.getByTestId('exam-deck');
  const optionText = await select.locator('option').allTextContents();
  expect(optionText.slice().sort()).toEqual([dionLabel, messerLabel]);
  await select.selectOption({ label: messerLabel });
  await showsFull(page.getByTestId('exam-deck-label'), messerLabel);

  const optionFit = await select.evaluate((el) => {
    const selectEl = el as HTMLSelectElement;
    selectEl.size = selectEl.options.length;
    const options = [...selectEl.options].map((option) => ({
      text: (option.textContent ?? '').replace(/\s+/g, ' ').trim(),
      clipped: option.scrollWidth > option.clientWidth + 1 || option.scrollHeight > option.clientHeight + 1,
    }));
    const listClipped = selectEl.scrollWidth > selectEl.clientWidth + 1;
    selectEl.size = 1;
    return { options, listClipped };
  });
  expect(optionFit.options.map((option) => option.text).sort()).toEqual([dionLabel, messerLabel]);
  expect(optionFit.listClipped).toBe(false);
  for (const option of optionFit.options) expect(option.clipped).toBe(false);
  await shot(page, 'labels-study-360');

  await page.getByTestId('start-deck').selectOption({ label: messerLabel });
  await page.getByRole('button', { name: 'Start studying', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Which river runs through Cairo?' })).toBeVisible();
  await showsFull(page.getByRole('heading', { name: 'Which river runs through Cairo?' }), 'Which river runs through Cairo?');
  await page.getByTestId('pause').click();
  const paused = page.getByTestId('resume');
  await expect(paused).toHaveText(`Resume ${messerLabel}`);
  await showsFull(paused.locator('.home-continue-label'), `Resume ${messerLabel}`);
  await shot(page, 'labels-paused-360');

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const card = page.getByTestId('resume-card');
  await expect(card.getByTestId('resume')).toHaveText(`Resume ${messerLabel}`);
  await showsFull(card.getByTestId('resume-test-name'), messerLabel);
  await showsFull(card.getByTestId('resume').locator('.home-continue-label'), `Resume ${messerLabel}`);
  await shot(page, 'labels-home-360');

  await showTab(page, 'library');
  await messerLink.click();
  await showsFull(page.getByRole('heading', { level: 1 }), messerLabel);
  await showsFull(
    page.getByText('professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf'),
    'professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf',
  );
  await showsFull(page.getByTestId('deck-resume').getByTestId('resume').locator('.home-continue-label'), `Resume ${messerLabel}`);
  await shot(page, 'labels-deck-360');

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Stats', exact: true }).click();
  await showsFull(page.getByTestId('by-test-row').filter({ hasText: messerLabel }), messerLabel);
  await showsFull(page.getByTestId('by-test-row').filter({ hasText: dionLabel }), dionLabel);
  await shot(page, 'labels-stats-360');
});
