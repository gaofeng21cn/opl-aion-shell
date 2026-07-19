import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

let isMobileLayout = false;

const mocks = vi.hoisted(() => ({
  showOpenInvoke: vi.fn(),
  recentWorkspaces: [] as string[],
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: mocks.showOpenInvoke },
    },
  },
}));

vi.mock('@/renderer/components/workspace', () => ({
  addRecentWorkspace: vi.fn(),
  getRecentWorkspaces: () => mocks.recentWorkspaces,
  removeRecentWorkspace: vi.fn(),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: isMobileLayout }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  supportsModeSwitch: () => true,
  filterNonPermissionAccessModes: () => [],
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
  useAttachEntry: ({
    openFileSelector,
    openDirectorySelector,
    directoryLabel,
  }: {
    openFileSelector: () => void;
    openDirectorySelector?: () => void;
    directoryLabel?: React.ReactNode;
  }) => ({
    entries: [
      { key: 'attach', label: 'Attach file', onClick: openFileSelector },
      { key: 'attach-directory', label: directoryLabel, onClick: openDirectorySelector },
    ],
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
      const labels: Record<string, string> = {
        'guid.context.addContext': 'Add context',
        'guid.context.attachFile': 'Attach file',
        'guid.context.attachDirectory': 'Attach folder',
        'guid.context.localInputsGroup': 'Local inputs',
        'guid.context.agentPackagesGroup': 'Agent Packages',
        'guid.context.skillsGroup': 'Skills',
        'guid.context.sessionModesGroup': 'Session modes',
        'guid.context.appsAndConnectionsGroup': 'Apps & connections',
        'guid.context.skills': 'Skills',
        'guid.context.noSelectableSkills': 'No optional skills available',
        'guid.context.connections': 'Apps & connections',
        'guid.context.noConnections': 'No apps or connections available',
        'guid.workspace.manageRegistered': 'Manage folders',
      };
      if (labels[key]) return labels[key];
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
      id: 'image-generation',
      name: 'Image generation',
      enabled: true,
      transport: { type: 'stdio' as const, command: 'echo' },
      created_at: 1,
      updated_at: 1,
      original_json: '{}',
    },
  ],
  selectedMcpServerIds: ['image-generation'],
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
    mocks.showOpenInvoke.mockReset();
    mocks.showOpenInvoke.mockResolvedValue([]);
    mocks.recentWorkspaces = [];
  });

  it('keeps model and user-language permission controls inline on desktop without a purpose selector', () => {
    render(<GuidActionRow {...buildProps()} />);

    const submitArea = screen.getByTestId('guid-action-submit');
    expect(within(submitArea).getByTestId('model-selector')).toBeInTheDocument();
    expect(within(submitArea).getByTestId('permission-mode')).toHaveTextContent('Permission: Full access');
    expect(screen.queryByTestId('purpose-selector')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('opens the desktop context menu on click and keeps file and directory attachment paths distinct', async () => {
    const user = userEvent.setup();
    render(<GuidActionRow {...buildProps()} />);

    await user.click(screen.getByRole('button', { name: 'Add context' }));
    expect(await screen.findByText('Attach file')).toBeInTheDocument();
    expect(screen.getByText('Attach folder')).toBeInTheDocument();
    expect(screen.queryByText(/Working directory/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Apps & connections' })).toBeInTheDocument();
    expect(screen.queryByText(/\bMCP\b|provider|team/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Attach file'));
    await waitFor(() =>
      expect(mocks.showOpenInvoke).toHaveBeenLastCalledWith({ properties: ['openFile', 'multiSelections'] })
    );

    await user.click(screen.getByRole('button', { name: 'Add context' }));
    fireEvent.click(await screen.findByText('Attach folder'));
    await waitFor(() =>
      expect(mocks.showOpenInvoke).toHaveBeenLastCalledWith({ properties: ['openDirectory', 'multiSelections'] })
    );
  });

  it('keeps working-directory selection out of the action row and capability palette', async () => {
    render(<GuidActionRow {...buildProps()} />);
    expect(screen.queryByTestId('guid-workspace-chip')).not.toBeInTheDocument();
    expect(screen.queryByText('No Project')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));
    expect(screen.queryByText(/Working directory/)).not.toBeInTheDocument();
  });

  it('toggles new-session skills and connections without moving working-directory selection into the mobile sheet', async () => {
    isMobileLayout = true;
    const onToggleSkill = vi.fn();
    const onToggleMcpServer = vi.fn();

    render(<GuidActionRow {...buildProps()} onToggleSkill={onToggleSkill} onToggleMcpServer={onToggleMcpServer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add context' }));

    expect(screen.queryByTestId('mobile-action-sheet-workspace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-capability-skills-skill-arbitrary-skill'));
    expect(onToggleSkill).toHaveBeenCalledWith('arbitrary-skill', false);

    fireEvent.click(
      screen.getByTestId('mobile-action-sheet-option-capability-apps_and_connections-connection-image-generation')
    );
    expect(onToggleMcpServer).toHaveBeenCalledWith('image-generation');
  });

  it('moves the full context surface into the mobile sheet while keeping only attachments disabled', () => {
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

    const plusButton = screen.getByRole('button', { name: 'Add context' });
    expect(plusButton).toBeEnabled();
    fireEvent.click(plusButton);

    expect(screen.getByTestId('mobile-action-sheet-attach-file')).toBeDisabled();
    expect(screen.getByTestId('mobile-action-sheet-attach-directory')).toBeDisabled();
    expect(screen.queryByTestId('mobile-action-sheet-workspace')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-capability-agent_packages')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-capability-skills')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-capability-apps_and_connections')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-permission')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-auto')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-reasoning')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-model')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-active-capability')).toHaveTextContent('Capability: Research');
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
