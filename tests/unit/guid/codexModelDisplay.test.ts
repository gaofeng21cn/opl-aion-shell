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

    expect(display.label).toBe('GPT-5.4');
    expect(display.reasoningLabel).toBe('推理超高');
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
    expect(display.reasoningLabel).toBe('推理超高');
    expect(display.label).not.toContain('gpt-5.3-codex');
  });

  it('marks the auto option as recommended and explains the current resolved model', () => {
    const option = buildOplCodexAutoModelOption({
      currentModelId: 'gpt-5.5',
      currentModelLabel: 'GPT-5.5',
      reasoningEffort: 'xhigh',
      localeKey: 'zh-CN',
    });

    expect(option.label).toBe('自动（推荐）');
    expect(option.description).toBe('当前 GPT-5.5 · 推理超高 · 跟随最新最强');
  });

  it('uses localized reasoning labels', () => {
    expect(formatOplCodexReasoningLabel('high', 'zh-CN')).toBe('推理高');
    expect(formatOplCodexReasoningLabel('high', 'en-US')).toBe('High reasoning');
    expect(formatOplCodexReasoningLabel('xhigh', 'zh-CN')).toBe('推理超高');
    expect(formatOplCodexReasoningLabel('xhigh', 'en-US')).toBe('Ultra reasoning');
  });

  it('formats compact labels for the selector button and menu rows', () => {
    expect(formatOplCodexCompactModelLabel('GPT-5.5')).toBe('5.5');
    expect(formatOplCodexCompactModelLabel('GPT-5.3 Codex')).toBe('5.3 Codex');
    expect(formatOplCodexReasoningMenuLabel('high', 'zh-CN')).toBe('高');
    expect(formatOplCodexReasoningMenuLabel('xhigh', 'en-US')).toBe('Ultra');
  });
});
