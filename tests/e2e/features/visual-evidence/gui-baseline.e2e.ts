import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { test, expect } from '../../fixtures';
import { goToGuid, goToSettings, httpDelete, httpGet, httpInvoke, httpPost } from '../../helpers';
import { collectGuiBaselineAccessibility } from './guiBaselineAccessibility';
import {
  GuiBaselineManifestWriter,
  readAppGuiVisualReferenceContract,
  requireCleanShellHead,
  type AppGuiVisualReferenceContract,
  type GuiBaselineAnchorEvidence,
  type GuiBaselineCoverageGap,
  type GuiBaselineLayoutCheck,
  type GuiBaselineLocale,
  type GuiBaselineTheme,
} from './guiBaselineManifest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const E2E_MODE = process.env.E2E_PACKAGED === '1' ? 'E2E_PACKAGED=1' : process.env.E2E_DEV === '1' ? 'E2E_DEV=1' : '';
const RUN_COMMAND = [
  'GUI_BASELINE_EVIDENCE_DIR=<task-owned-evidence-dir>',
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
  contractRoute: string;
  contractState: string;
  anchors: AnchorTarget[];
  coverageGaps: GuiBaselineCoverageGap[];
  verifyBackdrop?: boolean;
  accessibilityRoot?: string;
  escapeSelector?: string;
  setup: (page: Page) => Promise<Record<string, string | number | boolean>>;
  layoutChecks: (page: Page) => Promise<GuiBaselineLayoutCheck[]>;
};
type VisualTargetDefinition = Omit<
  VisualTarget,
  'screenshotName' | 'viewport' | 'theme' | 'locale' | 'contractRoute' | 'contractState'
>;

function resolveAppRepoRoot(): string {
  const explicit = process.env.OPL_APP_REPO_ROOT;
  if (explicit) return fs.realpathSync(explicit);
  let current = REPO_ROOT;
  while (true) {
    const candidate = path.join(current, 'one-person-lab-app');
    if (fs.existsSync(path.join(candidate, '.git'))) return fs.realpathSync(candidate);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Set OPL_APP_REPO_ROOT to the canonical one-person-lab-app checkout');
}

function resolveEvidenceRoot(): string {
  const explicit = process.env.GUI_BASELINE_EVIDENCE_DIR;
  if (!explicit) throw new Error('Set GUI_BASELINE_EVIDENCE_DIR to a task-owned evidence directory');
  const evidenceRoot = path.resolve(explicit);
  const relativeToRepo = path.relative(REPO_ROOT, evidenceRoot);
  if (relativeToRepo === '' || (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo))) {
    throw new Error('GUI_BASELINE_EVIDENCE_DIR must be outside the Shell worktree');
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  return fs.realpathSync(evidenceRoot);
}

async function takeEvidenceScreenshot(page: Page, evidenceRoot: string, sceneId: string): Promise<string> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sceneId)) {
    throw new Error(`GUI baseline scene id is not output-safe: ${sceneId}`);
  }
  const screenshotPath = path.join(evidenceRoot, 'screenshots', `${sceneId}.png`);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}

