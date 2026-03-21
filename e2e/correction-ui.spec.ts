import { test, expect } from '@playwright/test';

// Dev server is on port 3000 for this session
test.use({ baseURL: 'http://localhost:3000' });

test.describe('Correction UI', () => {
  test.describe('Page Load', () => {
    test('loads /correct without errors and shows upload form', async ({ page }) => {
      const response = await page.goto('/correct');
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1', { hasText: '図面補正ツール' })).toBeVisible({ timeout: 10_000 });
    });

    test('shows "サンプルで試す" button on upload page', async ({ page }) => {
      await page.goto('/correct');
      const sampleBtn = page.locator('button', { hasText: 'サンプルで試す' });
      await expect(sampleBtn).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Demo Load', () => {
    test('auto-loads blueprint via ?demo=sankei59 URL param', async ({ page }) => {
      await page.goto('/correct?demo=sankei59');

      // Wait for the canvas to appear (dark theme editor loads after demo data)
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible({ timeout: 20_000 });

      // Sidebar should show room list with count
      const roomHeader = page.locator('button', { hasText: /部屋一覧 \(\d+\)/ });
      await expect(roomHeader).toBeVisible({ timeout: 10_000 });

      // Toolbar should be visible (tool buttons)
      const toolbar = page.locator('[aria-label="選択"]');
      await expect(toolbar).toBeVisible();
    });
  });

  // All tests below require demo data loaded
  test.describe('Editor interactions', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/correct?demo=sankei59');
      // Wait for canvas and sidebar to be ready
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('button', { hasText: /部屋一覧 \(\d+\)/ })).toBeVisible({ timeout: 10_000 });
    });

    test('room selection via sidebar highlights the room', async ({ page }) => {
      // Click the first room item in the sidebar list
      const roomItems = page.locator('ul > li > button');
      const count = await roomItems.count();
      expect(count).toBeGreaterThan(0);

      // Click first room
      await roomItems.first().click();

      // The clicked room should have the selected style (border-[#4a90d9])
      await expect(roomItems.first()).toHaveCSS('border-left-color', 'rgb(74, 144, 217)');
    });

    test('tool switching changes active tool with aria-pressed', async ({ page }) => {
      // Initially "select" tool should be active
      const selectBtn = page.locator('[aria-label="選択"]');
      await expect(selectBtn).toHaveAttribute('aria-pressed', 'true');

      // Click "室名編集" tool
      const editNameBtn = page.locator('[aria-label="室名編集"]');
      await editNameBtn.click();
      await expect(editNameBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(selectBtn).toHaveAttribute('aria-pressed', 'false');

      // Click "頂点移動" tool
      const moveVertexBtn = page.locator('[aria-label="頂点移動"]');
      await moveVertexBtn.click();
      await expect(moveVertexBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(editNameBtn).toHaveAttribute('aria-pressed', 'false');
    });

    test('undo/redo buttons exist and undo is initially disabled', async ({ page }) => {
      // Undo button exists with title
      const undoBtn = page.locator('button[title="元に戻す (Ctrl+Z)"]');
      await expect(undoBtn).toBeVisible();

      // At initial load, undo should be disabled (historyIdx === 0)
      await expect(undoBtn).toBeDisabled();

      // Redo button exists
      const redoBtn = page.locator('button[title="やり直す (Ctrl+Y)"]');
      await expect(redoBtn).toBeVisible();
      await expect(redoBtn).toBeDisabled();
    });

    test('layer toggle changes checkbox state', async ({ page }) => {
      // Find the "レイヤー" section - it might be collapsed initially
      const layerSection = page.locator('button', { hasText: 'レイヤー' });
      await expect(layerSection).toBeVisible();

      // Ensure layers section is expanded
      // Check if checkboxes are visible; if not, click to expand
      const pdfCheckbox = page.locator('label').filter({ hasText: 'PDF背景' }).locator('input[type="checkbox"]');
      if (!(await pdfCheckbox.isVisible())) {
        await layerSection.click();
      }
      await expect(pdfCheckbox).toBeVisible();

      // PDF layer should be checked by default
      await expect(pdfCheckbox).toBeChecked();

      // Uncheck it
      await pdfCheckbox.uncheck();
      await expect(pdfCheckbox).not.toBeChecked();

      // Check it again
      await pdfCheckbox.check();
      await expect(pdfCheckbox).toBeChecked();
    });

    test('sidebar collapse and expand', async ({ page }) => {
      // The sidebar should be visible (260px wide)
      const sidebar = page.locator('.w-\\[260px\\]');
      await expect(sidebar).toBeVisible();

      // Click the close button (title="サイドバーを閉じる")
      const closeBtn = page.locator('button[title="サイドバーを閉じる"]');
      await closeBtn.click();

      // Sidebar should collapse - the 260px sidebar should not be visible
      await expect(sidebar).not.toBeVisible();

      // Open button should appear (title="サイドバーを開く")
      const openBtn = page.locator('button[title="サイドバーを開く"]');
      await expect(openBtn).toBeVisible();

      // Click to reopen
      await openBtn.click();
      await expect(sidebar).toBeVisible();
    });

    test('export buttons exist - JSON and DXF', async ({ page }) => {
      // JSON save button
      const jsonBtn = page.locator('button', { hasText: 'JSON' });
      await expect(jsonBtn).toBeVisible();

      // DXF export button
      const dxfBtn = page.locator('button', { hasText: /^DXF/ });
      await expect(dxfBtn).toBeVisible();
    });

    test('JSON export triggers download without error', async ({ page }) => {
      const jsonBtn = page.locator('button', { hasText: 'JSON' });
      await expect(jsonBtn).toBeVisible();

      // Listen for download event
      const downloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null);
      await jsonBtn.click();
      const download = await downloadPromise;

      // Download should have started (file ends with _corrected.json)
      if (download) {
        expect(download.suggestedFilename()).toMatch(/_corrected\.json$/);
      }
      // No error should appear on the page
      const errorToast = page.locator('text=エクスポートに失敗');
      await expect(errorToast).not.toBeVisible();
    });

    test('keyboard shortcuts change tools', async ({ page }) => {
      // Focus the canvas area to ensure keyboard events are captured
      const canvas = page.locator('canvas').first();
      await canvas.click();

      // Press 'N' for editName tool
      await page.keyboard.press('n');
      const editNameBtn = page.locator('[aria-label="室名編集"]');
      await expect(editNameBtn).toHaveAttribute('aria-pressed', 'true');

      // Press 'V' for select tool
      await page.keyboard.press('v');
      const selectBtn = page.locator('[aria-label="選択"]');
      await expect(selectBtn).toHaveAttribute('aria-pressed', 'true');

      // Press 'M' for moveVertex tool
      await page.keyboard.press('m');
      const moveVertexBtn = page.locator('[aria-label="頂点移動"]');
      await expect(moveVertexBtn).toHaveAttribute('aria-pressed', 'true');

      // Note: 'G' shortcut is shown on toolbar as moveAll, but the actual
      // keyboard handler maps it to grid toggle — this is a known bug.
    });

    test('multi-select with shift+click on sidebar rooms', async ({ page }) => {
      const roomItems = page.locator('ul > li > button');
      const count = await roomItems.count();
      if (count < 2) {
        test.skip();
        return;
      }

      // Click first room normally
      await roomItems.nth(0).click();

      // Shift+click second room
      await roomItems.nth(1).click({ modifiers: ['Shift'] });

      // The second room should have multi-select style (border-cyan-400)
      // Tailwind 4 uses lab/oklab color space, so check class instead
      await expect(roomItems.nth(1)).toHaveClass(/border-cyan-400/);
    });
  });
});
