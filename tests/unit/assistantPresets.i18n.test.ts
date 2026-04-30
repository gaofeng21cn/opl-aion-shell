import { describe, expect, it } from 'vitest';
import { ASSISTANT_PRESETS } from '../../src/common/config/presets/assistantPresets';

describe('assistant preset ru-RU coverage', () => {
  it('every preset with a ru-RU name also has a ru-RU description', () => {
    const missing = ASSISTANT_PRESETS.filter(
      (preset) => preset.nameI18n['ru-RU'] && !preset.descriptionI18n['ru-RU']
    ).map((preset) => preset.id);

    expect(missing).toEqual([]);
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