function bindTargetsToAppContract(
  contract: AppGuiVisualReferenceContract,
  definitions: VisualTargetDefinition[]
): VisualTarget[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  if (byId.size !== definitions.length)
    throw new Error('Shell GUI visual target definitions contain duplicate scene ids');
  const targets = contract.scene_matrix.map((scene) => {
    const definition = byId.get(scene.id);
    if (!definition) throw new Error(`Shell GUI harness has no implementation for App scene ${scene.id}`);
    const viewport = contract.capture_contract.supported_viewports[scene.viewport];
    if (!viewport) throw new Error(`App scene ${scene.id} has no supported viewport binding`);
    return {
      ...definition,
      screenshotName: `gui-baseline/${scene.id}`,
      viewport: { name: scene.viewport, ...viewport },
      theme: scene.theme,
      locale: scene.locale,
      contractRoute: scene.route,
      contractState: scene.state,
    };
  });
  if (targets.length !== definitions.length) {
    const unknown = definitions.filter(
      (definition) => !contract.scene_matrix.some((scene) => scene.id === definition.id)
    );
    throw new Error(
      `Shell GUI harness defines scenes absent from App authority: ${unknown.map((scene) => scene.id).join(', ')}`
    );
  }
  return targets;
}

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
    const content = active?.querySelector<HTMLElement>('.arco-btn-content') ?? active;
    const icon = active?.querySelector<HTMLElement>('[data-testid^="starter-icon-"]');
    const label = content ? Array.from(content.children).find((child) => child !== icon) : null;
    if (!active || !inactive || !content || !icon || !(label instanceof HTMLElement)) return null;

    const activeRect = active.getBoundingClientRect();
    const inactiveRect = inactive.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const style = window.getComputedStyle(active);
    const contentStyle = window.getComputedStyle(content);
    return {
      activeHeight: activeRect.height,
      inactiveHeight: inactiveRect.height,
      rowTopDelta: Math.abs(activeRect.top - inactiveRect.top),
      iconLabelCenterDelta: Math.abs(iconRect.top + iconRect.height / 2 - (labelRect.top + labelRect.height / 2)),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      alignItems: contentStyle.alignItems,
      labelClientWidth: label.clientWidth,
      labelScrollWidth: label.scrollWidth,
      labelOverflowX: window.getComputedStyle(label).overflowX,
      labelTextOverflow: window.getComputedStyle(label).textOverflow,
    };
  });

  const passed = Boolean(
    geometry &&
    Math.abs(geometry.activeHeight - 34) <= 1 &&
    Math.abs(geometry.activeHeight - geometry.inactiveHeight) <= 1 &&
    geometry.rowTopDelta <= 1 &&
    geometry.iconLabelCenterDelta <= 1 &&
    geometry.fontSize === '13px' &&
    geometry.lineHeight === '18px' &&
    geometry.fontWeight === '500' &&
    geometry.alignItems === 'center' &&
    geometry.labelScrollWidth <= geometry.labelClientWidth + 1 &&
    geometry.labelOverflowX === 'visible' &&
    geometry.labelTextOverflow !== 'ellipsis'
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
  const composerBox = await requiredBox(
    page.locator('[data-testid="guid-input-card-shell"]'),
    'home_backdrop_clears_stale_pixels_composer'
  );
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
  const inset = Math.min(4, Math.max(2, box.width / 100));
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
  let sampledPixels = 0;
  let excludedPixels = 0;
  const pixelCount = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const pixelIndex = offset / info.channels;
    const column = pixelIndex % info.width;
    const row = Math.floor(pixelIndex / info.width);
    const viewportX = (left + column + 0.5) / scaleX;
    const viewportY = (top + row + 0.5) / scaleY;
    const composerShadowInset = 8;
    const coveredByComposer =
      viewportX >= composerBox.x - composerShadowInset &&
      viewportX <= composerBox.x + composerBox.width + composerShadowInset &&
      viewportY >= composerBox.y - composerShadowInset &&
      viewportY <= composerBox.y + composerBox.height + composerShadowInset;
    if (coveredByComposer) {
      excludedPixels += 1;
      continue;
    }

    sampledPixels += 1;
    const matchesBackground =
      Math.abs(data[offset] - background.red) <= 6 &&
      Math.abs(data[offset + 1] - background.green) <= 6 &&
      Math.abs(data[offset + 2] - background.blue) <= 6 &&
      data[offset + 3] >= 250;
    if (matchesBackground) matchingPixels += 1;
  }

  const matchingRatio = sampledPixels > 0 ? matchingPixels / sampledPixels : 0;
  const passed = background.alpha >= 250 && sampledPixels >= 16 && matchingRatio >= 0.97;
  return {
    id: 'home_backdrop_clears_stale_pixels',
    passed,
    details: `computed=${background.css} alpha=${background.alpha} bottom_band_match=${matchingRatio.toFixed(3)} sampled_pixels=${sampledPixels} excluded_composer_pixels=${excludedPixels} band_pixels=${pixelCount}`,
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
  const trigger = page.locator('[data-testid="acp-sendbox-decision-controls"] .sendbox-model-btn').first();
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(page.locator('[data-testid="opl-codex-session-menu"]')).toBeVisible();
}

async function openHomeModelMenu(page: Page): Promise<void> {
  const trigger = page.locator('[data-testid="guid-model-selector"]');
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(page.locator('[data-testid="opl-codex-session-menu"]')).toBeVisible();
}

async function openHomeCapabilityPalette(page: Page): Promise<void> {
  const trigger = page.locator('[data-testid="file-upload-btn"]');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator('[data-testid="guid-capability-palette"]')).toBeVisible();
}

async function openConversationCommandMenu(page: Page): Promise<void> {
  const input = page.locator('[data-testid="conversation-composer"] textarea').first();
  await expect(input).toBeVisible();
  await input.fill('/');
  await expect(page.locator('[role="listbox"]')).toBeVisible();
}

