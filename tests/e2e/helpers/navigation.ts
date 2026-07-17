/**
 * Navigation helpers for E2E tests.
 *
 * Centralises route constants and provides typed navigation utilities
 * so individual test files stay DRY.
 */
import type { Page } from '@playwright/test';
import { channelItemById } from './selectors';

// ── Route constants ──────────────────────────────────────────────────────────

export const ROUTES = {
  guid: '#/guid',
  settings: {
    general: '#/settings/general',
    gateway: '#/settings/gateway',
    access: '#/settings/access',
    workspace: '#/settings/workspace',
    agents: '#/settings/agents',
    capabilities: '#/settings/capabilities',
    resources: '#/settings/resources',
    environment: '#/settings/environment',
    storage: '#/settings/storage',
    appearance: '#/settings/appearance',
    personalization: '#/settings/personalization',
    advanced: '#/settings/advanced',
    about: '#/settings/about',
    update: '#/settings/update',
    theme: '#/settings/theme',
    'local-services': '#/settings/local-services',
    gemini: '#/settings/gemini',
    model: '#/settings/model',
    agent: '#/settings/agent',
    assistants: '#/settings/assistants',
    display: '#/settings/display',
    system: '#/settings/system',
  },
  legacySettings: {
    webui: '#/settings/webui',
  },
  /** Dynamic extension settings tab route */
  extensionSettings: (tabId: string) => `#/settings/ext/${tabId}`,
} as const;

export type SettingsTab = keyof typeof ROUTES.settings;
export type LegacySettingsTab = keyof typeof ROUTES.legacySettings;

// ── Navigation helpers ───────────────────────────────────────────────────────

/**
 * Check if the page is already at the target hash route.
 * Avoids redundant navigation + re-render when consecutive tests
 * in the same describe block navigate to the same page.
 */
function isAlreadyAt(page: Page, hash: string): boolean {
  try {
    const url = page.url();
    // Compare the hash portion (e.g. "#/guid" or "#/settings/agent")
    const currentHash = url.includes('#') ? '#' + url.split('#')[1] : '';
    return currentHash === hash;
  } catch {
    return false;
  }
}

/**
 * Navigate to a hash route via UI clicks.
 *
 * This app uses HashRouter with ProtectedLayout, so programmatic
 * `window.location.assign` is unreliable when React Router hasn't
 * initialised yet. Instead we click the Sider footer button and
 * settings sider nav items — exactly like a user would.
 */
export async function navigateTo(page: Page, hash: string): Promise<void> {
  if (page.isClosed()) {
    throw new Error('Cannot navigate: page is already closed.');
  }

  if (isAlreadyAt(page, hash)) {
    return;
  }

  const currentHash = await page.evaluate(() => window.location.hash);
  const isOnSettings = currentHash.includes('/settings/');
  const targetIsSettings = hash.includes('/settings/');

  if (!targetIsSettings) {
    // Target is non-settings (guid, conversation, etc.)
    if (isOnSettings) {
      // Click the sider back button to leave settings
      const siderBtn = page.locator('.sider-footer div').first();
      if (await siderBtn.isVisible().catch(() => false)) {
        await siderBtn.click();
        // Wait for hash to change away from settings
        await page
          .waitForFunction(() => !window.location.hash.includes('/settings/'), { timeout: 10_000 })
          .catch(() => {});
      }
    }
    // Programmatic navigation for non-settings targets.
    // Always navigate when not already at the target (e.g. conversation → guid).
    if (!isAlreadyAt(page, hash)) {
      await page.evaluate((h) => window.location.assign(h), hash);
      try {
        await page.waitForFunction((h) => window.location.hash === h, hash, { timeout: 10_000 });
      } catch {
        /* best-effort */
      }
    }
  } else {
    // Target is a settings sub-page
    if (!isOnSettings) {
      // Click sider settings button to enter settings
      const siderBtn = page.locator('.sider-footer div').first();
      if (await siderBtn.isVisible().catch(() => false)) {
        await siderBtn.click();
        await page
          .waitForFunction(() => window.location.hash.includes('/settings/'), { timeout: 10_000 })
          .catch(() => {});
      } else {
        await page.evaluate((h) => window.location.assign(h), hash);
        await page.waitForFunction((h) => window.location.hash === h, hash, { timeout: 10_000 }).catch(() => {});
      }
    }

    // Extract the settings path segment (e.g. "assistants" from "#/settings/assistants")
    const settingsPath = hash.replace(/^#\/settings\//, '');
    if (!isAlreadyAt(page, hash)) {
      const navItem = page.locator(`[data-settings-path="${settingsPath}"]`);
      if (await navItem.isVisible().catch(() => false)) {
        await navItem.click({ timeout: 2_000 }).catch(() => page.evaluate((h) => window.location.assign(h), hash));
        await page
          .waitForFunction((h) => window.location.hash.includes(h), `/settings/${settingsPath}`, { timeout: 10_000 })
          .catch(() => {});
      } else {
        await page.evaluate((h) => window.location.assign(h), hash);
        await page.waitForFunction((h) => window.location.hash === h, hash, { timeout: 10_000 }).catch(() => {});
      }
    }
  }

  // Wait for body to have meaningful content
  try {
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 10_000 });
  } catch {
    /* best-effort */
  }
}

