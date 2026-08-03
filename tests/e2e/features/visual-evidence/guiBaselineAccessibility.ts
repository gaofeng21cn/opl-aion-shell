import type { Page } from '@playwright/test';

import type { GuiBaselineAccessibilityEvidence } from './guiBaselineManifest';

export type GuiBaselineAccessibilityOptions = {
  rootSelector?: string;
  escapeSelector?: string;
  minimumTextContrast?: number;
};

const CONTROL_SELECTOR =
  'button,a,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="option"],[role="menuitem"],[role="combobox"]';

function activeDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return 'none';
    return active.dataset.testid || active.getAttribute('aria-label') || active.getAttribute('name') || active.tagName;
  });
}

export async function collectGuiBaselineAccessibility(
  page: Page,
  options: GuiBaselineAccessibilityOptions = {}
): Promise<GuiBaselineAccessibilityEvidence> {
  const rootSelector = options.rootSelector ?? 'body';
  const minimumTextContrast = options.minimumTextContrast ?? 4.5;
  const controls = await page.locator(`${rootSelector} ${CONTROL_SELECTOR}`).evaluateAll((elements) =>
    elements
      .map((element, index) => {
        const html = element as HTMLElement;
        const style = window.getComputedStyle(html);
        const rect = html.getBoundingClientRect();
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        const accessibleName =
          html.getAttribute('aria-label') ||
          (html.getAttribute('aria-labelledby')
            ? html
                .getAttribute('aria-labelledby')
                ?.split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
                .join(' ')
                .trim()
            : '') ||
          html.getAttribute('title') ||
          html.innerText?.trim() ||
          html.getAttribute('placeholder') ||
          '';
        const role = html.getAttribute('role') || html.tagName.toLowerCase();
        const focusable =
          !html.matches(':disabled') && html.getAttribute('aria-disabled') !== 'true' && html.tabIndex >= 0;
        const id = html.dataset.testid || html.getAttribute('name') || `${role}-${index}`;
        return {
          id,
          role,
          accessible_name: accessibleName,
          focusable,
          visible,
          matched: visible && Boolean(accessibleName),
        };
      })
      .filter((control) => control.visible && control.accessible_name)
      .slice(0, 24)
  );
  if (controls.length === 0)
    throw new Error(`GUI baseline accessibility found no named controls under ${rootSelector}`);

  const initialActive = await activeDescription(page);
  const visibleControlSelector = CONTROL_SELECTOR.split(',')
    .map((selector) => `${rootSelector} ${selector}:not(:disabled):not([aria-disabled="true"]):visible`)
    .join(',');
  const firstControl = page.locator(visibleControlSelector).first();
  await firstControl.focus();
  const focusedControl = await activeDescription(page);
  if (focusedControl === 'none') {
    throw new Error(`GUI baseline accessibility could not focus a named control under ${rootSelector}`);
  }
  const focusVisible = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.matches(':focus-visible');
  });

  const overlayBefore = options.escapeSelector
    ? await page
        .locator(options.escapeSelector)
        .isVisible()
        .catch(() => false)
    : false;
  await page.keyboard.press('Escape');
  const overlayAfter = options.escapeSelector
    ? await page
        .locator(options.escapeSelector)
        .isVisible()
        .catch(() => false)
    : false;
  const escapeOutcome = options.escapeSelector
    ? overlayBefore && !overlayAfter
      ? 'closed_expected_overlay'
      : 'overlay_not_closed'
    : 'no_overlay_expected';

  const overflow = await page.evaluate(
    ({ root, controlSelector }) => {
      const host = document.querySelector<HTMLElement>(root);
      if (!host) return [{ selector: root, reason: 'root_missing' }];
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      return Array.from(host.querySelectorAll<HTMLElement>(controlSelector))
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        })
        .flatMap((element) => {
          const rect = element.getBoundingClientRect();
          const selector = element.dataset.testid || element.getAttribute('aria-label') || element.tagName;
          const violations: Array<{ selector: string; reason: string }> = [];
          if (rect.left < -1 || rect.right > viewportWidth + 1 || rect.top < -1 || rect.bottom > viewportHeight + 1) {
            violations.push({ selector, reason: 'control_outside_viewport' });
          }
          if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
            violations.push({ selector, reason: 'control_scroll_overflow' });
          }
          return violations;
        })
        .slice(0, 8);
    },
    { root: rootSelector, controlSelector: CONTROL_SELECTOR }
  );

  const contrastChecks = await page.evaluate(
    ({ root, minimum, controlSelector }) => {
      const parseColor = (value: string): [number, number, number, number] | null => {
        const trimmed = value.trim();
        const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/i);
        if (rgb) {
          const parts = rgb[1].split(',').map((part) => Number.parseFloat(part.trim()));
          if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
            return [parts[0], parts[1], parts[2], parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1];
          }
        }
        const hex = trimmed.match(/^#([0-9a-f]{3,8})$/i)?.[1];
        if (hex) {
          const expanded =
            hex.length <= 4
              ? hex
                  .split('')
                  .map((part) => `${part}${part}`)
                  .join('')
              : hex;
          const numbers = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
          const alpha = expanded.length >= 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
          return [...numbers, alpha] as [number, number, number, number];
        }
        return null;
      };
      const luminance = (value: [number, number, number, number]): number => {
        const channels = value
          .slice(0, 3)
          .map((channel) => channel / 255)
          .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const ratio = (foreground: [number, number, number, number], background: [number, number, number, number]) => {
        const foregroundLum = luminance(foreground);
        const backgroundLum = luminance(background);
        return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
      };
      const backgroundFor = (element: HTMLElement): string => {
        let current: HTMLElement | null = element;
        while (current) {
          const color = window.getComputedStyle(current).backgroundColor;
          const parsed = parseColor(color);
          if (parsed && parsed[3] > 0) return color;
          current = current.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };
      const host = document.querySelector<HTMLElement>(root);
      if (!host) return [];
      return Array.from(host.querySelectorAll<HTMLElement>(controlSelector))
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.matches(':disabled') &&
            element.getAttribute('aria-disabled') !== 'true'
          );
        })
        .map((element, index) => {
          const foreground = window.getComputedStyle(element).color;
          const background = backgroundFor(element);
          const parsedForeground = parseColor(foreground);
          const parsedBackground = parseColor(background);
          const value = parsedForeground && parsedBackground ? ratio(parsedForeground, parsedBackground) : null;
          return {
            id: element.dataset.testid || element.getAttribute('aria-label') || `control-${index}`,
            ratio: value,
            passed: value !== null && value >= minimum,
            foreground,
            background,
          };
        })
        .slice(0, 24);
    },
    { root: rootSelector, minimum: minimumTextContrast, controlSelector: CONTROL_SELECTOR }
  );

  return {
    named_controls: controls,
    focus: {
      initial_active_element: initialActive,
      focused_control: focusedControl,
      focus_visible: focusVisible,
      escape_dispatched: true,
      escape_outcome: escapeOutcome,
      focus_after_escape: await activeDescription(page),
    },
    overflow: { passed: overflow.length === 0, violations: overflow },
    rendered_contrast: {
      passed: contrastChecks.length > 0 && contrastChecks.every((check) => check.passed),
      minimum_ratio: minimumTextContrast,
      checks: contrastChecks,
    },
  };
}