async function openSettingsScene(
  page: Page,
  tab: 'general' | 'appearance' | 'capabilities' | 'environment',
  readySelector: string,
  route?: string
): Promise<void> {
  await goToSettings(page, tab);
  if (route) {
    await page.evaluate((target) => {
      window.location.hash = `#${target}`;
    }, route);
    await page.waitForFunction((target) => window.location.hash === `#${target}`, route, { timeout: 10_000 });
  }
  await expect(page.locator(readySelector)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.arco-message')).toHaveCount(0, { timeout: 10_000 });
  await waitForStablePaint(page);
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
  target: VisualTarget,
  evidenceRoot: string
): Promise<void> {
  await applyAppearance(page, electronApp, target.viewport, target.theme, target.locale);
  const state = await target.setup(page);
  const anchors = await collectAnchors(page, target.anchors);
  const layoutChecks = await target.layoutChecks(page);
  for (const check of layoutChecks) {
    expect(check.passed, `${check.id}: ${check.details}`).toBe(true);
  }

  const route = await page.evaluate(() => window.location.hash.replace(/^#/, ''));
  const expectedRoutePattern = new RegExp(
    `^${target.contractRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z0-9_]+/g, '[^/?#]+')}$`
  );
  expect(route, `${target.id}: route must match App-owned contract ${target.contractRoute}`).toMatch(
    expectedRoutePattern
  );
  const screenshotPath = await takeEvidenceScreenshot(page, evidenceRoot, target.id);
  const screenshotChecks =
    target.id.startsWith('home-') && target.verifyBackdrop !== false
      ? [await homeBackdropPaintCheck(page, screenshotPath)]
      : [];
  for (const check of screenshotChecks) {
    expect(check.passed, `${check.id}: ${check.details}`).toBe(true);
  }
  const accessibility = await collectGuiBaselineAccessibility(page, {
    rootSelector: target.accessibilityRoot ?? MAIN_CONTENT_SELECTOR,
    escapeSelector: target.escapeSelector,
  });
  expect(accessibility.focus.escape_outcome, `${target.id}: ${JSON.stringify(accessibility.focus)}`).not.toBe(
    'overlay_not_closed'
  );
  writer.add({
    id: target.id,
    shell_head: shellHead,
    route,
    viewport: target.viewport,
    theme: target.theme,
    locale: target.locale,
    state: { ...state, contract_state: target.contractState },
    screenshot_path: path.relative(evidenceRoot, screenshotPath),
    anchors,
    layout_checks: [...layoutChecks, ...screenshotChecks],
    coverage_gaps: target.coverageGaps,
    accessibility,
  });
}

function buildTargets(conversationId: string): VisualTargetDefinition[] {
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
      id: 'home-default-desktop-light-zh',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_input', '[data-testid="guid-input-card-shell"]'),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [
        {
          id: 'installed_package_home_starters',
          reason:
            'Package-discovered Home starters require installed-cohort evidence and are not injected by source E2E.',
        },
      ],
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
      id: 'home-default-narrow-light-en',
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
        await homeComposerVisualCheck(page, 'rgb(255, 255, 255)', false),
      ],
    },
    {
      id: 'home-model-menu-desktop-light-en',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_input', '[data-testid="guid-input-card-shell"]'),
        anchor('home_model_control', '[data-testid="guid-model-selector"]'),
        anchor('home_model_menu', '[data-testid="opl-codex-session-menu"]'),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [],
      escapeSelector: '[data-testid="opl-codex-session-menu"]',
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, true);
        await expectHomeLocale(page, 'en-US');
        await openHomeModelMenu(page);
        return { route_kind: 'home', rail: 'expanded', model_menu: 'open' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await viewportCheck(
          page,
          'home_model_menu_within_viewport',
          '.arco-dropdown-menu:visible, [role="menu"]:visible'
        ),
        await textOverflowCheck(page, 'home_model_menu_text_does_not_overflow', MAIN_CONTENT_SELECTOR),
        await homeComposerVisualCheck(page, 'rgb(255, 255, 255)', false),
      ],
    },
    {
      id: 'home-capability-palette-desktop-dark-zh',
      anchors: [
        anchor('home_route', '[data-testid="opl-guid-entry"]'),
        anchor('home_capability_palette_trigger', '[data-testid="file-upload-btn"][aria-expanded="true"]'),
        anchor('home_capability_palette', '[data-testid="guid-capability-palette"]'),
        anchor('home_capability_palette_search', '[data-testid="guid-capability-palette-search"]'),
      ],
      coverageGaps: [],
      verifyBackdrop: false,
      escapeSelector: '[data-testid="guid-capability-palette"]',
      setup: async (page) => {
        await goToGuid(page);
        await setNavigationRailExpanded(page, true);
        await expectHomeLocale(page, 'zh-CN');
        await openHomeCapabilityPalette(page);
        return { route_kind: 'home', rail: 'expanded', capability_palette: 'open' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await viewportCheck(page, 'home_capability_palette_within_viewport', '[data-testid="guid-capability-palette"]'),
        await textOverflowCheck(
          page,
          'home_capability_palette_text_does_not_overflow',
          '[data-testid="guid-capability-palette"]'
        ),
      ],
    },
    {
      id: 'rail-selected-desktop-light-en',
      anchors: [
        anchor('rail_selected_conversation', `#c-${conversationId}[data-selected="true"][aria-current="page"]`),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await setNavigationRailExpanded(page, true);
        await expectConversationLocale(page, 'en-US');
        const selectedRow = page.locator(`#c-${conversationId}`);
        await selectedRow.scrollIntoViewIfNeeded();
        await expect(selectedRow).toHaveAttribute('aria-current', 'page');
        return { route_kind: 'ordinary_conversation', rail: 'expanded', rail_row: 'selected' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await viewportCheck(page, 'selected_rail_row_within_viewport', `#c-${conversationId}`),
        await textOverflowCheck(page, 'selected_rail_row_text_does_not_overflow', NAVIGATION_RAIL_SELECTOR),
      ],
    },
    {
      id: 'conversation-default-desktop-light-zh',
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
        await expectConversationLocale(page, 'zh-CN');
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', composer: 'decision_ready' };
      },
      layoutChecks: conversationChecks,
    },
    {
      id: 'conversation-model-menu-desktop-dark-en',
      anchors: [
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_model_control', '[data-testid="acp-sendbox-decision-controls"] .sendbox-model-btn'),
        anchor('conversation_model_menu', '[data-testid="opl-codex-session-menu"]'),
      ],
      coverageGaps: [],
      escapeSelector: '[data-testid="opl-codex-session-menu"]',
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await openConversationModelMenu(page);
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', model_menu: 'open' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await viewportCheck(page, 'conversation_model_menu_within_viewport', '[data-testid="opl-codex-session-menu"]'),
        await textOverflowCheck(
          page,
          'conversation_model_menu_text_does_not_overflow',
          '[data-testid="opl-codex-session-menu"]'
        ),
      ],
    },
    {
      id: 'conversation-command-menu-desktop-light-en',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('conversation_command_menu', '[role="listbox"]'),
        anchor('conversation_command_option', '[role="listbox"] [role="option"]'),
      ],
      coverageGaps: [],
      escapeSelector: '[role="listbox"]',
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await expectConversationLocale(page, 'en-US');
        await openConversationCommandMenu(page);
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', command_menu: 'open' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await viewportCheck(page, 'conversation_command_menu_within_viewport', '[role="listbox"]'),
        await textOverflowCheck(page, 'conversation_command_menu_text_does_not_overflow', '[role="listbox"]'),
      ],
    },
    {
      id: 'conversation-default-narrow-dark-zh',
      anchors: [
        anchor('conversation_timeline', '[data-testid="message-list-scroller"]'),
        anchor('conversation_composer', '[data-testid="conversation-composer"]'),
        anchor('narrow_rail_closed', `${NAVIGATION_RAIL_SELECTOR}.collapsed`, 'attached'),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await setNavigationRailExpanded(page, false);
        await expectConversationLocale(page, 'zh-CN');
        return { route_kind: 'ordinary_conversation', fixture: 'persisted_with_workspace', composer: 'narrow' };
      },
      layoutChecks: async (page) => [
        ...(await conversationChecks(page)),
        await viewportCheck(
          page,
          'narrow_conversation_composer_within_viewport',
          '[data-testid="conversation-composer"]'
        ),
      ],
    },
    {
      id: 'rail-hover-actions-desktop-dark-zh',
      anchors: [
        anchor('rail_hovered_conversation', `#c-${conversationId}:hover`),
        anchor('rail_hover_actions', `#c-${conversationId} > div.absolute`),
        anchor('rail_hover_edit_action', `#c-${conversationId} > div.absolute > span`),
        anchor('desktop_rail_expanded', `${NAVIGATION_RAIL_SELECTOR}:not(.collapsed)`),
      ],
      coverageGaps: [],
      setup: async (page) => {
        await openFixtureConversation(page, conversationId, 'closed');
        await setNavigationRailExpanded(page, true);
        await expectConversationLocale(page, 'zh-CN');
        const hoveredRow = page.locator(`#c-${conversationId}`);
        await hoveredRow.scrollIntoViewIfNeeded();
        await hoveredRow.hover();
        await expect(page.locator(`#c-${conversationId} > div.absolute`)).toBeVisible();
        return { route_kind: 'ordinary_conversation', rail: 'expanded', rail_row: 'hover_actions_visible' };
      },
      layoutChecks: async (page) => [
        ...(await railMainChecks(page)),
        await viewportCheck(page, 'rail_hover_actions_within_viewport', `#c-${conversationId} > div.absolute`),
        await textOverflowCheck(page, 'rail_hover_row_text_does_not_overflow', `#c-${conversationId}`),
      ],
    },
    ...buildSettingsTargets(),
  ];
}

