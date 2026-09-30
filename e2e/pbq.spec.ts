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

async function tapSelect(page: Page, select: ReturnType<Page['locator']>, pick: number) {
  await select.scrollIntoViewIfNeeded();
  await select.tap();
  const options = await select.locator('option').allTextContents();
  const value = options[Math.min(pick, options.length - 1)] ?? '';
  await select.selectOption({ label: value });
  await expect(select).toHaveValue(value);
  return value;
}

async function tapType(page: Page, input: ReturnType<Page['locator']>, text: string) {
  await input.scrollIntoViewIfNeeded();
  await input.tap();
  await expect(input).toBeFocused();
  await page.keyboard.type(text);
  await expect(input).toHaveValue(text);
}

/** Answer one PBQ with real taps and typing, submit, and check every row and part is graded. */
async function answerAndGrade(page: Page, label: string, shot?: string) {
  await expect(page.getByTestId('pbq-form')).toBeVisible();
  await expectQuiet(page);
  const items = await page.getByTestId('pbq-item').count();
  expect(items, label).toBeGreaterThan(3);
  const format = await page.getByTestId('pbq-form').getAttribute('data-format');
  const given: string[] = [];
  if (format === 'order') {
    await page.getByTestId('pbq-down').first().tap();
  } else {
    // Use the type-instead fallback on the first list control.
    const toggle = page.getByTestId('pbq-type-toggle').first();
    const selects = page.getByTestId('pbq-select');
    if ((await selects.count()) > 0) {
      await toggle.tap();
      const typed = page.getByTestId('pbq-item').first().getByTestId('pbq-text').first();
      await tapType(page, typed, 'typed guess');
      given.push('typed guess');
    }
    const selectCount = await selects.count();
    for (let index = 0; index < selectCount; index += 1) {
      given.push(await tapSelect(page, selects.nth(index), 1 + (index % 3)));
    }
    const texts = page.getByTestId('pbq-text');
    const textCount = await texts.count();
    for (let index = given.includes('typed guess') ? 1 : 0; index < textCount; index += 1) {
      await tapType(page, texts.nth(index), `guess ${index + 1}`);
      given.push(`guess ${index + 1}`);
    }
  }
  const parts = format === 'order' ? items : await page.locator('[data-testid="pbq-select"], [data-testid="pbq-text"]').count();
  if (shot) await page.screenshot({ path: `${shots}/${shot}-before-submit.png`, fullPage: true });
  await page.getByTestId('submit').tap();
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('pbq-item-result'), label).toHaveCount(items);
  await expect(page.getByTestId('pbq-control-result'), label).toHaveCount(parts);
  await expect(page.getByTestId('correct-answer'), label).toHaveCount(parts);
  await expect(page.getByTestId('pbq-score')).toContainText(`of ${parts} parts correct`);
  const results = await page.getByTestId('pbq-control-result').allTextContents();
  for (const value of given) expect(results.some((text) => text.includes(`Your answer: ${value}`)), `${label} ${value}`).toBe(true);
  const notes = await page.getByTestId('item-explanation').count();
  const shared = await page.getByTestId('explanation').count();
  if (shot) await page.screenshot({ path: `${shots}/${shot}-after-submit.png`, fullPage: true });
  return { items, parts, notes, shared };
}

async function saveFigure(page: Page, name: string, kind: 'items' | 'one') {
  const itemFigures = page.getByTestId('pbq-item-figure');
  if (kind === 'items') {
    await expect(itemFigures.first()).toBeVisible();
    const count = await itemFigures.count();
    for (let index = 0; index < count; index += 1) {
      const img = itemFigures.nth(index).locator('img');
      await expect(img).toBeVisible();
      const natural = await img.evaluate((node: HTMLImageElement) => node.naturalWidth);
      expect(natural).toBeGreaterThan(60);
    }
    await page.getByTestId('pbq-form').screenshot({ path: `${shots}/${name}-figures.png` });
    return count;
  }
  const figure = page.getByTestId('question-figure').first();
  await expect(figure).toBeVisible();
  await figure.screenshot({ path: `${shots}/${name}-figure.png` });
  return 1;
}

