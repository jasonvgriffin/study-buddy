import { expect, type Page } from '@playwright/test';

/**
 * Home shows one section at a time in its top spot (Start studying, Subjects, Stats, or Settings).
 * After an import Home shows the import's Start studying card, so open Subjects before using the library.
 */
async function openSection(page: Page, id: 'library' | 'stats' | 'settings') {
  const tab = page.getByTestId(`home-tab-${id}`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(`home-section-${id}`)).toBeVisible();
}

export const openSubjects = (page: Page) => openSection(page, 'library');
export const openStats = (page: Page) => openSection(page, 'stats');
export const openSettings = (page: Page) => openSection(page, 'settings');
