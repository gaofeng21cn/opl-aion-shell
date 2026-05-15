import { render, screen } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

vi.mock('@/renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader' />,
}));

vi.mock('@/renderer/pages/guid', () => ({
  default: () => <div data-testid='guid-page'>Guid</div>,
}));

vi.mock('@/renderer/pages/settings/ModeSettings', () => ({
  default: () => <div data-testid='settings-model-page'>Model</div>,
}));

vi.mock('@/renderer/pages/settings/AgentSettings', () => ({
  default: () => <div data-testid='settings-agent-page'>Agent</div>,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings', () => ({
  default: () => <div data-testid='settings-assistants-page'>Assistants</div>,
}));

import PanelRoute from '@/renderer/components/layout/Router';

const LayoutShell: React.FC = () => <Outlet />;

describe('PanelRoute team entry guard', () => {
  beforeEach(() => {
    window.location.hash = '#/guid';
  });

  it('does not redirect team routes when team mode is enabled', async () => {
    window.location.hash = '#/team/team-1';

    render(<PanelRoute layout={<LayoutShell />} />);

    expect(window.location.hash).toBe('#/team/team-1');
  });

  it('still renders the guid route normally', async () => {
    render(<PanelRoute layout={<LayoutShell />} />);

    expect(await screen.findByTestId('guid-page')).toBeInTheDocument();
  });

  it.each([
    ['#/settings/model', 'settings-model-page'],
    ['#/settings/agent', 'settings-agent-page'],
    ['#/settings/assistants', 'settings-assistants-page'],
  ])('keeps hidden settings route %s on its real page surface', async (hash, testId) => {
    window.location.hash = hash;

    render(<PanelRoute layout={<LayoutShell />} />);

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });
});
