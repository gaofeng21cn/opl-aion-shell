/** Skills Hub E2E: navigation to a skill that does not exist. */

import { test, expect } from '../../../fixtures';
import { goToSkillsHub, cleanupTestSkills } from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Skills Hub - Edge Cases (P2)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-23: URL parameter highlight skill (skill doesn't exist scenario)
  // ============================================================================

  test('TC-S-23: should not crash when URL highlight param references non-existent skill', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-23/01-initial-state.png');

    // React Router reads search parameters from the hash route.
    const nonExistentSkill = 'NonExistentSkill-12345';
    await page.evaluate((skillName) => {
      const [route, search] = window.location.hash.split('?');
      const params = new URLSearchParams(search);
      params.set('highlight', skillName);
      window.location.hash = `${route}?${params.toString()}`;
    }, nonExistentSkill);

    // Wait for React to process the URL change
    await page.waitForTimeout(1500);

    // Screenshot 02: After navigation with non-existent highlight
    await takeScreenshot(page, 'skills-hub/tc-s-23/02-after-navigation.png');

    // Expected: Page should not crash, My Skills section still visible
    const mySkillsSection = page.locator('[data-testid="manual-and-third-party-capabilities"]');
    await expect(mySkillsSection).toBeVisible();

    // Screenshot 03: Page still functional
    await takeScreenshot(page, 'skills-hub/tc-s-23/03-page-functional.png');

    // Expected: No skill card highlighted
    const allCards = page.locator('[data-testid^="my-skill-card-"]');
    const cardCount = await allCards.count();

    // Verify no card has highlight styles
    for (let i = 0; i < cardCount; i++) {
      const card = allCards.nth(i);
      const classes = await card.getAttribute('class');
      if (classes) {
        expect(classes).not.toMatch(/(?:^|\s)bg-fill-1(?:\s|$)/);
      }
    }

    // Expected: URL parameter stays (not cleared when skill doesn't exist)
    // App only clears param when skill is found and highlighted
    await page.waitForTimeout(500);
    const currentURL = page.url();
    expect(currentURL).toContain('highlight=');

    // Screenshot 04: Final state (no highlight, param remains)
    await takeScreenshot(page, 'skills-hub/tc-s-23/04-final-state.png');
  });
});
