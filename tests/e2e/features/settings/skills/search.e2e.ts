/** Skills Hub E2E: search installed manual skills. */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  getMySkills,
  importSkillViaBridge,
  searchMySkills,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Search (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-02: Search My Skills (match scenario)
  // ============================================================================

  test('TC-S-02: should filter My Skills list by search keyword', async ({ page }) => {
    // Setup: Create 3 test skills with unique names
    const timestamp = Date.now();
    const tempSource = createTempExternalSource('tc-s-02');
    try {
      const skill1 = `E2E-Test-Search-Target-${timestamp}`;
      const skill2 = `E2E-Test-Alpha-${timestamp}`;
      const skill3 = `E2E-Test-Beta-${timestamp}`;

      createTestSkill(tempSource.path, skill1, 'target skill for search test');
      createTestSkill(tempSource.path, skill2, 'Alpha skill');
      createTestSkill(tempSource.path, skill3, 'Beta skill');

      const import1 = await importSkillViaBridge(page, path.join(tempSource.path, skill1));
      const import2 = await importSkillViaBridge(page, path.join(tempSource.path, skill2));
      const import3 = await importSkillViaBridge(page, path.join(tempSource.path, skill3));

      expect(import1.success).toBe(true);
      expect(import2.success).toBe(true);
      expect(import3.success).toBe(true);

      await refreshSkillsHub(page);

      // Wait for My Skills section to load
      const mySkillsSection = page.locator('[data-testid="manual-and-third-party-capabilities"]');
      await expect(mySkillsSection).toBeVisible();

      // Verify 3 skills exist via Bridge before UI search
      const mySkills = await getMySkills(page);
      const testSkills = mySkills.filter((s) => s.name.includes(`-${timestamp}`));
      expect(testSkills.length).toBe(3);

      // Screenshot 01: Initial state with 3 skills
      await takeScreenshot(page, 'skills-hub/tc-s-02/01-before-search.png');

      // Step 2: Enter search keyword in My Skills search box
      await searchMySkills(page, 'Search');

      // Wait for search results to render
      await page.waitForTimeout(500);

      // Screenshot 02: After search
      await takeScreenshot(page, 'skills-hub/tc-s-02/02-search-results.png');

      // Expected: Only skill with "Search" in name visible
      const targetCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skill1)}"]`);
      await expect(targetCard).toBeVisible();

      // Expected: Other cards not visible
      const alphaCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skill2)}"]`);
      const betaCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skill3)}"]`);
      await expect(alphaCard).not.toBeVisible();
      await expect(betaCard).not.toBeVisible();

      // Screenshot 03: Only target card visible
      await takeScreenshot(page, 'skills-hub/tc-s-02/03-filtered-result.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-03: Search My Skills (no match scenario)
  // ============================================================================

  test('TC-S-03: should show empty state when search has no match', async ({ page }) => {
    // Setup: Create 1 test skill
    const tempSource = createTempExternalSource('tc-s-03');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Skill', 'Test skill');
      await importSkillViaBridge(page, path.join(tempSource.path, 'E2E-Test-Skill'));

      await refreshSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-03/01-before-search.png');

      // Step 2: Search with non-existent keyword
      await searchMySkills(page, 'NonExistentKeyword');
      await page.waitForTimeout(300);

      // Screenshot 02: After search
      await takeScreenshot(page, 'skills-hub/tc-s-03/02-no-results.png');

      // Expected: Skill card not visible
      const skillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Skill')}"]`);
      await expect(skillCard).not.toBeVisible();

      // Expected: Empty state message visible (note: don't match i18n text)
      const mySkillsSection = page.locator('[data-testid="manual-and-third-party-capabilities"]');
      await expect(mySkillsSection).toBeVisible();

      // Screenshot 03: Empty state
      await takeScreenshot(page, 'skills-hub/tc-s-03/03-empty-state.png');
    } finally {
      tempSource.cleanup();
    }
  });
});
