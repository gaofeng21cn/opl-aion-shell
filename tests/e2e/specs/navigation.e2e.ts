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
const SETTINGS_E2E_MODE =
  process.env.E2E_PACKAGED === '1' ? 'E2E_PACKAGED=1' : process.env.E2E_DEV === '1' ? 'E2E_DEV=1' : '';
const SETTINGS_VISUAL_VIEWPORTS = [
  { name: 'desktop-light', navigation: 'desktop', theme: 'light', size: { width: 1440, height: 960 } },
  { name: 'narrow-light', navigation: 'mobile', theme: 'light', size: { width: 720, height: 900 } },
  { name: 'desktop-dark', navigation: 'desktop', theme: 'dark', size: { width: 1440, height: 960 } },
  { name: 'narrow-dark', navigation: 'mobile', theme: 'dark', size: { width: 720, height: 900 } },
] as const;
const SETTINGS_LONG_PAGE_TABS = new Set<SettingsTab>(['agents', 'capabilities', 'resources', 'environment']);

type SettingsVisualAnchor = {
  id: string;
  selector: string;
  required?: boolean;
  coverageGapWhenMissing?: string;
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
  captureScrollBottom?: boolean;
};

type SettingsCompatibilityTarget = {
  id: string;
  source: SettingsTab;
  target: SettingsTab;
  section: string;
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

type SettingsScrollEvidence = {
  position: 'top' | 'bottom';
  scroll_top: number;
  scroll_height: number;
  client_height: number;
  scrollable: boolean;
};

const gitCommit = () => {
  const cwd = path.resolve(__dirname, '..', '..', '..');
  const dirty = execSync('git status --porcelain --untracked-files=no', {
    cwd,
    encoding: 'utf8',
  }).trim();
  if (dirty) {
    throw new Error(`Settings visual evidence requires a clean tracked worktree:\n${dirty}`);
  }
  return execSync('git rev-parse HEAD', {
    cwd,
    encoding: 'utf8',
  }).trim();
};

const anchor = (id: string, selector: string, required = true): SettingsVisualAnchor => ({
  id,
  selector,
  required,
});

const fixtureAnchor = (id: string, selector: string): SettingsVisualAnchor => ({
  id,
  selector,
  required: false,
  coverageGapWhenMissing: 'fixture_state_unavailable',
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

const expectStorageActionIconLayout = async (page: import('@playwright/test').Page) => {
  const metrics = await page.locator('[data-testid="settings-storage-primary-action"]').evaluate((element) => {
    const button = element as HTMLButtonElement;
    const icon = button.querySelector<HTMLElement>(':scope > .i-icon');
    const label = icon?.nextElementSibling instanceof HTMLElement ? icon.nextElementSibling : null;
    const svg = icon?.querySelector<SVGElement>('svg') ?? null;
    const iconRect = icon?.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    const iconStyle = icon ? window.getComputedStyle(icon) : null;
    return {
      directIconSlot: icon?.parentElement === button,
      iconWidth: iconRect?.width ?? null,
      iconHeight: iconRect?.height ?? null,
      svgWidth: svgRect?.width ?? null,
      svgHeight: svgRect?.height ?? null,
      iconLabelGap: iconRect && labelRect ? labelRect.left - iconRect.right : null,
      iconLabelCenterDelta:
        iconRect && labelRect
          ? Math.abs(iconRect.top + iconRect.height / 2 - (labelRect.top + labelRect.height / 2))
          : null,
      iconBackground: iconStyle?.backgroundColor ?? null,
      iconColor: iconStyle?.color ?? null,
    };
  });

  expect(metrics.directIconSlot, JSON.stringify(metrics)).toBe(true);
  expect(metrics.iconWidth, JSON.stringify(metrics)).toBeCloseTo(20, 0);
  expect(metrics.iconHeight, JSON.stringify(metrics)).toBeCloseTo(20, 0);
  expect(metrics.svgWidth, JSON.stringify(metrics)).toBeCloseTo(16, 0);
  expect(metrics.svgHeight, JSON.stringify(metrics)).toBeCloseTo(16, 0);
  expect(metrics.iconLabelGap, JSON.stringify(metrics)).toBeCloseTo(8, 0);
  expect(metrics.iconLabelCenterDelta, JSON.stringify(metrics)).toBeLessThanOrEqual(1);
  expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(metrics.iconBackground);
  expect(metrics.iconColor).not.toBeNull();
  expect(metrics.iconColor).not.toBe('rgba(0, 0, 0, 0)');
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

const expectSelectedSettingsNavigationItem = async (
  page: import('@playwright/test').Page,
  tab: string,
  viewport: 'desktop' | 'mobile',
  allowUnlistedRoute = false
) => {
  const itemSelector = viewport === 'mobile' ? '.settings-mobile-top-nav__item' : '.settings-sider__item';
  const targetItem = page.locator(`${itemSelector}[data-settings-path="${tab}"]`);
  if (allowUnlistedRoute) {
    await expect(targetItem).toHaveCount(0);
    await expect(page.locator(`${itemSelector}[aria-current="page"]`)).toHaveCount(0);
    return;
  }
  await expect(targetItem).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(`${itemSelector}[aria-current="page"]`)).toHaveCount(1);
};

const resetSettingsScreenshotPointer = async (
  page: import('@playwright/test').Page,
  viewport: { width: number; height: number }
) => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.mouse.move(viewport.width - 4, 48);
  await page.locator('.settings-sider__item').evaluateAll(async (items) => {
    await Promise.all(items.flatMap((item) => item.getAnimations().map((animation) => animation.finished)));
  });
  await expect(page.locator('.settings-sider__item:hover')).toHaveCount(0);
  await expect(page.locator('.settings-mobile-top-nav__item:hover')).toHaveCount(0);
};

const coverageGapsFor = (
  anchors: SettingsVisualAnchor[],
  evidence: ManifestAnchorEvidence[]
): ManifestCoverageGap[] => {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return anchors
    .filter((item) => !byId.get(item.id)?.visible && (item.required !== false || item.coverageGapWhenMissing))
    .map((item) => ({
      id: item.id,
      selector: item.selector,
      reason: item.coverageGapWhenMissing ?? 'required_anchor_not_visible',
    }));
};

const setSettingsScrollPosition = async (
  page: import('@playwright/test').Page,
  position: SettingsScrollEvidence['position']
): Promise<SettingsScrollEvidence> => {
  const scroller = page.locator('.settings-page-wrapper').first();
  await expect(scroller).toBeVisible();
  const metrics = await scroller.evaluate(async (element, nextPosition) => {
    element.scrollTop = nextPosition === 'bottom' ? element.scrollHeight : 0;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  }, position);
  const evidence: SettingsScrollEvidence = {
    position,
    scroll_top: metrics.scrollTop,
    scroll_height: metrics.scrollHeight,
    client_height: metrics.clientHeight,
    scrollable: metrics.scrollHeight > metrics.clientHeight + 1,
  };
  if (position === 'top') {
    expect(metrics.scrollTop, 'Settings route screenshot must start at the internal scroller top').toBeLessThanOrEqual(
      1
    );
  } else {
    if (evidence.scrollable) {
      expect(
        metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop,
        'Settings bottom screenshot must reach the internal scroller bottom'
      ).toBeLessThanOrEqual(2);
    }
  }
  return evidence;
};

const openCompatibilityTarget = async (page: import('@playwright/test').Page, target: SettingsCompatibilityTarget) => {
  const searchInput = page
    .locator('[data-testid="settings-search-input"] input, input[data-testid="settings-search-input"]')
    .first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('');
  }
  await page.evaluate((source) => window.location.assign(`#/settings/${source}`), target.source);
  await page.waitForFunction(
    ({ route, section }) =>
      window.location.hash.includes(`/settings/${route}`) &&
      new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('section') === section,
    { route: target.target, section: target.section },
    { timeout: 10_000 }
  );
  await expectSettingsAnchorLanding(page, target.section);
};

const expectSettingsAnchorLanding = async (page: import('@playwright/test').Page, section: string) => {
  const target = page.locator(`#${section}`);
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport();
  await expect.poll(() => target.evaluate((element) => document.activeElement === element)).toBe(true);
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
      anchors: [
        ...commonSettingsAnchors,
        anchor('overview_page', '[data-testid="settings-page-overview"]'),
        anchor('overview_primary', '[data-testid="settings-overview-primary"]'),
        anchor('overview_status', '[data-testid="settings-overview-status"]'),
        anchor('overview_contextual_entries', '[data-testid="settings-overview-summary-grid"]'),
        anchor('overview_temporal_server', '[data-testid="settings-overview-temporal-server"]'),
        anchor('overview_temporal_worker', '[data-testid="settings-overview-temporal-worker"]'),
        anchor('overview_temporal_scheduler', '[data-testid="settings-overview-temporal-scheduler"]'),
      ],
    },
    {
      tab: 'gateway',
      name: 'Gateway Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('gateway_page', '[data-testid="settings-page-gateway"]'),
        anchor('gateway_primary', '[data-testid="settings-gateway-primary"]'),
        fixtureAnchor('gateway_identity_name', '[data-testid="settings-gateway-identity-name"]'),
        fixtureAnchor('gateway_disconnect', '[data-testid="settings-gateway-disconnect"]'),
        fixtureAnchor('gateway_metrics', '[data-testid="settings-gateway-metrics"]'),
      ],
    },
    {
      tab: 'access',
      name: 'Access Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('access_page', '[data-testid="settings-page-models"]'),
        anchor('access_primary', '[data-testid="settings-models-primary"]'),
        anchor('access_codex_cli', '[data-testid="settings-models-codex-cli"]'),
        anchor('access_gateway', '[data-testid="settings-models-gateway-link"]'),
      ],
    },
    {
      tab: 'workspace',
      name: 'Workspace Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('workspace_page', '[data-testid="settings-page-workspace"]'),
        anchor('workspace_primary', '[data-testid="settings-workspace-primary"]'),
        anchor('workspace_primary_action', '[data-testid="settings-workspace-primary-action"]'),
        anchor('workspace_diagnostics_action', '[data-testid="settings-workspace-diagnostics-action"]'),
        anchor('workspace_technical_details', '[data-testid="settings-workspace-technical-details"]', false),
      ],
    },
    {
      tab: 'agents',
      name: 'Agent Packages Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('agents_page', '[data-testid="settings-page-agents"]'),
        anchor('agents_primary', '[data-testid="settings-agents-primary"]'),
        anchor('agents_catalog_filters', '[data-testid="settings-agents-catalog-filters"]'),
      ],
    },
    {
      tab: 'capabilities',
      name: 'Capabilities Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('capabilities_page', '[data-testid="settings-page-capabilities"]'),
        anchor('capabilities_primary', '[data-testid="settings-capabilities-primary"]'),
        anchor('capabilities_primary_action', '[data-testid="settings-capabilities-primary-action"]'),
        anchor('capabilities_technical_details', '[data-testid="settings-capabilities-technical-details"]'),
      ],
    },
    {
      tab: 'resources',
      name: 'Resources & Connections Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('resources_page', '[data-testid="settings-page-resources"]'),
        anchor('resources_primary', '[data-testid="settings-resources-primary"]'),
        anchor('resources_browser', '[data-testid="settings-resources-browser-access"]'),
        anchor('resources_diagnostics_action', '[data-testid="settings-resources-diagnostics-action"]'),
        anchor('resources_technical_details', '[data-testid="settings-resources-technical-details"]', false),
      ],
    },
    {
      tab: 'environment',
      name: 'Maintenance Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('maintenance_page', '[data-testid="settings-page-maintenance"]'),
        anchor('maintenance_primary', '[data-testid="settings-maintenance-primary"]'),
        anchor('maintenance_temporal_server', '[data-testid="settings-maintenance-temporal-server"]'),
        anchor('maintenance_temporal_worker', '[data-testid="settings-maintenance-temporal-worker"]'),
        anchor('maintenance_temporal_scheduler', '[data-testid="settings-maintenance-temporal-scheduler"]'),
        anchor('maintenance_diagnostics_action', '[data-testid="settings-maintenance-diagnostics-action"]'),
        anchor('maintenance_technical_details', '[data-testid="settings-maintenance-technical-details"]', false),
      ],
    },
    {
      tab: 'storage',
      name: 'Data & Storage Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('storage_page', '[data-testid="settings-page-storage"]'),
        anchor('storage_primary', '[data-testid="settings-storage-primary"]'),
        anchor('storage_primary_action', '[data-testid="settings-storage-primary-action"]'),
        anchor('storage_diagnostics_action', '[data-testid="settings-storage-diagnostics-action"]'),
        anchor('storage_technical_details', '[data-testid="settings-storage-technical-details"]', false),
      ],
    },
    {
      tab: 'appearance',
      name: 'Preferences Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('preferences_page', '[data-testid="settings-page-preferences"]'),
        anchor('preferences_primary', '[data-testid="settings-preferences-primary"]'),
        anchor('preferences_performance', '[data-testid="preferences-performance-section"]'),
        anchor('preferences_display', '[data-testid="preferences-display-section"]'),
      ],
    },
    {
      tab: 'personalization',
      name: 'Personalization Settings',
      level: 'top-level',
      anchors: [
        ...commonSettingsAnchors,
        anchor('personalization_page', '[data-testid="settings-page-personalization"]'),
        anchor('personalization_primary', '[data-testid="settings-personalization-primary"]'),
        anchor('personalization_instructions', '[data-testid="settings-personalization-instructions"]'),
        anchor('personalization_system_agents', '[data-testid="settings-system-agents-editor"]'),
        anchor('personalization_app_context', '[data-testid="settings-opl-app-context-editor"]'),
      ],
    },
  ];
  const secondaryTabs: SettingsVisualTarget[] = [
    {
      tab: 'advanced',
      name: 'Advanced Settings',
      level: 'secondary',
      anchors: [
        ...commonSettingsAnchors,
        anchor('advanced_page', '[data-testid="settings-page-advanced"]'),
        anchor('advanced_primary', '[data-testid="settings-advanced-primary"]'),
      ],
    },
    {
      tab: 'about',
      name: 'About Settings',
      level: 'secondary',
      anchors: [
        ...commonSettingsAnchors,
        anchor('about_page', '[data-testid="settings-page-about"]'),
        anchor('about_primary', '[data-testid="settings-about-primary"]'),
        anchor('about_diagnostics_action', '[data-testid="settings-about-diagnostics-action"]'),
        anchor('about_technical_details', '[data-testid="settings-about-technical-details"]', false),
      ],
    },
  ];
  const compatibilityTargets: SettingsCompatibilityTarget[] = [
    {
      id: 'update_to_maintenance',
      source: 'update',
      target: 'environment',
      section: 'updates',
      anchors: [
        anchor('maintenance_page', '[data-testid="settings-page-maintenance"]'),
        anchor('updates_section', '#updates'),
      ],
    },
    {
      id: 'theme_to_preferences',
      source: 'theme',
      target: 'appearance',
      section: 'themes',
      anchors: [
        anchor('preferences_page', '[data-testid="settings-page-preferences"]'),
        anchor('themes_section', '#themes'),
      ],
    },
    {
      id: 'local_services_to_maintenance',
      source: 'local-services',
      target: 'environment',
      section: 'services',
      anchors: [
        anchor('maintenance_page', '[data-testid="settings-page-maintenance"]'),
        anchor('services_section', '#services'),
      ],
    },
  ];
  const allVisualTargets = [...tabs, ...secondaryTabs];
  const stateTargets: SettingsVisualStateTarget[] = [
    {
      id: 'capabilities_manual_and_third_party',
      route: 'capabilities',
      state: 'capabilities_manual_and_third_party',
      action: async (page) => {
        await page.evaluate(() => window.location.assign('#/settings/capabilities?tab=manual_and_third_party'));
        await page.waitForFunction(
          () =>
            window.location.hash.includes('/settings/capabilities') &&
            new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab') === 'manual_and_third_party',
          { timeout: 10_000 }
        );
        await expect(page.locator('[data-testid="settings-capabilities-third-party"]')).toBeVisible();
      },
      anchors: [
        anchor('capabilities_manual_root', '[data-testid="settings-capabilities-third-party"]'),
        anchor('capabilities_manual_skills', '[data-testid="settings-capabilities-manual-skills"]'),
        anchor('capabilities_manual_tools', '[data-testid="settings-capabilities-manual-tools"]'),
        anchor('capabilities_voice_input', '[data-testid="settings-capabilities-voice-input"]'),
      ],
      captureScrollBottom: true,
    },
    {
      id: 'settings_search_empty_state',
      route: 'general',
      state: 'settings_search_empty_state',
      action: async (page) => {
        await page.evaluate(() => window.location.assign('#/settings/general'));
        await page.waitForFunction(() => window.location.hash === '#/settings/general', { timeout: 10_000 });
        const input = page
          .locator('[data-testid="settings-search-input"] input, input[data-testid="settings-search-input"]')
          .first();
        await expect(input).toBeVisible();
        await input.fill('');
        await input.fill('zz-no-route-match-zz');
        await expect(page.locator('[data-testid="settings-search-empty"]').first()).toBeVisible();
      },
      anchors: [
        anchor('settings_search_input', '[data-testid="settings-search-input"]'),
        anchor('settings_search_empty', '[data-testid="settings-search-empty"]'),
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
    const selectedTabs = process.env.E2E_SETTINGS_SINGLE_ROUTE
      ? tabs.filter(({ tab }) => tab === process.env.E2E_SETTINGS_SINGLE_ROUTE)
      : tabs;
    expect(selectedTabs.length).toBeGreaterThan(0);
    for (const { tab, anchors } of selectedTabs) {
      await goToSettings(page, tab);
      await expectVisualAnchors(page, anchors);
      await takeScreenshot(page, `settings-${tab}`);
    }
  });

  test('settings control center visual QA anchors are stable', async ({ page }) => {
    for (const { tab } of tabs) {
      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      await expectSelectedSettingsNavigationItem(page, tab, 'desktop');
      await expectVisualAnchors(page, allVisualTargets.find((target) => target.tab === tab)?.anchors ?? []);
      if (tab === 'storage') await expectStorageActionIconLayout(page);
    }
    for (const tab of legacyTabs) {
      await expect(page.locator(`.settings-sider__item[data-settings-id="${tab}"]`)).toHaveCount(0);
    }
    for (const { tab, anchors } of secondaryTabs) {
      await goToSettings(page, tab);
      await expectUrlContains(page, tab);
      await expectVisualAnchors(page, anchors);
    }
    for (const target of compatibilityTargets) {
      await openCompatibilityTarget(page, target);
      await expectVisualAnchors(page, target.anchors);
    }
  });

  test('settings search is unique and supports bilingual Enter navigation', async ({ page }) => {
    const searches = [
      { size: SETTINGS_VISUAL_VIEWPORTS[0].size, query: 'packages', route: 'environment', section: 'updates' },
      { size: SETTINGS_VISUAL_VIEWPORTS[0].size, query: '能力包', route: 'capabilities', section: 'source' },
    ];

    for (const { size, query, route, section } of searches) {
      await page.setViewportSize(size);
      await goToSettings(page, 'general');
      const input = page
        .locator('[data-testid="settings-search-input"] input, input[data-testid="settings-search-input"]')
        .first();
      await expect(input).toBeVisible();
      await input.fill(query);
      await expect(page.locator('[data-testid="settings-search-result"]').first()).toBeVisible();
      await input.press('Enter');
      await page.waitForFunction(
        ({ route, section }) =>
          window.location.hash.includes(`/settings/${route}`) &&
          new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('section') === section,
        { route, section },
        { timeout: 10_000 }
      );
      await expectSettingsAnchorLanding(page, section);
    }
  });

  test('screenshot: settings control center visual QA', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    test.setTimeout(900_000);
    const commit = gitCommit();
    const entries: Array<{
      command: string;
      commit: string;
      level: SettingsVisualTarget['level'] | 'compatibility' | 'interaction-state';
      state: string;
      viewport: { name: string; width: number; height: number };
      theme: 'light' | 'dark';
      route: string;
      screenshot_path: string;
      status_anchors: string[];
      anchors: ManifestAnchorEvidence[];
      coverage_gaps: ManifestCoverageGap[];
      scroll: SettingsScrollEvidence;
    }> = [];
    const command = [
      'AIONUI_E2E_ALLOW_BACKEND_FAILURE=1',
      'AIONUI_E2E_PRODUCT_PROFILE=1',
      SETTINGS_E2E_MODE,
      'E2E_SCREENSHOTS=1',
      'bun run test:e2e -- tests/e2e/specs/navigation.e2e.ts --grep "settings control center visual QA"',
    ]
      .filter(Boolean)
      .join(' ');

    for (const viewport of SETTINGS_VISUAL_VIEWPORTS) {
      await page.setViewportSize(viewport.size);
      await goToSettings(page, 'general');
      const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (currentTheme !== viewport.theme) {
        const themeButton = page.locator('[data-testid="sider-footer-theme"]');
        await expect(themeButton).toBeVisible();
        await themeButton.click();
      }
      await page.waitForFunction(
        (theme) => document.documentElement.getAttribute('data-theme') === theme,
        viewport.theme,
        { timeout: 10_000 }
      );
      for (const { tab, level, anchors } of allVisualTargets) {
        await goToSettings(page, tab);
        await expectSelectedSettingsNavigationItem(
          page,
          tab,
          viewport.navigation,
          viewport.navigation === 'mobile' && level === 'secondary'
        );
        await expectVisualAnchors(page, anchors);
        if (tab === 'storage') await expectStorageActionIconLayout(page);
        const topScroll = await setSettingsScrollPosition(page, 'top');
        await resetSettingsScreenshotPointer(page, viewport.size);
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
          theme: viewport.theme,
          route: `/settings/${tab}`,
          screenshot_path: screenshotPath,
          status_anchors: anchorEvidence.filter((item) => item.visible).map((item) => item.id),
          anchors: anchorEvidence,
          coverage_gaps: coverageGapsFor(anchors, anchorEvidence),
          scroll: topScroll,
        });
        if (SETTINGS_LONG_PAGE_TABS.has(tab)) {
          const bottomScroll = await setSettingsScrollPosition(page, 'bottom');
          await resetSettingsScreenshotPointer(page, viewport.size);
          const bottomAnchorEvidence = await collectAnchorEvidence(page, anchors);
          const bottomScreenshotName = `settings/control-center/${viewport.name}/${tab}-scroll-bottom`;
          const bottomScreenshotPath = await takeScreenshot(page, bottomScreenshotName);
          entries.push({
            command,
            commit,
            level,
            state: 'internal_scroll_bottom',
            viewport: {
              name: viewport.name,
              ...viewport.size,
            },
            theme: viewport.theme,
            route: `/settings/${tab}`,
            screenshot_path: bottomScreenshotPath,
            status_anchors: bottomAnchorEvidence.filter((item) => item.visible).map((item) => item.id),
            anchors: bottomAnchorEvidence,
            coverage_gaps: [
              ...coverageGapsFor(anchors, bottomAnchorEvidence),
              ...(bottomScroll.scrollable
                ? []
                : [
                    {
                      id: 'settings_internal_scroll_range',
                      reason: 'internal_scroll_range_unavailable_at_viewport',
                    },
                  ]),
            ],
            scroll: bottomScroll,
          });
        }
      }
      for (const target of stateTargets) {
        await goToSettings(page, target.route);
        await target.action(page);
        await expectVisualAnchors(page, target.anchors);
        const topScroll = await setSettingsScrollPosition(page, 'top');
        await resetSettingsScreenshotPointer(page, viewport.size);
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
          theme: viewport.theme,
          route: `/settings/${target.route}`,
          screenshot_path: screenshotPath,
          status_anchors: anchorEvidence.filter((item) => item.visible).map((item) => item.id),
          anchors: anchorEvidence,
          coverage_gaps: coverageGapsFor(target.anchors, anchorEvidence),
          scroll: topScroll,
        });
        if (target.captureScrollBottom) {
          const bottomScroll = await setSettingsScrollPosition(page, 'bottom');
          await resetSettingsScreenshotPointer(page, viewport.size);
          const bottomAnchorEvidence = await collectAnchorEvidence(page, target.anchors);
          const bottomScreenshotName = `settings/control-center/${viewport.name}/${target.id}-scroll-bottom`;
          const bottomScreenshotPath = await takeScreenshot(page, bottomScreenshotName);
          entries.push({
            command,
            commit,
            level: 'interaction-state',
            state: `${target.state}_internal_scroll_bottom`,
            viewport: {
              name: viewport.name,
              ...viewport.size,
            },
            theme: viewport.theme,
            route: `/settings/${target.route}`,
            screenshot_path: bottomScreenshotPath,
            status_anchors: bottomAnchorEvidence.filter((item) => item.visible).map((item) => item.id),
            anchors: bottomAnchorEvidence,
            coverage_gaps: [
              ...coverageGapsFor(target.anchors, bottomAnchorEvidence),
              ...(bottomScroll.scrollable
                ? []
                : [
                    {
                      id: 'settings_internal_scroll_range',
                      reason: 'internal_scroll_range_unavailable_at_viewport',
                    },
                  ]),
            ],
            scroll: bottomScroll,
          });
        }
      }
      for (const target of compatibilityTargets) {
        await openCompatibilityTarget(page, target);
        await expectVisualAnchors(page, target.anchors);
        const topScroll = await setSettingsScrollPosition(page, 'top');
        await resetSettingsScreenshotPointer(page, viewport.size);
        const anchorEvidence = await collectAnchorEvidence(page, target.anchors);
        const screenshotName = `settings/control-center/${viewport.name}/compatibility-${target.id}`;
        const screenshotPath = await takeScreenshot(page, screenshotName, { fullPage: true });
        entries.push({
          command,
          commit,
          level: 'compatibility',
          state: 'compatibility_redirect_landing',
          viewport: {
            name: viewport.name,
            ...viewport.size,
          },
          theme: viewport.theme,
          route: `/settings/${target.source} -> /settings/${target.target}?section=${target.section}`,
          screenshot_path: screenshotPath,
          status_anchors: anchorEvidence.filter((item) => item.visible).map((item) => item.id),
          anchors: anchorEvidence,
          coverage_gaps: coverageGapsFor(target.anchors, anchorEvidence),
          scroll: topScroll,
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
            'contracts/app-settings-control-plane.json#experience_contract',
            'docs/product/gui/settings-control-center.md',
            'tests/e2e/specs/navigation.e2e.ts',
          ],
          coverage_summary: {
            top_level_routes: tabs.map((target) => `/settings/${target.tab}`),
            secondary_routes: secondaryTabs.map((target) => `/settings/${target.tab}`),
            compatibility_routes: compatibilityTargets.map(
              (target) => `/settings/${target.source} -> /settings/${target.target}?section=${target.section}`
            ),
            interaction_states: stateTargets.map((target) => target.state),
            internal_scroll_routes: [...SETTINGS_LONG_PAGE_TABS].map((tab) => `/settings/${tab}`),
            coverage_gaps: [
              {
                id: 'state_changing_action_confirmation',
                reason: 'covered_by_focused_dom_tests_but_not_available_in_the_backend_independent_visual_fixture',
              },
            ],
            viewports: SETTINGS_VISUAL_VIEWPORTS.map((viewport) => viewport.name),
            color_schemes: [...new Set(SETTINGS_VISUAL_VIEWPORTS.map((viewport) => viewport.theme))],
          },
          release_readiness_claim: false,
          notes: [
            'This manifest proves screenshot-level route, viewport, and anchor coverage only.',
            'It is not a release, installed-app currentness, or runtime readiness receipt.',
            'AIONUI_E2E_ALLOW_BACKEND_FAILURE=1 keeps visual QA focused on Settings UI when bundled AionCore is absent.',
            'AIONUI_E2E_PRODUCT_PROFILE=1 hides example extension tabs so screenshots represent the shipped product IA.',
            'Connected Gateway account anchors are recorded when the packaged fixture exposes that state; otherwise the manifest retains an explicit fixture_state_unavailable gap.',
            'Long Settings routes include separate internal-scroller top and bottom screenshots.',
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
