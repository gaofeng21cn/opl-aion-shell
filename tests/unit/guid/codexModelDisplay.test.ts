import { describe, expect, it } from 'vitest';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexCompactModelLabel,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningLabel,
  formatOplCodexReasoningMenuLabel,
} from '@/renderer/utils/model/oplCodexModelDisplay';

describe('oplCodexModelDisplay', () => {
  it('formats fixed Codex model options with friendly model names and separate reasoning labels', () => {
    const display = formatOplCodexModelDisplay({
      id: 'gpt-5.4',
      label: 'gpt-5.4',
      reasoningEffort: 'xhigh',
      localeKey: 'zh-CN',
    });

    expect(display.label).toBe('5.4');
    expect(display.reasoningLabel).toBe('超高');
    expect(display.description).toBe('固定此模型');
    expect(display.label).not.toContain('gpt-5.4');
  });

  it('formats Codex-specialized model ids without exposing raw slugs', () => {
    const display = formatOplCodexModelDisplay({
      id: 'gpt-5.3-codex',
      label: 'gpt-5.3-codex',
      reasoningEffort: 'xhigh',
      localeKey: 'zh-CN',
    });

    expect(display.label).toBe('GPT-5.3 Codex');
    expect(display.reasoningLabel).toBe('超高');
    expect(display.label).not.toContain('gpt-5.3-codex');
  });

  it('explains the compatible fallback when the live Codex catalog is unavailable', () => {
    const option = buildOplCodexAutoModelOption({
      modelInfo: {
        current_model_id: null,
        current_model_label: null,
        available_models: [
          { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
          { id: 'gpt-5.5', label: 'GPT-5.5' },
        ],
      },
      localeKey: 'zh-CN',
    });
    expect(option.label).toBe('自动（推荐）');
    expect(option.description).toBe('当前 5.6 Sol · 超高 · 跟随最新最强');
  });

  it('displays an unknown catalog default and its highest advertised reasoning effort', () => {
    const option = buildOplCodexAutoModelOption({
      modelInfo: {
        current_model_id: 'gpt-5.6-sol',
        current_model_label: '5.6 Sol',
        available_models: [{ id: 'gpt-5.6-sol', label: '5.6 Sol' }],
        catalog_models: [
          { id: 'gpt-5.6-sol', label: '5.6 Sol' },
          {
            id: 'gpt-6',
            label: 'GPT-6',
            isDefault: true,
            supportedReasoningEfforts: [{ reasoningEffort: 'xhigh' }, { reasoningEffort: 'ultra' }],
          },
        ],
      },
      localeKey: 'en-US',
    });

    expect(option.label).toBe('Auto (recommended)');
    expect(option.description).toBe('Current GPT-6 · Ultra · follows latest strongest');
  });

  it('uses localized reasoning labels', () => {
    expect(formatOplCodexReasoningLabel('high', 'zh-CN')).toBe('高');
    expect(formatOplCodexReasoningLabel('high', 'en-US')).toBe('High');
    expect(formatOplCodexReasoningLabel('xhigh', 'zh-CN')).toBe('超高');
    expect(formatOplCodexReasoningLabel('xhigh', 'en-US')).toBe('Extra high');
    expect(formatOplCodexReasoningLabel('ultra', 'zh-CN')).toBe('极高');
    expect(formatOplCodexReasoningLabel('ultra', 'en-US')).toBe('Ultra');
  });

  it('formats compact labels for the selector button and menu rows', () => {
    expect(formatOplCodexCompactModelLabel('GPT-5.5')).toBe('5.5');
    expect(formatOplCodexCompactModelLabel('5.6 Sol')).toBe('5.6 Sol');
    expect(formatOplCodexCompactModelLabel('GPT-5.3 Codex')).toBe('5.3 Codex');
    expect(formatOplCodexReasoningMenuLabel('high', 'zh-CN')).toBe('高');
    expect(formatOplCodexReasoningMenuLabel('xhigh', 'en-US')).toBe('Extra high');
    expect(formatOplCodexReasoningMenuLabel('ultra', 'zh-CN')).toBe('极高');
    expect(formatOplCodexReasoningMenuLabel('ultra', 'en-US')).toBe('Ultra');
  });
});
