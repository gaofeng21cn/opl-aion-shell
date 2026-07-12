import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';
import SettingsModal, { SubModal } from '@/renderer/components/settings/SettingsModal';
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

vi.mock('@/renderer/pages/settings/sections/PersonalizationSettings', () => ({
  PersonalizationSettingsContent: () => <div data-testid='personalization-content'>Personalization content</div>,
  default: () => <div data-testid='personalization-content'>Personalization content</div>,
}));

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: () => <div data-testid='skills-content'>Skills</div>,
}));

vi.mock('@/renderer/pages/settings/CapabilitiesSettings', () => ({
  CapabilitiesSettingsContent: ({ activeTab }: { activeTab: 'skills' | 'tools' }) => (
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
        'settings.localServices': 'Local Services',
        'settings.storage': 'Storage',
        'settings.capabilities': 'Capabilities',
        'settings.onboarding': 'Access',
        'settings.resources': 'Resources & Connections',
        'settings.preferences': 'Preferences',
        'settings.personalizationNav': 'Personalization',
        'settings.advanced': 'Advanced',
        'settings.about': 'About',
        'settings.model': 'Model',
        'settings.agent': 'Agent',
        'settings.tools': 'Tools',
        'settings.webui': 'WebUI',
        'settings.searchPlaceholder': 'Search settings',
        'settings.searchEmpty': 'No matching settings',
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

  it('shows only App-owned ordinary settings tabs', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Personalization')).toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('About')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
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
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Personalization')).toBeInTheDocument();
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

  it('keeps Advanced and About after a Settings secondary-group divider', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <SettingsSider />
      </MemoryRouter>
    );

    const divider = screen.getByTestId('settings-sider-secondary-divider');
    const preferences = screen.getByRole('button', { name: 'Preferences' });
    const advanced = screen.getByRole('button', { name: 'Advanced' });
    const about = screen.getByRole('button', { name: 'About' });

    expect(preferences.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(divider.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(advanced.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'working directories' } });

    expect(screen.queryByTestId('settings-sider-secondary-divider')).not.toBeInTheDocument();
  });

  it('keeps the Settings footer to return and named theme actions', () => {
    const onSettingsClick = vi.fn();
    const onThemeToggle = vi.fn();

    render(
      <SiderFooter
        isMobile
        isSettings
        theme='dark'
        siderTooltipProps={getSiderTooltipProps(false)}
        onSettingsClick={onSettingsClick}
        onThemeToggle={onThemeToggle}
      />
    );

    fireEvent.click(screen.getByTestId('sider-footer-settings'));
    fireEvent.click(screen.getByTestId('sider-footer-theme'));

    expect(onSettingsClick).toHaveBeenCalledOnce();
    expect(onThemeToggle).toHaveBeenCalledOnce();
    expect(screen.getByTestId('sider-footer-theme')).toHaveAccessibleName('Light mode');
    expect(screen.queryByTestId('sider-footer-account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sider-footer-help')).not.toBeInTheDocument();
  });

  it('keeps Advanced and About after a Settings secondary-group divider', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <SettingsSider />
      </MemoryRouter>
    );

    const divider = screen.getByTestId('settings-sider-secondary-divider');
    const preferences = screen.getByRole('button', { name: 'Preferences' });
    const advanced = screen.getByRole('button', { name: 'Advanced' });
    const about = screen.getByRole('button', { name: 'About' });

    expect(preferences.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(divider.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(advanced.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'working directories' } });

    expect(screen.queryByTestId('settings-sider-secondary-divider')).not.toBeInTheDocument();
  });

  it('keeps the Settings footer to return and named theme actions', () => {
    const onSettingsClick = vi.fn();
    const onThemeToggle = vi.fn();

    render(
      <SiderFooter
        isMobile
        isSettings
        theme='dark'
        siderTooltipProps={getSiderTooltipProps(false)}
        onSettingsClick={onSettingsClick}
        onThemeToggle={onThemeToggle}
      />
    );

    fireEvent.click(screen.getByTestId('sider-footer-settings'));
    fireEvent.click(screen.getByTestId('sider-footer-theme'));

    expect(onSettingsClick).toHaveBeenCalledOnce();
    expect(onThemeToggle).toHaveBeenCalledOnce();
    expect(screen.getByTestId('sider-footer-theme')).toHaveAccessibleName('Light mode');
    expect(screen.queryByTestId('sider-footer-account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sider-footer-help')).not.toBeInTheDocument();
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
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
  });

  it('keeps Resources ordinary while surfacing Advanced through Settings search', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'working directories' } });

    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Working directories')).toBeInTheDocument();
    expect(screen.queryByText('Access')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Working directories'));

    expect(screen.getByTestId('system-content')).toBeInTheDocument();
  });

  it('uses Enter to open and focus the first matching Settings item', async () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    const input = screen.getByTestId('settings-search-input');
    fireEvent.change(input, { target: { value: 'working directories' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('system-content')).toBeInTheDocument());
    await waitFor(() => expect(document.getElementById('working-directories')).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('focuses compatibility anchors and keeps legacy assistants on capabilities skills', async () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='theme' />);

    await waitFor(() => expect(document.getElementById('themes')).toHaveFocus());

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='local-services' />);
    await waitFor(() => expect(document.getElementById('services')).toHaveFocus());

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='assistants' />);
    await waitFor(() => expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:skills'));
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
      expect(screen.getByTestId('runtime-content')).toBeInTheDocument();
    });

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='system' />);

    await waitFor(() => {
      expect(screen.getByTestId('system-content')).toBeInTheDocument();
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

  it('redirects legacy agent and tools tab requests to purpose-first capability content', () => {
    render(<SettingsModal visible onCancel={() => {}} defaultTab='model' />);

    expect(screen.getByTestId('runtime-content')).toBeInTheDocument();
    expect(screen.queryByTestId('system-content')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='agent' />);

    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('MAS');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('MAG');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('RCA');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('OMA');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:skills');

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='tools' />);

    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('Skills');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('Tools');
    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:tools');

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='assistants' />);

    expect(screen.getByTestId('capabilities-content')).toHaveTextContent('active:skills');
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
