import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const sampleThree = path.resolve('public/samples/sample-three-tests.pdf');
const shots = process.env.E2E_SHOTS ?? '/opt/cursor/artifacts';

test('exam simulation confirms the cert, weights, and a short domain', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-tab-library').click();
  await page.getByTestId('start-subject').click();
  await page.getByTestId('subject-name').fill('A+ Core 1 220-1201');
  await page.getByTestId('add-subject').click();
  await page.getByTestId('pdf-file').setInputFiles(sampleThree);
  await expect(page.getByTestId('start-saved')).toBeVisible();

  const study = page.getByTestId('home-tab-study');
  if ((await study.getAttribute('aria-selected')) !== 'true') await study.click();
  await page.getByTestId('exam-sim').click();

  const panel = page.getByTestId('exam-sim-panel');
  await expect(panel.getByTestId('exam-sim-cert-name')).toHaveText('A+ Core 1 (220-1201)');
  await expect(panel.getByTestId('exam-sim-subject')).toHaveText('A+ Core 1 220-1201');
  await expect(panel.locator('[data-domain="Mobile Devices"]')).toHaveValue('13');
  await expect(panel.locator('[data-domain="Hardware and Network Troubleshooting"]')).toHaveValue('28');
  await expect(panel.getByTestId('exam-sim-count')).toHaveValue('90');

  await panel.getByTestId('exam-sim-cert').selectOption('N10-009');
  await expect(panel.getByTestId('exam-sim-cert-name')).toHaveText('Network+ (N10-009)');
  await expect(panel.locator('[data-domain="Networking Concepts"]')).toHaveValue('23');
  await panel.locator('[data-domain="Networking Concepts"]').fill('30');
  await expect(panel.locator('[data-domain="Networking Concepts"]')).toHaveValue('30');

  await panel.getByTestId('exam-sim-cert').selectOption('220-1201');
  await panel.getByTestId('exam-sim-count').fill('3');
  await expect(panel.getByTestId('exam-sim-notes')).toContainText('instead of');
  await expect(panel.getByTestId('exam-sim-notes')).toContainText('filled from the other questions');

  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'exam-sim-confirm.png'), fullPage: true });

  await panel.getByTestId('exam-sim-cancel').click();
  await expect(panel).toHaveCount(0);

  await page.getByTestId('exam-sim').click();
  await page.getByTestId('exam-sim-count').fill('3');
  await page.getByTestId('exam-sim-start').click();
  await expect(page.getByTestId('position')).toHaveText('Question 1 of 3');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('resume-test-name')).toHaveText('Exam simulation');
});
