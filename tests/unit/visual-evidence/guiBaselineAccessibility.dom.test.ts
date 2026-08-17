import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateRenderedControlContrast } from '../../e2e/features/visual-evidence/guiBaselineAccessibility';

const VISIBLE_RECT = {
  x: 0,
  y: 0,
  top: 0,
  right: 40,
  bottom: 24,
  left: 0,
  width: 40,
  height: 24,
  toJSON: () => ({}),
} as DOMRect;

describe('GUI baseline rendered contrast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(VISIBLE_RECT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('samples a checked switch track instead of an inherited but unpainted text color', () => {
    document.body.innerHTML = `
      <div id="root" style="background-color: rgb(20, 21, 22)">
        <div class="opl-settings-row">
          <div class="opl-settings-row__main">Keep awake</div>
          <button
            role="switch"
            aria-checked="true"
            style="background-color: rgb(249, 250, 251); color: rgb(249, 250, 251)"
          >
            <span style="display: block; background-color: rgb(246, 246, 246)"></span>
          </button>
        </div>
      </div>
    `;

    const [check] = evaluateRenderedControlContrast({ root: '#root', minimum: 4.5, controlSelector: 'button' });

    expect(check.id).toBe('Keep awake');
    expect(check.context_label).toBe('Keep awake');
    expect(check.sample_kind).toBe('control_background_against_backdrop');
    expect(check.minimum_required).toBe(3);
    expect(check.ratio).toBeGreaterThan(3);
    expect(check.passed).toBe(true);
  });

  it('samples a switch thumb when a quiet unchecked track blends into its backdrop', () => {
    document.body.innerHTML = `
      <div id="root" style="background-color: rgb(20, 21, 22)">
        <button
          role="switch"
          aria-label="Save uploads to workspace"
          aria-checked="false"
          style="background-color: rgb(53, 54, 56); color: rgb(249, 250, 251)"
        >
          <span style="display: block; background-color: rgb(246, 246, 246)"></span>
        </button>
      </div>
    `;

    const [check] = evaluateRenderedControlContrast({ root: '#root', minimum: 4.5, controlSelector: 'button' });

    expect(check.id).toBe('Save uploads to workspace');
    expect(check.accessible_name).toBe('Save uploads to workspace');
    expect(check.sample_kind).toBe('descendant_background_against_backdrop');
    expect(check.minimum_required).toBe(3);
    expect(check.ratio).toBeGreaterThan(3);
    expect(check.passed).toBe(true);
  });

  it('keeps the 4.5 to 1 threshold for rendered control text', () => {
    document.body.innerHTML = `
      <div id="root" style="background-color: rgb(255, 255, 255)">
        <button style="background-color: transparent; color: rgb(180, 180, 180)">Low contrast label</button>
      </div>
    `;

    const [check] = evaluateRenderedControlContrast({ root: '#root', minimum: 4.5, controlSelector: 'button' });

    expect(check.sample_kind).toBe('text_or_current_color');
    expect(check.minimum_required).toBe(4.5);
    expect(check.ratio).toBeLessThan(4.5);
    expect(check.passed).toBe(false);
  });
});