function buildSettingsTargets(): VisualTargetDefinition[] {
  const settingsTarget = (
    id: string,
    tab: 'general' | 'appearance' | 'capabilities' | 'environment',
    pageSelector: string,
    primarySelector: string,
    route?: string
  ): VisualTargetDefinition => ({
    id,
    accessibilityRoot: '.settings-page-wrapper',
    anchors: [
      anchor('settings_page_wrapper', '.settings-page-wrapper'),
      anchor('settings_page_content', '.settings-page-content'),
      anchor('settings_page', pageSelector),
      anchor('settings_primary', primarySelector),
    ],
    coverageGaps: [],
    setup: async (page) => {
      await openSettingsScene(page, tab, pageSelector, route);
      return { route_kind: `settings_${tab}`, settings_page: 'ready' };
    },
    layoutChecks: async (page) => [
      await viewportCheck(page, `${id}_within_viewport`, '.settings-page-wrapper'),
      await textOverflowCheck(page, `${id}_text_does_not_overflow`, '.settings-page-content'),
    ],
  });

  return [
    settingsTarget(
      'settings-general-desktop-light-zh',
      'general',
      '[data-testid="settings-page-overview"]',
      '[data-testid="settings-overview-primary"]'
    ),
    settingsTarget(
      'settings-appearance-desktop-dark-en',
      'appearance',
      '[data-testid="settings-page-preferences"]',
      '[data-testid="settings-preferences-primary"]'
    ),
    settingsTarget(
      'settings-capabilities-desktop-light-en',
      'capabilities',
      '[data-testid="settings-page-capabilities"]',
      '[data-testid="settings-capabilities-primary"]'
    ),
    settingsTarget(
      'settings-maintenance-desktop-dark-zh',
      'environment',
      '[data-testid="settings-page-maintenance"]',
      '[data-testid="settings-maintenance-primary"]',
      '/settings/environment?section=updates'
    ),
    settingsTarget(
      'settings-general-narrow-light-en',
      'general',
      '[data-testid="settings-page-overview"]',
      '[data-testid="settings-overview-primary"]'
    ),
    settingsTarget(
      'settings-capabilities-narrow-dark-zh',
      'capabilities',
      '[data-testid="settings-page-capabilities"]',
      '[data-testid="settings-capabilities-primary"]'
    ),
  ];
}

