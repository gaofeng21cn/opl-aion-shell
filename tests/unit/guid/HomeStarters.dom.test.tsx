import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import HomeStarters from '@/renderer/pages/guid/components/HomeStarters';

vi.mock('@/renderer/pages/guid/utils/oplHomeAssistants', () => ({
  getOplHomePurposeAssistantIds: () => [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-bookforge',
    'opl-meta-agent',
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const assistant = (id: string): Assistant => ({
  id,
  source: 'builtin',
  name: id.toUpperCase(),
  name_i18n: { 'en-US': id.toUpperCase() },
  description_i18n: {},
  enabled: true,
  sort_order: 1,
  preset_agent_type: 'codex',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
});

describe('HomeStarters', () => {
  it('shows no more than four App-owned starters and selects one capability', async () => {
    const onSelect = vi.fn();
    render(
      <HomeStarters
        assistants={['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge', 'opl-meta-agent'].map(
          assistant
        )}
        localeKey='en-US'
        onSelect={onSelect}
      />
    );

    expect(screen.getAllByTestId(/^home-starter-/)).toHaveLength(4);
    expect(screen.queryByTestId('home-starter-opl-meta-agent')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('home-starter-med-autogrant'));
    expect(onSelect).toHaveBeenCalledWith('med-autogrant');
  });
});
