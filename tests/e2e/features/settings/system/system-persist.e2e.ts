/**
 * System Settings Persistence E2E Tests
 *
 * Verifies that settings survive a page reload (persisted to backend, not just React state).
 * Pattern: record → change → reload → assert persisted → restore.
 * All operations via UI — zero invokeBridge, zero mock.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle } from '../../../helpers/navigation';

async function reloadAndGoToSystem(page: import('@playwright/test').Page) {
  await page.reload();
  await goToSettings(page, 'system');
  await waitForSettle(page);
}

test.describe('System Settings Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  // TC-PERSIST-01: Language switch persists across reload
  test('TC-PERSIST-01: language selection persists after reload', async ({ page }) => {
    const selectTrigger = page.locator('.aion-select .arco-select-view').first();
    await expect(selectTrigger).toBeVisible();
    const originalLang = await selectTrigger.textContent();

    await selectTrigger.click();
    const englishOption = page.locator('.arco-select-option:has-text("English")');
    await expect(englishOption).toBeVisible();
    await englishOption.click();
    await page.waitForFunction(() => document.body.textContent?.includes('Language'), { timeout: 15_000 });
    expect(await selectTrigger.textContent()).toContain('English');

    await reloadAndGoToSystem(page);

    const reloadedSelect = page.locator('.aion-select .arco-select-view').first();
    await expect(reloadedSelect).toBeVisible();
    expect(await reloadedSelect.textContent()).toContain('English');
    expect(await page.locator('body').textContent()).toContain('Language');

    // Restore
    await reloadedSelect.click();
    const restoreOption = page.locator(`.arco-select-option:has-text("${originalLang?.trim() || '简体中文'}")`);
    await expect(restoreOption).toBeVisible();
    await restoreOption.click();
    await waitForSettle(page);
  });

  // TC-PERSIST-03: promptTimeout InputNumber persists across reload
  test('TC-PERSIST-03: promptTimeout value persists after reload', async ({ page }) => {
    const wrapper = page
      .locator('.arco-input-number')
      .filter({ has: page.locator('[class*="suffix"]:has-text("s")') })
      .first();
    await expect(wrapper).toBeVisible({ timeout: 15_000 });

    const input = wrapper.locator('input');
    const originalValue = (await input.inputValue()).trim();

    await input.click();
    await page.keyboard.press('Meta+a');
    await input.fill('600');
    await input.blur();
    await waitForSettle(page, 500);
    expect(Number((await input.inputValue()).trim())).toBe(600);

    await reloadAndGoToSystem(page);

    const reloadedWrapper = page
      .locator('.arco-input-number')
      .filter({ has: page.locator('[class*="suffix"]:has-text("s")') })
      .first();
    await expect(reloadedWrapper).toBeVisible({ timeout: 15_000 });
    const reloadedInput = reloadedWrapper.locator('input');

    // Wait for the value to be hydrated from backend
    await page
      .waitForFunction(
        () => {
          const inputs = document.querySelectorAll<HTMLInputElement>('.arco-input-number input');
          for (const el of inputs) {
            if (el.value.trim() === '600') return true;
          }
          return false;
        },
        { timeout: 15_000 }
      )
      .catch(() => {});

    expect(Number((await reloadedInput.inputValue()).trim())).toBe(600);

    // Restore
    await reloadedInput.click();
    await page.keyboard.press('Meta+a');
    await reloadedInput.fill(originalValue || '300');
    await reloadedInput.blur();
    await waitForSettle(page, 500);
  });

});
