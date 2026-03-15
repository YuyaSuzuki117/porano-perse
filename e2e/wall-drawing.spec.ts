import { test, expect } from '@playwright/test';

test.describe('Wall drawing flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('porano-perse-welcome-dismissed', 'true'));
    await page.reload();
    // Wait for toolbar to appear
    await page.locator('text=Tools').waitFor({ timeout: 15_000 });
  });

  test('wall tool can be selected', async ({ page }) => {
    // The wall tool button has label text "壁描画"
    const wallButton = page.locator('button', { hasText: '壁描画' });
    await expect(wallButton).toBeVisible();
    await wallButton.click();

    // After clicking, the button should be active (blue background)
    await expect(wallButton).toHaveClass(/bg-blue-500/);
  });

  test('wall tool shows drawing hint', async ({ page }) => {
    const wallButton = page.locator('button', { hasText: '壁描画' });
    await wallButton.click();

    // Status bar should show wall drawing hint
    const hint = page.locator('text=壁描画: クリックで始点');
    await expect(hint).toBeVisible();
  });
});
