import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { createRuntimeV2Projection } from '../../unit/opl-runtime/runtime-v2/fixture';
import {
  closeRuntimeE2EFixture,
  executeRuntimeE2EVisibilityAction,
  launchRuntimeE2EFixture,
  readRuntimeE2EActionLog,
  readRuntimeE2EAppState,
  type RuntimeE2EAppState,
  type RuntimeE2EFixture,
  type RuntimeE2ELocale,
} from './runtimeFixture';

const VIEWPORTS = [
  { width: 1440, height: 960, columns: 4 },
  { width: 1024, height: 900, columns: 2 },
  { width: 768, height: 900, columns: 2 },
  { width: 375, height: 812, columns: 1 },
] as const;

const WRAP_REGRESSION_VIEWPORT = { width: 1370, height: 900, columns: 2 } as const;
const PROJECT_NAMES = ['DM-CVD-Mortality-Risk', 'NF-PitNET', 'Obesity'] as const;
const ORAL_PROJECT_NAMES = ['糖尿病', '无功能垂体瘤', '肥胖'] as const;

const VISIBLE_WORK_ITEM_NAMES = [
  '001 DM CVD Mortality Risk',
  '002 DM China US Mortality Attribution',
  '003 DPCC Primary Care Phenotype Treatment Gap',
  '004 DPCC Longitudinal Care Inertia Gap',
  'NF-PitNET Paper 1',
  'NF-PitNET Paper 2',
  'NF-PitNET Paper 3',
  'NF-PitNET Paper 4',
  'Obesity Paper 1',
] as const;

const LOCALES = [
  {
    id: 'zh-CN',
    allAgents: '全部智能体',
    deliveredStatus: '已交付，自动暂停',
    stoppedStatus: '已停止',
    nextStep: '下一步：补齐投稿信息或发起修订',
    actionTitle: '补齐投稿信息或发起修订',
    actionSummary: '里程碑已交付；请补齐投稿信息，或在需要修订时重新启动任务。',
    owner: '负责人：你',
    forbiddenAction: 'Provide submission details or request a revision',
  },
  {
    id: 'en-US',
    allAgents: 'All agents',
    deliveredStatus: 'Delivered, auto-paused',
    stoppedStatus: 'Stopped',
    nextStep: 'Next step: Provide submission details or request a revision',
    actionTitle: 'Provide submission details or request a revision',
    actionSummary:
      'The milestone is delivered. Provide submission details, or restart the task when a revision is needed.',
    owner: 'Owner: You',
    forbiddenAction: '补齐投稿信息或发起修订',
  },
] as const;

type RawWorkItem = RuntimeE2EAppState['app_state']['operator']['workbench']['work_item_projection_v2']['items'][number];

function rawWorkItem(state: RuntimeE2EAppState, projectId: string, workItemId: string): RawWorkItem {
  const item = state.app_state.operator.workbench.work_item_projection_v2.items.find(
    (candidate) =>
      candidate.identity.agent_id === 'mas' &&
      candidate.identity.project_id === projectId &&
      candidate.identity.work_item_id === workItemId
  );
  if (!item) throw new Error(`Missing Runtime E2E work item mas/${projectId}/${workItemId}.`);
  return item;
}

async function setViewport(
  page: Page,
  app: ElectronApplication,
  viewport: { width: number; height: number }
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!window) throw new Error('Runtime V2 E2E could not resolve the main BrowserWindow.');
    window.setMinimumSize(0, 0);
    window.setContentSize(size.width, size.height);
  }, viewport);
  await page.setViewportSize(viewport);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('[data-testid="runtime-v2-page"]')?.scrollTo(0, 0);
  });
  await expect
    .poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })))
    .toEqual({ width: viewport.width, height: viewport.height });
  await page.locator('[data-testid="runtime-scope-bar"]').scrollIntoViewIfNeeded();
}

