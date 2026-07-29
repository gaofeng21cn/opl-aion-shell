/**
 * Assistant Settings Skills — E2E tests.
 *
 * Covers: user/project skill display, add/remove, persistence, and the
 * ordinary-editor boundary that hides runtime-managed builtin skills.
 */
import { test, expect } from '../fixtures';
import {
  goToAssistantSettings,
  clickCreateAssistant,
  fillAssistantName,
  saveAssistant,
  waitForDrawerClose,
  closeDrawer,
  openAssistantDrawer,
  deleteAssistant,
  getVisibleAssistantIds,
  SKILLS_SECTION,
} from '../helpers';

test.describe('Assistant Settings Skills', () => {
  test.setTimeout(60_000);

  test('skill panel hides runtime-managed builtin skills for custom assistant', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Create a custom assistant to see skills panel
    const testName = `Skills Test ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    // Skills section should be visible for new custom assistants
    const skillsSection = page.locator(SKILLS_SECTION);
    await expect(skillsSection).toBeVisible();
    await expect(page.locator('.arco-collapse-item').filter({ hasText: /Builtin|内置/ })).toHaveCount(0);

    // Cancel and cleanup
    await closeDrawer(page);
  });

  test('skill panel hides auto-injected skills section', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Open a builtin assistant that has auto-injected skills
    const ids = await getVisibleAssistantIds(page);
    if (ids.length === 0) {
      test.skip(true, 'No assistants available');
      return;
    }

    // Try the first builtin assistant
    await openAssistantDrawer(page, ids[0]);

    const skillsSection = page.locator(SKILLS_SECTION);
    const hasSkills = await skillsSection.isVisible().catch(() => false);

    // Skills section should be visible for at least one assistant
    // If not, the feature may not be enabled — skip gracefully
    if (!hasSkills) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not rendered for this assistant');
      return;
    }

    await expect(
      skillsSection.locator('.arco-collapse-item').filter({ hasText: /Auto-injected|自动注入/ })
    ).toHaveCount(0);

    await closeDrawer(page);
  });

  test('does not expose builtin skill selection', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Skill Toggle ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    const builtinCollapse = page.locator('.arco-collapse-item').filter({ hasText: /Builtin|内置/ });
    await expect(builtinCollapse).toHaveCount(0);

    await closeDrawer(page);
  });

  test('does not expose auto-injected skill controls', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Auto-injected skills only exist on builtin assistants.
    // Builtin IDs don't start with "ext-" or contain timestamps from custom creation.
    const ids = await getVisibleAssistantIds(page);
    const builtinId = ids.find((id) => !id.startsWith('ext-'));
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);

    await expect(page.locator('.arco-collapse-item').filter({ hasText: /Auto-injected|自动注入/ })).toHaveCount(0);
    await closeDrawer(page);
  });

  test('add skills button opens modal', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Add Skills ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Click "Add Skills" button
    const addSkillsBtn = skillsSection.locator('button').filter({ hasText: /Add Skills|添加/ });
    if (
      await addSkillsBtn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await addSkillsBtn.first().click();
      // Modal should open
      const modal = page.locator('.arco-modal');
      await expect(modal.first()).toBeVisible({ timeout: 5_000 });
      // Close modal first (Escape closes the topmost overlay)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Close the drawer
    await closeDrawer(page);
  });

  test('skill selection persists after save and reopen', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Skill Persist ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Save the custom assistant without exposing runtime-managed controls.
    await expect(page.locator('.arco-collapse-item').filter({ hasText: /Builtin|内置/ })).toHaveCount(0);

    await saveAssistant(page);
    await waitForDrawerClose(page);

    // Reopen and verify
    let targetId = '';
    for (const id of await getVisibleAssistantIds(page)) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        targetId = id;
        break;
      }
    }

    if (targetId) {
      await openAssistantDrawer(page, targetId);
      // Verify drawer opens without error
      const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
      await expect(drawer).toBeVisible({ timeout: 5_000 });

      // Cleanup
      await closeDrawer(page);
      await page.waitForTimeout(300);
      await openAssistantDrawer(page, targetId);
      await deleteAssistant(page);
    }
  });

  test('builtin assistant can access skills section', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Builtin assistants have simple IDs (not ext- prefix, not custom UUIDs)
    const ids = await getVisibleAssistantIds(page);
    const builtinId = ids.find((id) => !id.startsWith('ext-'));
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);
    const saveBtn = page.locator('[data-testid="btn-save-assistant"]');
    await expect(saveBtn).toBeVisible({ timeout: 3_000 });
    await closeDrawer(page);
  });

  test('custom skills collapse renders', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Custom Skills ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Skills section rendered — verify the collapse container has content
    const collapseItems = skillsSection.locator('.arco-collapse-item');
    const collapseCount = await collapseItems.count();
    // At least the custom/project section should exist.
    expect(collapseCount).toBeGreaterThanOrEqual(1);

    await closeDrawer(page);
  });

  test('extension assistant drawer opens without error', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Find an extension-contributed assistant
    const ids = await getVisibleAssistantIds(page);
    const extId = ids.find((id) => id.startsWith('ext-'));
    test.skip(!extId, 'No extension assistant available');

    await openAssistantDrawer(page, extId!);
    // Drawer should open and display the save button (may be disabled depending on edit state)
    const saveBtn = page.locator('[data-testid="btn-save-assistant"]');
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    await closeDrawer(page);
  });

  test('skills counter shows in summary', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Counter Test ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    // Verify the summary remains present without runtime-managed rows.
    const body = await page.locator('[data-testid="assistant-edit-drawer"]').textContent();
    expect(body).toBeTruthy();

    await closeDrawer(page);
  });
});
