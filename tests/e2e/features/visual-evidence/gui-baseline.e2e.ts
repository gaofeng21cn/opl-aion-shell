import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
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
const E2E_MODE = process.env.E2E_PACKAGED === '1' ? 'E2E_PACKAGED=1' : process.env.E2E_DEV === '1' ? 'E2E_DEV=1' : '';
const RUN_COMMAND = [
  'AIONUI_E2E_PRODUCT_PROFILE=1',
  E2E_MODE,
  'E2E_SCREENSHOTS=1',
  'bun run test:e2e -- tests/e2e/features/visual-evidence/gui-baseline.e2e.ts',
]
  .filter(Boolean)
  .join(' ');
const STREAM_FIXTURE_KEY = 'aionui:e2e-message-stream-conversation-id';
const GUI_BASELINE_FIXTURE_MARKER = 'opl_gui_baseline_v1';
const WORKSPACE_PATH = path.join(os.tmpdir(), 'aionui-gui-baseline-workspace');
const NAVIGATION_RAIL_SELECTOR = '.layout-sider:has([data-testid="app-navigation-rail"])';
const MAIN_CONTENT_SELECTOR = '.app-shell > .arco-layout > .layout-content';
const VIEWPORT_TOLERANCE_PX = 2;

type CreatedConversation = { id: string };
type FixtureConversation = { id: string; extra?: { e2e_fixture?: string } };
type FixtureConversationPage = { items: FixtureConversation[] };
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

async function waitForStablePaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

async function applyAppearance(
  page: Page,
  electronApp: ElectronApplication,
  viewport: VisualTarget['viewport'],
  theme: GuiBaselineTheme,
  locale: GuiBaselineLocale
): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, size) => {
    const mainWindow = BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed())
      .toSorted((left, right) => {
        const leftBounds = left.getBounds();
        const rightBounds = right.getBounds();
        return rightBounds.width * rightBounds.height - leftBounds.width * leftBounds.height;
      })[0];
    if (!mainWindow) throw new Error('GUI baseline could not resolve the Electron main window');
    mainWindow.setContentSize(size.width, size.height);
  }, viewport);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect
    .poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })))
    .toEqual({ width: viewport.width, height: viewport.height });
  await waitForStablePaint(page);
  await httpInvoke(page, 'PUT', '/api/settings/client', {
    language: locale,
    'theme.appearanceMode': theme,
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
  await waitForStablePaint(page);

  const settings = await httpGet<ClientSettings>(page, '/api/settings/client');
  expect(settings.language).toBe(locale);
  expect(settings['theme.appearanceMode']).toBe(theme);
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
      e2e_fixture: GUI_BASELINE_FIXTURE_MARKER,
    },
  });
  if (!conversation?.id) {
    throw new Error('POST /api/conversations succeeded without a conversation id');
  }
  return conversation.id;
}

async function fixtureConversationIds(page: Page): Promise<string[]> {
  const result = await httpGet<FixtureConversationPage>(page, '/api/conversations?limit=10000');
  return (result.items ?? [])
    .filter((conversation) => conversation.extra?.e2e_fixture === GUI_BASELINE_FIXTURE_MARKER)
    .map((conversation) => conversation.id);
}

async function removeFixtureConversations(page: Page): Promise<void> {
  for (const id of await fixtureConversationIds(page)) {
    // Fixture cleanup is intentionally marker-based, never title-based.
    // eslint-disable-next-line no-await-in-loop
    await httpDelete(page, `/api/conversations/${encodeURIComponent(id)}`);
  }
  await expect.poll(() => fixtureConversationIds(page)).toEqual([]);
}

