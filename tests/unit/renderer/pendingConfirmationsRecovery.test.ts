import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IConfirmation, TMessage } from '@/common/chat/chatLib';
import { describe, expect, it } from 'vitest';
import {
  buildPendingConfirmationMessage,
  hasPermissionMessageForCallId,
  mergeCanonicalPendingApprovals,
  removePermissionMessage,
} from '@/renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';

const confirmation: IConfirmation<string> = {
  id: 'tool-1',
  call_id: 'tool-1',
  title: 'Write file',
  description: 'Write /tmp/current_time.txt',
  command_type: 'edit',
  options: [{ label: 'Allow', value: 'allow_once' }],
};

describe('pending confirmations recovery', () => {
  it('builds a permission message with stable msg_id from confirmation id', () => {
    const message = buildPendingConfirmationMessage('conv-1', confirmation);

    expect(message.type).toBe('permission');
    expect(message.conversation_id).toBe('conv-1');
    expect(message.msg_id).toBe('confirmation:tool-1');
    expect(message.content.call_id).toBe('tool-1');
  });

  it('detects existing permission messages by call_id', () => {
    const list = [buildPendingConfirmationMessage('conv-1', confirmation)];

    expect(hasPermissionMessageForCallId(list, 'tool-1')).toBe(true);
    expect(hasPermissionMessageForCallId(list, 'tool-2')).toBe(false);
  });

  it('removes recovered permission messages by confirmation id or call_id', () => {
    const list = [
      buildPendingConfirmationMessage('conv-1', confirmation),
      { id: 'text-1', type: 'text', conversation_id: 'conv-1', content: { content: 'hello' } },
    ] as TMessage[];

    const result = removePermissionMessage(list, { id: 'tool-1', call_id: 'tool-1' });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
  });

  it('restores canonical approvals once by stable app-server request id', () => {
    const response = {
      type: 'acp_permission',
      msg_id: 'approval-1',
      conversation_id: 'conv-1',
      data: {
        options: [{ option_id: 'accept', name: 'Allow once', kind: 'allow_once' }],
        tool_call: {
          tool_call_id: 'approval-1',
          raw_input: { codex_app_server_request: true },
          status: 'pending',
          title: 'Run command',
          kind: 'execute',
        },
      },
    } as IResponseMessage;

    const recovered = mergeCanonicalPendingApprovals([], [response]);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ type: 'acp_permission', msg_id: 'approval-1' });
    expect(mergeCanonicalPendingApprovals(recovered, [response])).toBe(recovered);
  });
});
