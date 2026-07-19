import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';
import SettingsModal, { SubModal } from '@/renderer/components/settings/SettingsModal';
import ChannelItem, {
  ChannelEmptyState,
  ChannelPreferenceRow,
  ChannelStatusBadge,
} from '@/renderer/components/settings/SettingsModal/contents/channels/ChannelItem';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import SettingsSider from '@/renderer/pages/settings/components/SettingsSider';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    children,
    visible,
    title,
    style,
    contentStyle,
  }: {
    children: React.ReactNode;
    visible: boolean;
    title?: string;
    style?: React.CSSProperties;
    contentStyle?: React.CSSProperties;
  }) =>
    visible ? (
      <div data-testid='settings-modal' data-content-border-radius={String(contentStyle?.borderRadius)} style={style}>
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => (
    <div data-testid='system-content'>
      System <section id='working-directories'>Working directories target</section>
    </div>
  ),
}));

vi.mock('@/renderer/pages/settings/sections/OverviewSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='overview-content'>Overview content {withWrapper === false ? 'embedded' : 'wrapped'}</div>
  ),
}));

vi.mock('@/renderer/pages/settings/sections/RuntimeSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='runtime-content'>
      Runtime content {withWrapper === false ? 'embedded' : 'wrapped'}
      <section id='updates'>Updates target</section>
      <section id='services'>Services target</section>
      <section id='diagnostics'>Diagnostics target</section>
    </div>
  ),
}));

vi.mock('@/renderer/pages/settings/sections/WorkspaceSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='workspace-content'>Workspace content {withWrapper === false ? 'embedded' : 'wrapped'}</div>
  ),
}));

vi.mock('@/renderer/pages/settings/sections/LocalServicesSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='local-services-content'>
      Local Services content {withWrapper === false ? 'embedded' : 'wrapped'}
    </div>
  ),
}));

vi.mock('@/renderer/pages/settings/StorageSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='storage-content'>Storage content {withWrapper === false ? 'embedded' : 'wrapped'}</div>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-content'>About</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='tools-content'>Tools</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div data-testid='webui-content'>Can Codex CLI and providers work now?</div>,
}));

vi.mock('@/renderer/pages/settings/sections/AccessSettings', () => ({
  AccessSettingsContent: () => <div data-testid='access-content'>Model & Account remote Docker WebUI access</div>,
  GatewaySettingsContent: () => <div data-testid='gateway-content'>OPL Gateway account</div>,
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='access-content'>Access content {withWrapper === false ? 'embedded' : 'wrapped'}</div>
  ),
}));

vi.mock('@/renderer/pages/settings/sections/ResourcesSettings', () => ({
  ResourcesSettingsContent: () => <div data-testid='resources-content'>Resources & Connections Docker WebUI cloud</div>,
  default: () => <div data-testid='resources-content'>Resources & Connections Docker WebUI cloud</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent', () => ({
  default: () => (
    <div data-testid='appearance-content'>
      Appearance <section id='themes'>Themes target</section>
    </div>
  ),
}));

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: () => <div data-testid='skills-content'>Skills</div>,
}));

vi.mock('@/renderer/pages/settings/CapabilitiesSettings', () => ({
  AgentPackagesSettingsContent: () => <div data-testid='agents-content'>Agent packages MAS MAG RCA OMA</div>,
  CapabilitiesSettingsContent: ({ activeTab }: { activeTab: 'opl_flow_managed' | 'manual_and_third_party' }) => (
    <div data-testid='capabilities-content'>
      Agents & Capabilities embedded MAS MAG RCA OMA Skills Tools active:{activeTab}
    </div>
  ),
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='capabilities-content'>
      Agents & Capabilities {withWrapper === false ? 'embedded' : 'wrapped'} MAS MAG RCA OMA Skills Tools
    </div>
  ),
}));

vi.mock('@/renderer/hooks/system/useExtensionSettingsTabs', () => ({
  useExtensionSettingsTabs: () => [],
}));

