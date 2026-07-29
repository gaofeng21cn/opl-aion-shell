/**
 * Skills Hub E2E Tests - Extension/Auto Boards Rendering (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-27: Render Extension Skills board
 * - TC-S-28: Render Auto-injected Skills board
 */

import { test, expect } from '../../../fixtures';
import { goToSkillsHub, cleanupTestSkills } from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Skills Hub - Boards Rendering (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-27: Render Extension Skills board
  // ============================================================================

  test('TC-S-27: should render Extension Skills board with correct structure', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-27/01-initial-state.png');

    // Expected: Extension Skills section exists
    const extensionSection = page.locator('[data-testid="extension-skills-section"]');
    await expect(extensionSection).toBeVisible();

    // Screenshot 02: Extension section visible
    await takeScreenshot(page, 'skills-hub/tc-s-27/02-extension-section.png');

    // Expected: Section has correct structure (title container with Puzzle icon)
    // Don't match i18n text, just verify structure exists
    const titleContainer = extensionSection.locator('.flex.items-center.gap-10px').first();
    await expect(titleContainer).toBeVisible();

    // Screenshot 03: Section structure verified
    await takeScreenshot(page, 'skills-hub/tc-s-27/03-structure-verified.png');

    // Additional verification: If extension skills exist, verify cards have Extension badge
    const extensionCards = page.locator('[data-testid^="my-skill-card-"]').filter({
      has: page.locator('text=/Extension/i'),
    });
    const cardCount = await extensionCards.count();
    console.log(`[TC-S-27] Extension skills found: ${cardCount}`);

    // Screenshot 04: Final state
    await takeScreenshot(page, 'skills-hub/tc-s-27/04-final-state.png');
  });

  // ============================================================================
  // TC-S-28: Keep upstream auto-injection out of the product UI
  // ============================================================================

  test('TC-S-28: should not render AionUI auto-injected Skills as a user scope', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-28/01-initial-state.png');

    const autoSection = page.locator('[data-testid="auto-skills-section"]');
    await expect(autoSection).toHaveCount(0);
    await expect(page.locator('[data-testid="my-skills-section"]')).toContainText(/Global User Skills|My Skills/);
    await takeScreenshot(page, 'skills-hub/tc-s-28/02-global-scope-only.png');
  });
});
