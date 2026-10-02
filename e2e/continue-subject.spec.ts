import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const longTest = 'CompTIA A Plus Core 1 Hardware Networking Mobile Devices and Virtualization Study Notes';

test('the resume button names the test and a long name stays inside 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('Rivers');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();
  await page.locator('[data-deck-name="Practice Test 1"]').click();
  await page.getByLabel('Test name').fill(longTest);
  await page.getByRole('button', { name: 'Rename test' }).click();
  await expect(page.getByRole('heading', { name: longTest })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  const picker = page.getByTestId('start-offer-test');
  await expect(picker).toHaveText(longTest);
  const pickerFit = await picker.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      nowrap: style.whiteSpace === 'nowrap',
      ellipsis: style.textOverflow === 'ellipsis',
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(pickerFit.nowrap).toBe(false);
  expect(pickerFit.ellipsis).toBe(false);
  expect(pickerFit.clipped).toBe(false);
  expect(pickerFit.pageOverflow).toBe(false);

  if (test.info().project.name === 'chromium-mobile') {
    await page.screenshot({ path: '/opt/cursor/artifacts/labels-long-picker-360.png', fullPage: true });
  }
  await page.getByTestId('start-saved').click();
  await page.getByRole('button', { name: 'Back' }).click();

  const card = page.getByTestId('resume-card');
  await expect(card.getByTestId('hero-kicker')).toHaveCount(0);
  await expect(card.getByTestId('resume-test-name')).toHaveText(longTest);
  await expect(card.getByTestId('resume')).toHaveText(`Resume ${longTest}`);
  await expect(card).toContainText(new RegExp(`Resume ${longTest}: Question 1 of 3`));

  const fit = await card.getByTestId('resume').evaluate((button) => {
    const label = button.querySelector('.home-continue-label');
    const hero = button.closest('[data-testid="resume-card"]');
    if (!(label instanceof HTMLElement) || !hero) return null;
    const style = getComputedStyle(label);
    const labelBox = label.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const heroBox = hero.getBoundingClientRect();
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
    return {
      truncated: label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1,
      buttonClipped: button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1,
      labelInside:
        labelBox.top >= buttonBox.top - 1 &&
        labelBox.bottom <= buttonBox.bottom + 1 &&
        labelBox.left >= buttonBox.left - 1 &&
        labelBox.right <= buttonBox.right + 1,
      wrapped: labelBox.height > line * 1.6,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      buttonInside: buttonBox.left >= heroBox.left - 1 && buttonBox.right <= heroBox.right + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(fit?.truncated).toBe(false);
  expect(fit?.buttonClipped).toBe(false);
  expect(fit?.labelInside).toBe(true);
  expect(fit?.wrapped).toBe(true);
  expect(fit?.whiteSpace).toBe('normal');
  expect(fit?.textOverflow).not.toBe('ellipsis');
  expect(fit?.buttonInside).toBe(true);
  expect(fit?.pageOverflow).toBe(false);

  if (test.info().project.name === 'chromium-mobile') {
    mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await page.screenshot({ path: '/opt/cursor/artifacts/labels-long-resume-360.png', fullPage: true });
  }

});
