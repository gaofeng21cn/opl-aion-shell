import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';

let isMobileLayout = false;

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: isMobileLayout }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  supportsModeSwitch: () => true,
}));

vi.mock('@/renderer/hooks/agent/useAgentModesForBackend', () => ({
  useAgentModesForBackend: () => [
    { value: 'read-only', label: 'Read Only' },
    { value: 'full-access', label: 'Full Access' },
  ],
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <button data-testid='permission-mode'>Permission: Full access</button>,
}));

vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: ({
    open,
    entries,
  }: {
    open: boolean;
    entries: Array<{
      key: string;
      label: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      submenu?: { options: Array<{ key: string; label: React.ReactNode }>; onSelect: (key: string) => void };
    }>;
  }) =>
    open ? (
      <div data-testid='mobile-action-sheet'>
        {entries.map((entry) => (
          <div key={entry.key}>
            <button
              type='button'
              data-testid={`mobile-action-sheet-${entry.key}`}
              disabled={entry.disabled}
              onClick={entry.onClick}
            >
              {entry.label}
            </button>
            {entry.submenu?.options.map((option) => (
              <button
                type='button'
                key={`${entry.key}:${option.key}`}
                data-testid={`mobile-action-sheet-option-${entry.key}-${option.key}`}
                onClick={() => entry.submenu?.onSelect(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    ) : null,
  useAttachEntry: () => ({
    entries: [{ key: 'attach', label: 'Add files', onClick: vi.fn() }],
    hiddenFileInput: null,
  }),
}));

vi.mock('@/renderer/pages/guid/components/PresetAgentTag', () => ({
  default: () => <div data-testid='purpose-selector'>Purpose</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'guid.home.activeCapability') return `Capability: ${String(options?.capability ?? '')}`;
      return String(options?.defaultValue ?? key);
    },
  }),
}));

const buildProps = () => ({
  files: [] as string[],
  onFilesUploaded: vi.fn(),
  modelSelectorNode: <button data-testid='model-selector'>Model</button>,
  selectedAgent: 'codex',
  effectiveModeAgent: 'codex',
  selectedMode: 'full-access',
  onModeSelect: vi.fn(),
  is_presetAgent: true,
  selectedAgentInfo: { agent_type: 'codex', name: 'Codex', is_preset: true },
  assistants: [],
  localeKey: 'en-US',
  onClosePresetTag: vi.fn(),
  allSkills: [{ name: 'arbitrary-skill', description: 'Not mobile', isAuto: false }],
  disabledBuiltinSkills: [],
  enabledSkills: ['arbitrary-skill'],
  onToggleSkill: vi.fn(),
  mcpServers: [
    {
      id: 'raw-mcp',
      name: 'Raw MCP',
      enabled: true,
      transport: { type: 'stdio' as const, command: 'echo' },
      created_at: 1,
      updated_at: 1,
      original_json: '{}',
    },
  ],
  selectedMcpServerIds: ['raw-mcp'],
  onToggleMcpServer: vi.fn(),
  hidePresetTag: true,
  showModeSelector: true,
  loading: false,
  isButtonDisabled: false,
  onSend: vi.fn(),
});

describe('GuidActionRow composer controls', () => {
  beforeEach(() => {
    isMobileLayout = false;
  });

  it('keeps model and user-language permission controls inline on desktop without a purpose selector', () => {
    render(<GuidActionRow {...buildProps()} />);

    const submitArea = screen.getByTestId('guid-action-submit');
    expect(within(submitArea).getByTestId('model-selector')).toBeInTheDocument();
    expect(within(submitArea).getByTestId('permission-mode')).toHaveTextContent('Permission: Full access');
    expect(screen.queryByTestId('purpose-selector')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('moves mobile Home controls into the allowed action sheet and keeps projectless configuration reachable', () => {
    isMobileLayout = true;
    const onModeSelect = vi.fn();
    const onModelChange = vi.fn();

    render(
      <GuidActionRow
        {...buildProps()}
        fileAccessDisabled
        fileAccessDisabledReason='Select a project to attach files'
        onModeSelect={onModeSelect}
        activeCapabilityLabel='Research'
        mobileCodexModelSelection={{
          modelInfo: {
            current_model_id: 'gpt-5.6-sol',
            current_model_label: 'GPT-5.6-Sol',
            available_models: [
              { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
              { id: 'gpt-5.4', label: 'GPT-5.4' },
            ],
          },
          selectedModelId: null,
          selectedReasoningEffort: 'high',
          onChange: onModelChange,
        }}
      />
    );

    const plusButton = screen.getByRole('button', { name: 'More' });
    expect(plusButton).toBeEnabled();
    fireEvent.click(plusButton);

    expect(screen.getByTestId('mobile-action-sheet-attach')).toBeDisabled();
    expect(screen.getByTestId('mobile-action-sheet-permission')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-auto')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-reasoning')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-model')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-active-capability')).toHaveTextContent('Capability: Research');
    expect(screen.queryByTestId('mobile-action-sheet-skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-action-sheet-mcp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('permission-mode')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-permission-read-only'));
    expect(onModeSelect).toHaveBeenCalledWith('read-only');

    fireEvent.click(screen.getByTestId('mobile-action-sheet-auto'));
    expect(onModelChange).toHaveBeenCalledWith(null, null);

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-reasoning-ultra'));
    expect(onModelChange).toHaveBeenCalledWith('gpt-5.6-sol', 'ultra');

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-model-gpt-5.4'));
    expect(onModelChange).toHaveBeenCalledWith('gpt-5.4', 'high');
  });
});
