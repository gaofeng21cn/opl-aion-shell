import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  supportsModeSwitch: () => true,
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <button data-testid='permission-mode'>Permission: Full access</button>,
}));

vi.mock('@/renderer/pages/guid/components/PresetAgentTag', () => ({
  default: () => <div data-testid='purpose-selector'>Purpose</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GuidActionRow composer controls', () => {
  it('keeps model and user-language permission controls in the bottom action row without a purpose selector', () => {
    render(
      <GuidActionRow
        files={[]}
        onFilesUploaded={vi.fn()}
        modelSelectorNode={<button data-testid='model-selector'>Model</button>}
        selectedAgent='codex'
        effectiveModeAgent='codex'
        selectedMode='default'
        onModeSelect={vi.fn()}
        is_presetAgent
        selectedAgentInfo={{ agent_type: 'codex', name: 'Codex', is_preset: true }}
        assistants={[]}
        localeKey='en-US'
        onClosePresetTag={vi.fn()}
        allSkills={[]}
        disabledBuiltinSkills={[]}
        enabledSkills={[]}
        onToggleSkill={vi.fn()}
        mcpServers={[]}
        selectedMcpServerIds={[]}
        onToggleMcpServer={vi.fn()}
        hidePresetTag
        showModeSelector
        loading={false}
        isButtonDisabled={false}
        onSend={vi.fn()}
      />
    );

    const submitArea = screen.getByTestId('guid-action-submit');
    expect(within(submitArea).getByTestId('model-selector')).toBeInTheDocument();
    expect(within(submitArea).getByTestId('permission-mode')).toHaveTextContent('Permission: Full access');
    expect(screen.queryByTestId('purpose-selector')).not.toBeInTheDocument();
  });
});
