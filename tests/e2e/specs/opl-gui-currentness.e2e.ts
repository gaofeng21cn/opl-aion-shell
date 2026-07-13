import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../fixtures';
import { goToGuid, httpDelete, httpPost } from '../helpers';

type CreatedConversation = { id: string };

const DESKTOP = { width: 1440, height: 960 };
const MOBILE = { width: 420, height: 844 };

async function setViewport(page: Page, electronApp: ElectronApplication, viewport: typeof DESKTOP): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, size) => {
    const mainWindow = BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed())
      .toSorted((left, right) => {
        const leftBounds = left.getBounds();
        const rightBounds = right.getBounds();
        return rightBounds.width * rightBounds.height - leftBounds.width * leftBounds.height;
      })[0];
    if (!mainWindow) throw new Error('OPL GUI currentness could not resolve the Electron main window');
    mainWindow.setContentSize(size.width, size.height);
  }, viewport);
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect
    .poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })))
    .toEqual(viewport);
}

async function requireRenderer(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number' &&
      ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0,
    { timeout: 30_000 }
  );
}

async function createConversation(page: Page, workspace: string): Promise<string> {
  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    type: 'acp',
    name: 'OPL GUI Currentness',
    extra: {
      workspace,
      custom_workspace: true,
      backend: 'codex',
      session_mode: 'full-access',
    },
  });
  if (!conversation.id) throw new Error('Currentness fixture did not return a conversation id');
  return conversation.id;
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('keeps desktop Home and conversation decisions in their App-owned locations', async ({ page, electronApp }) => {
  let conversationId: string | null = null;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-currentness-'));
  try {
    await requireRenderer(page);
    await setViewport(page, electronApp, DESKTOP);
    await goToGuid(page);

    const rail = page.locator('.layout-sider:has([data-testid="app-navigation-rail"])');
    await expect(rail).toBeVisible();
    await expect(rail).not.toHaveClass(/\bcollapsed\b/);
    await expect(page.locator('[data-testid="opl-guid-entry"]')).toBeVisible();
    await expect(page.locator('[data-testid="guid-action-submit"]')).toBeVisible();
    await expect(page.locator('[data-testid="guid-model-selector"]')).toBeVisible();

    conversationId = await createConversation(page, workspace);
    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/conversation/${conversationId}`);

    await expect(page.locator('[data-testid="conversation-composer"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="acp-sendbox-decision-controls"]')).toBeVisible();
    await expect(page.locator('[data-testid="conversation-side-panel-surface"]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    const environment = page.locator('.conversation-environment-trigger');
    await expect(environment).toBeVisible();
    await expect(page.locator('[data-testid="conversation-environment-popover"]')).toHaveCount(0);
    await environment.click();
    await expect(page.locator('[data-testid="conversation-environment-popover"]')).toBeVisible();
  } finally {
    if (conversationId)
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('collapses mobile rail and moves conversation decisions into the More sheet', async ({ page, electronApp }) => {
  let conversationId: string | null = null;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-currentness-'));
  try {
    await requireRenderer(page);
    await setViewport(page, electronApp, MOBILE);
    await goToGuid(page);

    const rail = page.locator('.layout-sider:has([data-testid="app-navigation-rail"])');
    await expect(rail).toHaveClass(/\bcollapsed\b/);
    await expect(page.locator('[data-testid="app-navigation-rail-backdrop"]')).toHaveCount(0);

    conversationId = await createConversation(page, workspace);
    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/conversation/${conversationId}`);

    await expect(page.locator('[data-testid="conversation-composer"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="acp-sendbox-decision-controls"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="conversation-side-panel-layer"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.conversation-environment-trigger')).toBeVisible();

    await page.locator('[data-testid="sendbox-mobile-plus-btn"]').click();
    await expect(page.locator('[data-testid="mobile-action-sheet-permission"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-action-sheet-model"]')).toBeVisible();
  } finally {
    if (conversationId)
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
