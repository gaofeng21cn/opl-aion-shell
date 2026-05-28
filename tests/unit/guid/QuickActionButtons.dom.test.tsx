import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QuickActionButtons from '@/renderer/pages/guid/components/QuickActionButtons';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getStatus: vi.fn().mockResolvedValue({ running: true }),
  statusChangedOn: vi.fn().mockReturnValue(() => undefined),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    getStatus: { invoke: mocks.getStatus },
    statusChanged: { on: mocks.statusChangedOn },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.access': 'Access',
        'settings.webui': 'WebUI',
        'settings.webui.running': 'Running',
        'settings.webui.starting': 'Checking',
        'settings.webui.operationFailed': 'Unavailable',
        'settings.webui.enable': 'Start',
        'conversation.welcome.quickActionFeedback': 'Feedback',
        'conversation.welcome.quickActionStar': 'Star',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('QuickActionButtons OPL App access shortcut', () => {
  it('routes the ordinary home shortcut to Access settings without showing WebUI as the entry label', async () => {
    render(
      <QuickActionButtons
        onOpenLink={vi.fn()}
        onOpenBugReport={vi.fn()}
        inactiveBorderColor='transparent'
        activeShadow='none'
      />
    );

    expect(screen.getByText(/Access/)).toBeInTheDocument();
    expect(screen.queryByText(/WebUI/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('guid-access-quick-action'));

    expect(mocks.navigate).toHaveBeenCalledWith('/settings/access');
    expect(mocks.navigate).not.toHaveBeenCalledWith('/settings/webui');
  });
});