test('phone import: every PBQ takes taps and typing and grades every part', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/');
  await expect(page.getByTestId('build-version')).toBeVisible();
  await page.getByTestId('subject-name').fill('Core 1');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Core 1"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(pdfPath);
  await expect(page.getByTestId('save-tests')).toBeVisible({ timeout: 240_000 });
  // The import check hides answers behind a spoiler, then lists every part's answer.
  await expect(page.getByTestId('review-notice')).toBeVisible();
  await expect(page.getByTestId('review-answer')).toHaveCount(0);
  await expect(page.getByTestId('review-explanation')).toHaveCount(0);
  await expect(page.getByText(/Answer from the PDF/)).toHaveCount(0);
  await expect(page.getByTestId('review-figure').first()).toBeVisible();
  await page.getByTestId('review-show-answer').first().click();
  await expect(page.getByTestId('review-answer').first()).toBeVisible();
  await expect(page.getByTestId('pbq-answer-row')).toHaveCount(6);
  await expect(page.getByText(/Answer from the PDF/)).toHaveCount(0);
  await page.screenshot({ path: `${shots}/review-a1-spoiler.png`, fullPage: true });
  await page.getByTestId('review-show-answer').first().click();
  await expect(page.getByTestId('review-answer')).toHaveCount(0);
  await page.getByTestId('save-tests').click();
  await expect(page.locator('[data-deck-name="Practice Exam A"]')).toBeVisible();

  const plan: Record<string, { figure: 'items' | 'one' | 'none'; shot?: boolean }[]> = {
    'Practice Exam A': [
      { figure: 'items', shot: true },
      { figure: 'one', shot: true },
      { figure: 'none' },
      { figure: 'one' },
      { figure: 'none' },
    ],
    'Practice Exam B': [
      { figure: 'none' },
      { figure: 'items' },
      { figure: 'none' },
      { figure: 'one', shot: true },
      { figure: 'none' },
    ],
    'Practice Exam C': [
      { figure: 'none' },
      { figure: 'none' },
      { figure: 'items', shot: true },
      { figure: 'none' },
      { figure: 'none' },
    ],
  };
  const summary: string[] = [];
  for (const [deck, steps] of Object.entries(plan)) {
    if (deck !== 'Practice Exam A') await page.getByRole('button', { name: 'Back' }).click();
    await openDeck(page, deck);
    await page.getByTestId('start-untimed').click();
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      const label = `${deck.slice(-1)}${index + 1}`;
      await expect(page.getByTestId('position')).toHaveText(new RegExp(`question ${index + 1} of 90`));
      if (step.figure === 'items') {
        const count = await saveFigure(page, label.toLowerCase(), 'items');
        expect(count, label).toBe(await page.getByTestId('pbq-item').count());
        await expect(page.getByTestId('question-figure')).toHaveCount(0);
      } else if (step.figure === 'one') {
        await saveFigure(page, label.toLowerCase(), 'one');
        await expect(page.getByTestId('pbq-item-figure')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('question-figure')).toHaveCount(0);
        await expect(page.getByTestId('pbq-item-figure')).toHaveCount(0);
      }
      if (label === 'A1') {
        await expect(page.getByTestId('pbq-form')).toHaveAttribute('data-format', 'match-two');
        await expect(page.getByTestId('pbq-select')).toHaveCount(12);
        await page.getByTestId('pbq-item-figure').first().tap();
        await expect(page.getByTestId('zoom-close')).toBeVisible();
        await page.getByTestId('zoom-close').tap();
        await expect(page.getByTestId('zoom-close')).toHaveCount(0);
      }
      const graded = await answerAndGrade(page, label, step.shot ? label.toLowerCase() : undefined);
      summary.push(`${label}:${graded.items}/${graded.parts}/${graded.notes}/${graded.shared}`);
      if (label === 'A1') {
        expect(graded.parts).toBe(12);
        expect(graded.notes).toBe(6);
      }
      await page.getByTestId('next').tap();
    }
  }
  console.log(summary.join(' '));
  expect(summary).toHaveLength(15);

  await expect(page.getByTestId('position')).toHaveText(/question 6 of 90/);
  await expect(page.getByTestId('choice').first()).toBeVisible();
  await expectQuiet(page);
});
