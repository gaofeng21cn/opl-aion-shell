import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';
import type { OplHomeAssistant } from '@/renderer/pages/guid/utils/oplHomeAssistants';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

let isMobileLayout = false;
let electronDesktop = true;

const mocks = vi.hoisted(() => ({
  showOpenInvoke: vi.fn(),
  recentWorkspaces: [] as string[],
  appState: {} as Record<string, unknown>,
}));

const shortcutByPackage: Record<string, string> = {
  mas: 'research',
  rca: 'ppt',
  mag: 'grant',
  obf: 'book',
  oma: 'oma',
};

const homeAssistant = (packageId: string, name: string): OplHomeAssistant => ({
  id: shortcutByPackage[packageId] ?? packageId,
  opl_package_id: packageId,
  opl_shortcut_id: shortcutByPackage[packageId] ?? packageId,
  source: 'builtin',
  name,
  name_i18n: { 'en-US': name },
  description: name,
  description_i18n: { 'en-US': name },
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

const homeAssistants = [
  homeAssistant('mas', 'Med Auto Science'),
  homeAssistant('mag', 'Med Auto Grant'),
  homeAssistant('rca', 'RedCube AI'),
  homeAssistant('obf', 'OPL Book Forge'),
  homeAssistant('oma', 'OPL Meta Agent'),
];

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

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => electronDesktop,
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
      meta?: React.ReactNode;
      trailingIcon?: React.ReactNode;
      dividerBefore?: boolean;
      disabled?: boolean;
      onClick?: () => void;
      submenu?: {
        options: Array<{ key: string; label: React.ReactNode; active?: boolean; disabled?: boolean }>;
        onSelect: (key: string) => void;
      };
    }>;
  }) =>
    open ? (
      <div data-testid='mobile-action-sheet'>
        {entries.map((entry) => (
          <div key={entry.key} data-mobile-entry-key={entry.key}>
            {entry.dividerBefore && <div role='separator' data-testid={`mobile-action-sheet-divider-${entry.key}`} />}
            <button
              type='button'
              data-testid={`mobile-action-sheet-${entry.key}`}
              data-divider-before={entry.dividerBefore ? 'true' : 'false'}
              disabled={entry.disabled}
              onClick={entry.onClick}
            >
              {entry.label}
              {entry.meta && <span>{entry.meta}</span>}
              {entry.trailingIcon && (
                <span data-testid={`mobile-action-sheet-${entry.key}-trailing-icon`}>{entry.trailingIcon}</span>
              )}
            </button>
            {entry.submenu?.options.map((option) => (
              <button
                type='button'
                key={`${entry.key}:${option.key}`}
                data-testid={`mobile-action-sheet-option-${entry.key}-${option.key}`}
                data-active={option.active ? 'true' : 'false'}
                disabled={option.disabled}
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
        'guid.context.agentPackagesGroup': 'Professional agents',
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
  onFilesPicked: vi.fn(),
  modelSelectorNode: <button data-testid='model-selector'>Model</button>,
  selectedAgent: 'codex',
  effectiveModeAgent: 'codex',
  selectedMode: 'full-access',
  onModeSelect: vi.fn(),
  is_presetAgent: true,
  selectedAgentInfo: { agent_type: 'codex', name: 'Codex', is_preset: true },
  assistants: homeAssistants,
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
    electronDesktop = true;
    mocks.showOpenInvoke.mockReset();
    mocks.showOpenInvoke.mockResolvedValue([]);
    mocks.recentWorkspaces = [];
    mocks.appState = {};
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
    expect(screen.getByRole('heading', { name: 'Professional agents' })).toBeInTheDocument();
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

  it('uses browser upload as the only WebUI file entry', async () => {
    electronDesktop = false;
    render(<GuidActionRow {...buildProps()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));
    const attachFile = await screen.findByText('Attach file');
    expect(screen.queryByText('Attach folder')).not.toBeInTheDocument();
    expect(screen.queryByText('common.fileAttach.myDevice')).not.toBeInTheDocument();

    fireEvent.click(attachFile);
    expect(mocks.showOpenInvoke).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('shows owner-projected skill descriptions in the Home capability palette', async () => {
    const projectedDescription = 'Use the forensic-folio-trigger when inspecting a document artifact.';
    render(
      <GuidActionRow
        {...buildProps()}
        allSkills={[{ name: 'documents', description: projectedDescription, isAuto: false }]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));
    expect(screen.getByText(projectedDescription)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('guid-capability-palette-search'), {
      target: { value: 'forensic-folio-trigger' },
    });
    expect(screen.getByTestId('guid-capability-palette-item-skill-documents')).toBeInTheDocument();
    expect(screen.getByText(projectedDescription)).toBeInTheDocument();
  });

  it('shows every dynamic Home shortcut and keeps optional skills independent from Package membership', async () => {
    const onSelectCapability = vi.fn();
    render(
      <GuidActionRow
        {...buildProps()}
        onSelectCapability={onSelectCapability}
        allSkills={[
          { name: 'med-autoscience', description: 'Owned by MAS', isAuto: false },
          { name: 'plugin:opl-bookforge', description: 'Owned by OBF', isAuto: false },
          { name: 'arbitrary-skill', description: 'Optional skill', isAuto: false },
        ]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));
    for (const shortcutId of ['research', 'grant', 'ppt', 'book', 'oma']) {
      expect(screen.getByTestId(`guid-capability-palette-item-agent-${shortcutId}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('guid-capability-palette-item-skill-med-autoscience')).toBeInTheDocument();
    expect(screen.getByTestId('guid-capability-palette-item-skill-plugin:opl-bookforge')).toBeInTheDocument();
    expect(screen.getByText('arbitrary-skill')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('guid-capability-palette-item-agent-book'));
    expect(onSelectCapability).toHaveBeenCalledWith('book');
  });

  it('keeps a live required Skill visible, selected, and locked even when the backend assistant also reports it', async () => {
    const assistantsWithReportedSkill = [...homeAssistants];
    assistantsWithReportedSkill[0] = Object.assign({}, assistantsWithReportedSkill[0], {
      enabled_skills: ['med-autoscience'],
    });
    render(
      <GuidActionRow
        {...buildProps()}
        assistants={assistantsWithReportedSkill}
        allSkills={[
          {
            name: 'med-autoscience',
            description: 'Required by live MAS metadata',
            isAuto: false,
            required: true,
            locked: true,
          },
        ]}
        enabledSkills={['med-autoscience']}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));
    const requiredSkill = screen.getByTestId('guid-capability-palette-item-skill-med-autoscience');
    expect(requiredSkill).toBeInTheDocument();
    expect(requiredSkill).toBeDisabled();
  });

  it('keeps verification-deferred agents selectable and disables only package-unavailable agents', async () => {
    mocks.appState = {
      agent_packages: {
        status_index: {
          packages: {
            mas: {
              package_id: 'mas',
              launch_allowed: false,
              launch_blocked_reason: 'live_verification_deferred',
            },
            mag: {
              package_id: 'mag',
              launch_allowed: false,
              launch_blocked_reason: 'package_not_installed',
            },
          },
        },
      },
    };
    render(<GuidActionRow {...buildProps()} onSelectCapability={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));
    expect(screen.getByTestId('guid-capability-palette-item-agent-research')).toBeEnabled();
    expect(screen.getByTestId('guid-capability-palette-item-agent-grant')).toBeDisabled();
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
    const sheet = screen.getByTestId('mobile-action-sheet');
    const entryOrder = Array.from(sheet.querySelectorAll<HTMLElement>('[data-mobile-entry-key]')).map(
      (entry) => entry.dataset.mobileEntryKey
    );
    const modelEntryIndex = entryOrder.indexOf('model');
    expect(entryOrder.slice(modelEntryIndex, modelEntryIndex + 3)).toEqual([
      'model',
      'reasoning',
      'reset-session-defaults',
    ]);
    expect(screen.queryByTestId('mobile-action-sheet-auto')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-option-model-__auto')).toHaveAttribute('data-active', 'true');
    expect(
      Array.from(
        screen
          .getByTestId('mobile-action-sheet-model')
          .parentElement?.querySelectorAll<HTMLElement>('[data-testid^="mobile-action-sheet-option-model-"]') ?? []
      ).map((option) => option.dataset.testid)
    ).toEqual([
      'mobile-action-sheet-option-model-__auto',
      'mobile-action-sheet-option-model-gpt-5.6-sol',
      'mobile-action-sheet-option-model-gpt-5.4',
    ]);
    expect(screen.getByTestId('mobile-action-sheet-reasoning')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-model')).toBeInTheDocument();
    const resetEntry = screen.getByTestId('mobile-action-sheet-reset-session-defaults');
    expect(resetEntry).toHaveAttribute('data-divider-before', 'true');
    expect(screen.getByTestId('mobile-action-sheet-divider-reset-session-defaults')).toHaveAttribute(
      'role',
      'separator'
    );
    expect(
      screen
        .getByTestId('mobile-action-sheet-reset-session-defaults-trailing-icon')
        .querySelector('[data-opl-icon="refresh"]')
    ).not.toBeNull();
    expect(screen.getByTestId('mobile-action-sheet-active-capability')).toHaveTextContent('Capability: Research');
    expect(screen.queryByTestId('model-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('permission-mode')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-permission-read-only'));
    expect(onModeSelect).toHaveBeenCalledWith('read-only');

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-model-__auto'));
    expect(onModelChange).toHaveBeenCalledWith(null, null);

    fireEvent.click(resetEntry);
    expect(onModelChange).toHaveBeenNthCalledWith(2, null, null);

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-reasoning-ultra'));
    expect(onModelChange).toHaveBeenNthCalledWith(3, 'gpt-5.6-sol', 'ultra');

    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-model-gpt-5.4'));
    expect(onModelChange).toHaveBeenNthCalledWith(4, 'gpt-5.4', 'high');
  });
});