async function navigateWithRetry(page: Page, hash: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await navigateTo(page, hash);
    if (isAlreadyAt(page, hash)) {
      return;
    }
  }
}

/**
 * Wait for the page to settle using event-driven detection.
 * If the condition is not met within timeout, simply continues (best-effort).
 */
export async function waitForSettle(page: Page, timeoutMs = 3000): Promise<void> {
  try {
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: timeoutMs });
  } catch {
    // Best-effort: page may not have enough content yet, continue without fixed sleep
  }
}

/** Navigate to the guid / chat page. */
export async function goToGuid(page: Page): Promise<void> {
  await navigateWithRetry(page, ROUTES.guid);
}

/** Navigate to a settings tab. */
export async function goToSettings(page: Page, tab: SettingsTab): Promise<void> {
  await navigateWithRetry(page, ROUTES.settings[tab]);
}

/** Navigate to a legacy upstream settings route kept for compatibility-only tests. */
export async function goToLegacySettings(page: Page, tab: LegacySettingsTab): Promise<void> {
  await navigateWithRetry(page, ROUTES.legacySettings[tab]);
}

/** Navigate to the assistant settings page. */
export async function goToAssistantSettings(page: Page): Promise<void> {
  await navigateWithRetry(page, ROUTES.settings.assistants);
}

/** Navigate to an extension-contributed settings tab by its ID. */
export async function goToExtensionSettings(page: Page, tabId: string): Promise<void> {
  await navigateWithRetry(page, ROUTES.extensionSettings(tabId));
}

/** Track whether we have already navigated to the channels tab in this session. */
let _onChannelsTab = false;

/**
 * Navigate to the channels tab inside the legacy WebUI settings page.
 * Compatibility-only coverage uses the old upstream route explicitly so ordinary
 * App settings tests do not treat it as a current product navigation target.
 */
export async function goToChannelsTab(page: Page): Promise<void> {
  const channelItem = page
    .locator(`${channelItemById('telegram')}, ${channelItemById('lark')}, ${channelItemById('dingtalk')}`)
    .first();

  // Quick check: if we're already on the channels tab, verify a channel item is still visible
  if (_onChannelsTab && isAlreadyAt(page, ROUTES.legacySettings.webui)) {
    const stillVisible = await channelItem.isVisible().catch(() => false);
    if (stillVisible) return;
  }

  await goToLegacySettings(page, 'webui');

  // The legacy route redirects to Resources; open the native remote-settings
  // modal through the same entry a user sees before locating its inner tabs.
  await page
    .waitForFunction(
      () =>
        window.location.hash.startsWith('#/settings/webui') || window.location.hash.startsWith('#/settings/resources'),
      { timeout: 12_000 }
    )
    .catch(() => undefined);

  const stableTab = page.getByRole('tab', { name: /^(Channels|频道)/i }).first();
  const fallbackTab = page
    .locator('.arco-tabs-header-title, .arco-tabs-nav-tab-title')
    .filter({ hasText: /channel|频道|渠道/i })
    .first();
  const openRemoteSettings = page.getByTestId('opl-settings-open-native-remote-settings');

  let switched = false;
  for (let attempt = 0; attempt < 2 && !switched; attempt++) {
    if (await channelItem.isVisible().catch(() => false)) {
      switched = true;
      break;
    }

    if (await openRemoteSettings.isVisible().catch(() => false)) {
      await openRemoteSettings.click();
      await stableTab.waitFor({ state: 'visible', timeout: 12_000 });
    }

    if (await stableTab.isVisible().catch(() => false)) {
      await stableTab.click();
      switched = true;
      break;
    }

    if (await fallbackTab.isVisible().catch(() => false)) {
      await fallbackTab.click();
      switched = true;
      break;
    }

    // Retry once in case of slow Settings lazy-load in packaged CI runs
    await goToLegacySettings(page, 'webui');
    await waitForSettle(page, 2_000);
  }

  if (!switched) {
    // Final strict wait to surface a clear failure when Channels tab truly does not exist
    await stableTab.waitFor({ state: 'visible', timeout: 12_000 });
    await stableTab.click();
  }

  try {
    await channelItem.waitFor({ state: 'visible', timeout: 12_000 });
    _onChannelsTab = true;
  } catch {
    // Best-effort fallback for transitional states
    await page.waitForFunction(() => (document.body.textContent?.length ?? 0) > 50, { timeout: 5_000 });
    _onChannelsTab = true;
  }
}

/** Reset the channels-tab navigation cache (call when navigating away). */
export function resetChannelsTabCache(): void {
  _onChannelsTab = false;
}

/**
 * Wait for a MutationObserver-based class change on an element.
 * Extracted from repeated inline usage across test files.
 */
export async function waitForClassChange(element: import('@playwright/test').Locator, timeoutMs = 1500): Promise<void> {
  await element.evaluate(
    (el, ms) =>
      new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve();
        });
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, ms);
      }),
    timeoutMs
  );
}
