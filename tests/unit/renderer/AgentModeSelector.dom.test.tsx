import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnsureConversationRuntimeResponse } from '@/common/types/platform/acpTypes';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';

const { getModeInvokeMock } = vi.hoisted(() => ({
  getModeInvokeMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getMode: { invoke: getModeInvokeMock },
      setMode: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => undefined),
  },
}));

vi.mock('@/renderer/pages/guid/hooks/agentSelectionUtils', () => ({
  savePreferredMode: vi.fn(),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/components/agent/AgentBadge', () => ({
  AgentLogoIcon: () => <span data-testid='agent-logo' />,
}));

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/renderer/components/opl/oplChromeIcon', () => ({
  OPL_CHROME_ICON_PROPS: {},
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span />,
}));

vi.mock('@arco-design/web-react', () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const Menu = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Menu.ItemGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Menu.Item = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    Dropdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Menu,
    Message: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

const preparedRuntime = (mode: string): EnsureConversationRuntimeResponse => ({
  recovered: true,
  config_options: [
    {
      id: 'mode',
      category: 'mode',
      option_type: 'select',
      current_value: mode,
      options: [{ value: mode, label: mode }],
    },
  ],
  runtime: {
    state: 'idle',
    can_send_message: true,
    has_task: false,
    is_processing: false,
    pending_confirmations: 0,
    turn_id: null,
  },
});

describe('AgentModeSelector runtime preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the valid initial permission mode and skips GET when preparation returned a snapshot', async () => {
    const beforeRuntimeSync = vi.fn().mockResolvedValue(preparedRuntime('agent'));

    render(
      <AgentModeSelector
        backend='codex'
        conversation_id='conv-1'
        compact
        initialMode='full-access'
        beforeRuntimeSync={beforeRuntimeSync}
      />
    );

    await waitFor(() => expect(beforeRuntimeSync).toHaveBeenCalledTimes(1));
    expect(getModeInvokeMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('mode-selector')).toHaveAttribute('data-current-mode', 'full-access');
  });

  it('uses the live mode endpoint when runtime preparation has no snapshot', async () => {
    const beforeRuntimeSync = vi.fn().mockResolvedValue(undefined);
    getModeInvokeMock.mockResolvedValue({ mode: 'read-only', initialized: true });

    render(
      <AgentModeSelector
        backend='codex'
        conversation_id='conv-1'
        compact
        initialMode='full-access'
        beforeRuntimeSync={beforeRuntimeSync}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode-selector')).toHaveAttribute('data-current-mode', 'read-only');
    });
    expect(getModeInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
  });
});
