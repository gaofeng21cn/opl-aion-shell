/**
 * Skills Hub E2E: extension inventory and exclusion of runtime-managed scopes.
 */

import { test, expect } from '../../../fixtures';
import { goToSkillsHub, getMySkills, cleanupTestSkills } from '../../../helpers/skillsHub';
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

    const extensionSkills = (await getMySkills(page)).filter((skill) => skill.source === 'extension');
    const extensionSection = page.locator('[data-testid="extension-skills-section"]');
    if (extensionSkills.length === 0) {
      await expect(extensionSection).toHaveCount(0);
      return;
    }
    await expect(extensionSection).toBeVisible();

    // Screenshot 02: Extension section visible
    await takeScreenshot(page, 'skills-hub/tc-s-27/02-extension-section.png');

    // Expected: Section has correct structure (title container with Puzzle icon)
    // Don't match i18n text, just verify structure exists
    const titleContainer = extensionSection.locator('.flex.items-center.gap-10px').first();
    await expect(titleContainer).toBeVisible();

    // Screenshot 03: Section structure verified
    await takeScreenshot(page, 'skills-hub/tc-s-27/03-structure-verified.png');

    await Promise.all(
      extensionSkills.map((skill) =>
        expect(extensionSection.getByRole('heading', { name: skill.name, exact: true })).toBeVisible()
      )
    );

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
    await expect(page.getByTestId('manual-and-third-party-capabilities')).toBeVisible();
    await takeScreenshot(page, 'skills-hub/tc-s-28/02-global-scope-only.png');
  });
});
