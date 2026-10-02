import { expect, test } from '@playwright/test';

test.use({ colorScheme: 'dark' });

test('dark mode preference still shows the light palette', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Study Buddy Beta', exact: true })).toBeVisible();
  const read = () =>
    page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const card = document.querySelector('.card');
      const cardBg = card ? getComputedStyle(card).backgroundColor : '';
      const theme = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
      return { bg: body.backgroundColor, color: body.color, cardBg, theme };
    });
  const colors = await read();
  expect(colors.bg).toBe('rgb(255, 255, 255)');
  expect(colors.color).toBe('rgb(31, 41, 51)');
  expect(colors.cardBg).toBe('rgb(255, 255, 255)');
  expect(colors.theme?.toLowerCase()).toBe('#ffffff');
  for (const name of ['Stats', 'Settings']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId(`home-section-${name.toLowerCase()}`)).toBeVisible();
    const again = await read();
    expect(again.bg).toBe(colors.bg);
    expect(again.color).toBe(colors.color);
    if (again.cardBg) expect(again.cardBg).toBe(colors.cardBg);
  }
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    const response = await fetch(href ?? '');
    return response.json();
  });
  expect(String(manifest.theme_color).toLowerCase()).toBe('#ffffff');
  expect(String(manifest.background_color).toLowerCase()).toBe('#ffffff');
  expect(manifest.name).toBe('Study Buddy Beta');
  expect(manifest.short_name).toBe('Study Buddy Beta');
});
