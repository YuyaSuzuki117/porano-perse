import { test, expect } from '@playwright/test';

test.describe('Save and load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('porano-perse-welcome-dismissed', 'true'));
    await page.reload();
    // Wait for header to load with save button
    await page.locator('[aria-label="プロジェクトを保存"]').waitFor({ timeout: 15_000 });
  });

  test('save button is visible and clickable', async ({ page }) => {
    const saveButton = page.locator('[aria-label="プロジェクトを保存"]');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });

  test('clicking save triggers a download', async ({ page }) => {
    // Listen for the download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });

    const saveButton = page.locator('[aria-label="プロジェクトを保存"]');
    await saveButton.click();

    const download = await downloadPromise;
    // Verify file name starts with expected prefix
    expect(download.suggestedFilename()).toMatch(/^porano-perse-project-.*\.json$/);
  });

  test('project list modal can be opened', async ({ page }) => {
    const listButton = page.locator('[aria-label="保存済みプロジェクト一覧"]');
    await expect(listButton).toBeVisible();
    await listButton.click();

    // ProjectListModal should appear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });
});