vi.mock('@/renderer/hooks/system/useExtI18n', () => ({
  useExtI18n: () => ({ resolveExtTabName: (tab: { id: string }) => tab.id }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: true }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  resolveExtensionAssetUrl: () => '',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.title': 'Settings',
        'settings.overview': 'Overview',
        'settings.maintenance': 'Maintenance',
        'settings.workspace': 'Workspace',
        'settings.workspacePersonalization': 'Workspace',
        'settings.localServices': 'Local Services',
        'settings.storage': 'Data & Storage',
        'settings.capabilities': 'Capabilities',
        'settings.gateway': 'Account & Access',
        'settings.models': 'Models',
        'settings.onboarding': 'Access',
        'settings.resources': 'Resources & Connections',
        'settings.preferences': 'Preferences',
        'settings.personalizationNav': 'Personalization',
        'settings.advanced': 'Advanced',
        'settings.about': 'About',
        'settings.model': 'Model',
        'settings.agent': 'Agent',
        'settings.agents': 'Agents',
        'settings.tools': 'Tools',
        'settings.webui': 'WebUI',
        'settings.searchPlaceholder': 'Search settings',
        'settings.searchEmpty': 'No matching settings',
        'settings.searchAnchorUnavailable': 'Setting unavailable; showing page start',
        'settings.lightMode': 'Light mode',
        'settings.darkMode': 'Dark mode',
        'common.back': 'Back to chat',
        'common.settings': 'Settings',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('SettingsModal OPL App navigation', () => {
  const scrollIntoView = vi.fn();
  const scrollTo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: scrollTo,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('opens Overview as the ordinary Settings default tab', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByTestId('overview-content')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-content')).not.toBeInTheDocument();
  });

  it('renders channel empty states as compact text without an illustration', () => {
    const { container } = render(<ChannelEmptyState testId='channel-empty'>No pending pairings</ChannelEmptyState>);

    const emptyState = screen.getByTestId('channel-empty');
    expect(emptyState).toHaveTextContent('No pending pairings');
    expect(emptyState).toHaveClass('text-12px', 'leading-18px');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.arco-empty')).toBeNull();
  });

  it('keeps channel controls single-column and semantic at narrow widths', () => {
    const { rerender } = render(
      <ChannelPreferenceRow label='App ID' description='Channel credential' required>
        <span>Credential control</span>
        <span>Test action</span>
      </ChannelPreferenceRow>
    );

    const row = document.querySelector('[data-channel-preference-row]');
    const actions = document.querySelector('[data-channel-row-actions]');
    expect(row).toHaveClass('flex-col', 'min-w-0', 'sm:flex-row');
    expect(actions).toHaveClass('w-full', 'max-w-full', 'flex-wrap', 'sm:w-auto');
    expect(screen.getByText('*')).toHaveClass('text-danger');

    rerender(<ChannelStatusBadge tone='warning'>Connecting</ChannelStatusBadge>);
    expect(screen.getByText('Connecting')).toHaveClass('bg-warning-1', 'text-warning-6');
    expect(screen.getByText('Connecting')).toHaveAttribute('data-channel-status-tone', 'warning');
  });

  it('renders channels as flat disclosure rows without nesting the enable switch', () => {
    const onToggleCollapse = vi.fn();
    const channel = {
      id: 'telegram',
      title: 'Telegram',
      description: 'Telegram channel',
      status: 'active' as const,
      enabled: true,
      content: <div>Telegram credentials</div>,
    };
    const { container, rerender } = render(
      <ChannelItem channel={channel} isCollapsed onToggleCollapse={onToggleCollapse} onToggleEnabled={() => {}} />
    );

    const disclosure = screen.getByRole('button', { name: 'Telegram' });
    const channelSwitch = container.querySelector('[data-channel-switch-for="telegram"]');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure).toHaveAttribute('aria-controls');
    expect(disclosure).toHaveAttribute('data-channel-disclosure', 'telegram');
    expect(channelSwitch).not.toBeNull();
    expect(disclosure.contains(channelSwitch)).toBe(false);
    expect(container.querySelector('.arco-collapse')).toBeNull();
    expect(container.querySelector('[data-channel-panel="telegram"]')).toBeNull();

    fireEvent.click(disclosure);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    rerender(
      <ChannelItem
        channel={channel}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
        onToggleEnabled={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Telegram' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Telegram' })).toHaveTextContent('Telegram credentials');
  });

  it('renders Account & Access and Models as separate owner pages', () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='gateway' />);

    expect(screen.getByTestId('gateway-content')).toBeInTheDocument();
    expect(screen.queryByTestId('access-content')).not.toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='access' />);

    expect(screen.getByTestId('access-content')).toBeInTheDocument();
    expect(screen.queryByTestId('gateway-content')).not.toBeInTheDocument();
  });

  it('shows only App-owned ordinary settings tabs', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    const overviewButton = screen.getByRole('button', { name: 'Overview' });
    expect(overviewButton).toBeInTheDocument();
    expect(overviewButton.querySelector('svg')).not.toBeNull();
    expect(overviewButton.querySelector('svg[data-icon="gauge-high"]')).toBeNull();
    expect(screen.getByText('Account & Access')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Data & Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.queryByText('Personalization')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('About')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.queryByText('Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Tools')).not.toBeInTheDocument();
    expect(screen.queryByText('WebUI')).not.toBeInTheDocument();
    expect(screen.queryByText('Local Services')).not.toBeInTheDocument();
  });

  it('keeps Settings control center host anchors stable for visual QA', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByTestId('settings-host')).toBeInTheDocument();
    expect(screen.getByTestId('settings-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('overview-content')).toHaveTextContent('embedded');
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Account & Access')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Data & Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.queryByText('Personalization')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('WebUI')).not.toBeInTheDocument();
  });

  it('keeps the active narrow-screen Settings entry in view and keyboard discoverable', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/appearance']}>
        <SettingsPageWrapper>
          <div>Preferences content</div>
        </SettingsPageWrapper>
      </MemoryRouter>
    );

    const activeEntry = screen.getByRole('button', { name: 'Preferences' });
    expect(activeEntry).toHaveAttribute('aria-current', 'page');
    activeEntry.focus();
    expect(activeEntry).toHaveFocus();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ left: 0 }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps exactly one global Settings search when the product sider is collapsed', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <SettingsSider collapsed />
        <SettingsPageWrapper>
          <div>Overview content</div>
        </SettingsPageWrapper>
      </MemoryRouter>
    );

    expect(screen.getAllByTestId('settings-search-input')).toHaveLength(1);
    expect(screen.getByTestId('settings-global-search')).toBeInTheDocument();
  });

  it('focuses the visible canonical anchor when legacy markup contains a hidden duplicate', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/access?section=model']}>
        <SettingsPageWrapper>
          <span id='model' aria-hidden='true' />
          <section id='model' data-testid='visible-model-anchor'>
            Model preference
          </section>
        </SettingsPageWrapper>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('visible-model-anchor')).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('falls back to the page start and reports an unavailable search anchor', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/general?section=missing-anchor']}>
        <SettingsPageWrapper>
          <div>Overview content</div>
        </SettingsPageWrapper>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('settings-search-anchor-fallback')).toBeInTheDocument());
    expect(screen.getByTestId('settings-page-focus-fallback')).toHaveFocus();
  });

  it('keeps retired Advanced out and places secondary About after a divider', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <SettingsSider />
      </MemoryRouter>
    );

    const preferences = screen.getByRole('button', { name: 'Preferences' });
    const divider = screen.getByTestId('settings-sider-secondary-divider');
    const about = screen.getByRole('button', { name: 'About' });

    expect(preferences).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advanced' })).not.toBeInTheDocument();
    expect(preferences.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(divider.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('keeps the connected account as the single Settings footer entry', () => {
    const onSettingsClick = vi.fn();

    render(
      <SiderFooter
        isMobile
        account={{ displayName: 'Feng Gao', email: 'feng@example.com', initials: 'FG' }}
        siderTooltipProps={getSiderTooltipProps(false)}
        onSettingsClick={onSettingsClick}
        onUpdateClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('sider-footer-account'));

    expect(onSettingsClick).toHaveBeenCalledWith('gateway');
    expect(screen.queryByTestId('sider-footer-theme')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sider-footer-settings')).not.toBeInTheDocument();
    expect(screen.getByTestId('sider-footer-account')).toHaveTextContent('Feng Gao');
    expect(screen.queryByRole('button', { name: 'Back to chat' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sider-footer-help')).not.toBeInTheDocument();
  });

  it('shows the connected Gateway account compactly and opens Account & Access', () => {
    const onSettingsClick = vi.fn();

    render(
      <SiderFooter
        isMobile={false}
        account={{ displayName: 'Feng Gao', email: 'feng@example.com', initials: 'FG' }}
        siderTooltipProps={getSiderTooltipProps(false)}
        onSettingsClick={onSettingsClick}
        onUpdateClick={vi.fn()}
      />
    );

    expect(screen.getByTestId('sider-footer-account')).toHaveTextContent('Feng Gao');
    expect(screen.getByTestId('sider-footer-account')).not.toHaveTextContent('feng@example.com');
    expect(screen.getByTestId('sider-footer-account')).toHaveAccessibleName('Feng Gao');
    fireEvent.click(screen.getByTestId('sider-footer-account'));

    expect(onSettingsClick).toHaveBeenCalledWith('gateway');
  });

  it('shows Settings when no Gateway account is connected and opens Overview', () => {
    const onSettingsClick = vi.fn();

    render(
      <SiderFooter
        isMobile={false}
        siderTooltipProps={getSiderTooltipProps(false)}
        onSettingsClick={onSettingsClick}
        onUpdateClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('sider-footer-settings'));

    expect(screen.getByTestId('sider-footer-settings')).toHaveTextContent('Settings');
    expect(onSettingsClick).toHaveBeenCalledWith('general');
  });

  it('caps Settings modal surfaces at an 8px radius', () => {
    const { unmount } = render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByTestId('settings-modal')).toHaveStyle({ borderRadius: '8px' });
    expect(screen.getByTestId('settings-modal')).toHaveAttribute('data-content-border-radius', '8px');

    unmount();
    render(
      <SubModal visible onCancel={() => {}} title='Nested settings'>
        Nested content
      </SubModal>
    );

    expect(screen.getByTestId('settings-modal')).toHaveStyle({ borderRadius: '8px' });
    expect(screen.getByTestId('settings-modal')).toHaveAttribute('data-content-border-radius', '8px');
  });

  it('filters Settings navigation by user task keywords', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'packages' } });

    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Data & Storage')).not.toBeInTheDocument();
  });

  it('keeps Resources ordinary while routing diagnostics search to Maintenance', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'working paths' } });

    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics and working paths')).toBeInTheDocument();
    expect(screen.queryByText('Models')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Diagnostics and working paths'));

    expect(screen.getByTestId('runtime-content')).toBeInTheDocument();
  });

  it('uses Enter to open and focus the first matching Settings item', async () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    const input = screen.getByTestId('settings-search-input');
    fireEvent.change(input, { target: { value: 'working paths' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('runtime-content')).toBeInTheDocument());
    await waitFor(() => expect(document.getElementById('diagnostics')).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('focuses compatibility anchors and keeps legacy assistants on capabilities skills', async () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='theme' />);

    await waitFor(() => expect(document.getElementById('themes')).toHaveFocus());

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='local-services' />);
    await waitFor(() => expect(document.getElementById('services')).toHaveFocus());

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='assistants' />);
    await waitFor(() =>
      expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:manual_and_third_party')
    );
    expect(document.getElementById('custom-assistants')).toBeNull();
  });

  it('shows an empty state when no Settings route matches search', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'not-a-settings-entry' } });

    expect(screen.getByTestId('settings-search-empty')).toHaveTextContent('No matching settings');
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('redirects legacy overview, runtime, model, and system tab requests to App-owned pages', async () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='overview' />);

    expect(screen.getByTestId('overview-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='runtime' />);

    await waitFor(() => {
      expect(screen.getByTestId('runtime-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='model' />);

    await waitFor(() => {
      expect(screen.getByTestId('access-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='system' />);

    await waitFor(() => {
      expect(screen.getByTestId('runtime-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='storage' />);

    await waitFor(() => {
      expect(screen.getByTestId('storage-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='workspace' />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='local-services' />);

    await waitFor(() => {
      expect(screen.getByTestId('runtime-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='resources' />);

    await waitFor(() => {
      expect(screen.getByTestId('resources-content')).toBeInTheDocument();
    });
  });

  it('redirects legacy agent and tools requests to their separated owner pages', async () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='model' />);

    expect(screen.getByTestId('access-content')).toBeInTheDocument();
    expect(screen.queryByTestId('system-content')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='agent' />);

    await waitFor(() => expect(screen.getByTestId('agents-content')).toHaveTextContent('MAS'));
    expect(screen.queryByTestId('capabilities-content')).not.toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='tools' />);

    await waitFor(() => expect(screen.getByTestId('capabilities-content')).toHaveTextContent('Skills'));
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('Tools');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:manual_and_third_party');

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='assistants' />);

    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:manual_and_third_party');
  });

  it('redirects legacy webui, display, and pet tab requests to Resources and Appearance', async () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='webui' />);

    expect(screen.getByTestId('resources-content')).toHaveTextContent('Docker WebUI');
    expect(screen.queryByTestId('webui-content')).not.toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='display' />);

    await waitFor(() => {
      expect(screen.getByTestId('appearance-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='pet' />);

    await waitFor(() => {
      expect(screen.getByTestId('appearance-content')).toBeInTheDocument();
    });
  });
});
