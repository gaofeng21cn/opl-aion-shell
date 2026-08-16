import { describe, expect, it } from 'vitest';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import { __remoteCompanionBridgeTest } from '@/process/bridge/remoteCompanionBridge';

function response(overrides: Partial<IResponseMessage> = {}): IResponseMessage {
  return {
    type: 'text',
    data: 'delta text',
    msg_id: 'message-001',
    turn_id: 'turn-001',
    conversation_id: 'thread-001',
    ...overrides,
  };
}

function completed(overrides: Partial<IConversationTurnCompletedEvent> = {}): IConversationTurnCompletedEvent {
  return {
    session_id: 'thread-001',
    turn_id: 'turn-001',
    status: 'finished',
    state: 'ai_waiting_input',
    detail: '',
    can_send_message: true,
    runtime: {
      state: 'idle',
      can_send_message: true,
      has_task: false,
      task_status: 'finished',
      is_processing: false,
      pending_confirmations: 0,
      turn_id: null,
    },
    workspace: '/workspace/project',
    model: { platform: 'codex', name: 'Codex', use_model: '' },
    last_message: { content: null, created_at: 1_784_105_026 },
    ...overrides,
  };
}

describe('remoteCompanionBridge projections', () => {
  it('projects non-replacement text responses as turn deltas', () => {
    expect(__remoteCompanionBridgeTest.responseToRemoteEvent(response())).toEqual({
      event_type: 'turn.delta',
      payload: { thread_id: 'thread-001', turn_id: 'turn-001', delta: 'delta text' },
    });
    expect(__remoteCompanionBridgeTest.responseToRemoteEvent(response({ replace: true }))).toBeNull();
  });

  it('projects owner approvals and only exposes one-shot remote decisions', () => {
    const approval = response({
      type: 'acp_permission',
      data: {
        options: [
          { option_id: 'accept', name: 'Allow once' },
          { option_id: 'acceptForSession', name: 'Allow for this task' },
          { option_id: 'decline', name: 'Deny' },
        ],
        tool_call: {
          tool_call_id: 'approval-001',
          title: 'Apply file changes',
          kind: 'edit',
        },
      },
    });

    expect(__remoteCompanionBridgeTest.approvalProjection(approval)).toEqual({
      id: 'approval-001',
      summary: 'Apply file changes',
      impact: 'medium',
      allowed_decisions: ['approve', 'reject'],
    });
    expect(__remoteCompanionBridgeTest.responseToRemoteEvent(approval)).toEqual({
      event_type: 'approval.requested',
      payload: {
        thread_id: 'thread-001',
        approval: { id: 'approval-001', summary: 'Apply file changes', impact: 'medium' },
      },
    });
  });

  it('projects stopped and completed turns with the wire event names', () => {
    expect(__remoteCompanionBridgeTest.turnCompletedToRemoteEvent(completed({ state: 'stopped' }))).toEqual({
      event_type: 'turn.stopped',
      payload: { thread_id: 'thread-001', turn_id: 'turn-001' },
    });
    expect(__remoteCompanionBridgeTest.turnCompletedToRemoteEvent(completed())).toEqual({
      event_type: 'turn.completed',
      payload: { thread_id: 'thread-001', turn_id: 'turn-001' },
    });
  });
});
