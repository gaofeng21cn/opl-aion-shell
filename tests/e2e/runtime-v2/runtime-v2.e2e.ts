import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { closeRuntimeE2EFixture, launchRuntimeE2EFixture, type RuntimeE2EFixture } from './runtimeFixture';

const VIEWPORTS = [
  { width: 1440, height: 960, columns: 4 },
  { width: 1024, height: 900, columns: 2 },
  { width: 768, height: 900, columns: 2 },
  { width: 375, height: 812, columns: 1 },
] as const;

const WRAP_REGRESSION_VIEWPORT = { width: 1370, height: 900, columns: 2 } as const;

const WORK_ITEM_NAMES = [
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

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let fixture: RuntimeE2EFixture | null = null;

test.beforeAll(async () => {
  fixture = await launchRuntimeE2EFixture();
  await fixture.page.evaluate(() => localStorage.setItem('i18nextLng', 'zh-CN'));
  await fixture.page.reload();
  const baseUrl = fixture.page.url().split('#')[0];
  await fixture.page.goto(`${baseUrl}#/runtime`);
  await expect(fixture.page.locator('[data-testid="runtime-v2-page"]')).toBeVisible({ timeout: 30_000 });
  await expect(fixture.page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9, { timeout: 30_000 });
});

test.afterAll(async () => {
  await closeRuntimeE2EFixture(fixture);
  fixture = null;
});

test('keeps Runtime V2 cognitively scoped and responsive at all acceptance widths', async () => {
  if (!fixture) throw new Error('Runtime V2 E2E fixture was not launched.');
  const { app, page, screenshotDir } = fixture;

  await expect(page.locator('[data-testid="runtime-agent-selector"]')).toBeVisible();
  await expect(page.locator('[data-testid="runtime-project-selector"]')).toBeDisabled();
  for (const name of WORK_ITEM_NAMES) {
    await expect(page.getByText(name, { exact: true })).toHaveCount(1);
  }

  await selectRuntimeOption(page, 'runtime-agent-selector', 'Med Auto Science');
  await expect(page.locator('[data-testid="runtime-project-selector"]')).toBeEnabled();
  await page.locator('[data-testid="runtime-project-selector"]').click();
  await expect(page.getByRole('option', { name: '糖尿病', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: '无功能垂体瘤', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: '肥胖', exact: true })).toBeVisible();
  await assertOptionIsTopmost(page, '糖尿病');
  await page.getByRole('option', { name: '糖尿病', exact: true }).click();
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(4);
  await selectRuntimeOption(page, 'runtime-agent-selector', '全部智能体');
  await expect(page.locator('[data-testid="runtime-project-selector"]')).toBeDisabled();
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9);

  await expect(page.locator('[data-testid="runtime-status-region"]')).not.toContainText('Med Auto Science');
  await expect(page.locator('[data-testid="runtime-task-row"]').first()).toContainText('分析结果复核');
  await expect(page.locator('[data-testid="runtime-task-row"]').first()).toContainText('医学写作');
  await expect(page.locator('[data-testid="runtime-task-row"]').first()).toContainText('1,200');
  await expect(page.locator('[data-testid="runtime-task-row"]').first()).toContainText('2,400');
  const deliveredRow = page
    .locator('[data-testid="runtime-task-row"]')
    .filter({ hasText: '002 DM China US Mortality Attribution' });
  await expect(deliveredRow).toContainText('暂无当前阶段');
  await expect(deliveredRow).toContainText('1,500');
  await expect(deliveredRow).not.toContainText('runtime_token_telemetry_verification');
  await expect(page.locator('[data-testid="runtime-work-item-list"]')).not.toContainText('attempt:dm001');
  await expect(page.locator('[data-testid="runtime-work-item-list"]')).not.toContainText('workflow:dm001');
  const availability = page.locator('[data-testid="runtime-agent-availability"]');
  await expect(availability).toContainText('5 个智能体可用');
  await expect(availability).not.toContainText('9');
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
      path: path.join(screenshotDir, `runtime-v2-${viewport.width}.png`),
      fullPage: true,
    });
    if (viewport.width === 375) {
      const firstTask = page.locator('[data-testid="runtime-task-row"]').first();
      await firstTask.scrollIntoViewIfNeeded();
      await expect(firstTask).toBeInViewport();
      await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-375-tasks.png') });
    }
  }

  await setViewport(page, app, VIEWPORTS[0]);
  await page.locator('[data-testid="runtime-task-row"]').first().click();
  const drawer = page.locator('[data-testid="runtime-task-detail"]');
  await expect(drawer).toBeVisible();
  await waitForDrawerToDock(page, drawer);
  await expect(drawer.locator('[data-testid="runtime-stage-map"] [data-stage-state]')).toHaveCount(5);
  await expect(drawer).toContainText('分析结果复核');
  await expect(drawer).toContainText('完成结果复核并进入写作');
  await expect(drawer).toContainText('产物');
  await expect(drawer).toContainText('时间线');
  await expect(drawer).toContainText('证据');
  await expect(drawer).toContainText('诊断');
  await expect(drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item')).toHaveCount(4);
  await expect(drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item-active')).toHaveCount(0);
  const drawerContent = drawer.locator('.arco-drawer-content');
  const detailDimensions = await drawerContent.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(detailDimensions.scrollWidth).toBeLessThanOrEqual(detailDimensions.clientWidth + 1);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-1440-detail.png'), fullPage: true });
  const disclosureItems = drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item');
  const timelineItem = disclosureItems.nth(1);
  const evidenceItem = disclosureItems.nth(2);
  await timelineItem.locator('.arco-collapse-item-header').click();
  await evidenceItem.locator('.arco-collapse-item-header').click();
  await expect(timelineItem).toContainText('项目清单已读取');
  await expect(evidenceItem).toContainText('STUDY_STATUS.md');
  await expect(drawer.locator('[data-testid="runtime-detail-disclosure"] .arco-collapse-item-active')).toHaveCount(2);
  const evidenceRef = evidenceItem.getByText(/STUDY_STATUS\.md/);
  await evidenceRef.scrollIntoViewIfNeeded();
  await expect(evidenceRef).toBeInViewport();
  await page.screenshot({
    path: path.join(screenshotDir, 'runtime-v2-1440-detail-disclosure.png'),
    fullPage: true,
  });
});

test('keeps ordinary words intact while wrapping unbroken identifiers as a fallback', async () => {
  if (!fixture) throw new Error('Runtime V2 E2E fixture was not launched.');
  const { app, page, screenshotDir } = fixture;

  await page.evaluate(() => localStorage.setItem('i18nextLng', 'en-US'));
  await page.reload();
  await expect(page.locator('[data-testid="runtime-task-row"]')).toHaveCount(9, { timeout: 30_000 });
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
    WORK_ITEM_NAMES.map((name) => assertTextWrapsAtWordBoundaries(page.getByText(name, { exact: true })))
  );
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-1370-en.png'), fullPage: true });

  await setViewport(page, app, VIEWPORTS[3]);
  const firstRow = page.locator('[data-testid="runtime-task-row"]').first();
  const firstTitle = firstRow.getByText(WORK_ITEM_NAMES[0], { exact: true });
  await assertLongTokenUsesFallbackWrapping(firstTitle);
  await assertNoHorizontalOverflow(page);
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeInViewport();
  await page.screenshot({ path: path.join(screenshotDir, 'runtime-v2-375-long-token.png') });
});
