import type { Locator, Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../fixtures';
import { goToGuid, httpDelete, httpGet, httpInvoke, httpPost, takeScreenshot } from '../../helpers';
import {
  GuiBaselineManifestWriter,
  requireCleanShellHead,
  type GuiBaselineAnchorEvidence,
  type GuiBaselineCoverageGap,
  type GuiBaselineLayoutCheck,
  type GuiBaselineLocale,
  type GuiBaselineTheme,
} from './guiBaselineManifest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const MANIFEST_PATH = path.resolve(__dirname, '../../screenshots/gui-baseline-manifest.json');
const RUN_COMMAND =
  'AIONUI_E2E_PRODUCT_PROFILE=1 E2E_DEV=1 E2E_SCREENSHOTS=1 bun run test:e2e -- tests/e2e/features/visual-evidence/gui-baseline.e2e.ts';
const STREAM_FIXTURE_KEY = 'aionui:e2e-message-stream-conversation-id';
const WORKSPACE_PATH = path.join(os.tmpdir(), 'aionui-gui-baseline-workspace');
const NAVIGATION_RAIL_SELECTOR = '.layout-sider:has([data-testid="app-navigation-rail"])';
const MAIN_CONTENT_SELECTOR = '.app-shell > .arco-layout > .layout-content';

type CreatedConversation = { id: string };
type ClientSettings = Record<string, unknown>;
type AnchorTarget = {
  id: string;
  selector: string;
  expected?: GuiBaselineAnchorEvidence['expected'];
};
type Rect = { x: number; y: number; width: number; height: number };
type StreamRegistry = {
  controllers: Record<
    string,
    {
      runScenario: (options: { historyPairs: number; seedHistoryOnly: true }) => Promise<void>;
    }
  >;
};
type VisualTarget = {
  id: string;
  screenshotName: string;
  viewport: { name: string; width: number; height: number };
  theme: GuiBaselineTheme;
  locale: GuiBaselineLocale;
  anchors: AnchorTarget[];
  coverageGaps: GuiBaselineCoverageGap[];
  setup: (page: Page) => Promise<Record<string, string | number | boolean>>;
  layoutChecks: (page: Page) => Promise<GuiBaselineLayoutCheck[]>;
};

const anchor = (
  id: string,
  selector: string,
  expected: GuiBaselineAnchorEvidence['expected'] = 'visible'
): AnchorTarget => ({ id, selector, expected });

async function ensureRendererReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number' &&
      ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0,
    { timeout: 30_000 }
  );
}

async function applyAppearance(
  page: Page,
  viewport: VisualTarget['viewport'],
  theme: GuiBaselineTheme,
  locale: GuiBaselineLocale
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height });
  await httpInvoke(page, 'PUT', '/api/settings/client', {
    language: locale,
    'theme.activeId': theme === 'light' ? 'default-theme' : 'dark',
  });
  await page.reload();
  await ensureRendererReady(page);
  await page.waitForFunction(
    (expectedTheme) => document.documentElement.getAttribute('data-theme') === expectedTheme,
    theme,
    {
      timeout: 10_000,
    }
  );

  const settings = await httpGet<ClientSettings>(page, '/api/settings/client');
  expect(settings.language).toBe(locale);
  expect(settings['theme.activeId']).toBe(theme === 'light' ? 'default-theme' : 'dark');
}

async function createFixtureConversation(page: Page): Promise<string> {
  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    type: 'acp',
    name: 'GUI Baseline Fixture',
    extra: {
      workspace: WORKSPACE_PATH,
      custom_workspace: true,
      backend: 'codex',
      session_mode: 'full-access',
    },
  });
  if (!conversation?.id) {
    throw new Error('POST /api/conversations succeeded without a conversation id');
  }
  return conversation.id;
}

