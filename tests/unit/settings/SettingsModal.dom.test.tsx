import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-content'>About</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='tools-content'>Tools</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div data-testid='webui-content'>Can Codex CLI and providers work now?</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/DisplayModalContent', () => ({
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

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplGuiSettingsVisibleTabs: () => [
    'general',
    'access',
    'capabilities',
    'environment',
    'appearance',
    'advanced',
    'about',
  ],
  getOplGuiLegacySettingsRouteRedirects: () => ({
    overview: 'general',
    runtime: 'environment',
    system: 'advanced',
    model: 'environment',
    agent: 'capabilities',
    assistants: 'capabilities',
    'skills-hub': 'capabilities',
    tools: 'capabilities',
    display: 'appearance',
    webui: 'access',
    pet: 'appearance',
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.title': 'Settings',
        'settings.general': 'General',
        'settings.environment': 'Local Environment',
        'settings.capabilities': 'Agents & Capabilities',
        'settings.access': 'Access',
        'settings.appearance': 'Appearance',
        'settings.advanced': 'Advanced',
        'settings.about': 'About & Updates',
        'settings.model': 'Model',
        'settings.agent': 'Agent',
        'settings.tools': 'Tools',
        'settings.webui': 'WebUI',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('SettingsModal OPL App navigation', () => {
  it('opens General as the ordinary Settings default tab', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByTestId('overview-content')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-content')).not.toBeInTheDocument();
  });

  it('shows only App-owned ordinary settings tabs', () => {
    render(<SettingsModal visible onCancel={() => {}} />);

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('Agents & Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Local Environment')).toBeInTheDocument();
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('About & Updates')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Tools')).not.toBeInTheDocument();
    expect(screen.queryByText('WebUI')).not.toBeInTheDocument();
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

    expect(screen.getByTestId('webui-content')).toHaveTextContent('Can Codex CLI and providers work now?');

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='display' />);

    expect(screen.getByTestId('appearance-content')).toBeInTheDocument();

    rerender(<SettingsModal visible onCancel={() => {}} defaultTab='pet' />);

    expect(screen.getByTestId('appearance-content')).toBeInTheDocument();
  });
});
