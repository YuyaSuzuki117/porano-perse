import { test, expect } from '@playwright/test';

test.describe('Furniture placement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('porano-perse-welcome-dismissed', 'true'));
    await page.reload();
    // Wait for editor to load
    await page.locator('text=Tools').waitFor({ timeout: 15_000 });
  });

  test('furniture catalog section is displayed', async ({ page }) => {
    // The furniture section title "什器・家具" should be visible in the control panel
    const furnitureSection = page.locator('text=什器・家具');
    await expect(furnitureSection).toBeVisible({ timeout: 10_000 });
  });

  test('furniture category tabs are available', async ({ page }) => {
    // Category radio group should be present
    const categoryGroup = page.locator('[role="radiogroup"][aria-label="什器カテゴリ"]');
    await expect(categoryGroup).toBeVisible({ timeout: 10_000 });
  });

  test('furniture catalog lists items', async ({ page }) => {
    // The furniture listbox should contain items
    const catalog = page.locator('[role="listbox"][aria-label="什器カタログ"]');
    await expect(catalog).toBeVisible({ timeout: 10_000 });

    const items = catalog.locator('[role="option"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a furniture item adds it to the scene', async ({ page }) => {
    // Get initial furniture count from store
    const initialCount = await page.evaluate(() => {
      // Access Zustand store via window (hydrated state)
      const state = JSON.parse(localStorage.getItem('porano-perse-project') || '{}');
      return (state?.state?.furniture || []).length;
    });

    // Click the first furniture item in the catalog
    const catalog = page.locator('[role="listbox"][aria-label="什器カタログ"]');
    await expect(catalog).toBeVisible({ timeout: 10_000 });

    const firstItem = catalog.locator('[role="option"]').first();
    await firstItem.click();

    // Wait a moment for the store to update
    await page.waitForTimeout(500);

    // Check that furniture count increased
    const newCount = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('porano-perse-project') || '{}');
      return (state?.state?.furniture || []).length;
    });

    expect(newCount).toBeGreaterThan(initialCount);
  });
});
