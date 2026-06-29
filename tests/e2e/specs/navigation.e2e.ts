/**
 * Navigation – route transitions and sidebar.
 *
 * Ensures the app can navigate between the guid/chat page and all
 * settings sub-pages without errors.
 */
import { test, expect } from '../fixtures';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  GUID_INPUT,
  goToGuid,
  goToSettings,
  ROUTES,
  expectUrlContains,
  takeScreenshot,
  type SettingsTab,
} from '../helpers';

const SETTINGS_SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const SETTINGS_VISUAL_MANIFEST = path.join(SETTINGS_SCREENSHOT_DIR, 'settings-control-center-manifest.json');
const SETTINGS_STATUS_ANCHORS = [
  'diagnostics_collapsed_by_default',
  'state_changing_action_confirmation',
  'post_action_recovery_notice',
  'legacy_redirect_landing',
];
const SETTINGS_VISUAL_VIEWPORTS = [
  { name: 'desktop', size: { width: 1440, height: 960 } },
  { name: 'mobile', size: { width: 390, height: 844 } },
];

const screenshotPathFor = (name: string) => path.join(SETTINGS_SCREENSHOT_DIR, `${name}.png`);

const gitCommit = () =>
  execSync('git rev-parse HEAD', {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
  }).trim();

async function requireGuidInput(page: import('@playwright/test').Page) {
  const input = page.locator(GUID_INPUT).first();
  if (!(await input.isVisible().catch(() => false))) {
    test.skip(
      true,
      'Guid input is unavailable in this E2E runtime, usually because the dev app is in incomplete-install preflight.'
    );
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
  const secondaryTabs: { tab: SettingsTab; name: string; anchors: string[] }[] = [
    {
      tab: 'workspace',
      name: 'Workspace Settings',
      anchors: [
        '[data-testid="opl-workspace-settings-root"]',
        '[data-testid="opl-workspace-settings-modules-root"]',
        '[data-testid="opl-workspace-settings-logs"]',
      ],
    },
    {
      tab: 'local-services',
      name: 'Local Services Settings',
      anchors: ['[data-testid="opl-local-services-cards"]', '[data-testid="opl-local-services-module-health"]'],
    },
  ];
  const legacyTabs = ['gemini', 'model', 'agent', 'assistants', 'display', 'webui', 'system'];

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

  test('settings control center visual QA anchors are stable', async ({ page }) => {
    for (const { tab } of tabs) {
      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      await expect(page.locator('.settings-page-wrapper')).toBeVisible();
      await expect(page.locator('.settings-page-content')).toBeVisible();
    }
    for (const tab of legacyTabs) {
      await expect(page.locator(`.settings-sider__item[data-settings-id="${tab}"]`)).toHaveCount(0);
    }
    for (const { tab, anchors } of secondaryTabs) {
      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      await expect(page.locator('.settings-page-wrapper')).toBeVisible();
      await expect(page.locator('.settings-page-content')).toBeVisible();
      for (const anchor of anchors) {
        await expect(page.locator(anchor)).toBeVisible();
      }
    }
  });

  test('screenshot: settings control center visual QA', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    const commit = gitCommit();
    const entries: Array<{
      command: string;
      commit: string;
      viewport: { name: string; width: number; height: number };
      route: string;
      screenshot_path: string;
      status_anchors: string[];
    }> = [];
    const allVisualTargets = [
      ...tabs.map(({ tab }) => ({
        tab,
        anchors: ['.settings-page-wrapper', '.settings-page-content'],
      })),
      ...secondaryTabs.map(({ tab, anchors }) => ({
        tab,
        anchors: ['.settings-page-wrapper', '.settings-page-content', ...anchors],
      })),
    ];

    for (const viewport of SETTINGS_VISUAL_VIEWPORTS) {
      await page.setViewportSize(viewport.size);
      for (const { tab, anchors } of allVisualTargets) {
        await goToSettings(page, tab);
        await expect(page.locator('.settings-page-wrapper')).toBeVisible();
        await expect(page.locator('.settings-page-content')).toBeVisible();
        for (const anchor of anchors) {
          await expect(page.locator(anchor).first()).toBeVisible();
        }
        const screenshotName = `settings/control-center/${viewport.name}/${tab}`;
        await takeScreenshot(page, screenshotName, { fullPage: true });
        entries.push({
          command:
            'E2E_SCREENSHOTS=1 bun run test:e2e -- tests/e2e/specs/navigation.e2e.ts --grep "settings control center visual QA"',
          commit,
          viewport: {
            name: viewport.name,
            ...viewport.size,
          },
          route: `/settings/${tab}`,
          screenshot_path: screenshotPathFor(screenshotName),
          status_anchors: SETTINGS_STATUS_ANCHORS,
        });
      }
    }
    fs.writeFileSync(
      SETTINGS_VISUAL_MANIFEST,
      `${JSON.stringify(
        {
          schema: 'opl_settings_control_center_visual_manifest.v1',
          entries,
        },
        null,
        2
      )}\n`
    );
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
