import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CapabilitiesSettingsContent } from '@/renderer/pages/settings/CapabilitiesSettings';

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: () => <div data-testid='skills-detail'>Skills detail</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='tools-detail'>Tools detail</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.capabilitiesPage.title': 'Agents & Capabilities',
        'settings.capabilitiesPage.description': 'Choose capabilities by work purpose first.',
        'settings.capabilitiesPage.purposes.research.title': 'Research',
        'settings.capabilitiesPage.purposes.research.description': 'Use MAS for research workflows.',
        'settings.capabilitiesPage.purposes.grant.title': 'Grant Writing',
        'settings.capabilitiesPage.purposes.grant.description': 'Use MAG for grant workflows.',
        'settings.capabilitiesPage.purposes.presentation.title': 'Presentations',
        'settings.capabilitiesPage.purposes.presentation.description': 'Use RCA for presentation workflows.',
        'settings.capabilitiesPage.purposes.automation.title': 'OPL Meta Agent',
        'settings.capabilitiesPage.purposes.automation.description': 'Use OMA explicitly.',
        'settings.capabilitiesTab.skills': 'Skills',
        'settings.capabilitiesTab.tools': 'Tools',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('CapabilitiesSettingsContent', () => {
  it('shows purpose capability groups before skills and tools details', () => {
    render(<CapabilitiesSettingsContent activeTab='skills' onTabChange={() => {}} />);

    expect(screen.getByText('Agents & Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('MAS')).toBeInTheDocument();
    expect(screen.getByText('Grant Writing')).toBeInTheDocument();
    expect(screen.getByText('MAG')).toBeInTheDocument();
    expect(screen.getByText('Presentations')).toBeInTheDocument();
    expect(screen.getByText('RCA')).toBeInTheDocument();
    expect(screen.getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(screen.getByText('OMA')).toBeInTheDocument();
    expect(screen.getAllByText('Skills').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tools').length).toBeGreaterThan(0);
    expect(screen.getByTestId('skills-detail')).toBeInTheDocument();
  });
});
