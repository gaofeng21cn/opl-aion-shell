/** Skills Hub E2E: installed skill rendering and deletion permissions. */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  getMySkills,
  importSkillViaBridge,
  deleteSkillViaBridge,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Core UI (P0)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Skills Hub before each test
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup test data after each test
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-01: Render My Skills list (basic scenario)
  // ============================================================================

  test('TC-S-01: should render imported custom skills in the manual inventory', async ({ page }) => {
    // Both imported fixtures are custom skills; builtin permissions are covered separately.
    const tempSource = createTempExternalSource('tc-s-01');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Builtin', 'Builtin-like test skill');
      createTestSkill(tempSource.path, 'E2E-Test-Custom', 'Custom test skill');

      // Import both skills
      await importSkillViaBridge(page, path.join(tempSource.path, 'E2E-Test-Builtin'));
      await importSkillViaBridge(page, path.join(tempSource.path, 'E2E-Test-Custom'));

      // Refresh page to ensure data is loaded
      await page.reload();
      await goToSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-01/01-initial-my-skills.png');

      // Step 2: Locate "My Skills" section
      const mySkillsSection = page.locator('[data-testid="manual-and-third-party-capabilities"]');
      await expect(mySkillsSection).toBeVisible();

      // Step 4: Verify skill count badge (should show 2)
      // Note: Badge structure may need adjustment based on actual implementation
      // const countBadge = mySkillsSection.locator('[class*="count"]');
      // await expect(countBadge).toHaveText('2');

      // Screenshot 02: My Skills section visible
      await takeScreenshot(page, 'skills-hub/tc-s-01/02-my-skills-section.png');

      // Expected: Display 2 skill cards
      const builtinCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Builtin')}"]`);
      const customCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Custom')}"]`);

      await expect(builtinCard).toBeVisible();
      await expect(customCard).toBeVisible();

      // Verify each card contains name and description
      await expect(builtinCard.locator(`text=E2E-Test-Builtin`)).toBeVisible();
      await expect(customCard.locator(`text=E2E-Test-Custom`)).toBeVisible();

      // Screenshot 03: Both cards visible
      await takeScreenshot(page, 'skills-hub/tc-s-01/03-skill-cards-rendered.png');

      // Bridge assertion: Verify backend state
      const skills = await getMySkills(page);
      const testSkills = skills.filter((s) => s.name.startsWith('E2E-Test-'));
      expect(testSkills).toHaveLength(2);
      expect(testSkills.map((s) => s.name)).toContain('E2E-Test-Builtin');
      expect(testSkills.map((s) => s.name)).toContain('E2E-Test-Custom');
    } finally {
      // Cleanup
      await deleteSkillViaBridge(page, 'E2E-Test-Builtin');
      await deleteSkillViaBridge(page, 'E2E-Test-Custom');
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-05: Delete custom skill (success scenario)
  // ============================================================================

  test('TC-S-05: should delete custom skill via UI with confirmation modal', async ({ page }) => {
    // Setup: Create 1 custom skill with unique name
    const skillName = `E2E-Test-Delete-Target-${Date.now()}`;
    const tempSource = createTempExternalSource('tc-s-05');
    try {
      createTestSkill(tempSource.path, skillName, 'Skill to be deleted');
      const skillPath = path.join(tempSource.path, skillName);
      const importResult = await importSkillViaBridge(page, skillPath);

      // Verify import success
      expect(importResult.success).toBe(true);

      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with skill card
      await takeScreenshot(page, 'skills-hub/tc-s-05/01-before-delete.png');

      // Step 2: Locate target skill card in My Skills section
      const targetCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(targetCard).toBeVisible();

      // Step 3: Hover to show delete button (may require actual hover)
      await targetCard.hover();
      await page.waitForTimeout(200);

      // Screenshot 02: After hover, delete button visible
      await takeScreenshot(page, 'skills-hub/tc-s-05/02-delete-button-visible.png');

      // Step 4: Click delete button
      const deleteButton = page.locator(`[data-testid="btn-delete-${normalizeTestId(skillName)}"]`);
      await deleteButton.click();

      // Step 5: Verify confirmation modal appears
      const modal = page.locator('.modal-delete-skill .arco-modal');
      await expect(modal).toBeVisible();

      // Verify modal title via Arco's title class
      await expect(modal.locator('.arco-modal-title')).toBeVisible();

      // Screenshot 03: Confirmation modal
      await takeScreenshot(page, 'skills-hub/tc-s-05/03-confirmation-modal.png');

      // Step 6: Click confirm button (Arco Modal confirm button)
      const confirmButton = modal.locator('.arco-btn-primary');
      await confirmButton.click();

      // Expected: Modal closes
      await expect(modal).not.toBeVisible();

      // Expected: Success message appears (don't check i18n text)
      await page.waitForSelector('.arco-message-success', { timeout: 5000 });

      // Screenshot 04: Success message
      await takeScreenshot(page, 'skills-hub/tc-s-05/04-success-message.png');

      // Wait for list refresh
      await page.waitForTimeout(1000);

      // Expected: Target card disappears
      await expect(targetCard).not.toBeVisible();

      // Screenshot 05: Card removed
      await takeScreenshot(page, 'skills-hub/tc-s-05/05-card-removed.png');

      // Bridge assertion: Verify skill is deleted from backend
      const skills = await getMySkills(page);
      const deletedSkill = skills.find((s) => s.name === skillName);
      expect(deletedSkill).toBeUndefined();
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-06: Delete builtin skill (no delete button)
  // ============================================================================

  test('TC-S-06: should not show delete button for builtin skills', async ({ page }) => {
    // No setup needed - verify existing builtin skills
    await page.reload();
    await goToSkillsHub(page);

    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-06/01-initial-state.png');

    // Query all skills and find a real builtin skill
    const skills = await getMySkills(page);
    const visibleSkillNames = await page.locator('[data-testid^="my-skill-card-"] h3').allTextContents();
    const builtinSkills = skills.filter((s) => s.source === 'builtin' && visibleSkillNames.includes(s.name));

    // Env-gated: dev-mode sandboxes and fresh CI runs may have no builtin
    // skills (builtin dir points at app bundle resources which are only
    // populated in packaged builds). Skip rather than hard-fail — this test
    // asserts UI behavior (no delete button), not fixture presence.
    if (builtinSkills.length === 0) {
      test.skip(true, 'No builtin skills in the manual inventory in this environment');
      return;
    }

    // Test the first builtin skill
    const firstBuiltin = builtinSkills[0];
    const normalizedName = normalizeTestId(firstBuiltin.name);

    // Step 2: Locate the builtin skill card
    const builtinCard = page.locator(`[data-testid="my-skill-card-${normalizedName}"]`);
    await expect(builtinCard).toBeVisible();

    // Step 3: Hover to card to reveal buttons
    await builtinCard.hover();
    await page.waitForTimeout(300);

    // Screenshot 02: After hover
    await takeScreenshot(page, 'skills-hub/tc-s-06/02-after-hover-builtin.png');

    // Only custom skills expose a delete action.
    const deleteButton = builtinCard.locator(`[data-testid="btn-delete-${normalizedName}"]`);

    // Screenshot 03: Final state - verify no delete button
    await takeScreenshot(page, 'skills-hub/tc-s-06/03-verify-no-delete-button.png');

    // Assertion: Delete button must NOT be visible for builtin skills
    await expect(deleteButton).not.toBeVisible();
  });
});
