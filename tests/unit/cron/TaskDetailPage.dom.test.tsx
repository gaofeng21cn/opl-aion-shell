/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDetailPage from '@/renderer/pages/cron/ScheduledTasksPage/TaskDetailPage';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';

const getJobInvokeMock = vi.fn();
const runNowInvokeMock = vi.fn();
const removeJobInvokeMock = vi.fn();
const getConversationInvokeMock = vi.fn();
const removeConversationInvokeMock = vi.fn();
const updateConversationInvokeMock = vi.fn();
const navigateMock = vi.fn();
const refetchConversationsMock = vi.fn();
const { useCronJobConversationsMock } = vi.hoisted(() => ({
  useCronJobConversationsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  const Modal = Object.assign(actual.Modal, {
    confirm: vi.fn((config: { onOk?: () => unknown }) => {
      void config.onOk?.();
      return { close: vi.fn(), update: vi.fn() };
    }),
  });
  return {
    ...actual,
    Modal,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      getJob: { invoke: (...args: unknown[]) => getJobInvokeMock(...args) },
      onJobUpdated: { on: () => vi.fn() },
      onJobExecuted: { on: () => vi.fn() },
      updateJob: { invoke: vi.fn() },
      runNow: { invoke: (...args: unknown[]) => runNowInvokeMock(...args) },
      removeJob: { invoke: (...args: unknown[]) => removeJobInvokeMock(...args) },
    },
    conversation: {
      get: { invoke: (...args: unknown[]) => getConversationInvokeMock(...args) },
      remove: { invoke: (...args: unknown[]) => removeConversationInvokeMock(...args) },
      update: { invoke: (...args: unknown[]) => updateConversationInvokeMock(...args) },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [] }),
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useCronJobConversations: (...args: unknown[]) => useCronJobConversationsMock(...args),
}));

vi.mock('@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/cron/repairCronJobTimeZone', () => ({
  repairCronJobTimeZone: async (cronJob: ICronJob) => cronJob,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationRuntimeWorkspaceErrorMessage: (error: unknown) => String(error),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

describe('TaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobInvokeMock.mockResolvedValue(job());
    runNowInvokeMock.mockResolvedValue({});
    removeJobInvokeMock.mockResolvedValue(undefined);
    getConversationInvokeMock.mockResolvedValue(null);
    removeConversationInvokeMock.mockResolvedValue(true);
    updateConversationInvokeMock.mockResolvedValue(true);
    refetchConversationsMock.mockResolvedValue(undefined);
    useCronJobConversationsMock.mockReturnValue({ conversations: [], refetch: refetchConversationsMock });
  });

  it('renames run-now conversations with the execution date in new conversation mode', async () => {
    runNowInvokeMock.mockResolvedValue({ conversation_id: 'conv-run' });
    getConversationInvokeMock.mockResolvedValue(
      conversation({
        id: 'conv-run',
        name: 'Daily report',
        created_at: Date.UTC(2026, 6, 1, 12, 0, 0),
        modified_at: Date.UTC(2026, 6, 1, 12, 0, 0),
        extra: {
          workspace: '/tmp/project',
        },
      })
    );

    renderTaskDetail();

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    fireEvent.click(await screen.findByText('cron.detail.runNow'));

    await waitFor(() =>
      expect(updateConversationInvokeMock).toHaveBeenCalledWith({
        id: 'conv-run',
        updates: { name: 'Daily report 01-07-26' },
      })
    );
    expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-run');
  });

  it('batch deletes execution history conversations without deleting the scheduled task', async () => {
    useCronJobConversationsMock.mockReturnValue({
      conversations: [
        conversation({ id: 'conv-run-1', name: 'Run 1' }),
        conversation({ id: 'conv-run-2', name: 'Run 2' }),
      ],
      refetch: refetchConversationsMock,
    });

    renderTaskDetail();

    await waitFor(() => expect(getJobInvokeMock).toHaveBeenCalledWith({ job_id: 'job-1' }));

    fireEvent.click(await screen.findByText('conversation.history.batchManage'));
    fireEvent.click(screen.getByText('conversation.history.selectAll'));
    const batchDeleteButton = screen.getByText('conversation.history.batchDelete').closest('button');
    await waitFor(() => expect(batchDeleteButton).not.toBeDisabled());
    fireEvent.click(batchDeleteButton!);

    await waitFor(() => {
      expect(removeConversationInvokeMock).toHaveBeenCalledWith({ id: 'conv-run-1' });
      expect(removeConversationInvokeMock).toHaveBeenCalledWith({ id: 'conv-run-2' });
    });
    expect(removeJobInvokeMock).not.toHaveBeenCalled();
  });
});

function renderTaskDetail() {
  return render(
    <MemoryRouter initialEntries={['/scheduled/job-1']}>
      <Routes>
        <Route path='/scheduled/:job_id' element={<TaskDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function job(overrides?: Partial<ICronJob>): ICronJob {
  return {
    id: 'job-1',
    name: 'Daily report',
    enabled: true,
    description: 'Build the daily report',
    schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Shanghai', description: 'Daily at 9 AM' },
    action: { command: 'test' },
    target: {
      execution_mode: 'new_conversation',
      payload: { kind: 'message', text: 'report' },
    },
    state: {
      last_status: 'success',
      last_run_at_ms: Date.now(),
      next_run_at_ms: Date.now() + 86_400_000,
    },
    metadata: {
      conversation_id: 'conv-1',
      created_at_ms: Date.now(),
    },
    ...overrides,
  } as ICronJob;
}

function conversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-run',
    type: 'acp',
    name: 'Run',
    created_at: Date.UTC(2026, 6, 1, 12, 0, 0),
    modified_at: Date.UTC(2026, 6, 1, 12, 0, 0),
    extra: {
      workspace: '/tmp/project',
      backend: 'codex',
    },
    model: {
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      api_key: '',
      api_base_url: '',
      use_model: 'model-1',
    },
    ...overrides,
  } as TChatConversation;
}
