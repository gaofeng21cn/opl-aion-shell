import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AgentPillBar from '@/renderer/pages/guid/components/AgentPillBar';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  resolveAgentLogo: () => null,
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: () => '',
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('AgentPillBar Settings route', () => {
  it('opens the App-owned agents page instead of the legacy agent tab', async () => {
    render(
      <AgentPillBar
        availableAgents={[
          { id: 'codex', agent_type: 'codex', backend: 'codex', name: 'Codex' },
          { id: 'custom', agent_type: 'custom', backend: 'custom', name: 'Custom' },
        ]}
        selectedAgentKey='codex'
        getAgentKey={(agent) => agent.backend || agent.agent_type}
        onSelectAgent={vi.fn()}
      />
    );

    await userEvent.click(screen.getByTestId('guid-agent-settings-shortcut'));

    expect(screen.getByTestId('agent-pill-codex').parentElement).toHaveAttribute(
      'data-opl-visual-source',
      'deepseek-harness'
    );
    expect(screen.getByTestId('agent-pill-codex').parentElement).toHaveAttribute('data-opl-visual-pattern', 'pill');
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/agents');
    expect(mocks.navigate).not.toHaveBeenCalledWith('/settings/agent?tab=local');
  });
});