async function openFixtureConversation(
  page: Page,
  conversationId: string,
  panelState: 'closed' | 'open'
): Promise<void> {
  await page.evaluate(
    ({ id, fixtureKey, preference }) => {
      window.sessionStorage.setItem(fixtureKey, id);
      window.localStorage.setItem(`workspace-preference-${id}`, preference);
    },
    {
      id: conversationId,
      fixtureKey: STREAM_FIXTURE_KEY,
      preference: panelState === 'open' ? 'expanded' : 'collapsed',
    }
  );

  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${conversationId}`);
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
  await page.waitForFunction(
    (id) =>
      Boolean(
        (
          window as typeof window & {
            __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
          }
        ).__AIONUI_E2E_MESSAGE_STREAM__?.controllers[id]
      ),
    conversationId,
    { timeout: 15_000 }
  );
  await page.evaluate(async (id) => {
    const controller = (
      window as typeof window & {
        __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
      }
    ).__AIONUI_E2E_MESSAGE_STREAM__?.controllers[id];
    if (!controller) throw new Error(`Missing E2E stream controller for ${id}`);
    await controller.runScenario({ historyPairs: 4, seedHistoryOnly: true });
  }, conversationId);
  await expect
    .poll(() => page.locator('.message-item.text').count(), {
      timeout: 15_000,
      message: 'Expected fixture messages in the real conversation timeline',
    })
    .toBeGreaterThanOrEqual(8);
  await expect(page.locator('[data-testid="conversation-composer"]')).toBeVisible();
}

async function collectAnchors(page: Page, targets: AnchorTarget[]): Promise<GuiBaselineAnchorEvidence[]> {
  return Promise.all(
    targets.map(async (target) => {
      const locator = page.locator(target.selector).first();
      const exists = (await page.locator(target.selector).count()) > 0;
      const visible = exists && (await locator.isVisible().catch(() => false));
      const expected = target.expected ?? 'visible';
      const matched = exists && (expected === 'attached' || (expected === 'visible' ? visible : !visible));
      expect(matched, `${target.id}: expected ${expected} at ${target.selector}`).toBe(true);
      return { ...target, expected, exists, visible, matched };
    })
  );
}

async function requiredBox(locator: Locator, id: string): Promise<Rect> {
  const box = await locator.first().boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error(`Layout check ${id} requires a visible, non-empty box`);
  }
  return box;
}

const overlapArea = (left: Rect, right: Rect): number => {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
};

async function disjointCheck(
  page: Page,
  id: string,
  leftSelector: string,
  rightSelector: string
): Promise<GuiBaselineLayoutCheck> {
  const left = await requiredBox(page.locator(leftSelector), `${id}:left`);
  const right = await requiredBox(page.locator(rightSelector), `${id}:right`);
  const area = overlapArea(left, right);
  return { id, passed: area <= 1, details: `overlap_area=${area.toFixed(2)}` };
}

async function viewportCheck(page: Page, id: string, selector: string): Promise<GuiBaselineLayoutCheck> {
  const box = await requiredBox(page.locator(selector), id);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`Layout check ${id} requires an explicit viewport`);
  const passed =
    box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  return {
    id,
    passed,
    details: `box=${JSON.stringify(box)} viewport=${viewport.width}x${viewport.height}`,
  };
}

async function textOverflowCheck(page: Page, id: string, rootSelector: string): Promise<GuiBaselineLayoutCheck> {
  const violations = await page
    .locator(rootSelector)
    .first()
    .evaluate((root) => {
      const candidates = Array.from(
        root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,label,button,[role="button"],[role="tab"]')
      );
      return candidates
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0)
            return false;
          if (!(element.textContent?.trim().length ?? 0)) return false;
          if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) return false;
          return element.scrollWidth > element.clientWidth + 1 || rect.left < -1 || rect.right > window.innerWidth + 1;
        })
        .slice(0, 8)
        .map((element) => ({
          label:
            element.getAttribute('data-testid') ||
            element.getAttribute('aria-label') ||
            element.className ||
            element.tagName,
          text: element.textContent?.trim().slice(0, 80) || '',
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
    });
  return {
    id,
    passed: violations.length === 0,
    details: violations.length === 0 ? 'no_visible_text_overflow' : `violations=${JSON.stringify(violations)}`,
  };
}

async function inertBackgroundCheck(page: Page): Promise<GuiBaselineLayoutCheck> {
  const main = page.locator('[data-testid="conversation-main-column"]');
  await expect(main).toHaveAttribute('inert', '');
  await expect(main).toHaveAttribute('aria-hidden', 'true');
  return { id: 'compact_overlay_background_inert', passed: true, details: 'main_column=inert aria-hidden=true' };
}

async function expectHomeLocale(page: Page, locale: GuiBaselineLocale): Promise<void> {
  await expect(page.locator('[data-testid="opl-guid-entry"]')).toContainText(
    locale === 'zh-CN' ? /推进什么/ : /move forward/i
  );
}

async function expectConversationLocale(page: Page, locale: GuiBaselineLocale): Promise<void> {
  await expect(page.locator('[data-testid="conversation-side-panel-toggle"]')).toHaveAttribute(
    'aria-label',
    locale === 'zh-CN' ? /打开工具面板|关闭工具面板/ : /Open tools|Close tools/
  );
}

async function setNavigationRailExpanded(page: Page, expanded: boolean): Promise<void> {
  const rail = page.locator(NAVIGATION_RAIL_SELECTOR);
  const collapsed = await rail.evaluate((element) => element.classList.contains('collapsed'));
  if (collapsed === expanded) {
    await page.locator('[data-testid="app-navigation-rail-toggle"]').click();
  }
  if (expanded) await expect(rail).not.toHaveClass(/\bcollapsed\b/);
  else await expect(rail).toHaveClass(/\bcollapsed\b/);
}

async function captureTarget(
  page: Page,
  writer: GuiBaselineManifestWriter,
  shellHead: string,
  target: VisualTarget
): Promise<void> {
  await applyAppearance(page, target.viewport, target.theme, target.locale);
  const state = await target.setup(page);
  const anchors = await collectAnchors(page, target.anchors);
  const layoutChecks = await target.layoutChecks(page);
  for (const check of layoutChecks) {
    expect(check.passed, `${check.id}: ${check.details}`).toBe(true);
  }

  const route = await page.evaluate(() => window.location.hash.replace(/^#/, ''));
  const screenshotPath = await takeScreenshot(page, target.screenshotName);
  writer.add({
    id: target.id,
    shell_head: shellHead,
    route,
    viewport: target.viewport,
    theme: target.theme,
    locale: target.locale,
    state,
    screenshot_path: path.relative(REPO_ROOT, screenshotPath),
    anchors,
    layout_checks: layoutChecks,
    coverage_gaps: target.coverageGaps,
  });
}

function buildTargets(conversationId: string): VisualTarget[] {
  const railMainChecks = async (page: Page) => [
    await disjointCheck(page, 'navigation_rail_does_not_cover_main', NAVIGATION_RAIL_SELECTOR, MAIN_CONTENT_SELECTOR),
  ];
  const conversationChecks = async (page: Page) => [
    ...(await railMainChecks(page)),
    await disjointCheck(
      page,
      'timeline_does_not_cover_composer',
      '[data-testid="message-list-scroller"]',
      '[data-testid="conversation-composer"]'
    ),
    await textOverflowCheck(page, 'conversation_text_does_not_overflow', '[data-testid="conversation-main-column"]'),
  ];

  return [
    {
      id: 'home-desktop-light-zh-CN-rail-expanded',
      screenshotName: 'gui-baseline/home/desktop/light/zh-CN/rail-expanded',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'light',
      locale: 'zh-CN',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_starters', '[data-testid="opl-home-starters"]'),
        anchor('home_input', '[data-testid="guid-input-card-shell"]'),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [{ id: 'mobile_home_states', reason: 'covered by separate mobile route-state entries' }],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, true);
        await expectHomeLocale(page, 'zh-CN');
        return { route_kind: 'home', rail: 'expanded' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await textOverflowCheck(page, 'home_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
      ],
    },
    {
      id: 'home-mobile-dark-en-US-rail-closed',
      screenshotName: 'gui-baseline/home/mobile/dark/en-US/rail-closed',
      viewport: { name: 'mobile', width: 390, height: 844 },
      theme: 'dark',
      locale: 'en-US',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_input', '[data-testid="guid-input-card-shell"]'),
        anchor('mobile_rail_closed', `${NAVIGATION_RAIL_SELECTOR}.collapsed`, 'attached'),
      ],
      coverageGaps: [{ id: 'narrow_drawer_open', reason: 'covered by a separate mobile route-state entry' }],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, false);
        await expectHomeLocale(page, 'en-US');
        return { route_kind: 'home', rail: 'closed' };
      },
      layoutChecks: async (page) => [
        await viewportCheck(page, 'mobile_home_main_within_viewport', MAIN_CONTENT_SELECTOR),
        await textOverflowCheck(page, 'mobile_home_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
      ],
    },
    {
      id: 'home-mobile-dark-en-US-narrow-drawer-open',
      screenshotName: 'gui-baseline/home/mobile/dark/en-US/narrow-drawer-open',
      viewport: { name: 'mobile', width: 390, height: 844 },
      theme: 'dark',
      locale: 'en-US',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('narrow_drawer', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
        anchor('narrow_drawer_backdrop', '[data-testid="app-navigation-rail-backdrop"]'),
      ],
      coverageGaps: [{ id: 'mobile_home_unobscured', reason: 'covered by the separate rail-closed entry' }],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, true);
        await expectHomeLocale(page, 'en-US');
        return { route_kind: 'home', rail: 'narrow_drawer_open' };
      },
      layoutChecks: async (page) => [
        await viewportCheck(page, 'narrow_drawer_within_viewport', NAVIGATION_RAIL_SELECTOR),
        await viewportCheck(
          page,
          'narrow_drawer_backdrop_within_viewport',
          '[data-testid="app-navigation-rail-backdrop"]'
        ),
        await textOverflowCheck(page, 'narrow_drawer_text_does_not_overflow', NAVIGATION_RAIL_SELECTOR),
      ],
    },
    {
      id: 'conversation-desktop-light-en-US-side-panel-closed',
      screenshotName: 'gui-baseline/conversation/desktop/light/en-US/side-panel-closed',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'light',
      locale: 'en-US',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_side_panel_toggle', '[data-testid="conversation-side-panel-toggle"]'),
        anchor('conversation_side_panel_closed', '[data-testid="conversation-side-panel-surface"]', 'hidden'),
      ],
      coverageGaps: [{ id: 'side_panel_content', reason: 'covered by the separate desktop open entry' }],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await expectConversationLocale(page, 'en-US');
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', side_panel: 'closed' };
      },
      layoutChecks: conversationChecks,
    },
    {
      id: 'conversation-desktop-dark-zh-CN-side-panel-open',
      screenshotName: 'gui-baseline/conversation/desktop/dark/zh-CN/side-panel-open',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'dark',
      locale: 'zh-CN',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_side_panel', '[data-testid="conversation-side-panel-surface"]'),
        anchor('conversation_side_panel_content', '[data-testid="conversation-side-panel"]'),
      ],
      coverageGaps: [{ id: 'compact_overlay', reason: 'covered by the separate compact viewport entry' }],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'open');
        await expectConversationLocale(page, 'zh-CN');
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', side_panel: 'desktop_open' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await disjointCheck(
          page,
          'main_column_does_not_cover_side_panel',
          '[data-testid="conversation-main-column"]',
          '[data-testid="conversation-side-panel-surface"]'
        ),
        await disjointCheck(
          page,
          'composer_does_not_cover_side_panel',
          '[data-testid="conversation-composer"]',
          '[data-testid="conversation-side-panel-surface"]'
        ),
        await textOverflowCheck(
          page,
          'side_panel_text_does_not_overflow',
          '[data-testid="conversation-side-panel-surface"]'
        ),
      ],
    },
    {
      id: 'conversation-compact-light-en-US-side-panel-overlay',
      screenshotName: 'gui-baseline/conversation/compact/light/en-US/side-panel-overlay',
      viewport: { name: 'compact', width: 1000, height: 760 },
      theme: 'light',
      locale: 'en-US',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('compact_overlay_layer', '[data-testid="conversation-side-panel-layer"][aria-hidden="false"]'),
        anchor('compact_overlay_backdrop', '[data-testid="conversation-side-panel-backdrop"]'),
        anchor('compact_overlay_panel', '[data-testid="conversation-side-panel-surface"]'),
      ],
      coverageGaps: [{ id: 'desktop_split_panel', reason: 'covered by the separate desktop open entry' }],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await page.locator('[data-testid="conversation-side-panel-toggle"]').click();
        await expect(page.locator('[data-testid="conversation-side-panel-layer"]')).toHaveAttribute(
          'aria-hidden',
          'false'
        );
        await expectConversationLocale(page, 'en-US');
        return {
          route_kind: 'ordinary_conversation',
          fixture: 'persisted_with_workspace',
          side_panel: 'compact_overlay_open',
        };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await viewportCheck(
          page,
          'compact_overlay_panel_within_viewport',
          '[data-testid="conversation-side-panel-surface"]'
        ),
        await viewportCheck(
          page,
          'compact_overlay_backdrop_within_viewport',
          '[data-testid="conversation-side-panel-backdrop"]'
        ),
        await inertBackgroundCheck(page),
        await textOverflowCheck(
          page,
          'compact_overlay_text_does_not_overflow',
          '[data-testid="conversation-side-panel-surface"]'
        ),
      ],
    },
  ];
}

test('writes route-bound GUI baseline evidence for Home and ordinary conversations', async ({ page }) => {
  test.skip(!process.env.E2E_SCREENSHOTS, 'GUI baseline evidence is opt-in');
  test.setTimeout(240_000);

  const shellHead = requireCleanShellHead(REPO_ROOT);
  const writer = new GuiBaselineManifestWriter(REPO_ROOT, MANIFEST_PATH, shellHead, RUN_COMMAND);
  let conversationId: string | null = null;
  let originalSettings: ClientSettings | null = null;

  fs.rmSync(WORKSPACE_PATH, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORKSPACE_PATH, 'src'), { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE_PATH, 'README.md'), '# GUI Baseline Workspace\n');
  fs.writeFileSync(path.join(WORKSPACE_PATH, 'src', 'index.ts'), "export const baseline = 'route-bound';\n");
  fs.writeFileSync(path.join(WORKSPACE_PATH, 'notes.txt'), 'Stable fixture content for layout evidence.\n');

  try {
    await goToGuid(page);
    await ensureRendererReady(page);
    originalSettings = await httpGet<ClientSettings>(page, '/api/settings/client');
    conversationId = await createFixtureConversation(page);

    for (const target of buildTargets(conversationId)) {
      // Evidence states intentionally share one Electron window and must run in order.
      // eslint-disable-next-line no-await-in-loop
      await captureTarget(page, writer, shellHead, target);
    }
  } finally {
    if (conversationId) {
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
      await page
        .evaluate(
          ({ id, fixtureKey }) => {
            window.sessionStorage.removeItem(fixtureKey);
            window.localStorage.removeItem(`workspace-preference-${id}`);
          },
          { id: conversationId, fixtureKey: STREAM_FIXTURE_KEY }
        )
        .catch(() => {});
    }
    if (originalSettings) {
      await httpInvoke(page, 'PUT', '/api/settings/client', {
        language: originalSettings.language ?? null,
        'theme.activeId': originalSettings['theme.activeId'] ?? null,
      }).catch(() => {});
    }
    fs.rmSync(WORKSPACE_PATH, { recursive: true, force: true });
  }

  writer.write();
});
