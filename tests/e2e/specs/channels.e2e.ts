/**
 * Channels – enable / disable toggle tests.
 *
 * Covers:
 *  - Navigating to the channels settings (webui tab → channels sub-tab)
 *  - Channel list renders with known channels
 *  - Toggle switches are visible for active channels
 *  - "Coming soon" channels have disabled toggles
 */
import { test, expect } from '../fixtures';
import { goToChannelsTab, channelItemById, channelSwitchById, takeScreenshot, waitForClassChange } from '../helpers';

const ACTIVE_CHANNEL_IDS = ['telegram', 'lark', 'dingtalk'] as const;
const COMING_SOON_CHANNEL_IDS = ['slack', 'discord'] as const;

test.describe('Channels', () => {
  test('channels settings page renders', async ({ page }) => {
    await goToChannelsTab(page);
    await expect(page.locator(channelItemById('telegram'))).toBeVisible({ timeout: 8_000 });
  });

  test('expanded channel forms fit a 400px viewport and keep disclosures keyboard accessible', async ({ page }) => {
    const originalViewport = page.viewportSize() || { width: 1280, height: 800 };

    try {
      await page.setViewportSize({ width: 400, height: 600 });
      await goToChannelsTab(page);

      const channelsTab = page.getByRole('tab', { name: /^(Channels|频道)/i }).first();
      await expect(channelsTab).toBeVisible();
      await expect(channelsTab).toHaveAttribute('aria-selected', 'true');

      const firstChannel = page.locator('[data-channel-id]').first();
      await expect(firstChannel).toBeVisible();
      const firstChannelBox = await firstChannel.boundingBox();
      expect(firstChannelBox).not.toBeNull();
      expect(firstChannelBox!.y).toBeGreaterThanOrEqual(0);
      expect(firstChannelBox!.y + firstChannelBox!.height).toBeLessThanOrEqual(600);

      const lark = page.locator(channelItemById('lark')).first();
      await expect(lark).toBeVisible({ timeout: 8_000 });
      const disclosure = lark.locator('[data-channel-disclosure]');
      await disclosure.scrollIntoViewIfNeeded();
      await disclosure.focus();
      await expect(disclosure).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

      const firstRow = lark.locator('[data-channel-preference-row]').first();
      await expect(firstRow).toBeVisible({ timeout: 8_000 });

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow).toEqual({ body: 0, document: 0 });

      const overflowingRows = await lark
        .locator('[data-channel-preference-row]')
        .evaluateAll((rows) => rows.filter((row) => row.scrollWidth > row.clientWidth + 1).length);
      expect(overflowingRows).toBe(0);

      if (process.env.E2E_SCREENSHOTS) {
        await takeScreenshot(page, 'channels-settings-400x600');
      }

      const optionalToggle = lark.getByTestId('lark-optional-fields-toggle');
      await optionalToggle.scrollIntoViewIfNeeded();
      await expect(optionalToggle).toHaveAttribute('aria-expanded', 'false');
      await optionalToggle.focus();
      await page.keyboard.press('Enter');
      await expect(optionalToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(lark.locator('#lark-optional-fields')).toBeVisible();
    } finally {
      await page.setViewportSize(originalViewport);
    }
  });

  test('known channels are listed', async ({ page }) => {
    await goToChannelsTab(page);

    const visibleCount = (
      await Promise.all(
        ACTIVE_CHANNEL_IDS.map(async (id) => {
          return (await page.locator(channelItemById(id)).count()) > 0 ? 1 : 0;
        })
      )
    ).reduce((sum, n) => sum + n, 0);

    expect(visibleCount).toBeGreaterThanOrEqual(2);
  });

  test('toggle switches are visible for channels', async ({ page }) => {
    await goToChannelsTab(page);

    const visibleSwitches = (
      await Promise.all(
        ACTIVE_CHANNEL_IDS.map(async (id) => {
          const sw = page.locator(channelSwitchById(id)).first();
          return (await sw.count()) > 0 ? 1 : 0;
        })
      )
    ).reduce((sum, n) => sum + n, 0);

    expect(visibleSwitches).toBeGreaterThanOrEqual(1);
  });

  test('can toggle a channel switch', async ({ page }) => {
    await goToChannelsTab(page);

    let toggled = false;
    for (const id of ACTIVE_CHANNEL_IDS) {
      const sw = page.locator(channelSwitchById(id)).first();
      if ((await sw.count()) === 0) continue;

      await expect(sw).toBeVisible({ timeout: 5_000 });
      const classBefore = await sw.getAttribute('class');
      if (classBefore?.includes('arco-switch-disabled')) continue;

      const checkedBefore = classBefore?.includes('arco-switch-checked');
      await sw.click();
      await waitForClassChange(sw, 1200);

      const classAfter = await sw.getAttribute('class');
      const checkedAfter = classAfter?.includes('arco-switch-checked');
      toggled = true;

      if (checkedBefore !== checkedAfter) {
        await sw.click();
        await waitForClassChange(sw, 1000);
      }
      break;
    }

    expect(toggled).toBeTruthy();
  });

  test('coming-soon channels have disabled switches', async ({ page }) => {
    await goToChannelsTab(page);

    for (const id of COMING_SOON_CHANNEL_IDS) {
      const item = page.locator(`${channelItemById(id)}[data-channel-status="coming_soon"]`).first();
      await expect(item).toBeVisible({ timeout: 8_000 });

      const sw = item.locator(channelSwitchById(id)).first();
      await expect(sw).toBeVisible({ timeout: 5_000 });

      const cls = (await sw.getAttribute('class')) || '';
      const ariaDisabled = await sw.getAttribute('aria-disabled');
      const dataDisabled = await sw.getAttribute('data-channel-switch-disabled');
      const disabledAttr = await sw.getAttribute('disabled');
      expect(
        cls.includes('arco-switch-disabled') ||
          ariaDisabled === 'true' ||
          dataDisabled === 'true' ||
          disabledAttr !== null
      ).toBeTruthy();
    }
  });

  test('screenshot: channels settings', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToChannelsTab(page);
    await takeScreenshot(page, 'channels-settings');
  });
});
