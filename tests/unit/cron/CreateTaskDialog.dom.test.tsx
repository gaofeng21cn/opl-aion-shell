/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';

const { addJobInvokeMock, updateJobInvokeMock, useConversationAgentsMock } = vi.hoisted(() => ({
  addJobInvokeMock: vi.fn(),
  updateJobInvokeMock: vi.fn(),
  useConversationAgentsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) =>
      ({
        'cron.page.createTask': 'Create Scheduled Task',
        'cron.page.editTask': 'Edit Scheduled Task',
        'cron.page.save': 'Save',
        'cron.page.cancel': 'Cancel',
        'cron.page.codexUnavailable': 'Codex unavailable',
        'cron.page.codexAmbiguous': 'Codex ambiguous',
      })[key] ?? key,
  }),
}));

vi.mock('@renderer/components/base/ModalWrapper', () => ({
  default: ({
    children,
    visible,
    title,
    onOk,
    onCancel,
    okText,
    cancelText,
    okButtonProps,
  }: React.PropsWithChildren<{
    visible?: boolean;
    title?: React.ReactNode;
    onOk?: () => unknown;
    onCancel?: () => unknown;
    okText?: React.ReactNode;
    cancelText?: React.ReactNode;
    okButtonProps?: { disabled?: boolean };
  }>) =>
    visible ? (
      <div role='dialog'>
        <h2>{title}</h2>
        {children}
        <button type='button' disabled={okButtonProps?.disabled} onClick={() => void onOk?.()}>
          {okText}
        </button>
        <button type='button' onClick={() => void onCancel?.()}>
          {cancelText}
        </button>
      </div>
    ) : null,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      addJob: { invoke: (...args: unknown[]) => addJobInvokeMock(...args) },
      updateJob: { invoke: (...args: unknown[]) => updateJobInvokeMock(...args) },
    },
  },
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => useConversationAgentsMock(),
}));

vi.mock('@renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: [],
    getAvailableModels: () => [],
  }),
}));

vi.mock('@renderer/pages/guid/components/GuidModelSelector', () => ({
  default: () => <div data-testid='model-selector' />,
}));

vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: () => <div data-testid='workspace-selector' />,
}));

vi.mock('@renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationCreateErrorMessage: (error: unknown) => String(error),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

describe('CreateTaskDialog OPL Scheduled Tasks composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    addJobInvokeMock.mockResolvedValue({});
    updateJobInvokeMock.mockResolvedValue({});
    useConversationAgentsMock.mockReturnValue({
      cliAgents: [codexAssistant()],
      presetAssistants: [],
      isLoading: false,
    });
  });

  it('hides the executor selector and writes the exact Codex Assistant id', async () => {
    render(<CreateTaskDialog visible onClose={vi.fn()} />);

    expect(screen.getByTestId('cron-fixed-executor')).toHaveTextContent('Codex');
    expect(screen.getByTestId('cron-fixed-executor')).toHaveAttribute('data-executor', 'codex_cli');

    fireEvent.change(screen.getByPlaceholderText('cron.page.form.namePlaceholder'), {
      target: { value: 'Daily report' },
    });
    fireEvent.change(screen.getByPlaceholderText('cron.page.form.descriptionPlaceholder'), {
      target: { value: 'Build the report' },
    });
    fireEvent.change(screen.getByPlaceholderText('cron.page.form.promptPlaceholder'), {
      target: { value: 'Run the report' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(addJobInvokeMock).toHaveBeenCalledOnce());
    expect(addJobInvokeMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        agent_config: expect.objectContaining({ assistant_id: 'assistant-codex' }),
      })
    );
  });

  it('keeps missing Codex identity local to new-task composition', () => {
    useConversationAgentsMock.mockReturnValue({ cliAgents: [], presetAssistants: [], isLoading: false });

    render(<CreateTaskDialog visible onClose={vi.fn()} />);

    expect(screen.getByTestId('cron-codex-unavailable')).toHaveTextContent('Codex unavailable');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('preserves a legacy non-Codex executor while schedule and prompt remain editable', async () => {
    useConversationAgentsMock.mockReturnValue({ cliAgents: [], presetAssistants: [], isLoading: false });
    render(<CreateTaskDialog visible editJob={legacyJob()} onClose={vi.fn()} />);

    expect(screen.getByTestId('cron-fixed-executor')).toHaveTextContent('Claude Code');
    expect(screen.queryByTestId('cron-codex-unavailable')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('cron.page.form.namePlaceholder')).toBeDisabled();
    expect(screen.getByPlaceholderText('cron.page.form.descriptionPlaceholder')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('cron.page.form.promptPlaceholder'), {
      target: { value: 'Updated legacy prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateJobInvokeMock).toHaveBeenCalledOnce());
    const request = updateJobInvokeMock.mock.calls[0]?.[0] as {
      updates: { name?: string; description?: string; target?: unknown; metadata?: { agent_config?: unknown } };
    };
    expect(request.updates).not.toHaveProperty('name');
    expect(request.updates).not.toHaveProperty('description');
    expect(request.updates.metadata).not.toHaveProperty('agent_config');
    expect(request.updates.target).toEqual(
      expect.objectContaining({
        execution_mode: 'new_conversation',
        payload: { kind: 'message', text: 'Updated legacy prompt' },
      })
    );
  });
});

function codexAssistant() {
  return {
    id: 'assistant-codex',
    assistant_id: 'assistant-codex',
    source: 'generated',
    enabled: true,
    name: 'Codex',
    name_i18n: {},
    agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
    agent_type: 'acp',
    backend: 'codex',
  };
}

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
