import { test, expect } from '@playwright/test';

test.describe('Export functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('porano-perse-welcome-dismissed', 'true'));
    await page.reload();
    // Wait for header with export button
    await page.locator('[aria-label="出力メニュー"]').waitFor({ timeout: 15_000 });
  });

  test('export button is visible', async ({ page }) => {
    const exportButton = page.locator('[aria-label="出力メニュー"]');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toContainText('出力');
  });

  test('clicking export opens dropdown with options', async ({ page }) => {
    const exportButton = page.locator('[aria-label="出力メニュー"]');
    await exportButton.click();

    // Dropdown menu should appear
    const dropdown = page.locator('[role="menu"][aria-label="出力オプション"]');
    await expect(dropdown).toBeVisible();
  });

  test('screenshot option is available in export dropdown', async ({ page }) => {
    const exportButton = page.locator('[aria-label="出力メニュー"]');
    await exportButton.click();

    const dropdown = page.locator('[role="menu"][aria-label="出力オプション"]');
    await expect(dropdown).toBeVisible();

    // Screenshot button should exist
    const screenshotOption = dropdown.locator('text=スクリーンショット');
    await expect(screenshotOption).toBeVisible();
  });

  test('high-res export option is available', async ({ page }) => {
    const exportButton = page.locator('[aria-label="出力メニュー"]');
    await exportButton.click();

    const dropdown = page.locator('[role="menu"][aria-label="出力オプション"]');
    await expect(dropdown).toBeVisible();

    const hiResOption = dropdown.locator('text=高解像度出力');
    await expect(hiResOption).toBeVisible();
  });
});
