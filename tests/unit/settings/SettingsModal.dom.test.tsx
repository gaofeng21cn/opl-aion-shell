import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SettingsModal from '@/renderer/components/settings/SettingsModal';

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children, visible, title }: { children: React.ReactNode; visible: boolean; title?: string }) =>
    visible ? (
      <div data-testid='settings-modal'>
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-content'>System</div>,
}));

vi.mock('@/renderer/pages/settings/sections/OverviewSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='overview-content'>Overview content {withWrapper === false ? 'embedded' : 'wrapped'}</div>
  ),
}));

vi.mock('@/renderer/pages/settings/sections/RuntimeSettings', () => ({
  default: ({ withWrapper }: { withWrapper?: boolean }) => (
    <div data-testid='runtime-content'>Runtime content {withWrapper === false ? 'embedded' : 'wrapped'}</div>
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

vi.mock('@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent', () => ({
  default: () => <div data-testid='appearance-content'>Appearance</div>,
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

vi.mock('@/renderer/utils/platform', () => ({
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
        'settings.onboarding': 'Get Started',
        'settings.preferences': 'Preferences',
        'settings.advanced': 'Advanced',
        'settings.about': 'About',
        'settings.model': 'Model',
        'settings.agent': 'Agent',
        'settings.tools': 'Tools',
        'settings.webui': 'WebUI',
        'settings.searchPlaceholder': 'Search settings',
        'settings.searchEmpty': 'No matching settings',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('SettingsModal OPL App navigation', () => {
  it('opens Overview as the ordinary Settings default tab', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByTestId('overview-content')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-content')).not.toBeInTheDocument();
  });

  it('shows only App-owned ordinary settings tabs', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByTestId('settings-sider-footer-about')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Tools')).not.toBeInTheDocument();
    expect(screen.queryByText('WebUI')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Local Services')).not.toBeInTheDocument();
  });

  it('keeps Settings control center host anchors stable for visual QA', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByTestId('settings-host')).toBeInTheDocument();
    expect(screen.getByTestId('settings-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('overview-content')).toHaveTextContent('embedded');
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByTestId('settings-sider-footer-about')).toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('WebUI')).not.toBeInTheDocument();
  });

  it('filters Settings navigation by user task keywords', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'rollback' } });

    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
  });

  it('surfaces secondary task pages only through Settings search', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'workspace' } });

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Workspace'));

    expect(screen.getByTestId('workspace-content')).toBeInTheDocument();
  });

  it('shows an empty state when no Settings route matches search', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    fireEvent.change(screen.getByTestId('settings-search-input'), { target: { value: 'not-a-settings-entry' } });

    expect(screen.getByTestId('settings-search-empty')).toHaveTextContent('No matching settings');
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('redirects legacy overview, runtime, model, and system tab requests to App-owned pages', () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='overview' />);

    expect(screen.getByTestId('overview-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='runtime' />);

    expect(screen.getByTestId('runtime-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='model' />);

    expect(screen.getByTestId('runtime-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='system' />);

    expect(screen.getByTestId('system-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='storage' />);

    expect(screen.getByTestId('storage-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='workspace' />);

    expect(screen.getByTestId('workspace-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='local-services' />);

    expect(screen.getByTestId('local-services-content')).toBeInTheDocument();
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
  });

  it('redirects legacy webui, display, and pet tab requests to Access and Appearance', () => {
    const { rerender } = render(<SettingsModal visible onCancel={() => {}} defaultTab='webui' />);

    expect(screen.getByTestId('access-content')).toHaveTextContent('remote Docker WebUI access');
    expect(screen.queryByTestId('webui-content')).not.toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='display' />);

    expect(screen.getByTestId('appearance-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='pet' />);

    expect(screen.getByTestId('appearance-content')).toBeInTheDocument();
  });
});
