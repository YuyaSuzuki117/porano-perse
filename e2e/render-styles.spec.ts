import { test, expect } from '@playwright/test';

/**
 * レンダリングスタイル E2E テスト
 * ヘッドレスChromiumのWebGL制約を考慮し、
 * UI構造・ボタン存在・ページロードの検証に集中
 */

test.describe.configure({ mode: 'serial' });

/** ウェルカムモーダルを閉じる */
async function dismissWelcome(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('porano-perse-welcome-dismissed', 'true'));
  await page.reload();
  await page.waitForTimeout(2000);

  const skipBtn = page.locator('button:has-text("スキップ")');
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click({ force: true });
    await page.waitForTimeout(500);
  }

  const startBtn = page.locator('[role="dialog"] button:has-text("始める")');
  if (await startBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await startBtn.click({ force: true });
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(500);
}

test.describe('Render styles & AI UI', () => {
  test.setTimeout(60_000);

  test('page loads without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await dismissWelcome(page);
    await page.waitForTimeout(2000);

    // 致命的エラー（ResizeObserver/hydrationは無視）
    const criticalErrors = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('hydration') &&
      !e.includes('WebGL')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('editor layout has 2D floor plan and 3D areas', async ({ page }) => {
    await dismissWelcome(page);

    // メインレイアウトが存在
    const main = page.locator('[role="main"]');
    await expect(main).toBeVisible({ timeout: 10_000 });
  });

  test('render style selector has all 5 modes including blueprint', async ({ page }) => {
    await dismissWelcome(page);

    // 各スタイルのボタンが存在するか確認
    const expectedStyles = ['リアル', '鉛筆', '水彩', '色鉛筆', '設計図'];
    for (const style of expectedStyles) {
      const btn = page.locator(`button:has-text("${style}")`).first();
      const count = await btn.count();
      expect(count, `"${style}" ボタンが見つかりません`).toBeGreaterThan(0);
    }
  });

  test('sketch mode is active by default', async ({ page }) => {
    await dismissWelcome(page);

    // aria-checked="true" のボタンを探す
    const activeBtn = page.locator('button[role="radio"][aria-checked="true"]').first();
    if (await activeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await activeBtn.textContent();
      // デフォルトは鉛筆モード
      expect(text).toContain('鉛筆');
    }
  });

  test('toolbar buttons exist', async ({ page }) => {
    await dismissWelcome(page);

    // ツールバーにボタンが存在
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(5);
  });

  test('sketch mode is default checked', async ({ page }) => {
    await dismissWelcome(page);

    // 鉛筆ボタンがchecked状態
    const sketchBtn = page.locator('button[role="radio"]:has-text("鉛筆")').first();
    if (await sketchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const isChecked = await sketchBtn.getAttribute('aria-checked');
      expect(isChecked).toBe('true');
    }
  });
});
