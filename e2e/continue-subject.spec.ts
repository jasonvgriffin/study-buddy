import { expect, test } from '@playwright/test';
import path from 'node:path';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const longSubject = 'CompTIA A Plus Core 1 Hardware Networking Mobile Devices and Virtualization Study Notes';

test('the continue button names the session subject and a long name stays inside 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill(longSubject);
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await page.getByTestId('start-saved').click();
  await page.getByRole('button', { name: 'Back' }).click();

  const card = page.getByTestId('resume-card');
  await expect(card.getByTestId('hero-kicker')).toHaveCount(0);
  await expect(card.getByTestId('resume-test-name')).toHaveText('Practice Test 1');
  await expect(card.getByTestId('resume')).toHaveText(`Continue ${longSubject}`);
  await expect(card).toContainText(/Resume Practice Test 1: Question 1 of 3/);

  const fit = await card.getByTestId('resume').evaluate((button) => {
    const label = button.querySelector('.home-continue-label');
    const hero = button.closest('[data-testid="resume-card"]');
    if (!label || !hero) return null;
    const buttonBox = button.getBoundingClientRect();
    const heroBox = hero.getBoundingClientRect();
    return {
      truncated: label.scrollWidth > label.clientWidth + 1,
      buttonInside: buttonBox.left >= heroBox.left - 1 && buttonBox.right <= heroBox.right + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(fit?.truncated).toBe(true);
  expect(fit?.buttonInside).toBe(true);
  expect(fit?.pageOverflow).toBe(false);
});
