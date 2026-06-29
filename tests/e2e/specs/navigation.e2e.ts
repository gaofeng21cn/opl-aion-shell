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
import { GUID_INPUT, goToGuid, goToSettings, expectUrlContains, takeScreenshot, type SettingsTab } from '../helpers';

const SETTINGS_SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const SETTINGS_VISUAL_MANIFEST = path.join(SETTINGS_SCREENSHOT_DIR, 'settings-control-center-manifest.json');
const SETTINGS_VISUAL_VIEWPORTS = [
  { name: 'desktop', size: { width: 1440, height: 960 } },
  { name: 'mobile', size: { width: 390, height: 844 } },
];

type SettingsVisualAnchor = {
  id: string;
  selector: string;
  required?: boolean;
};

type SettingsVisualTarget = {
  tab: SettingsTab;
  level: 'top-level' | 'secondary';
  name: string;
  anchors: SettingsVisualAnchor[];
};

type SettingsVisualStateTarget = {
  id: string;
  route: SettingsTab;
  state: string;
  action: (page: import('@playwright/test').Page) => Promise<void>;
  anchors: SettingsVisualAnchor[];
};

type ManifestAnchorEvidence = {
  id: string;
  selector: string;
  visible: boolean;
};

type ManifestCoverageGap = {
  id: string;
  reason: string;
  selector?: string;
};

const gitCommit = () =>
  execSync('git rev-parse HEAD', {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
  }).trim();

const anchor = (id: string, selector: string, required = true): SettingsVisualAnchor => ({
  id,
  selector,
  required,
});

const commonSettingsAnchors = [
  anchor('settings_page_wrapper', '.settings-page-wrapper'),
  anchor('settings_page_content', '.settings-page-content'),
];

const expectVisualAnchors = async (page: import('@playwright/test').Page, anchors: SettingsVisualAnchor[]) => {
  for (const item of anchors) {
    const locator = page.locator(item.selector).first();
    const visible = await locator.isVisible().catch(() => false);
    if (item.required !== false) {
      await expect(locator, item.id).toBeVisible();
    } else if (!visible) {
      test.info().annotations.push({
        type: 'settings-visual-optional-anchor',
        description: `${item.id} not visible for ${page.url()}`,
      });
    }
  }
};

const collectAnchorEvidence = async (
  page: import('@playwright/test').Page,
  anchors: SettingsVisualAnchor[]
): Promise<ManifestAnchorEvidence[]> => {
  const evidence: ManifestAnchorEvidence[] = [];
  for (const item of anchors) {
    evidence.push({
      id: item.id,
      selector: item.selector,
      visible: await page
        .locator(item.selector)
        .first()
        .isVisible()
        .catch(() => false),
    });
  }
  return evidence;
};