async function launchLocalizedFixture(locale: RuntimeE2ELocale): Promise<RuntimeE2EFixture> {
  const nextFixture = await launchRuntimeE2EFixture({ locale });
  const { page } = nextFixture;
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/runtime`);
  await expect(page.locator('[data-testid="runtime-v2-page"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__initialLanguage)).toBe(locale);
  return nextFixture;
}

async function assertTextWrapsAtWordBoundaries(locator: Locator): Promise<void> {
  const splitWords = await locator.evaluate((element) => {
    const words: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();
    while (currentNode) {
      const textNode = currentNode as Text;
      const value = textNode.textContent ?? '';
      for (const match of value.matchAll(/[A-Za-z]+/g)) {
        if (match.index === undefined) continue;
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + match[0].length);
        const lineTops = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)));
        if (lineTops.size > 1) words.push(match[0]);
      }
      currentNode = walker.nextNode();
    }
    return words;
  });
  expect(splitWords, `Words split across lines in ${await locator.textContent()}`).toEqual([]);
}

async function assertLongTokenUsesFallbackWrapping(locator: Locator): Promise<void> {
  const metrics = await locator.evaluate((element, longToken) => {
    element.textContent = longToken;
    const row = element.closest<HTMLElement>('[data-testid="runtime-task-row"]');
    if (!row) throw new Error('Runtime title is not inside a task row.');
    const rowRect = row.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects());
    return {
      wraps: new Set(rects.map((rect) => Math.round(rect.top))).size > 1,
      fits: rects.every((rect) => rect.left >= rowRect.left - 1 && rect.right <= rowRect.right + 1),
    };
  }, 'RuntimeProjectionIdentifier'.repeat(12));
  expect(metrics).toEqual({ wraps: true, fits: true });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const readDimensions = () =>
    page.evaluate(() => {
      const runtimePage = document.querySelector<HTMLElement>('[data-testid="runtime-v2-page"]');
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        runtimeClientWidth: runtimePage?.clientWidth ?? 0,
        runtimeScrollWidth: runtimePage?.scrollWidth ?? 0,
      };
    });
  await expect
    .poll(async () => {
      const dimensions = await readDimensions();
      return {
        documentFits: dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1,
        bodyFits: dimensions.bodyScrollWidth <= dimensions.bodyClientWidth + 1,
        runtimeFits: dimensions.runtimeScrollWidth <= dimensions.runtimeClientWidth + 1,
      };
    })
    .toEqual({ documentFits: true, bodyFits: true, runtimeFits: true });
  const dimensions = await readDimensions();
  const diagnostics = JSON.stringify(dimensions);
  expect(dimensions.documentScrollWidth, diagnostics).toBeLessThanOrEqual(dimensions.documentClientWidth + 1);
  expect(dimensions.bodyScrollWidth, diagnostics).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1);
  expect(dimensions.runtimeScrollWidth, diagnostics).toBeLessThanOrEqual(dimensions.runtimeClientWidth + 1);
}

async function assertStatusLabelsAreNotClipped(page: Page): Promise<void> {
  const clippedLabels = await page
    .locator('[data-testid="runtime-task-row"] .arco-tag-content')
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
        )
        .map((element) => element.textContent ?? '')
    );
  expect(clippedLabels).toEqual([]);
}

async function resetRuntimeScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    let element: HTMLElement | null = document.querySelector('[data-testid="runtime-scope-bar"]');
    while (element) {
      element.scrollTop = 0;
      element = element.parentElement;
    }
  });
}

async function assertElementsWithinViewport(page: Page, selectors: string[]): Promise<void> {
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  }));
  for (const selector of selectors) {
    const locator = page.locator(selector);
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${selector} should have a layout box`).not.toBeNull();
    if (!box) continue;
    expect(box.x, `${selector} should not be clipped on the left`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${selector} should not be clipped on the right`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y, `${selector} should not be clipped above the viewport`).toBeGreaterThanOrEqual(-1);
  }
}

async function gridColumnCount(page: Page): Promise<number> {
  return page
    .locator('[data-testid="runtime-task-row"]')
    .first()
    .evaluate((row) => {
      const value = getComputedStyle(row).gridTemplateColumns.trim();
      return value ? value.split(/\s+/).length : 0;
    });
}

async function assertOptionIsTopmost(page: Page, label: string): Promise<void> {
  const option = page.getByRole('option', { name: label, exact: true });
  await expect(option).toBeVisible();
  await expect
    .poll(() =>
      option.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(hit && element.contains(hit));
      })
    )
    .toBe(true);
}

async function waitForSelectPopupToClose(page: Page): Promise<void> {
  await expect(page.locator('.arco-select-popup')).toHaveCount(0);
}

async function selectRuntimeOption(page: Page, selectorTestId: string, label: string): Promise<void> {
  await page.locator(`[data-testid="${selectorTestId}"]`).click();
  await assertOptionIsTopmost(page, label);
  await page.getByRole('option', { name: label, exact: true }).click();
  await waitForSelectPopupToClose(page);
}

async function waitForDrawerToDock(page: Page, drawer: ReturnType<Page['locator']>): Promise<void> {
  const drawerPanel = drawer.locator('.arco-drawer');
  await expect
    .poll(async () => {
      const box = await drawerPanel.boundingBox();
      if (!box) return null;
      const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
      return {
        width: Math.round(box.width),
        rightGap: Math.round(viewportWidth - box.x - box.width),
      };
    })
    .toEqual({ width: 680, rightGap: 0 });
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

let fixture: RuntimeE2EFixture | null = null;

test.beforeAll(async () => {
  fixture = await launchLocalizedFixture('zh-CN');
});

test.afterAll(async () => {
  await closeRuntimeE2EFixture(fixture);
  fixture = null;
});

test('uses canonical workspace directory names for every project and work item', () => {
  const projection = createRuntimeV2Projection();

  expect(projection.project_catalog.map((project) => project.display_name)).toEqual(PROJECT_NAMES);
  for (const project of projection.project_catalog) {
    expect(path.basename(project.workspace_path)).toBe(project.display_name);
  }
  for (const item of projection.items) {
    expect(path.basename(item.identity.workspace_path)).toBe(item.identity.project_display_name);
  }
  expect(projection.items.filter((item) => item.identity.work_item_id === '001').map((item) => item.item_id)).toEqual([
    'diabetes:001',
    'nf-pitnet:001',
  ]);
  for (const oralName of ORAL_PROJECT_NAMES) {
    expect(projection.project_catalog.map((project) => project.display_name)).not.toContain(oralName);
  }
});

test('localizes lifecycle decisions while keeping project names stable at every acceptance width', async () => {
  if (!fixture) throw new Error('Runtime V2 E2E fixture was not launched.');

  for (const locale of LOCALES) {
    if (locale.id !== 'zh-CN') {
      await closeRuntimeE2EFixture(fixture);
      fixture = await launchLocalizedFixture(locale.id);
    }
    const { app, page, screenshotDir } = fixture;
    await setViewport(page, app, VIEWPORTS[0]);

    await expect(page.locator('[data-testid="runtime-agent-selector"]')).toBeVisible();
    await expect(page.locator('[data-testid="runtime-project-selector"]')).toBeDisabled();
    for (const name of VISIBLE_WORK_ITEM_NAMES) {
      await expect(page.getByText(name, { exact: true })).toHaveCount(1);
    }
    for (const projectName of PROJECT_NAMES) {
      await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible();
    }
    for (const oralName of ORAL_PROJECT_NAMES) {
      await expect(page.locator('[data-testid="runtime-v2-page"]')).not.toContainText(oralName);
    }

    await selectRuntimeOption(page, 'runtime-agent-selector', 'Med Auto Science');
    await expect(page.locator('[data-testid="runtime-project-selector"]')).toBeEnabled();
    await page.locator('[data-testid="runtime-project-selector"]').click();
    for (const projectName of PROJECT_NAMES) {
      await expect(page.getByRole('option', { name: projectName, exact: true })).toBeVisible();
    }
    await assertOptionIsTopmost(page, PROJECT_NAMES[0]);
    await page.getByRole('option', { name: PROJECT_NAMES[0], exact: true }).click();
    await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(4);
    await selectRuntimeOption(page, 'runtime-agent-selector', locale.allAgents);
    await expect(page.locator('[data-testid="runtime-project-selector"]')).toBeDisabled();
    await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9);

    const deliveredRow = page
      .locator('[data-testid="runtime-task-row"]')
      .filter({ hasText: '002 DM China US Mortality Attribution' });
    await expect(deliveredRow.locator('[data-runtime-status="delivered_auto_paused"]')).toHaveText(
      locale.deliveredStatus
    );
    await expect(deliveredRow).toContainText(locale.nextStep);
    await expect(deliveredRow).toContainText(locale.owner);
    await expect(deliveredRow).not.toContainText(locale.forbiddenAction);

    const stoppedRow = page.locator('[data-testid="runtime-task-row"]').filter({ hasText: 'NF-PitNET Paper 1' });
    await expect(stoppedRow.locator('[data-runtime-status="stopped"]')).toHaveText(locale.stoppedStatus);
    if (locale.id === 'en-US') {
      for (const forbidden of [
        ...ORAL_PROJECT_NAMES,
        '已交付，自动暂停',
        '当前不再推进',
        '补齐投稿信息或发起修订',
        '负责人：你',
        '分析结果复核',
        '医学写作',
        '研究方向确认',
        '研究设计',
      ]) {
        await expect(page.locator('[data-testid="runtime-v2-page"]')).not.toContainText(forbidden);
      }
    }

    await expect(page.locator('[data-testid="runtime-status-region"]')).not.toContainText('Med Auto Science');
    await expect(deliveredRow).toContainText('1,500');
    await expect(deliveredRow).not.toContainText('runtime_token_telemetry_verification');
    await expect(page.locator('[data-testid="runtime-work-item-list"]')).not.toContainText('attempt:dm001');
    await expect(page.locator('[data-testid="runtime-work-item-list"]')).not.toContainText('workflow:dm001');
    const availability = page.locator('[data-testid="runtime-agent-availability"]');
    await expect(availability).toContainText(locale.id === 'zh-CN' ? '5 个智能体可用' : '5 agents available');
    await expect(availability.locator('.arco-collapse-item-active')).toHaveCount(0);

    for (const viewport of VIEWPORTS) {
      await setViewport(page, app, viewport);
      if (viewport.width > 1180) {
        await expect(page.locator('[data-testid="runtime-status-views"] input[type="radio"]')).toHaveCount(7);
      } else {
        await page.locator('[data-testid="runtime-status-view-select"]').click();
        await expect(page.getByRole('option')).toHaveCount(7);
        await page.keyboard.press('Escape');
        await waitForSelectPopupToClose(page);
      }
      await resetRuntimeScroll(page);
      await expect.poll(() => gridColumnCount(page)).toBe(viewport.columns);
      await assertNoHorizontalOverflow(page);
      await assertStatusLabelsAreNotClipped(page);
      await assertElementsWithinViewport(page, [
        '[data-testid="runtime-scope-bar"]',
        '[data-testid="runtime-agent-selector"]',
        '[data-testid="runtime-project-selector"]',
        '[data-testid="runtime-refresh-button"]',
        '[data-testid="runtime-status-region"]',
        viewport.width > 1180 ? '[data-testid="runtime-status-views"]' : '[data-testid="runtime-status-view-select"]',
        '[data-testid="runtime-work-item-list"]',
      ]);
      await page.screenshot({
        path: path.join(screenshotDir, `runtime-v2-${locale.id}-${viewport.width}.png`),
        fullPage: true,
      });
      if (viewport.width === 375) {
        const firstTask = page.locator('[data-testid="runtime-task-row"]').first();
        await firstTask.scrollIntoViewIfNeeded();
        await expect(firstTask).toBeInViewport();
        await page.screenshot({ path: path.join(screenshotDir, `runtime-v2-${locale.id}-375-tasks.png`) });
      }
    }

    await setViewport(page, app, VIEWPORTS[0]);
    await deliveredRow.click();
    const drawer = page.locator('[data-testid="runtime-task-detail"]');
    await expect(drawer).toBeVisible();
    await waitForDrawerToDock(page, drawer);
    const nextAction = drawer.locator('[data-testid="runtime-next-action"]');
    await expect(nextAction).toContainText(locale.actionTitle);
    await expect(nextAction).toContainText(locale.actionSummary);
    await expect(nextAction).toContainText(locale.owner);
    await expect(nextAction).not.toContainText(locale.forbiddenAction);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(screenshotDir, `runtime-v2-${locale.id}-action-detail.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  }

  await closeRuntimeE2EFixture(fixture);
  fixture = await launchLocalizedFixture('zh-CN');
});

