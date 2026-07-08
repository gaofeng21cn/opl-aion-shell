/**
 * Assistant Settings UI States (P1) — semantic E2E coverage.
 *
 * Keep this file focused on user-observable states that are not just screenshot
 * transitions. CRUD, permissions, and deeper skills behavior live in adjacent
 * assistant suites.
 */
import { test, expect } from '../../fixtures';
import {
  goToAssistantSettings,
  clickCreateAssistant,
  fillAssistantName,
  saveAssistant,
  clearSearch,
  closeDrawer,
  httpPost,
  httpInvoke,
} from '../../helpers';

test.describe('Assistant Settings UI States (P1)', () => {
  test.setTimeout(90_000);

  test('search expands with focus and handles blank/no-result queries', async ({ page }) => {
    await goToAssistantSettings(page);

    const cards = page.locator('[data-testid^="assistant-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 10_000 });
    const countBefore = await cards.count();

    const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
    const searchInput = page.locator('[data-testid="input-search-assistant"]');

    await expect(searchInput).toBeHidden({ timeout: 5_000 });
    await searchToggle.click();
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await expect(searchInput).toBeFocused({ timeout: 2_000 });

    await searchInput.fill('   ');
    await expect(cards).toHaveCount(countBefore);

    await searchInput.fill('zzz_nonexistent_assistant_98765');
    await expect(cards).toHaveCount(0);

    await clearSearch(page);
  });

  test('builtin and custom assistants expose the right source tags', async ({ page }) => {
    await goToAssistantSettings(page);

    const builtinCard = page.locator('[data-testid^="assistant-card-builtin-"]').first();
    await expect(builtinCard).toBeVisible();
    await expect(builtinCard.locator('.arco-tag').filter({ hasText: /Custom|自定义/i })).toHaveCount(0);

    const testName = `E2E Custom ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await saveAssistant(page);

    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 });

    const customCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: testName });
    await expect(customCard).toBeVisible();
    await expect(customCard.locator('.arco-tag').filter({ hasText: /Custom|自定义/i })).toBeVisible();

    await customCard.click();
    await drawer.waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('[data-testid="btn-delete-assistant"]').click();
    await page.locator('[data-testid="modal-delete-assistant"] .arco-btn-status-danger').click();
    await drawer.waitFor({ state: 'hidden', timeout: 5_000 });
  });

  test('card hover actions and extension switch states stay user-observable', async ({ page }) => {
    await goToAssistantSettings(page);

    const cards = page.locator('[data-testid^="assistant-card-"]');
    const firstCard = cards.first();
    await firstCard.waitFor({ state: 'visible', timeout: 10_000 });

    const assistantId = ((await firstCard.getAttribute('data-testid')) || '').replace('assistant-card-', '');
    const duplicateBtn = page.locator(`[data-testid="btn-duplicate-${assistantId}"]`);

    expect(await duplicateBtn.isVisible().catch(() => false)).toBe(false);
    await firstCard.hover();
    await expect(duplicateBtn).toBeVisible();

    const extensionCard = page.locator('[data-testid^="assistant-card-ext-"]').first();
    if (await extensionCard.isVisible().catch(() => false)) {
      const extensionId = ((await extensionCard.getAttribute('data-testid')) || '').replace('assistant-card-', '');
      const switchElement = page.locator(`[data-testid="switch-enabled-${extensionId}"]`);

      await expect(switchElement).toBeChecked();
      await expect(switchElement).toBeDisabled();
    }
  });

  test('drawer close controls and rules editor states work without visual checkpoints', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);

    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const rulesContainer = drawer
      .locator('.border')
      .filter({ has: page.locator('textarea') })
      .first();
    const initialHeight = await rulesContainer.evaluate((el) => window.getComputedStyle(el).height);

    const expandBtn = drawer.locator('[data-testid="btn-expand-rules"]');
    await expandBtn.click();
    await expect
      .poll(async () => parseInt(await rulesContainer.evaluate((el) => window.getComputedStyle(el).height), 10))
      .toBeGreaterThan(parseInt(initialHeight, 10));

    await expandBtn.click();
    await expect
      .poll(async () => await rulesContainer.evaluate((el) => window.getComputedStyle(el).height))
      .toBe(initialHeight);

    const editTab = drawer
      .locator('div')
      .filter({ hasText: /^(Edit|编辑)$/i })
      .first();
    const previewTab = drawer
      .locator('div')
      .filter({ hasText: /^(Preview|预览)$/i })
      .first();
    const textarea = drawer.locator('textarea');

    await expect(textarea).toBeVisible();
    await previewTab.click();
    await expect.poll(async () => await previewTab.getAttribute('class')).toContain('text-primary');
    await editTab.click();
    await expect(textarea).toBeVisible();

    await closeDrawer(page);
    await expect(drawer).toBeHidden({ timeout: 3_000 });
  });

  test('skills sections expose counts and builtin skill toggles do not open removal modal', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);

    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const skillsCollapse = drawer.locator('[data-testid="skills-collapse"]');
    await expect(skillsCollapse).toBeVisible();

    const builtinSection = skillsCollapse
      .locator('.arco-collapse-item')
      .filter({ hasText: /Builtin Skills|内置技能/i });
    const builtinHeader = builtinSection.locator('.arco-collapse-item-header');
    await expect(builtinHeader).toBeVisible();
    expect(await builtinHeader.textContent()).toMatch(/\d+/);

    if ((await builtinHeader.getAttribute('aria-expanded')) === 'false') {
      await builtinHeader.click();
    }

    const skillCards = builtinSection.locator('div.flex.items-start.gap-8px.p-8px');
    if ((await skillCards.count()) > 0) {
      const checkbox = skillCards.first().locator('.arco-checkbox');
      const wasChecked = await checkbox.evaluate((el) => el.classList.contains('arco-checkbox-checked'));

      if (!wasChecked) {
        await checkbox.click();
        await expect.poll(async () => await checkbox.evaluate((el) => el.classList.contains('arco-checkbox-checked'))).toBe(true);
      }

      await checkbox.click();
      await expect(page.locator('.arco-modal-wrapper').filter({ hasText: /Remove|删除|移除/i })).not.toBeVisible();
      await expect.poll(async () => await checkbox.evaluate((el) => el.classList.contains('arco-checkbox-checked'))).toBe(false);

      await checkbox.click();
    }

    const customSection = skillsCollapse
      .locator('.arco-collapse-item')
      .filter({ hasText: /Imported Skills|导入技能/i });
    if (await customSection.isVisible().catch(() => false)) {
      await expect(customSection).toContainText(/No custom skills added|未添加自定义技能/i);
    }

    await closeDrawer(page);
  });

  test('skills modal preserves semantic states: cleared search, source pills, disabled added skills', async ({ page }) => {
    await goToAssistantSettings(page);

    const tempSkillPath = '/tmp/e2e-test-skills-ui-states';
    await httpPost(page, '/api/skills/external-paths', { name: 'E2E Test Source', path: tempSkillPath });

    await clickCreateAssistant(page);
    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const addSkillsBtn = page.locator('[data-testid="btn-add-skills"]');
    await addSkillsBtn.click();

    const modal = page.locator('.arco-modal').filter({ hasText: /Add Skills|添加技能/i });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const searchInput = modal.locator('input').first();
    await searchInput.fill('test search query');
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 5_000 });

    await addSkillsBtn.click();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(searchInput).toHaveValue('');

    const pills = modal.locator('button').filter({ has: page.locator('span[class*="px-6px"]') });
    if ((await pills.count()) > 0) {
      const firstPill = pills.first();
      await expect.poll(async () => await firstPill.getAttribute('class')).toContain('bg-primary-6');

      if ((await pills.count()) > 1) {
        const secondPill = pills.nth(1);
        await secondPill.click();
        await expect.poll(async () => await secondPill.getAttribute('class')).toContain('bg-primary-6');
        await expect.poll(async () => await firstPill.getAttribute('class')).not.toContain('bg-primary-6');
      }
    }

    const addedBtns = modal.locator('button').filter({ hasText: /Added|已添加/i });
    if ((await addedBtns.count()) > 0) {
      await expect(addedBtns.first()).toBeDisabled();
    }

    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await closeDrawer(page);
    await httpInvoke(page, 'DELETE', '/api/skills/external-paths', { path: tempSkillPath });
  });

  test('session storage intent opens assistant editor and clears itself', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const targetId = await page.evaluate(() => {
      const el = document.querySelector('[data-testid^="assistant-card-"]');
      return el ? (el.getAttribute('data-testid') || '').replace('assistant-card-', '') : null;
    });

    if (!targetId) {
      test.skip(true, 'No assistant cards rendered in env — cannot harvest target id for intent test');
      return;
    }

    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.waitForLoadState('networkidle');

    await page.evaluate((id) => {
      sessionStorage.setItem('guid.openAssistantEditorIntent', JSON.stringify({ assistantId: id, openAssistantEditor: true }));
      window.location.hash = '#/settings/assistants';
    }, targetId);

    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => await page.evaluate(() => sessionStorage.getItem('guid.openAssistantEditorIntent'))).toBeNull();

    await closeDrawer(page);
  });
});
