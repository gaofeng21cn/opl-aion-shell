/**
 * Agent Settings Management Catalog — E2E tests.
 *
 * Covers: LocalAgents component rendering, managed CLI catalog,
 * known runtime presence, agent status, and catalog refresh.
 */
import { test, expect } from '../fixtures';
import { goToSettings, expectUrlContains, expectBodyContainsAny, settingsSiderItemById } from '../helpers';

test.describe('Agent Settings Management Catalog', () => {
  test('LocalAgents page renders', async ({ page }) => {
    await goToSettings(page, 'agent');
    await expectUrlContains(page, 'agent');
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', '代理']);
  });

  test('managed CLI agents displayed', async ({ page }) => {
    await goToSettings(page, 'agent');

    // At least one detected agent card should be visible
    // Agent cards use AgentCard component in a grid
    const agentGrid = page.locator('.grid');
    await expect(agentGrid.first()).toBeVisible({ timeout: 8_000 });

    // Check for known backend names
    const body = await page.locator('body').textContent();
    const hasKnownAgent = ['Claude', 'Codex', 'Gemini', 'Aion', 'OpenCode', 'Qwen'].some((name) =>
      body?.includes(name)
    );
    expect(hasKnownAgent).toBeTruthy();
  });

  test('Gemini agent is present in detected list', async ({ page }) => {
    await goToSettings(page, 'agent');

    // Gemini or Aion RS should be in the agent list
    await expectBodyContainsAny(page, ['Gemini', 'gemini', 'Aion']);
  });

  test('agent settings page has sidebar navigation item', async ({ page }) => {
    await goToSettings(page, 'agent');

    const siderItem = page.locator(settingsSiderItemById('agent')).first();
    await expect(siderItem).toBeVisible({ timeout: 8_000 });
  });

  test('managed agent catalog exposes diagnostics or custom-agent actions', async ({ page }) => {
    await goToSettings(page, 'agent');

    // The management catalog exposes either diagnostics or custom-agent actions.
    await expectBodyContainsAny(page, ['Test Connection', 'test connection', '测试连接', 'Custom', 'custom', '自定义']);
  });

  test('detected agents section refreshes without error', async ({ page }) => {
    await goToSettings(page, 'agent');

    // Navigate away and back to trigger a refresh
    await goToSettings(page, 'about');
    await goToSettings(page, 'agent');

    // Page should still render correctly
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', '代理']);
    const agentGrid = page.locator('.grid');
    await expect(agentGrid.first()).toBeVisible({ timeout: 8_000 });
  });
});