test('persists archive and restore by canonical identity without changing runtime truth', async () => {
  if (!fixture) throw new Error('Runtime V2 E2E fixture was not launched.');
  const { app, page, screenshotDir } = fixture;

  await setViewport(page, app, VIEWPORTS[0]);
  const initialState = readRuntimeE2EAppState(fixture);
  const initialDm001 = structuredClone(rawWorkItem(initialState, 'diabetes', '001'));
  const initialNf001 = structuredClone(rawWorkItem(initialState, 'nf-pitnet', '001'));
  expect(initialDm001.item_id).toBe('diabetes:001');
  expect(initialNf001.item_id).toBe('nf-pitnet:001');
  expect(initialDm001.identity.work_item_id).toBe(initialNf001.identity.work_item_id);
  expect(initialState.app_state.operator.workbench.work_item_projection_v2.summary).toMatchObject({
    work_item_count: 9,
    visible_work_item_count: 9,
    archived_work_item_count: 0,
    total_work_item_count: 9,
  });
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9);
  await expect(page.locator('[data-testid="runtime-open-archive"]')).toContainText('归档库（0）');

  const dm001Row = page
    .locator('[data-testid="runtime-task-row"]')
    .filter({ hasText: initialDm001.identity.work_item_display_name });
  await dm001Row.click();
  await page.locator('[data-testid="runtime-archive-work-item"]').click();
  const archiveConfirmation = page.locator('.arco-modal').filter({ hasText: '归档这项任务？' });
  await expect(archiveConfirmation).toBeVisible();
  await expect(archiveConfirmation).toContainText('只会从主总览隐藏');
  await expect(archiveConfirmation).toContainText('不会停止正在运行的自动流程');
  await expect(archiveConfirmation).toContainText('也不会删除证据');
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-archive-confirmation-zh-CN.png') });
  await archiveConfirmation.getByRole('button', { name: '归档任务', exact: true }).click();

  await expect(page.getByText('任务已归档', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="runtime-task-detail"]')).toBeHidden();
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(8);
  await expect(page.getByText(initialDm001.identity.work_item_display_name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(initialNf001.identity.work_item_display_name, { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-testid="runtime-open-archive"]')).toContainText('归档库（1）');

  const archivedState = readRuntimeE2EAppState(fixture);
  const archivedDm001 = rawWorkItem(archivedState, 'diabetes', '001');
  expect(archivedDm001.visibility).toMatchObject({ state: 'archived', generation: 4 });
  expect(archivedDm001.lifecycle).toEqual(initialDm001.lifecycle);
  expect(archivedDm001.execution).toEqual(initialDm001.execution);
  expect(archivedDm001.telemetry).toEqual(initialDm001.telemetry);
  expect(archivedDm001.telemetry.cumulative.total_tokens).toBe(initialDm001.telemetry.cumulative.total_tokens);
  expect(rawWorkItem(archivedState, 'nf-pitnet', '001')).toEqual(initialNf001);
  expect(archivedState.app_state.operator.workbench.work_item_projection_v2.summary).toMatchObject({
    work_item_count: 8,
    visible_work_item_count: 8,
    archived_work_item_count: 1,
    total_work_item_count: 9,
  });
  expect(readRuntimeE2EActionLog(fixture).at(-1)).toMatchObject({
    outcome: 'applied',
    item_id: 'diabetes:001',
    previous_generation: 3,
    resulting_generation: 4,
    payload: {
      agent_id: 'mas',
      project_id: 'diabetes',
      work_item_id: '001',
      visibility_state: 'archived',
      expected_generation: 3,
    },
  });

  const staleResult = executeRuntimeE2EVisibilityAction(fixture, {
    agent_id: 'mas',
    project_id: 'diabetes',
    work_item_id: '001',
    visibility_state: 'visible',
    expected_generation: 3,
    reason: 'e2e_stale_generation_probe',
  });
  expect(staleResult).toMatchObject({
    ok: false,
    reason_code: 'work_item_control_generation_conflict',
    error: {
      details: {
        expected_generation: 3,
        current_generation: 4,
      },
    },
  });
  const afterConflict = rawWorkItem(readRuntimeE2EAppState(fixture), 'diabetes', '001');
  expect(afterConflict.visibility).toMatchObject({ state: 'archived', generation: 4 });
  expect(afterConflict.lifecycle).toEqual(initialDm001.lifecycle);
  expect(afterConflict.execution).toEqual(initialDm001.execution);
  expect(afterConflict.telemetry).toEqual(initialDm001.telemetry);
  expect(afterConflict.telemetry.cumulative.total_tokens).toBe(initialDm001.telemetry.cumulative.total_tokens);
  expect(readRuntimeE2EActionLog(fixture).at(-1)).toMatchObject({
    outcome: 'generation_conflict',
    item_id: 'diabetes:001',
    previous_generation: 4,
    resulting_generation: 4,
  });

  await page.locator('[data-testid="runtime-open-archive"]').click();
  await expect(page.locator('[data-testid="runtime-archive-header"]')).toContainText('当前范围内共 1 项已归档任务');
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(1);
  await expect(page.getByText(initialDm001.identity.work_item_display_name, { exact: true })).toHaveCount(1);
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-archive-library-zh-CN.png'), fullPage: true });

  await page.getByText(initialDm001.identity.work_item_display_name, { exact: true }).click();
  await page.locator('[data-testid="runtime-restore-work-item"]').click();
  const restoreConfirmation = page.locator('.arco-modal').filter({ hasText: '恢复这项任务？' });
  await expect(restoreConfirmation).toBeVisible();
  await expect(restoreConfirmation).toContainText('自动流程和证据保持不变');
  await restoreConfirmation.getByRole('button', { name: '恢复任务', exact: true }).click();

  await expect(page.getByText('任务已恢复', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="runtime-task-detail"]')).toBeHidden();
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(0);
  await page.locator('[data-testid="runtime-archive-back"]').click();
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9);
  await expect(page.getByText(initialDm001.identity.work_item_display_name, { exact: true })).toHaveCount(1);
  await expect(page.getByText(initialNf001.identity.work_item_display_name, { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-testid="runtime-open-archive"]')).toContainText('归档库（0）');

  const restoredState = readRuntimeE2EAppState(fixture);
  const restoredDm001 = rawWorkItem(restoredState, 'diabetes', '001');
  expect(restoredDm001.visibility).toMatchObject({ state: 'visible', generation: 5 });
  expect(restoredDm001.lifecycle).toEqual(initialDm001.lifecycle);
  expect(restoredDm001.execution).toEqual(initialDm001.execution);
  expect(restoredDm001.telemetry).toEqual(initialDm001.telemetry);
  expect(restoredDm001.telemetry.cumulative.total_tokens).toBe(initialDm001.telemetry.cumulative.total_tokens);
  expect(rawWorkItem(restoredState, 'nf-pitnet', '001')).toEqual(initialNf001);
  expect(restoredState.app_state.operator.workbench.work_item_projection_v2.summary).toMatchObject({
    work_item_count: 9,
    visible_work_item_count: 9,
    archived_work_item_count: 0,
    total_work_item_count: 9,
  });
  expect(readRuntimeE2EActionLog(fixture).at(-1)).toMatchObject({
    outcome: 'applied',
    item_id: 'diabetes:001',
    previous_generation: 4,
    resulting_generation: 5,
    payload: {
      agent_id: 'mas',
      project_id: 'diabetes',
      work_item_id: '001',
      visibility_state: 'visible',
      expected_generation: 4,
    },
  });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-restored-zh-CN.png'), fullPage: true });
});

test('keeps stage detail and advanced evidence progressively disclosed', async () => {
  if (!fixture) throw new Error('Runtime V2 E2E fixture was not launched.');
  const { app, page, screenshotDir } = fixture;

  await setViewport(page, app, VIEWPORTS[0]);
  await page.locator('[data-testid="runtime-task-row"]').filter({ hasText: '001 DM CVD Mortality Risk' }).click();
  const drawer = page.locator('[data-testid="runtime-task-detail"]');
  await expect(drawer).toBeVisible();
  await waitForDrawerToDock(page, drawer);
  await expect(drawer.locator('[data-testid="runtime-stage-map"] [data-stage-state]')).toHaveCount(5);
  await expect(drawer).toContainText('分析结果复核');
  await expect(drawer.locator('[data-testid="runtime-next-action"]')).toContainText('继续推进');
  await expect(drawer).toContainText('产物');
  await expect(drawer).toContainText('时间线');
  await expect(drawer).toContainText('证据');
  await expect(drawer).toContainText('诊断');
  const disclosure = drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item');
  await expect(disclosure).toHaveCount(4);
  await expect(drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item-active')).toHaveCount(0);
  const drawerContent = drawer.locator('.arco-drawer-content');
  const detailDimensions = await drawerContent.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(detailDimensions.scrollWidth).toBeLessThanOrEqual(detailDimensions.clientWidth + 1);
  await disclosure.nth(1).locator('.arco-collapse-item-header').click();
  await disclosure.nth(2).locator('.arco-collapse-item-header').click();
  await expect(disclosure.nth(1)).toContainText('项目清单已读取');
  await expect(disclosure.nth(2)).toContainText('STUDY_STATUS.md');
  await expect(drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item-active')).toHaveCount(2);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-1440-detail-disclosure.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('keeps ordinary words intact while wrapping unbroken identifiers as a fallback', async () => {
  if (!fixture) throw new Error('Runtime V2 E2E fixture was not launched.');
  await closeRuntimeE2EFixture(fixture);
  fixture = await launchLocalizedFixture('en-US');
  const { app, page, screenshotDir } = fixture;

  await setViewport(page, app, WRAP_REGRESSION_VIEWPORT);
  await expect.poll(() => gridColumnCount(page)).toBe(WRAP_REGRESSION_VIEWPORT.columns);

  const description = page.getByText(
    "Choose an agent and project, then see each work item's status, current progress, next action, and observed usage.",
    { exact: true }
  );
  const missingUsage = page.getByText('Usage not recorded', { exact: true }).first();
  await expect(description).toBeVisible();
  await expect(missingUsage).toBeVisible();
  await expect
    .poll(() =>
      missingUsage.evaluate((element) => {
        const style = getComputedStyle(element);
        return { overflowWrap: style.overflowWrap, wordBreak: style.wordBreak };
      })
    )
    .toEqual({ overflowWrap: 'break-word', wordBreak: 'normal' });
  await assertTextWrapsAtWordBoundaries(description);
  await assertTextWrapsAtWordBoundaries(missingUsage);
  await Promise.all(
    VISIBLE_WORK_ITEM_NAMES.map((name) => assertTextWrapsAtWordBoundaries(page.getByText(name, { exact: true })))
  );
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-1370-en-US.png'), fullPage: true });

  await setViewport(page, app, VIEWPORTS[3]);
  const firstRow = page.locator('[data-testid="runtime-task-row"]').first();
  const firstTitle = firstRow.getByText(VISIBLE_WORK_ITEM_NAMES[0], { exact: true });
  await assertLongTokenUsesFallbackWrapping(firstTitle);
  await assertNoHorizontalOverflow(page);
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeInViewport();
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-375-long-token.png') });
});