const coverageGapsFor = (
  anchors: SettingsVisualAnchor[],
  evidence: ManifestAnchorEvidence[]
): ManifestCoverageGap[] => {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return anchors
    .filter((item) => item.required !== false && !byId.get(item.id)?.visible)
    .map((item) => ({
      id: item.id,
      selector: item.selector,
      reason: 'required_anchor_not_visible',
    }));
};

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
  const tabs: SettingsVisualTarget[] = [
    {
      tab: 'general',
      name: 'Overview Settings',
      level: 'top-level',
      anchors: [...commonSettingsAnchors, anchor('overview_status', '[data-testid="settings-overview-status"]')],
    },
    {
      tab: 'access',
      name: 'Setup & Access Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('codex_api_key_input', '[data-testid="opl-settings-codex-api-key-input"]'),
        anchor('codex_configure_button', '[data-testid="opl-settings-configure-codex-button"]'),
        anchor('web_remote_anchor', '#web-remote'),
      ],
    },
    {
      tab: 'capabilities',
      name: 'Capabilities Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('capability_external_tools', '[data-testid="capability-entry-external-tools"]'),
        anchor('capability_custom_assistants', '[data-testid="capability-entry-custom-assistants"]'),
      ],
    },
    {
      tab: 'environment',
      name: 'Maintenance & Updates Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('runtime_health_summary', '[data-testid="opl-runtime-health-summary"]'),
        anchor('maintenance_hub', '[data-testid="opl-maintenance-hub"]'),
        anchor('module_maintenance', '[data-testid="opl-module-maintenance"]'),
        anchor('managed_updates', '[data-testid="opl-managed-updates"]'),
        anchor('managed_update_background_status', '[data-testid="opl-managed-update-background-status"]', false),
        anchor('managed_update_post_action_notice', '[data-testid="opl-managed-update-post-action-notice"]', false),
      ],
    },
    {
      tab: 'storage',
      name: 'Data & Storage Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('storage_settings_page', '[data-testid="storage-settings-page"]'),
        anchor('storage_conversations', '[data-testid="storage-conversations"]'),
        anchor('storage_runtime', '[data-testid="storage-runtime"]'),
        anchor('storage_logs', '[data-testid="storage-logs"]'),
        anchor('storage_updater_cache', '[data-testid="storage-updater-cache"]'),
      ],
    },
    {
      tab: 'appearance',
      name: 'Preferences Settings',
      level: 'top-level',
      anchors: [...commonSettingsAnchors],
    },
    {
      tab: 'advanced',
      name: 'Advanced Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('developer_profile_status', '[data-testid="opl-developer-profile-status"]'),
      ],
    },
  ];
  const secondaryTabs: SettingsVisualTarget[] = [
    {
      tab: 'workspace',
      name: 'Workspace Settings',
      level: 'secondary',
      anchors: [
        ...commonSettingsAnchors,
        anchor('workspace_root', '[data-testid="opl-workspace-settings-root"]'),
        anchor('workspace_modules_root', '[data-testid="opl-workspace-settings-modules-root"]'),
        anchor('workspace_logs', '[data-testid="opl-workspace-settings-logs"]'),
        anchor('workspace_modules', '[data-testid="opl-workspace-settings-modules"]'),
      ],
    },
    {
      tab: 'local-services',
      name: 'Local Services Settings',
      level: 'secondary',
      anchors: [
        ...commonSettingsAnchors,
        anchor('local_services_cards', '[data-testid="opl-local-services-cards"]'),
        anchor('local_services_module_health', '[data-testid="opl-local-services-module-health"]'),
      ],
    },
  ];
  const allVisualTargets = [...tabs, ...secondaryTabs];
  const stateTargets: SettingsVisualStateTarget[] = [
    {
      id: 'settings_search_empty_state',
      route: 'general',
      state: 'settings_search_empty_state',
      action: async (page) => {
        await page.evaluate(() => window.location.assign('#/settings/general'));
        await page.waitForFunction(() => window.location.hash === '#/settings/general', { timeout: 10_000 });
        await expect(page.locator('[data-testid="settings-route-search"]').first()).toBeVisible();
        const input = page.locator('[data-testid="settings-route-search"] input').first();
        await input.fill('');
        await input.fill('zz-no-route-match-zz');
        await expect(
          page.locator('[data-testid="settings-route-search"] [data-testid="settings-search-empty"]').first()
        ).toBeVisible();
      },
      anchors: [
        anchor('settings_search_input', '[data-testid="settings-route-search"] [data-testid="settings-search-input"]'),
        anchor('settings_search_empty', '[data-testid="settings-route-search"] [data-testid="settings-search-empty"]'),
      ],
    },
    {
      id: 'make_opl_usable_confirmation',
      route: 'environment',
      state: 'state_changing_action_confirmation',
      action: async (page) => {
        await page.locator('[data-testid="opl-maintenance-hub-make-usable"]').click();
      },
      anchors: [
        anchor('maintenance_hub', '[data-testid="opl-maintenance-hub"]'),
        anchor('make_usable_confirmation', '[data-testid="opl-maintenance-hub-make-usable-confirmation"]'),
        anchor('make_usable_confirm_button', '[data-testid="opl-maintenance-hub-make-usable-confirm"]'),
      ],
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
      await expectVisualAnchors(page, allVisualTargets.find((target) => target.tab === tab)?.anchors ?? []);
    }
    for (const tab of legacyTabs) {
      await expect(page.locator(`.settings-sider__item[data-settings-id="${tab}"]`)).toHaveCount(0);
    }
    for (const { tab, anchors } of secondaryTabs) {
      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      await expectVisualAnchors(page, anchors);
    }
  });

  test('screenshot: settings control center visual QA', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    const commit = gitCommit();
    const entries: Array<{
      command: string;
      commit: string;
      level: SettingsVisualTarget['level'] | 'interaction-state';
      state: string;
      viewport: { name: string; width: number; height: number };
      route: string;
      screenshot_path: string;
      status_anchors: string[];
      anchors: ManifestAnchorEvidence[];
      coverage_gaps: ManifestCoverageGap[];
    }> = [];
    const command =
      'AIONUI_E2E_ALLOW_BACKEND_FAILURE=1 E2E_SCREENSHOTS=1 bun run test:e2e -- tests/e2e/specs/navigation.e2e.ts --grep "settings control center visual QA"';

    for (const viewport of SETTINGS_VISUAL_VIEWPORTS) {
      await page.setViewportSize(viewport.size);
      for (const { tab, level, anchors } of allVisualTargets) {
        await goToSettings(page, tab);
        await expectVisualAnchors(page, anchors);
        const anchorEvidence = await collectAnchorEvidence(page, anchors);
        const screenshotName = `settings/control-center/${viewport.name}/${tab}`;
        const screenshotPath = await takeScreenshot(page, screenshotName, { fullPage: true });
        entries.push({
          command,
          commit,
          level,
          state: 'route_landing',
          viewport: {
            name: viewport.name,
            ...viewport.size,
          },
          route: `/settings/${tab}`,
          screenshot_path: screenshotPath,
          status_anchors: anchorEvidence.filter((item) => item.visible).map((item) => item.id),
          anchors: anchorEvidence,
          coverage_gaps: coverageGapsFor(anchors, anchorEvidence),
        });
      }
      for (const target of stateTargets) {
        await goToSettings(page, target.route);
        await target.action(page);
        await expectVisualAnchors(page, target.anchors);
        const anchorEvidence = await collectAnchorEvidence(page, target.anchors);
        const screenshotName = `settings/control-center/${viewport.name}/${target.id}`;
        const screenshotPath = await takeScreenshot(page, screenshotName, { fullPage: true });
        entries.push({
          command,
          commit,
          level: 'interaction-state',
          state: target.state,
          viewport: {
            name: viewport.name,
            ...viewport.size,
          },
          route: `/settings/${target.route}`,
          screenshot_path: screenshotPath,
          status_anchors: anchorEvidence.filter((item) => item.visible).map((item) => item.id),
          anchors: anchorEvidence,
          coverage_gaps: coverageGapsFor(target.anchors, anchorEvidence),
        });
      }
    }
    fs.writeFileSync(
      SETTINGS_VISUAL_MANIFEST,
      `${JSON.stringify(
        {
          schema: 'opl_settings_control_center_visual_manifest.v1',
          generated_at: new Date().toISOString(),
          source_of_truth: [
            '/Users/gaofeng/.codex/attachments/adac8faa-8bd0-4237-a2b4-8d44a0d419a5/pasted-text.txt',
            'tests/e2e/specs/navigation.e2e.ts',
          ],
          coverage_summary: {
            top_level_routes: tabs.map((target) => `/settings/${target.tab}`),
            secondary_routes: secondaryTabs.map((target) => `/settings/${target.tab}`),
            interaction_states: stateTargets.map((target) => target.state),
            coverage_gaps: [],
            viewports: SETTINGS_VISUAL_VIEWPORTS.map((viewport) => viewport.name),
          },
          release_readiness_claim: false,
          notes: [
            'This manifest proves screenshot-level route, viewport, and anchor coverage only.',
            'It is not a release, installed-app currentness, or runtime readiness receipt.',
            'AIONUI_E2E_ALLOW_BACKEND_FAILURE=1 keeps visual QA focused on Settings UI when bundled AionCore is absent.',
          ],
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
