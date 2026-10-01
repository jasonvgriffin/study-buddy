import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const sampleFigure = path.resolve('public/samples/sample-figure.pdf');

test('tapping a choice grades it and shows the explanation underneath', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.getByTestId('watch-lesson')).toHaveCount(0);
  await expect(page.getByTestId('why')).toHaveCount(0);
  await expect(page.getByText('Cairo sits on the Nile')).toHaveCount(0);
  const choice = page.getByTestId('choice').filter({ hasText: 'Nile' });
  await expect(choice).not.toHaveClass(/correct|wrong/);
  const box = await choice.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await choice.click();
  await expect(page.getByTestId('result')).toHaveText('✓ Correct');
  await expect(choice).toHaveClass(/correct/);
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
  await expect(page.getByTestId('why')).toHaveCount(0);
  const lesson = page.getByTestId('watch-lesson');
  await expect(lesson).toBeVisible();
  await expect(lesson).toHaveAttribute('href', /example\.com\/lessons\/nile/);
  await expect(page.getByTestId('next')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('position')).toHaveText(/Question 1 of/);
});

test('a wrong choice shows the correct answer, the PDF explanation, and the lesson', async ({ page }) => {
  await page.addInitScript(() => {
    const vibes: Array<number | number[]> = [];
    (window as unknown as { __vibes: Array<number | number[]> }).__vibes = vibes;
    const vibrate = (pattern: number | number[]) => {
      vibes.push(pattern);
      return true;
    };
    Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: vibrate });
  });
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').filter({ hasText: 'Amazon' }).click();
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  const amazon = page.getByTestId('choice').filter({ hasText: 'Amazon' });
  await expect(amazon).toHaveClass(/wrong/);
  await expect(amazon).toHaveClass(/shake/);
  const vibes = await page.evaluate(() => (window as unknown as { __vibes: unknown[] }).__vibes);
  expect(vibes).toEqual(expect.arrayContaining([[60, 40, 60]]));
  await expect(page.getByTestId('choice').filter({ hasText: 'Nile' })).toHaveClass(/correct/);
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
  await expect(page.getByTestId('why')).toHaveCount(0);
  const lesson = page.getByTestId('watch-lesson');
  await expect(lesson).toHaveAttribute('target', '_blank');
  await expect(lesson).toHaveAttribute('rel', /noopener/);
  await expect(lesson).toHaveAttribute('href', /example\.com\/lessons\/nile/);
  await expect(lesson).toHaveText(/Watch the lesson/);
  const look = await lesson.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      tag: el.tagName,
      color: style.color,
      decoration: style.textDecorationLine,
      cursor: style.cursor,
    };
  });
  expect(look.tag).toBe('A');
  expect(look.color).toBe('rgb(11, 79, 191)');
  expect(look.decoration).toContain('underline');
  expect(look.cursor).toBe('pointer');
  await lesson.hover();
  await expect(lesson).toHaveCSS('color', 'rgb(8, 57, 140)');
  await lesson.evaluate((el) => (el as HTMLElement).focus({ focusVisible: true }));
  await expect(lesson).toHaveCSS('outline-style', 'solid');
  const ring = await lesson.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
  expect(ring).toBeGreaterThanOrEqual(2);
  await page.emulateMedia({ colorScheme: 'dark' });
  const darkContrast = await lesson.evaluate((el) => {
    const parse = (value: string) => value.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const lin = (channel: number) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    const fg = parse(getComputedStyle(el).color);
    const bg = parse(getComputedStyle(document.body).backgroundColor);
    const hi = Math.max(lum(fg), lum(bg));
    const lo = Math.min(lum(fg), lum(bg));
    return (hi + 0.05) / (lo + 0.05);
  });
  expect(darkContrast).toBeGreaterThanOrEqual(4.5);
  const pressed = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && rule.selectorText === '.lesson-link:active') {
          return rule.style.color;
        }
      }
    }
    return '';
  });
  expect(pressed).toBe('var(--link-pressed)');
});

