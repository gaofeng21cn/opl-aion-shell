import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ConversationAgentRebindControl from '@/renderer/pages/conversation/components/ConversationAgentRebindControl';

const mocks = vi.hoisted(() => ({
  rebindAssistant: vi.fn(),
  mutate: vi.fn(),
  emit: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      rebindAssistant: { invoke: mocks.rebindAssistant },
    },
  },
}));

vi.mock('@/common/config/oplProductProfile', () => ({
  canonicalizeOplProfessionalAgentId: (value: string) =>
    ({ medautoscience: 'mas', mas: 'mas' })[value.replace(/[^a-z0-9]/gi, '').toLowerCase()] ?? value,
  getOplDefaultExecutorAgentKey: () => 'codex',
  getOplProfessionalAgentPackages: () => [{ package_id: 'mas' }],
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({
    cliAgents: [
      {
        id: 'generated-codex',
        assistant_id: 'generated-codex',
        managed_agent_id: 'codex-runtime',
        source: 'generated',
        name: 'Codex',
        name_i18n: {},
        description_i18n: {},
        enabled: true,
        sort_order: 0,
        agent_id: 'codex-runtime',
        agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        agent_type: 'acp',
        agent_source: 'builtin',
        backend: 'codex',
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
      },
    ],
    presetAssistants: [
      {
        id: 'med-autoscience',
        source: 'builtin',
        name: 'Med AutoScience',
        name_i18n: { 'zh-CN': '医学科研' },
        description_i18n: {},
        enabled: true,
        sort_order: 1,
        agent_id: 'codex-runtime',
        agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
      },
    ],
  }),
}));

vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: mocks.emit } }));
vi.mock('swr', () => ({ mutate: mocks.mutate }));
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return { ...actual, Message: { success: mocks.success, error: mocks.error } };
});
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: { agent?: string }) => (options?.agent ? `${key}:${options.agent}` : key),
  }),
}));

const conversation = (runtimeState: 'idle' | 'running' = 'idle'): TChatConversation =>
  ({
    id: 'conversation-1',
    name: 'Research',
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    status: runtimeState === 'running' ? 'running' : 'finished',
    runtime: {
      state: runtimeState,
      can_send_message: runtimeState === 'idle',
      has_task: true,
      is_processing: runtimeState === 'running',
      pending_confirmations: 0,
      turn_id: runtimeState === 'running' ? 'turn-1' : null,
    },
    assistant: {
      id: 'generated-codex',
      source: 'generated',
      name: 'Codex',
      avatar: '',
      backend: 'codex',
    },
    extra: { backend: 'codex' },
  }) as TChatConversation;

async function selectMedAutoScience(): Promise<void> {
  await userEvent.click(screen.getByTestId('conversation-agent-owner-selector'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: '@医学科研' }));
}

describe('ConversationAgentRebindControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('commits an explicit @Agent owner only from the authoritative Core readback', async () => {
    const rebound = {
      ...conversation(),
      assistant: {
        id: 'med-autoscience',
        source: 'builtin',
        name: 'Med AutoScience',
        avatar: '',
        backend: 'codex',
      },
    };
    mocks.rebindAssistant.mockResolvedValue(rebound);
    mocks.mutate.mockResolvedValue(undefined);
    render(<ConversationAgentRebindControl conversation={conversation()} />);

    await selectMedAutoScience();

    await waitFor(() =>
      expect(mocks.rebindAssistant).toHaveBeenCalledWith({
        id: 'conversation-1',
        assistant: { id: 'med-autoscience', locale: 'zh-CN' },
      })
    );
    expect(mocks.mutate).toHaveBeenCalledWith('conversation/conversation-1', rebound, false);
    expect(mocks.emit).toHaveBeenCalledWith('chat.history.refresh');
    expect(mocks.success).toHaveBeenCalledWith('conversation.chat.switchedToAgent:医学科研');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('keeps the original owner and cache when the old backend has no rebind endpoint', async () => {
    mocks.rebindAssistant.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    render(<ConversationAgentRebindControl conversation={conversation()} />);

    await selectMedAutoScience();

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('conversation.chat.switchAgentFailed'));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('conversation-agent-owner-selector')).toHaveTextContent('@Codex');
  });

  it('hides owner mutation when the legacy backend omits authoritative assistant identity', () => {
    const legacyConversation = { ...conversation(), assistant: undefined };

    render(<ConversationAgentRebindControl conversation={legacyConversation} />);

    expect(screen.queryByTestId('conversation-agent-owner-selector')).not.toBeInTheDocument();
    expect(mocks.rebindAssistant).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('rejects a successful response whose authoritative owner does not match the selection', async () => {
    mocks.rebindAssistant.mockResolvedValue(conversation());
    render(<ConversationAgentRebindControl conversation={conversation()} />);

    await selectMedAutoScience();

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('conversation.chat.switchAgentFailed'));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not offer owner mutation while the conversation is running', () => {
    render(<ConversationAgentRebindControl conversation={conversation('running')} />);

    expect(screen.getByTestId('conversation-agent-owner-selector')).toBeDisabled();
    expect(mocks.rebindAssistant).not.toHaveBeenCalled();
  });
});
