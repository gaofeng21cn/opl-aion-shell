/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import ScheduledTasksPage from '@/renderer/pages/cron/ScheduledTasksPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'cron.scheduledTasks': 'Scheduled Tasks',
        'cron.page.newTask': 'New task',
        'cron.page.description': 'Scheduled task description',
        'cron.page.codexUnavailable': 'Codex unavailable',
        'cron.page.codexAmbiguous': 'Codex ambiguous',
        'cron.page.form.newConversation': 'New conversation',
        'cron.page.form.existingConversation': 'Ongoing conversation',
      })[key] ?? key,
  }),
}));

vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@renderer/pages/cron/useCronJobs', () => ({
  useAllCronJobs: () => ({
    jobs: [legacyJob()],
    loading: false,
    pauseJob: vi.fn(),
    resumeJob: vi.fn(),
  }),
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [], presetAssistants: [], isLoading: false }),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: () => false,
    setLocal: vi.fn(),
  },
}));

vi.mock('@/common/adapter/ipcBridge', async () => {
  const actual = await vi.importActual<typeof import('@/common/adapter/ipcBridge')>('@/common/adapter/ipcBridge');
  return {
    ...actual,
    systemSettings: { setKeepAwake: { invoke: vi.fn() } },
  };
});

vi.mock('@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({
  default: () => null,
}));

describe('ScheduledTasksPage fail-open composition', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('disables only new-task composition while existing jobs stay visible', () => {
    render(
      <MemoryRouter>
        <ScheduledTasksPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('scheduled-create-task')).toBeDisabled();
    expect(screen.getByTestId('scheduled-codex-unavailable')).toHaveTextContent('Codex unavailable');
    expect(screen.getByText('Legacy task')).toBeInTheDocument();
  });
});

function legacyJob(): ICronJob {
  return {
    id: 'legacy-job',
    name: 'Legacy task',
    description: 'Legacy description',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily' },
    target: {
      execution_mode: 'new_conversation',
      payload: { kind: 'message', text: 'Legacy prompt' },
    },
    metadata: {
      conversation_id: 'legacy-conversation',
      agent_type: 'acp',
      created_by: 'user',
      created_at: 1,
      updated_at: 1,
      agent_config: { name: 'Claude Code', backend: 'claude', assistant_id: 'assistant-claude' },
    },
    state: { run_count: 0, retry_count: 0, max_retries: 0 },
  };
}