test.describe.configure({ timeout: 240_000 });

test('writes App-contract-bound GUI baseline evidence for all 16 scenes', async ({ page, electronApp }) => {
  test.skip(!process.env.E2E_SCREENSHOTS, 'GUI baseline evidence is opt-in');

  const evidenceRoot = resolveEvidenceRoot();
  const shellHead = requireCleanShellHead(REPO_ROOT);
  const appVisualReference = readAppGuiVisualReferenceContract(resolveAppRepoRoot());
  const writer = new GuiBaselineManifestWriter(
    REPO_ROOT,
    evidenceRoot,
    path.join(evidenceRoot, 'gui-baseline-manifest.json'),
    shellHead,
    RUN_COMMAND,
    appVisualReference.binding
  );
  let conversationId: string | null = null;
  let originalSettings: ClientSettings | null = null;

  initializeFixtureWorkspace();

  try {
    await goToGuid(page);
    await ensureRendererReady(page);
    originalSettings = await httpGet<ClientSettings>(page, '/api/settings/client');
    await removeFixtureConversations(page);
    conversationId = await createFixtureConversation(page);

    const targets = bindTargetsToAppContract(appVisualReference.contract, buildTargets(conversationId));
    expect(targets).toHaveLength(16);
    for (const target of targets) {
      // Evidence states intentionally share one Electron window and must run in order.
      // eslint-disable-next-line no-await-in-loop
      await captureTarget(page, electronApp, writer, shellHead, target, evidenceRoot);
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
