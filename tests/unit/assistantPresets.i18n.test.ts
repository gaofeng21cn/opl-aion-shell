import { describe, expect, it } from 'vitest';
import { ASSISTANT_PRESETS } from '../../src/common/config/presets/assistantPresets';

describe('assistant preset locale coverage', () => {
  it('keeps preset locale metadata limited to Simplified Chinese and English', () => {
    const extraLocaleKeys = ASSISTANT_PRESETS.flatMap((preset) =>
      [
        ...Object.keys(preset.ruleFiles),
        ...Object.keys(preset.skillFiles ?? {}),
        ...Object.keys(preset.nameI18n),
        ...Object.keys(preset.descriptionI18n),
        ...Object.keys(preset.promptsI18n ?? {}),
      ].filter((locale) => locale !== 'zh-CN' && locale !== 'en-US')
    );

    expect(extraLocaleKeys).toEqual([]);
  });
});

describe('OPL domain assistant presets', () => {
  it('keeps OPL and active domain assistants available as Codex presets', () => {
    const presets = new Map(ASSISTANT_PRESETS.map((preset) => [preset.id, preset]));

    for (const id of ['one-person-lab', 'med-auto-science', 'med-auto-grant', 'redcube-ai']) {
      expect(presets.get(id)?.presetAgentType).toBe('codex');
    }
  });
});
