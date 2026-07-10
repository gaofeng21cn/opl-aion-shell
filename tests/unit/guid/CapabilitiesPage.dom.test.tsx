import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CapabilitiesPage from '@/renderer/pages/guid/CapabilitiesPage';

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useCustomAgentsLoader', () => ({
  useCustomAgentsLoader: () => ({
    assistants: [
      {
        id: 'mas',
        name: 'Research',
        name_i18n: { 'en-US': 'Research' },
        description: 'Move research forward',
        description_i18n: { 'en-US': 'Move research forward' },
        avatar: 'MAS',
      },
      {
        id: 'mag',
        name: 'Grant',
        name_i18n: { 'en-US': 'Grant' },
        description: 'Build grant applications',
        description_i18n: { 'en-US': 'Build grant applications' },
        avatar: 'MAG',
      },
    ],
    catalogAssistants: [],
    customAgentAvatarMap: new Map(),
  }),
}));

describe('CapabilitiesPage', () => {
  it('uses the ordinary capability surface to select a capability for Home', async () => {
    render(<CapabilitiesPage />);

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Grant')).toBeInTheDocument();
    expect(screen.queryByText(/settings\/capabilities/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('capability-mag'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { state: { selectedCapabilityId: 'mag' } });
  });
});
