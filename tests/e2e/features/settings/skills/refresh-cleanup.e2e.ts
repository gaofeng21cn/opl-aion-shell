/** Skills Hub E2E: refresh installed skills and verify cleanup. */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  getMySkills,
  importSkillViaBridge,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Refresh/Cleanup (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-04: Refresh My Skills list
  // ============================================================================

  test('TC-S-04: should refresh My Skills list and show newly added skill', async ({ page }) => {
    // Setup: Create 1 initial test skill
    const tempSource = createTempExternalSource('tc-s-04');
    try {
      const initialSkill = `E2E-Test-Initial-${Date.now()}`;
      createTestSkill(tempSource.path, initialSkill, 'Initial skill');

      const import1 = await importSkillViaBridge(page, path.join(tempSource.path, initialSkill));
      expect(import1.success).toBe(true);

      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with 1 skill
      await takeScreenshot(page, 'skills-hub/tc-s-04/01-initial-state.png');

      // Verify 1 skill exists
      const mySkillsSection = page.locator('[data-testid="manual-and-third-party-capabilities"]');
      await expect(mySkillsSection).toBeVisible();
      const initialCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(initialSkill)}"]`);
      await expect(initialCard).toBeVisible();

      // Step 2: Dynamically add new skill via Bridge
      const newSkill = `E2E-Test-New-Skill-${Date.now()}`;
      createTestSkill(tempSource.path, newSkill, 'Newly added skill');
      const import2 = await importSkillViaBridge(page, path.join(tempSource.path, newSkill));
      expect(import2.success).toBe(true);

      // Screenshot 02: Before refresh (new skill not visible in UI yet)
      await takeScreenshot(page, 'skills-hub/tc-s-04/02-before-refresh.png');

      // Step 3: Click refresh button
      const refreshButton = page.locator('[data-testid="btn-refresh-my-skills"]');
      await expect(refreshButton).toBeVisible();
      await refreshButton.click();

      // Wait for refresh to complete (loading state disappears)
      await page.waitForTimeout(500);

      // Screenshot 03: After refresh
      await takeScreenshot(page, 'skills-hub/tc-s-04/03-after-refresh.png');

      // Expected: New skill card appears
      const newCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(newSkill)}"]`);
      await expect(newCard).toBeVisible();

      // Expected: Skill count updated (verify via Bridge)
      const mySkills = await getMySkills(page);
      const testSkills = mySkills.filter((s) => s.name.startsWith('E2E-Test-'));
      expect(testSkills.length).toBe(2);

      // Screenshot 04: Verify both skills visible
      await takeScreenshot(page, 'skills-hub/tc-s-04/04-both-skills-visible.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-07: Test skills are absent after cleanup
  // ============================================================================

  test('TC-S-07: should remove test skills from the installed list after cleanup', async ({ page }) => {
    // Setup: Ensure no test skills exist (cleanup already done in beforeEach)
    await cleanupTestSkills(page);
    await refreshSkillsHub(page);

    // Screenshot 01: Initial state (may have builtin skills)
    await takeScreenshot(page, 'skills-hub/tc-s-07/01-initial-state.png');

    // Expected: My Skills section visible
    const mySkillsSection = page.locator('[data-testid="manual-and-third-party-capabilities"]');
    await expect(mySkillsSection).toBeVisible();

    // Verify via Bridge that no E2E test skills exist
    const mySkills = await getMySkills(page);
    const testSkills = mySkills.filter((s) => s.name.startsWith('E2E-Test-'));
    expect(testSkills.length).toBe(0);

    // Screenshot 02: No E2E test skills
    await takeScreenshot(page, 'skills-hub/tc-s-07/02-no-e2e-skills.png');

    // Expected: No E2E test skill cards rendered
    // Note: There may be builtin skills, so we only check that E2E test skills don't exist
    const e2eSkillCards = page.locator('[data-testid^="my-skill-card-E2E-Test-"]');
    await expect(e2eSkillCards).toHaveCount(0);

    // Screenshot 03: Final verification
    await takeScreenshot(page, 'skills-hub/tc-s-07/03-verified-no-e2e.png');
  });
});