test("I don't know reveals the answer and lesson and counts the question missed", async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();

  await expect(page.getByTestId('edit-card')).toHaveCount(0);
  await expect(page.getByTestId('skip-for-later')).toBeVisible();
  const giveUp = page.getByRole('button', { name: "I don't know", exact: true });
  await expect(giveUp).toHaveText("I don't know");
  await expect(page.getByTestId('end-session')).toHaveText('End session');
  const sessionHash = await page.evaluate(() => location.hash);
  expect(sessionHash).toMatch(/^#\/session\//);
  await giveUp.click();
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await expect(page.getByTestId('choice').filter({ hasText: 'Nile' })).toHaveClass(/correct/);
  await expect(page.getByTestId('explanation')).toContainText('Cairo sits on the Nile');
  const lesson = page.getByTestId('watch-lesson');
  await expect(lesson).toBeVisible();
  await expect(lesson).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.getByTestId('live-score')).toContainText('0 of 1 correct');
  await expect(page).toHaveURL(/#\/session\//);
  await page.getByTestId('next').click();

  await expect(page.getByTestId('position')).toHaveText('Question 2 of 3');
  await page.getByTestId('end-session').click();
  await expect(page).toHaveURL(/#\/results\//);
  await expect(page.getByTestId('score-counts')).toContainText('0 right, 1 wrong, 2 unanswered');
  await expect(page.getByTestId('domain-scores')).toContainText('0 right, 1 wrong, 2 unanswered');
  await expect(page.getByTestId('missed-review')).toBeVisible();
  await expect(page.getByTestId('missed-card')).toHaveCount(1);
  const cairo = page.getByTestId('missed-card').filter({ hasText: 'Cairo' });
  await expect(cairo.getByTestId('your-answer')).toContainText("You chose I don't know");
  await expect(cairo.getByTestId('watch-lesson')).toBeVisible();
});

test('choose two submits only after two taps, and a missing explanation is stated', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Rivers"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await page.getByTestId('choice').filter({ hasText: 'Nile' }).click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.getByText('both flow through Europe')).toHaveCount(0);
  await page.getByTestId('choice').filter({ hasText: 'Danube' }).click();
  await expect(page.getByTestId('submit')).toBeDisabled();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await page.getByTestId('choice').filter({ hasText: 'Danube' }).click();
  await page.getByTestId('choice').filter({ hasText: 'Danube' }).click();
  await page.getByTestId('choice').filter({ hasText: 'Rhine' }).click();
  await expect(page.getByTestId('choose-count')).toContainText('2 of 2');
  await expect(page.getByTestId('submit')).toBeEnabled();
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('result')).toHaveText('✓ Correct');
  await expect(page.getByTestId('explanation')).toContainText('both flow through Europe');
  await expect(page.getByRole('button', { name: /^A\. Danube/ })).toHaveClass(/correct/);
  await expect(page.getByRole('button', { name: /^C\. Rhine/ })).toHaveClass(/correct/);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await page.getByTestId('choice').filter({ hasText: 'Madrid' }).click();
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await expect(page.getByTestId('explanation')).toHaveText('No explanation provided in your PDF.');
  await expect(page.getByRole('button', { name: /^A\. Lisbon/ })).toHaveClass(/correct/);
  await expect(page.getByRole('button', { name: /^B\. Madrid/ })).toHaveClass(/wrong/);
});

test('a question figure from the PDF is shown before the answer', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('subject-name').fill('Color');
  await page.getByTestId('add-subject').click();
  await expect(page.locator('[data-subject-name="Color"]')).toHaveClass(/on/);
  await page.getByTestId('pdf-file').setInputFiles(sampleFigure);
  await page.getByTestId('save-tests').click();
  await page.getByTestId('home-tab-library').click();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByTestId('start-untimed').click();
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('explanation-figure')).toHaveCount(0);
  await page.getByTestId('choice').filter({ hasText: 'Red' }).click();
  await expect(page.getByTestId('result')).toHaveText('✗ Incorrect');
  await expect(page.getByTestId('explanation')).toContainText('square in the figure is green');
  await expect(page.getByTestId('question-figure')).toBeVisible();
});