function initializeFixtureWorkspace(): void {
  fs.rmSync(WORKSPACE_PATH, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORKSPACE_PATH, 'src'), { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE_PATH, 'README.md'), '# GUI Baseline Workspace\n');
  fs.writeFileSync(path.join(WORKSPACE_PATH, 'src', 'index.ts'), "export const baseline = 'route-bound';\n");
  fs.writeFileSync(path.join(WORKSPACE_PATH, 'notes.txt'), 'Stable fixture content for layout evidence.\n');

  execFileSync('git', ['init', '--quiet', '--initial-branch=main', WORKSPACE_PATH]);
  execFileSync('git', ['-C', WORKSPACE_PATH, 'add', '.']);
  execFileSync(
    'git',
    [
      '-C',
      WORKSPACE_PATH,
      '-c',
      'user.name=OPL E2E',
      '-c',
      'user.email=opl-e2e@localhost',
      'commit',
      '--quiet',
      '-m',
      'test: seed GUI baseline workspace',
    ],
    { stdio: 'pipe' }
  );

  const repositoryRoot = execFileSync('git', ['-C', WORKSPACE_PATH, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  expect(fs.realpathSync(repositoryRoot)).toBe(fs.realpathSync(WORKSPACE_PATH));
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

async function goToRuntime(page: Page): Promise<void> {
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/runtime`);
  await expect(page.locator('[data-testid="runtime-v2-page"]')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid="runtime-work-item-list"], [data-testid="runtime-projection-unavailable"]').first()
  ).toBeVisible({ timeout: 30_000 });
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
    box.x >= -VIEWPORT_TOLERANCE_PX &&
    box.y >= -VIEWPORT_TOLERANCE_PX &&
    box.x + box.width <= viewport.width + VIEWPORT_TOLERANCE_PX &&
    box.y + box.height <= viewport.height + VIEWPORT_TOLERANCE_PX;
  return {
    id,
    passed,
    details: `box=${JSON.stringify(box)} viewport=${viewport.width}x${viewport.height}`,
  };
}

async function viewportWidthCoverageCheck(
  page: Page,
  id: string,
  selector: string,
  minimumRatio: number
): Promise<GuiBaselineLayoutCheck> {
  const box = await requiredBox(page.locator(selector), id);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`Layout check ${id} requires an explicit viewport`);
  const ratio = box.width / viewport.width;
  return {
    id,
    passed: ratio >= minimumRatio,
    details: `width_ratio=${ratio.toFixed(3)} minimum=${minimumRatio.toFixed(3)} box_width=${box.width.toFixed(2)} viewport_width=${viewport.width}`,
  };
}

async function outsideViewportCheck(page: Page, id: string, selector: string): Promise<GuiBaselineLayoutCheck> {
  const box = await requiredBox(page.locator(selector), id);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`Layout check ${id} requires an explicit viewport`);
  const passed =
    box.x + box.width <= 1 || box.y + box.height <= 1 || box.x >= viewport.width - 1 || box.y >= viewport.height - 1;
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
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node) {
            const parent = node.parentElement;
            const text = node.textContent?.trim();
            if (parent && text) {
              const parentStyle = window.getComputedStyle(parent);
              if (parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden') {
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const textRect of range.getClientRects()) {
                  if (
                    textRect.width > 0 &&
                    textRect.height > 0 &&
                    (textRect.left < rect.left - 1 || textRect.right > rect.right + 1)
                  ) {
                    return true;
                  }
                }
              }
            }
            node = walker.nextNode();
          }
          return rect.left < -1 || rect.right > window.innerWidth + 1;
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

async function homeStarterGeometryCheck(page: Page): Promise<GuiBaselineLayoutCheck> {
  const geometry = await page.evaluate(() => {
    const active = document.querySelector<HTMLElement>('[data-testid^="home-starter-"][aria-pressed="true"]');
    const inactive = document.querySelector<HTMLElement>('[data-testid^="home-starter-"][aria-pressed="false"]');
    const content = active?.querySelector<HTMLElement>('.arco-btn-content');
    const icon = active?.querySelector<HTMLElement>('[data-testid^="starter-icon-"]');
    const check = active?.querySelector<HTMLElement>('[data-testid="starter-active-check"]');
    const label = content ? Array.from(content.children).find((child) => child !== icon && child !== check) : null;
    if (!active || !inactive || !content || !icon || !check || !(label instanceof HTMLElement)) return null;

    const activeRect = active.getBoundingClientRect();
    const inactiveRect = inactive.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const checkRect = check.getBoundingClientRect();
    const style = window.getComputedStyle(active);
    const contentStyle = window.getComputedStyle(content);
    return {
      activeHeight: activeRect.height,
      inactiveHeight: inactiveRect.height,
      rowTopDelta: Math.abs(activeRect.top - inactiveRect.top),
      iconLabelCenterDelta: Math.abs(iconRect.top + iconRect.height / 2 - (labelRect.top + labelRect.height / 2)),
      checkLabelCenterDelta: Math.abs(checkRect.top + checkRect.height / 2 - (labelRect.top + labelRect.height / 2)),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      alignItems: contentStyle.alignItems,
    };
  });

  const passed = Boolean(
    geometry &&
    Math.abs(geometry.activeHeight - 34) <= 1 &&
    Math.abs(geometry.activeHeight - geometry.inactiveHeight) <= 1 &&
    geometry.rowTopDelta <= 1 &&
    geometry.iconLabelCenterDelta <= 1 &&
    geometry.checkLabelCenterDelta <= 1 &&
    geometry.fontSize === '13px' &&
    geometry.lineHeight === '18px' &&
    geometry.fontWeight === '500' &&
    geometry.alignItems === 'center'
  );
  return {
    id: 'home_starter_active_geometry_stable',
    passed,
    details: geometry ? JSON.stringify(geometry) : 'active_or_inactive_starter_geometry_missing',
  };
}

async function homeComposerVisualCheck(
  page: Page,
  expectedBackground: 'rgb(255, 255, 255)' | 'rgb(32, 34, 36)',
  verifyFocus: boolean
): Promise<GuiBaselineLayoutCheck> {
  const inner = page.locator('[data-testid="guid-input-card-inner"]');
  const textarea = page.locator('[data-testid="guid-input"]');
  const read = async () =>
    inner.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const input = element.querySelector('textarea');
      const inputStyle = input ? window.getComputedStyle(input) : null;
      const rect = element.getBoundingClientRect();
      const modelButton = element.querySelector<HTMLElement>('.sendbox-model-btn');
      const modelStyle = modelButton ? window.getComputedStyle(modelButton) : null;
      const modelIcon = modelButton?.querySelector<SVGElement>('svg');
      const modelIconRect = modelIcon?.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
        shadow: style.boxShadow,
        inputFontSize: inputStyle?.fontSize ?? null,
        inputLineHeight: inputStyle?.lineHeight ?? null,
        inputWeight: inputStyle?.fontWeight ?? null,
        modelFontSize: modelStyle?.fontSize ?? null,
        modelLineHeight: modelStyle?.lineHeight ?? null,
        modelIconWidth: modelIconRect?.width ?? null,
        modelIconHeight: modelIconRect?.height ?? null,
      };
    });

  const resting = await read();
  let focused = resting;
  if (verifyFocus) {
    await textarea.focus();
    await waitForStablePaint(page);
    focused = await read();
    await textarea.evaluate((element) => element.blur());
    await waitForStablePaint(page);
  }

  const optionalModelPass =
    resting.modelFontSize === null ||
    (resting.modelFontSize === '12px' &&
      resting.modelLineHeight === '18px' &&
      resting.modelIconWidth !== null &&
      resting.modelIconHeight !== null &&
      Math.abs(resting.modelIconWidth - 16) <= 1 &&
      Math.abs(resting.modelIconHeight - 16) <= 1);
  const passed =
    resting.background === expectedBackground &&
    resting.borderWidth === '1px' &&
    resting.shadow !== 'none' &&
    resting.inputFontSize === '14px' &&
    resting.inputLineHeight === '20px' &&
    resting.inputWeight === '400' &&
    focused.shadow !== 'none' &&
    Math.abs(resting.width - focused.width) <= 1 &&
    Math.abs(resting.height - focused.height) <= 1 &&
    optionalModelPass;
  return {
    id: verifyFocus ? 'home_composer_resting_and_focus_geometry' : 'home_composer_visual_tokens',
    passed,
    details: JSON.stringify({ resting, focused }),
  };
}

async function homeBackdropPaintCheck(page: Page, screenshotPath: string): Promise<GuiBaselineLayoutCheck> {
  const homeEntry = page.locator('[data-testid="opl-guid-entry"]');
  const box = await requiredBox(homeEntry, 'home_backdrop_clears_stale_pixels');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Home backdrop check requires an explicit viewport');

  const background = await homeEntry.evaluate((element) => {
    const css = window.getComputedStyle(element).backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Home backdrop check could not create a canvas context');
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return { css, red, green, blue, alpha };
  });

  const image = sharp(screenshotPath).ensureAlpha();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('Home backdrop check could not read screenshot dimensions');

  const scaleX = metadata.width / viewport.width;
  const scaleY = metadata.height / viewport.height;
  const inset = Math.min(16, Math.max(4, box.width / 10));
  const bandHeight = Math.min(10, Math.max(4, box.height / 20));
  const left = Math.max(0, Math.round((box.x + inset) * scaleX));
  const right = Math.min(metadata.width, Math.round((box.x + box.width - inset) * scaleX));
  const top = Math.max(0, Math.round((box.y + box.height - bandHeight) * scaleY));
  const bottom = Math.min(metadata.height, Math.round((box.y + box.height - 2) * scaleY));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const { data, info } = await sharp(screenshotPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let matchingPixels = 0;
  const pixelCount = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const matchesBackground =
      Math.abs(data[offset] - background.red) <= 6 &&
      Math.abs(data[offset + 1] - background.green) <= 6 &&
      Math.abs(data[offset + 2] - background.blue) <= 6 &&
      data[offset + 3] >= 250;
    if (matchesBackground) matchingPixels += 1;
  }

  const matchingRatio = matchingPixels / pixelCount;
  const passed = background.alpha >= 250 && matchingRatio >= 0.97;
  return {
    id: 'home_backdrop_clears_stale_pixels',
    passed,
    details: `computed=${background.css} alpha=${background.alpha} bottom_band_match=${matchingRatio.toFixed(3)}`,
  };
}

async function compactConversationHistoryEmptyCheck(page: Page): Promise<GuiBaselineLayoutCheck> {
  const details = await page
    .locator('[data-testid="conversation-history-empty"]')
    .first()
    .evaluate((element) => {
      const style = window.getComputedStyle(element);
      const icon = element.querySelector<SVGElement>('svg');
      const label = element.querySelector<HTMLElement>('.text-13px');
      const iconRect = icon?.getBoundingClientRect();
      const labelStyle = label ? window.getComputedStyle(label) : null;
      return {
        display: style.display,
        flexDirection: style.flexDirection,
        gap: style.gap,
        hasArcoIllustration: element.querySelector('.arco-empty') !== null,
        iconWidth: iconRect?.width ?? null,
        iconHeight: iconRect?.height ?? null,
        iconColor: icon ? window.getComputedStyle(icon).color : null,
        labelFontSize: labelStyle?.fontSize ?? null,
        labelLineHeight: labelStyle?.lineHeight ?? null,
      };
    });

  const passed =
    details.display === 'flex' &&
    details.flexDirection === 'column' &&
    details.gap === '8px' &&
    details.hasArcoIllustration === false &&
    details.iconWidth !== null &&
    details.iconHeight !== null &&
    Math.abs(details.iconWidth - 20) <= 1 &&
    Math.abs(details.iconHeight - 20) <= 1 &&
    details.iconColor !== null &&
    details.iconColor !== 'rgba(0, 0, 0, 0)' &&
    details.labelFontSize === '13px' &&
    details.labelLineHeight === '18px';
  return {
    id: 'conversation_history_empty_is_compact_monochrome',
    passed,
    details: JSON.stringify(details),
  };
}

async function conversationTypographyCheck(page: Page): Promise<GuiBaselineLayoutCheck> {
  const details = await page.evaluate(() => {
    const plainText = document.querySelector<HTMLElement>('[data-testid="message-text-content"].whitespace-pre-wrap');
    const markdownHost = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="message-text-content"]'))
      .map((element) => element.querySelector<HTMLElement>('.markdown-shadow'))
      .find((element): element is HTMLElement => element !== null);
    const markdownBody = markdownHost?.shadowRoot?.querySelector<HTMLElement>('.markdown-shadow-body') ?? null;
    const read = (element: HTMLElement | null) => {
      if (!element) return null;
      const style = window.getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        fontWeight: style.fontWeight === 'normal' ? 400 : Number.parseInt(style.fontWeight, 10),
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing,
      };
    };
    return { plain: read(plainText), markdown: read(markdownBody) };
  });

  const typographyMatches = (value: (typeof details)['plain']): boolean =>
    Boolean(
      value &&
      Math.abs(value.fontSize - 15) <= 0.1 &&
      Math.abs(value.lineHeight - 22) <= 0.2 &&
      value.fontWeight === 400 &&
      (value.letterSpacing === 'normal' || value.letterSpacing === '0px')
    );
  const passed =
    typographyMatches(details.plain) &&
    typographyMatches(details.markdown) &&
    details.plain?.fontFamily === details.markdown?.fontFamily;
  return {
    id: 'conversation_plain_and_markdown_typography_match_codex_rhythm',
    passed,
    details: JSON.stringify(details),
  };
}

async function expectHomeLocale(page: Page, locale: GuiBaselineLocale): Promise<void> {
  const homeEntry = page.locator('[data-testid="opl-guid-entry"]');
  await expect(homeEntry).toHaveCount(1);
  await expect(page.locator('[data-testid="guid-input-card-shell"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="sider-footer-account"], [data-testid="sider-footer-settings"]')).toHaveCount(
    1
  );
  await expect(homeEntry).toContainText(locale === 'zh-CN' ? /推进什么/ : /move forward/i);
}

async function expectConversationLocale(page: Page, locale: GuiBaselineLocale): Promise<void> {
  await expect(page.locator('[data-testid="conversation-side-panel-toggle"]')).toHaveAttribute(
    'aria-label',
    locale === 'zh-CN' ? /打开文件面板|关闭文件面板/ : /Open files|Close files/
  );
}

async function openConversationModelMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="acp-sendbox-decision-controls"] .sendbox-model-btn').first().click();
  await expect(page.getByText(/Auto \(recommended\)/i).last()).toBeVisible();
}

async function openEnvironmentPopover(page: Page): Promise<void> {
  await page.locator('.conversation-environment-trigger').click();
  await expect(page.locator('[data-testid="conversation-environment-popover"]')).toBeVisible();
  await waitForSettledVisual(page, '[data-testid="conversation-environment-popover"]');
}

async function openMobileActionSheet(page: Page, triggerSelector: string): Promise<void> {
  await page.locator(triggerSelector).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      return Boolean(box && viewport && box.y < viewport.height && box.y + box.height <= viewport.height + 1);
    })
    .toBe(true);
}

async function openWorkspacePreview(page: Page, fileName: string): Promise<void> {
  const panelToggle = page.locator('[data-testid="conversation-side-panel-toggle"]');
  await panelToggle.focus();
  await panelToggle.press('Enter');
  const workspace = page.locator('[data-testid="conversation-side-panel"]');
  await expect(workspace.locator('.workspace-tree')).toBeVisible({ timeout: 30_000 });
  await workspace.getByText(fileName, { exact: true }).first().click();
  const preview = page.locator('[data-testid="conversation-preview-surface"]');
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="conversation-side-panel-layer"]')).toHaveAttribute('aria-hidden', 'true');

  // The files toggle is activated by keyboard so its hover-only tooltip must
  // not leak into the settled Preview evidence after Arco's 200 ms delay.
  await page.waitForTimeout(250);
  await expect(page.locator('.arco-tooltip-content:visible')).toHaveCount(0);
  await expect(preview).toBeVisible();
}

async function waitForSettledTransform(page: Page, selector: string): Promise<void> {
  await expect
    .poll(
      () =>
        page
          .locator(selector)
          .first()
          .evaluate((element) => {
            const transform = window.getComputedStyle(element).transform;
            if (transform === 'none') return 0;
            const matrix = new DOMMatrixReadOnly(transform);
            return Math.abs(matrix.m41) + Math.abs(matrix.m42);
          }),
      { timeout: 5_000, message: `Expected ${selector} entrance transform to settle` }
    )
    .toBeLessThan(0.5);
}

async function waitForSettledVisual(page: Page, selector: string): Promise<void> {
  await expect
    .poll(
      () =>
        page
          .locator(selector)
          .first()
          .evaluate((element) => {
            let current: HTMLElement | null = element as HTMLElement;
            let minimumOpacity = 1;
            let transformOffset = 0;
            while (current && current !== document.body) {
              const style = window.getComputedStyle(current);
              const opacity = Number.parseFloat(style.opacity);
              if (Number.isFinite(opacity)) minimumOpacity = Math.min(minimumOpacity, opacity);
              if (style.transform !== 'none') {
                const matrix = new DOMMatrixReadOnly(style.transform);
                transformOffset += Math.abs(matrix.m41) + Math.abs(matrix.m42);
              }
              current = current.parentElement;
            }
            return minimumOpacity >= 0.99 && transformOffset < 0.5;
          }),
      { timeout: 5_000, message: `Expected ${selector} entrance opacity and transform to settle` }
    )
    .toBe(true);
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
  electronApp: ElectronApplication,
  writer: GuiBaselineManifestWriter,
  shellHead: string,
  target: VisualTarget
): Promise<void> {
  await applyAppearance(page, electronApp, target.viewport, target.theme, target.locale);
  const state = await target.setup(page);
  const anchors = await collectAnchors(page, target.anchors);
  const layoutChecks = await target.layoutChecks(page);
  for (const check of layoutChecks) {
    expect(check.passed, `${check.id}: ${check.details}`).toBe(true);
  }

  const route = await page.evaluate(() => window.location.hash.replace(/^#/, ''));
  const screenshotPath = await takeScreenshot(page, target.screenshotName);
  const screenshotChecks = target.id.startsWith('home-') ? [await homeBackdropPaintCheck(page, screenshotPath)] : [];
  for (const check of screenshotChecks) {
    expect(check.passed, `${check.id}: ${check.details}`).toBe(true);
  }
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
    layout_checks: [...layoutChecks, ...screenshotChecks],
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
    await conversationTypographyCheck(page),
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
      coverageGaps: [],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, true);
        await expectHomeLocale(page, 'zh-CN');
        return { route_kind: 'home', rail: 'expanded' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await textOverflowCheck(page, 'home_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
        await homeComposerVisualCheck(page, 'rgb(255, 255, 255)', true),
      ],
    },
    {
      id: 'home-mobile-dark-en-US-rail-closed',
      screenshotName: 'gui-baseline/home/mobile/dark/en-US/rail-closed',
      viewport: { name: 'mobile', width: 420, height: 844 },
      theme: 'dark',
      locale: 'en-US',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_input', '[data-testid="guid-input-card-shell"]'),
        anchor('mobile_rail_closed', `${NAVIGATION_RAIL_SELECTOR}.collapsed`, 'attached'),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, false);
        await expectHomeLocale(page, 'en-US');
        return { route_kind: 'home', rail: 'closed' };
      },
      layoutChecks: async (page) => [
        await viewportCheck(page, 'mobile_home_main_within_viewport', MAIN_CONTENT_SELECTOR),
        await textOverflowCheck(page, 'mobile_home_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
        await homeComposerVisualCheck(page, 'rgb(32, 34, 36)', false),
      ],
    },
    {
      id: 'home-desktop-light-zh-CN-starter-active',
      screenshotName: 'gui-baseline/home/desktop/light/zh-CN/starter-active',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'light',
      locale: 'zh-CN',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_starters', '[data-testid="opl-home-starters"]'),
        anchor('home_starter_active', '[data-testid="home-starter-mas"][aria-pressed="true"][data-opl-active="true"]'),
        anchor('home_starter_active_check', '[data-testid="home-starter-mas"] [data-testid="starter-active-check"]'),
        anchor('home_input', '[data-testid="guid-input-card-shell"]'),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, true);
        await expectHomeLocale(page, 'zh-CN');
        const starter = page.locator('[data-testid="home-starter-mas"]');
        await starter.click();
        await expect(starter).toHaveAttribute('aria-pressed', 'true');
        await expect(starter).toHaveAttribute('data-opl-active', 'true');
        await expect(starter.locator('[data-testid="starter-active-check"]')).toBeVisible();
        await expect(page.locator('[data-testid="guid-input-card-shell"]')).toBeVisible();
        await waitForStablePaint(page);
        return { route_kind: 'home', rail: 'expanded', starter: 'mas', starter_state: 'active' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await textOverflowCheck(page, 'home_active_starter_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
        await homeStarterGeometryCheck(page),
        await homeComposerVisualCheck(page, 'rgb(255, 255, 255)', false),
      ],
    },
    {
      id: 'home-mobile-dark-en-US-action-sheet-open',
      screenshotName: 'gui-baseline/home/mobile/dark/en-US/action-sheet-open',
      viewport: { name: 'mobile', width: 420, height: 844 },
      theme: 'dark',
      locale: 'en-US',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('mobile_action_sheet', '[role="dialog"][aria-modal="true"]'),
        anchor(
          'mobile_attach',
          '[data-testid="mobile-action-sheet-attach"], [data-testid="mobile-action-sheet-attach-host-files"]'
        ),
        anchor('mobile_permission', '[data-testid="mobile-action-sheet-permission"]'),
        anchor('mobile_reasoning', '[data-testid="mobile-action-sheet-reasoning"]'),
        anchor('mobile_model', '[data-testid="mobile-action-sheet-model"]'),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, false);
        await openMobileActionSheet(page, '[data-testid="file-upload-btn"]');
        return { route_kind: 'home', rail: 'closed', composer_surface: 'mobile_action_sheet' };
      },
      layoutChecks: async (page) => [
        await viewportCheck(page, 'mobile_home_action_sheet_within_viewport', '[role="dialog"][aria-modal="true"]'),
        await textOverflowCheck(
          page,
          'mobile_home_action_sheet_text_does_not_overflow',
          '[role="dialog"][aria-modal="true"]'
        ),
      ],
    },
    {
      id: 'runtime-desktop-light-en-US-overview',
      screenshotName: 'gui-baseline/runtime/desktop/light/en-US/overview',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'light',
      locale: 'en-US',
      anchors: [
        anchor('runtime_route', '[data-testid="runtime-v2-page"]'),
        anchor(
          'runtime_state',
          '[data-testid="runtime-work-item-list"], [data-testid="runtime-projection-unavailable"]'
        ),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await goToRuntime(page);
        await setNavigationRailExpanded(page, true);
        return {
          route_kind: 'runtime',
          runtime_state: (await page
            .locator('[data-testid="runtime-work-item-list"]')
            .isVisible()
            .catch(() => false))
            ? 'work_item_projection'
            : 'projection_unavailable',
        };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await viewportCheck(page, 'runtime_main_within_viewport', MAIN_CONTENT_SELECTOR),
        await textOverflowCheck(page, 'runtime_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
      ],
    },
    {
      id: 'conversation-desktop-light-en-US-composer-controls',
      screenshotName: 'gui-baseline/conversation/desktop/light/en-US/composer-controls',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'light',
      locale: 'en-US',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_decision_controls', '[data-testid="acp-sendbox-decision-controls"]'),
        anchor('conversation_model_control', '[data-testid="acp-sendbox-decision-controls"] .sendbox-model-btn'),
        anchor('conversation_permission_control', '[data-testid="agent-mode-selector-codex"]'),
        anchor('conversation_files_closed', '[data-testid="conversation-side-panel-surface"]', 'hidden'),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await expectConversationLocale(page, 'en-US');
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', composer: 'decision_ready' };
      },
      layoutChecks: conversationChecks,
    },
    {
      id: 'conversation-desktop-light-en-US-model-menu-open',
      screenshotName: 'gui-baseline/conversation/desktop/light/en-US/model-menu-open',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'light',
      locale: 'en-US',
      anchors: [
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_model_control', '[data-testid="acp-sendbox-decision-controls"] .sendbox-model-btn'),
        anchor('conversation_model_menu', 'text="Auto (recommended)"'),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await openConversationModelMenu(page);
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', model_menu: 'open' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await viewportCheck(page, 'conversation_model_menu_within_viewport', 'text="Auto (recommended)"'),
        await textOverflowCheck(page, 'conversation_model_menu_text_does_not_overflow', 'text="Auto (recommended)"'),
      ],
    },
    {
      id: 'conversation-desktop-dark-zh-CN-environment-open',
      screenshotName: 'gui-baseline/conversation/desktop/dark/zh-CN/environment-open',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'dark',
      locale: 'zh-CN',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_environment_trigger', '.conversation-environment-trigger'),
        anchor('conversation_environment_popover', '[data-testid="conversation-environment-popover"]'),
        anchor(
          'conversation_environment_browser_address',
          '[data-testid="conversation-environment-popover"] input[aria-label]'
        ),
        anchor(
          'conversation_environment_browser_open',
          '[data-testid="conversation-environment-popover"] button[aria-label]'
        ),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await openEnvironmentPopover(page);
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', environment: 'open' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await viewportCheck(
          page,
          'conversation_environment_popover_within_viewport',
          '[data-testid="conversation-environment-popover"]'
        ),
        await textOverflowCheck(
          page,
          'conversation_environment_text_does_not_overflow',
          '[data-testid="conversation-environment-popover"]'
        ),
      ],
    },
    {
      id: 'conversation-desktop-dark-zh-CN-files-open',
      screenshotName: 'gui-baseline/conversation/desktop/dark/zh-CN/files-open',
      viewport: { name: 'desktop', width: 1440, height: 960 },
      theme: 'dark',
      locale: 'zh-CN',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_files_surface', '[data-testid="conversation-side-panel-surface"]'),
        anchor('conversation_files_content', '[data-testid="conversation-side-panel"]'),
        anchor('conversation_workspace_tree', '[data-testid="conversation-side-panel"] .workspace-tree'),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'open');
        await expectConversationLocale(page, 'zh-CN');
        await expect(page.locator('[data-testid="conversation-side-panel"] .workspace-tree')).toBeVisible({
          timeout: 30_000,
        });
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', files: 'desktop_open' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await disjointCheck(
          page,
          'main_column_does_not_cover_files',
          '[data-testid="conversation-main-column"]',
          '[data-testid="conversation-side-panel-surface"]'
        ),
        await disjointCheck(
          page,
          'composer_does_not_cover_files',
          '[data-testid="conversation-composer"]',
          '[data-testid="conversation-side-panel-surface"]'
        ),
        await textOverflowCheck(
          page,
          'conversation_files_text_does_not_overflow',
          '[data-testid="conversation-side-panel-surface"]'
        ),
      ],
    },
    {
      id: 'conversation-mobile-light-en-US-preview-open',
      screenshotName: 'gui-baseline/conversation/mobile/light/en-US/preview-open',
      viewport: { name: 'mobile', width: 420, height: 844 },
      theme: 'light',
      locale: 'en-US',
      anchors: [
        anchor('conversation_preview_surface', '[data-testid="conversation-preview-surface"]'),
        anchor('conversation_timeline_hidden', '[data-testid="conversation-timeline-surface"]', 'hidden'),
        anchor('conversation_composer_hidden', '[data-testid="conversation-composer"]', 'hidden'),
        anchor(
          'conversation_files_layer_closed',
          '[data-testid="conversation-side-panel-layer"][aria-hidden="true"]',
          'attached'
        ),
        anchor(
          'conversation_files_surface_closed',
          '[data-testid="conversation-side-panel-surface"][aria-hidden="true"]',
          'attached'
        ),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await setNavigationRailExpanded(page, false);
        await openWorkspacePreview(page, 'README.md');
        await waitForSettledTransform(page, '[data-testid="conversation-preview-surface"]');
        return {
          route_kind: 'ordinary_conversation',
          fixture: 'persisted_with_workspace',
          preview: 'mobile_open',
          files: 'closed_by_preview',
        };
      },
      layoutChecks: async (page) => [
        await viewportCheck(page, 'mobile_preview_within_viewport', '[data-testid="conversation-preview-surface"]'),
        await viewportWidthCoverageCheck(
          page,
          'mobile_preview_owns_readable_canvas',
          '[data-testid="conversation-preview-surface"]',
          0.9
        ),
        await outsideViewportCheck(
          page,
          'mobile_files_surface_outside_viewport',
          '[data-testid="conversation-side-panel-surface"]'
        ),
        await disjointCheck(
          page,
          'mobile_files_surface_does_not_cover_preview',
          '[data-testid="conversation-side-panel-surface"]',
          '[data-testid="conversation-preview-surface"]'
        ),
        await textOverflowCheck(
          page,
          'mobile_preview_text_does_not_overflow',
          '[data-testid="conversation-preview-surface"]'
        ),
      ],
    },
  ];
}

function buildEmptyHistoryTarget(): VisualTarget {
  return {
    id: 'home-desktop-light-zh-CN-empty-history',
    screenshotName: 'gui-baseline/home/desktop/light/zh-CN/empty-history',
    viewport: { name: 'desktop', width: 1440, height: 960 },
    theme: 'light',
    locale: 'zh-CN',
    anchors: [
      anchor('home_route', '[data-testid="opl-guid-entry"]'),
      anchor('conversation_history_empty', '[data-testid="conversation-history-empty"]'),
      anchor('conversation_history_empty_icon', '[data-testid="conversation-history-empty"] svg'),
      anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
    ],
    coverageGaps: [],
    setup: async (page) => {
      await goToGuid(page);
      await setNavigationRailExpanded(page, true);
      await expectHomeLocale(page, 'zh-CN');
      await expect(page.locator('[data-testid="conversation-history-empty"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="conversation-history-empty"] .arco-empty')).toHaveCount(0);
      return { route_kind: 'home', rail: 'expanded', conversation_history: 'empty' };
    },
    layoutChecks: async (page) => [
      await disjointCheck(page, 'navigation_rail_does_not_cover_main', NAVIGATION_RAIL_SELECTOR, MAIN_CONTENT_SELECTOR),
      await textOverflowCheck(page, 'home_empty_history_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
      await compactConversationHistoryEmptyCheck(page),
    ],
  };
}

test.describe.configure({ timeout: 240_000 });

test('writes route-bound GUI baseline evidence for Home and ordinary conversations', async ({ page, electronApp }) => {
  test.skip(!process.env.E2E_SCREENSHOTS, 'GUI baseline evidence is opt-in');

  const shellHead = requireCleanShellHead(REPO_ROOT);
  const writer = new GuiBaselineManifestWriter(REPO_ROOT, MANIFEST_PATH, shellHead, RUN_COMMAND);
  let conversationId: string | null = null;
  let originalSettings: ClientSettings | null = null;

  initializeFixtureWorkspace();

  try {
    await goToGuid(page);
    await ensureRendererReady(page);
    originalSettings = await httpGet<ClientSettings>(page, '/api/settings/client');
    await removeFixtureConversations(page);
    await captureTarget(page, electronApp, writer, shellHead, buildEmptyHistoryTarget());
    conversationId = await createFixtureConversation(page);

    for (const target of buildTargets(conversationId)) {
      // Evidence states intentionally share one Electron window and must run in order.
      // eslint-disable-next-line no-await-in-loop
      await captureTarget(page, electronApp, writer, shellHead, target);
    }
  } finally {
    if (conversationId) {
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`);
      await expect.poll(() => fixtureConversationIds(page)).toEqual([]);
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
        'theme.appearanceMode': originalSettings['theme.appearanceMode'] ?? null,
      }).catch(() => {});
    }
    fs.rmSync(WORKSPACE_PATH, { recursive: true, force: true });
  }

  writer.write();
});
