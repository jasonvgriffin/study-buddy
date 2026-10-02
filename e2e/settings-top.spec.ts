import { expect, test } from '@playwright/test';

test('Settings opens in the top spot of Home, scrolled to its top, with green backup buttons', async ({ page }) => {
  await page.goto('./');
  const panelTop = () => page.locator('#home-panel').evaluate((el) => el.getBoundingClientRect().top);
  for (const open of [
    () => page.getByTestId('home-tab-settings').click(),
    () => page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click(),
  ]) {
    await page.getByTestId('home-tab-study').click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await open();
    const section = page.getByTestId('home-section-settings');
    await expect(section).toBeVisible();
    await expect(page).toHaveURL(/\/(#\/)?$/);
    await expect(section.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    // The section top is on screen rather than scrolled past.
    const top = await panelTop();
    expect(top).toBeGreaterThanOrEqual(-1);
    expect(top).toBeLessThan(200);
    await expect(section.getByRole('button', { name: 'Export backup' })).toHaveClass(/btn-primary/);
    await expect(section.locator('label', { hasText: 'Import backup' })).toHaveClass(/btn-primary/);
  }
});

test('Settings explains where the answer buzz works; Home does not', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('haptics-note')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  const note = page.getByTestId('haptics-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText(
    "Heads up: the little buzz when you answer doesn't work on iPhone in any browser. On Android it depends on the browser: Chrome buzzes, Firefox doesn't. The colors and animations always show.",
  );
  await expect(note).toHaveClass(/muted/);

  // The note uses exactly the same typography as the card's description right above it.
  const fonts = await note.evaluate((el) => {
    const desc = el.previousElementSibling as HTMLElement;
    const read = (node: Element) => {
      const style = getComputedStyle(node);
      return { tag: node.tagName, className: node.className, fontSize: style.fontSize, fontFamily: style.fontFamily, lineHeight: style.lineHeight };
    };
    return { desc: read(desc), note: read(el) };
  });
  expect(fonts.note).toEqual(fonts.desc);
});
