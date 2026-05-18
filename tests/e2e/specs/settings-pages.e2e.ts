import { test, expect } from '../fixtures';
import { goToSettings, settingsSiderItemById, waitForSettle } from '../helpers';
import type { SettingsTab } from '../helpers';

const BUILTIN_SETTINGS_PAGES: Array<{ tab: SettingsTab; id: string; route: string }> = [
  { tab: 'overview', id: 'overview', route: '/settings/overview' },
  { tab: 'runtime', id: 'runtime', route: '/settings/runtime' },
  { tab: 'capabilities', id: 'capabilities', route: '/settings/capabilities' },
  { tab: 'access', id: 'access', route: '/settings/access' },
  { tab: 'appearance', id: 'appearance', route: '/settings/appearance' },
  { tab: 'system', id: 'system', route: '/settings/system' },
  { tab: 'about', id: 'about', route: '/settings/about' },
];

test.describe('Settings pages', () => {
  for (const pageSpec of BUILTIN_SETTINGS_PAGES) {
    test(`${pageSpec.id} page opens from the settings sidebar`, async ({ page }) => {
      await goToSettings(page, pageSpec.tab);
      await waitForSettle(page);

      await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 10_000 }).toContain(pageSpec.route);
      await expect(page.locator(settingsSiderItemById(pageSpec.id))).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="opl-first-run-window"]')).toHaveCount(0);
      await expect(page.locator('.settings-page-content')).toBeVisible({ timeout: 10_000 });

      const contentText = await page.locator('.settings-page-content').innerText();
      expect(contentText.trim().length).toBeGreaterThan(20);
    });
  }

  test('overview Refresh status returns to an idle state after manual refresh', async ({ page }) => {
    await goToSettings(page, 'overview');
    const refreshButton = page.getByRole('button', { name: /Refresh status|刷新状态/ });

    await expect(page.locator('[data-testid="opl-first-run-window"]')).toHaveCount(0);
    await expect(refreshButton).toBeVisible({ timeout: 10_000 });
    await refreshButton.click();
    await expect(refreshButton).not.toHaveClass(/arco-btn-loading/, { timeout: 30_000 });
  });

  test('system page exposes the OPL Developer Mode switch', async ({ page }) => {
    await goToSettings(page, 'system');

    await expect(page.locator('[data-testid="opl-first-run-window"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="opl-developer-mode-row"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="opl-developer-mode-switch"]')).toBeVisible({ timeout: 10_000 });
  });
});
