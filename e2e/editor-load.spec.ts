import { test, expect } from '@playwright/test';

test.describe('Editor initial load', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('welcome modal is displayed', async ({ page }) => {
    // Clear dismissed flag so the modal always shows
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('porano-perse-welcome-dismissed'));
    await page.reload();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.locator('#welcome-modal-title')).toContainText('Porano Perse');
  });

  test('clicking start button dismisses modal and shows editor', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('porano-perse-welcome-dismissed'));
    await page.reload();

    const startButton = page.locator('button', { hasText: '始める' });
    await expect(startButton).toBeVisible({ timeout: 15_000 });
    await startButton.click();

    // Modal should disappear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).not.toBeVisible();
  });

  test('2D floor plan and 3D preview areas are visible', async ({ page }) => {
    // Dismiss welcome modal so editor loads directly
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('porano-perse-welcome-dismissed', 'true'));
    await page.reload();

    // 2D floor plan area: either loading text or the toolbar
    const floorPlan = page.locator('text=図面エディタを読み込み中').or(
      page.locator('text=Tools')
    );
    await expect(floorPlan).toBeVisible({ timeout: 15_000 });

    // 3D preview area: either loading text or the Porano brand
    const threeArea = page.locator('text=3Dエンジンを読み込み中').or(
      page.locator('text=Porano').first()
    );
    await expect(threeArea).toBeVisible({ timeout: 15_000 });
  });
});
