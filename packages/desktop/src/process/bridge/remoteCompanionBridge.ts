import { app } from 'electron';
import { ipcBridge } from '@/common';
import type { IResponseMessage, IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type {
  RemoteApprovalImpact,
  RemoteApprovalProjection,
  RemoteCanonicalActionPort,
  RemoteProjectionEvent,
} from '../services/remote-companion/canonicalActionBridge';
import { RemoteCompanionService } from '../services/remote-companion/RemoteCompanionService';
import { readRemoteBrokerConfig, RemoteBrokerClient } from '../services/remote-companion/brokerClient';
import { ElectronRemoteCredentialStore } from '../services/remote-companion/credentialStore';
import { TencentCloudImAdapter } from '../services/remote-companion/tencentImAdapter';
import { disposeRemoteCompanionConnectorHost } from '../services/remote-companion/remoteCompanionConnectorHost';
import { getActiveCodexAppServerAdapter } from './codexAppServerBridge';
import { resolveSelectedWorkspaceRoot } from './oplRuntimeBridge';

let activeService: RemoteCompanionService | null = null;
let disposeStateListener: (() => void) | null = null;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function remoteDecision(value: string | null): 'approve' | 'reject' | null {
  if (value === 'accept') return 'approve';
  if (value === 'decline') return 'reject';
  return null;
}

function approvalProjection(message: IResponseMessage): RemoteApprovalProjection | null {
  if (message.type !== 'acp_permission') return null;
  const data = record(message.data);
  const toolCall = record(data?.tool_call);
  if (!toolCall) return null;
  const id = text(toolCall.tool_call_id) ?? message.msg_id;
  const summary = text(toolCall.title) ?? 'Approval required';
  const kind = text(toolCall.kind);
  const rawInput = record(toolCall.raw_input);
  const interaction = record(rawInput?.codex_interaction);
  const requiresAdditionalContent =
    interaction?.kind === 'request_user_input' || interaction?.kind === 'mcp_elicitation';
  const impact: RemoteApprovalImpact = requiresAdditionalContent
    ? 'high'
    : kind === 'fetch'
      ? 'low'
      : kind === 'edit'
        ? 'medium'
        : 'high';
  const ownerDecisions = Array.isArray(data?.options)
    ? data.options.flatMap((option) => {
        const optionRecord = record(option);
        const optionId = text(optionRecord?.option_id);
        const decision = remoteDecision(optionId);
        return decision ? [decision] : [];
      })
    : [];
  const hasSimpleCanonicalDecisions = ownerDecisions.includes('approve') && ownerDecisions.includes('reject');
  const allowedDecisions = !requiresAdditionalContent && hasSimpleCanonicalDecisions ? ['approve', 'reject'] : [];
  return { id, summary, impact, allowed_decisions: allowedDecisions };
}

function responseToRemoteEvent(message: IResponseMessage): RemoteProjectionEvent | null {
  const threadId = text(message.conversation_id);
  const turnId = text(message.turn_id);
  if (!threadId || !turnId) return null;
  if (message.type === 'text' && message.replace !== true && typeof message.data === 'string') {
    return {
      event_type: 'turn.delta',
      payload: { thread_id: threadId, turn_id: turnId, delta: message.data },
    };
  }
  const approval = approvalProjection(message);
  if (approval) {
    return {
      event_type: 'approval.requested',
      payload: {
        thread_id: threadId,
        approval: { id: approval.id, summary: approval.summary, impact: approval.impact },
      },
    };
  }
  return null;
}

function turnCompletedToRemoteEvent(event: IConversationTurnCompletedEvent): RemoteProjectionEvent | null {
  if (!event.session_id || !event.turn_id) return null;
  return {
    event_type: event.state === 'stopped' ? 'turn.stopped' : 'turn.completed',
    payload: { thread_id: event.session_id, turn_id: event.turn_id },
  };
}

function createCanonicalPort(): RemoteCanonicalActionPort {
  const adapter = getActiveCodexAppServerAdapter();
  return {
    listThreads: () => adapter.listThreads({ includeArchived: false }),
    readThread: (threadId) => adapter.readThread(threadId),
    listApprovals: async (threadId) =>
      adapter.listPendingApprovals(threadId, threadId).flatMap((message) => {
        const approval = approvalProjection(message);
        return approval ? [approval] : [];
      }),
    startTurn: (request) => adapter.startTurn(request),
    startWithDesktopDefaults: (request) =>
      adapter.startWithDesktopDefaults({
        ...request,
        workspace: resolveSelectedWorkspaceRoot(process.env),
      }),
    interruptTurn: (request) => adapter.interruptTurn(request),
    respondRemoteApproval: (request) =>
      adapter.respondApproval({ requestId: request.approval_id, decision: request.decision }),
    subscribeEvents: (listener) => {
      const disposeResponse = adapter.onResponse((message) => {
        const event = responseToRemoteEvent(message);
        if (event) listener(event);
      });
      const disposeTurn = adapter.onTurnCompleted((event) => {
        const projection = turnCompletedToRemoteEvent(event);
        if (projection) listener(projection);
      });
      return () => {
        disposeResponse();
        disposeTurn();
      };
    },
  };
}

function getActiveService(): RemoteCompanionService {
  if (!activeService) {
    const brokerConfig = readRemoteBrokerConfig();
    const broker = new RemoteBrokerClient({ config: brokerConfig });
    activeService = new RemoteCompanionService({
      broker,
      brokerConfig,
      credentialStore: new ElectronRemoteCredentialStore(app.getPath('userData')),
      transport: new TencentCloudImAdapter(),
      canonical: createCanonicalPort(),
    });
    disposeStateListener = activeService.onStateChanged((state) => ipcBridge.remoteCompanion.stateChanged.emit(state));
  }
  return activeService;
}

export function initRemoteCompanionBridge(): void {
  ipcBridge.remoteCompanion.getState.provider(() => getActiveService().getState());
  ipcBridge.remoteCompanion.startPairing.provider((request) => getActiveService().startPairing(request));
  ipcBridge.remoteCompanion.pollPairing.provider((request) => getActiveService().pollPairing(request.pair_id));
  ipcBridge.remoteCompanion.confirmPairing.provider((request) => getActiveService().confirmPairing(request));
  ipcBridge.remoteCompanion.revokePairing.provider((request) => getActiveService().revokePair(request));
  ipcBridge.remoteCompanion.refreshPair.provider((request) => getActiveService().refreshPair(request.pair_id));
}

export async function disposeRemoteCompanionBridge(): Promise<void> {
  disposeStateListener?.();
  disposeStateListener = null;
  const service = activeService;
  activeService = null;
  try {
    await service?.dispose();
  } finally {
    await disposeRemoteCompanionConnectorHost();
  }
}

export const __remoteCompanionBridgeTest = {
  approvalProjection,
  createCanonicalPort,
  responseToRemoteEvent,
  reset: disposeRemoteCompanionBridge,
  turnCompletedToRemoteEvent,
};
