import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CapabilitiesSettingsContent } from '@/renderer/pages/settings/CapabilitiesSettings';

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: () => <div data-testid='skills-detail'>Skills detail</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='tools-detail'>Tools detail</div>,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      modules: {
        items: [
          { module_id: 'medautoscience', status: 'ready' },
          { module_id: 'medautogrant', status: 'update_available' },
          { module_id: 'redcube', status: 'failed_with_repair' },
          { module_id: 'oplbookforge', status: 'ready' },
          { module_id: 'oplmetaagent', status: 'missing' },
        ],
      },
    },
  }),
}));

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplGuiSettingsControlPlane: () => null,
  getOplGuiSettingsVisibleTabs: () => [
    'general',
    'access',
    'capabilities',
    'environment',
    'storage',
    'appearance',
    'advanced',
  ],
  getOplGuiSettingsSecondaryPageIds: () => ['about', 'update', 'theme', 'workspace', 'local-services'],
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
  getOplDefaultHomeAssistants: () => [
    {
      id: 'mas',
      display_name: 'Med Auto Science',
      short_name: 'MAS',
      home_purpose_label: 'Research',
      description_i18n: { 'en-US': 'Use MAS for research workflows.' },
    },
    {
      id: 'mag',
      display_name: 'Med Auto Grant',
      short_name: 'MAG',
      home_purpose_label: 'Grant Writing',
      description_i18n: { 'en-US': 'Use MAG for grant workflows.' },
    },
    {
      id: 'rca',
      display_name: 'RedCube AI',
      short_name: 'RCA',
      home_purpose_label: 'Presentations',
      description_i18n: { 'en-US': 'Use RCA for presentation workflows.' },
    },
    {
      id: 'bookforge',
      display_name: 'OPL BookForge',
      short_name: 'BookForge',
      home_purpose_label: 'Writing books',
      description_i18n: { 'en-US': 'Use BookForge for manuscripts.' },
    },
  ],
  getOplAssistantSkillProfile: (assistantId: string) => {
    const profiles: Record<string, { required_skills: string[] }> = {
      mas: { required_skills: ['mas'] },
      mag: { required_skills: ['mag'] },
      rca: { required_skills: ['rca'] },
      bookforge: { required_skills: ['opl-bookforge'] },
    };
    return profiles[assistantId];
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.capabilitiesPage.title': 'Agents & Capabilities',
        'settings.capabilitiesPage.description': 'Choose capabilities by work purpose first.',
        'settings.capabilitiesPage.status.ready': 'Ready',
        'settings.capabilitiesPage.status.update': 'Update available',
        'settings.capabilitiesPage.status.repair': 'Needs repair',
        'settings.capabilitiesPage.status.missing': 'Missing',
        'settings.capabilitiesPage.purposes.automation.title': 'OPL Meta Agent',
        'settings.capabilitiesPage.purposes.automation.description': 'Use OMA explicitly.',
        'settings.capabilitiesPage.entries.externalTools.title': 'External tools & voice',
        'settings.capabilitiesPage.entries.externalTools.description': 'Connect external tools and speech input.',
        'settings.capabilitiesPage.entries.externalTools.technical': 'Technical detail: MCP is the protocol.',
        'settings.capabilitiesPage.entries.customAssistants.title': 'Custom assistants',
        'settings.capabilitiesPage.entries.customAssistants.description': 'Use the Advanced assistant area.',
        'settings.capabilitiesTab.skills': 'Skills',
        'settings.capabilitiesTab.tools': 'External tools & voice',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('CapabilitiesSettingsContent', () => {
  it('shows purpose capability groups before skills and tools details', () => {
    const onTabChange = vi.fn();
    render(<CapabilitiesSettingsContent activeTab='skills' onTabChange={onTabChange} />);

    expect(screen.getByText('Agents & Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('MAS')).toBeInTheDocument();
    expect(screen.getByText('Grant Writing')).toBeInTheDocument();
    expect(screen.getByText('MAG')).toBeInTheDocument();
    expect(screen.getByText('Presentations')).toBeInTheDocument();
    expect(screen.getByText('RCA')).toBeInTheDocument();
    expect(screen.getByText('Writing books')).toBeInTheDocument();
    expect(screen.getByText('BookForge')).toBeInTheDocument();
    expect(screen.getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(screen.getByText('OMA')).toBeInTheDocument();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.getByText('Update available')).toBeInTheDocument();
    expect(screen.getByText('Needs repair')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(screen.getAllByText('External tools & voice').length).toBeGreaterThan(0);
    expect(screen.getByText('Technical detail: MCP is the protocol.')).toBeInTheDocument();
    expect(screen.getByText('Custom assistants')).toBeInTheDocument();
    expect(screen.getAllByText('Skills').length).toBeGreaterThan(0);
    expect(screen.getByTestId('skills-detail')).toBeInTheDocument();

    const externalTools = screen.getByTestId('capability-entry-external-tools');
    fireEvent.click(within(externalTools).getByRole('button', { name: 'External tools & voice' }));
    expect(onTabChange).toHaveBeenCalledWith('tools');

    const research = screen.getByTestId('capability-purpose-mas');
    fireEvent.click(within(research).getByRole('button', { name: 'Skills' }));
    expect(onTabChange).toHaveBeenCalledWith('skills');
  });
});
