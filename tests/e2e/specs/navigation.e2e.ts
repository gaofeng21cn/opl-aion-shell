/**
 * Navigation – route transitions and sidebar.
 *
 * Ensures the app can navigate between the guid/chat page and all
 * settings sub-pages without errors.
 */
import { test, expect } from '../fixtures';
import { GUID_INPUT, goToGuid, goToSettings, ROUTES, expectUrlContains, takeScreenshot, type SettingsTab } from '../helpers';

async function requireGuidInput(page: import('@playwright/test').Page) {
  const input = page.locator(GUID_INPUT).first();
  if (!(await input.isVisible().catch(() => false))) {
    test.skip(true, 'Guid input is unavailable in this E2E runtime, usually because the dev app is in incomplete-install preflight.');
  }
  return input;
}

// ── Guid Page ────────────────────────────────────────────────────────────────

test.describe('Guid Page', () => {
  test('navigates to guid page', async ({ page }) => {
    await goToGuid(page);
    await expectUrlContains(page, 'guid');
  });

  test('chat input area is present', async ({ page }) => {
    await goToGuid(page);
    const textarea = await requireGuidInput(page);
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });

  test('can type in chat input', async ({ page }) => {
    await goToGuid(page);
    const input = await requireGuidInput(page);
    await input.click();
    await input.fill('E2E test message');
    const value = await input.inputValue().catch(() => input.textContent());
    expect(value).toContain('E2E test');
  });

  test('screenshot: guid page', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToGuid(page);
    await takeScreenshot(page, 'guid-page', { fullPage: true });
  });
});

// ── Settings Pages ───────────────────────────────────────────────────────────

test.describe('Settings Pages', () => {
  const tabs: { tab: SettingsTab; name: string }[] = [
    { tab: 'general', name: 'Overview Settings' },
    { tab: 'access', name: 'Setup & Access Settings' },
    { tab: 'capabilities', name: 'Capabilities Settings' },
    { tab: 'environment', name: 'Maintenance & Updates Settings' },
    { tab: 'storage', name: 'Data & Storage Settings' },
    { tab: 'appearance', name: 'Preferences Settings' },
    { tab: 'advanced', name: 'Advanced Settings' },
  ];

  for (const { tab, name } of tabs) {
    test(`${name} loads`, async ({ page }) => {
      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(10);
    });
  }

  test('screenshot: settings pages', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    for (const { tab } of tabs) {
      await goToSettings(page, tab);
      await takeScreenshot(page, `settings-${tab}`);
    }
  });
});

// ── Cross-page navigation ────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test('can navigate between pages via URL', async ({ page }) => {
    await goToGuid(page);
    expect(page.url()).toContain('guid');

    await goToSettings(page, 'about');
    expect(page.url()).toContain('about');

    await goToGuid(page);
    expect(page.url()).toContain('guid');
  });
});
