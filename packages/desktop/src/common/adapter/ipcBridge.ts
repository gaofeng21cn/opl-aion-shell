/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC Bridge → HTTP/WS adapter.
 *
 * This file replaces the original IPC bridge calls with HTTP REST and WebSocket
 * calls routed to aioncore. Electron-native operations (window controls,
 * native dialogs, auto-update, devtools, zoom, CDP, deep links) remain as IPC.
 */

import type { IConfirmation } from '@/common/chat/chatLib';
import type { AcpSlashCommandApiItem } from '@/common/chat/slash/types';
import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type {
  ICssTheme,
  IMcpServer,
  IProvider,
  ISessionMcpServer,
  TChatConversation,
  TConversationRuntimeSummary,
  TProviderWithModel,
} from '../config/storage';
import type {
  Assistant,
  CreateAssistantRequest,
  ImportAssistantsRequest,
  ImportAssistantsResult,
  SetAssistantStateRequest,
  UpdateAssistantRequest,
} from '../types/agent/assistantTypes';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '../types/office/preview';
import type {
  AcpModelInfo,
  GetConfigOptionsResponse,
  SetConfigOptionRequest,
  SetConfigOptionResponse,
} from '../types/platform/acpTypes';
import type {
  GitCommitStagedRequest,
  GitCommitStagedResult,
  GitPushCurrentBranchRequest,
  GitPushCurrentBranchResult,
  GitWorkspaceInspectRequest,
  GitWorkspaceInspection,
} from '../types/platform/gitWorkspace';
import type {
  CreateProviderRequest,
  FetchModelsAnonymousRequest,
  FetchModelsResponse,
  ProviderHealthCheckRequest,
  ProviderHealthCheckResponse,
  UpdateProviderRequest,
} from '../types/provider/providerApi';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  ITeamCreatedEvent,
  ITeamListChangedEvent,
  ITeamTeammateMessageEvent,
  TTeam,
  TeamAgent,
} from '../types/team/teamTypes';
import type {
  CodexReviewStartRequest,
  CodexReviewStartResult,
  CodexThreadDescriptor,
  CodexThreadDetail,
  CodexThreadDirectory,
  CodexThreadDirectoryRequest,
  CodexThreadIdRequest,
  CodexThreadRenameRequest,
  CodexThreadSettingsUpdateRequest,
  CodexThreadStartRequest,
} from '../types/codex/appServerThreads';
import type {
  AutoUpdateStatus,
  AutoUpdateInstallRequest,
  UpdateCheckRequest,
  UpdateCheckResult,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
  UpdateDownloadResult,
} from '../update/updateTypes';
import type { Theme } from '@/common/theme/types';
import type { ProtocolDetectionRequest, ProtocolDetectionResponse } from '../utils/protocolDetector';
import { TEAM_MODE_ENABLED } from '../config/constants';
import {
  buildCreateConversationBody,
  fromApiConversation,
  fromApiPaginatedConversations,
  toApiModelOptional,
} from './apiModelMapper';
import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPut,
  httpRequest,
  stubProvider,
  withResponseMap,
  wsEmitter,
  wsMappedEmitter,
} from './httpBridge';
import { fromApiSearchResult, type ApiMessageSearchItem } from './searchMapper';
import type { IAddTeamAgentParams, ICreateTeamParams } from './teamMapper';
import {
  fromBackendAgent,
  fromBackendTeam,
  fromBackendTeamAgentRenamedEvent,
  fromBackendTeamAgentSpawnedEvent,
  fromBackendTeamAgentStatusEvent,
  fromBackendTeamList,
  fromBackendTeamOptional,
  toBackendAgent,
} from './teamMapper';
import { fromBackendCompareResult, type RawCompareResult } from './fileSnapshotMapper';
import {
  absoluteToRelativePath,
  fromBackendWorkspaceFlatFiles,
  fromBackendWorkspaceList,
  type RawWorkspaceFlatFile,
} from './workspaceMapper';

type BridgeProvider<Data, Params> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
  invoke: Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>;
};

function disabledTeamMutation<Data, Params>(inner: BridgeProvider<Data, Params>): BridgeProvider<Data, Params> {
  if (TEAM_MODE_ENABLED) {
    return inner;
  }
  const invoke = async () => {
    throw new Error('Team mode is disabled for ordinary OPL App');
  };
  return {
    provider: () => {},
    invoke: invoke as unknown as BridgeProvider<Data, Params>['invoke'],
  };
}

// ---------------------------------------------------------------------------
// Shell — routed to POST /api/shell/*
// ---------------------------------------------------------------------------

export const shell = {
  openFile: httpPost<void, string>('/api/shell/open-file', (file_path) => ({ file_path })),
  showItemInFolder: httpPost<void, string>('/api/shell/show-item-in-folder', (file_path) => ({ file_path })),
  openExternal: httpPost<void, string>('/api/shell/open-external', (url) => ({ url })),
  checkToolInstalled: httpPost<boolean, { tool: string }>('/api/shell/check-tool-installed'),
  openFolderWith: httpPost<void, { folder_path: string; tool: 'vscode' | 'terminal' | 'explorer' }>(
    '/api/shell/open-folder-with'
  ),
};

// ---------------------------------------------------------------------------
// Assistants — routed to /api/assistants/*
// ---------------------------------------------------------------------------

export const assistants = {
  list: httpGet<Assistant[], void>('/api/assistants'),
  create: httpPost<Assistant, CreateAssistantRequest>('/api/assistants'),
  update: httpPut<Assistant, UpdateAssistantRequest>((p) => `/api/assistants/${p.id}`),
  delete: httpDelete<void, { id: string }>((p) => `/api/assistants/${p.id}`),
  setState: httpPatch<Assistant, SetAssistantStateRequest>(
    (p) => `/api/assistants/${p.id}/state`,
    (p) => {
      const { id: _id, ...body } = p;
      return body;
    }
  ),
  import: httpPost<ImportAssistantsResult, ImportAssistantsRequest>('/api/assistants/import'),
};

// ---------------------------------------------------------------------------
// Conversation — REST + WS
// ---------------------------------------------------------------------------

export const conversation = {
  create: withResponseMap(
    httpPost<TChatConversation, ICreateConversationParams>('/api/conversations', buildCreateConversationBody),
    fromApiConversation
  ),
  createWithConversation: withResponseMap(
    httpPost<TChatConversation, { conversation: TChatConversation }>('/api/conversations/clone', (p) => {
      const isAionrs = p.conversation.type === 'aionrs';
      const { model: _rawModel, ...rest } = p.conversation as TChatConversation & {
        model?: TProviderWithModel;
      };
      const clonedConversation: Record<string, unknown> = { ...rest };
      if (isAionrs) {
        const model = toApiModelOptional(_rawModel);
        if (model) clonedConversation.model = model;
      }
      return {
        conversation: clonedConversation,
      };
    }),
    fromApiConversation
  ),
  get: withResponseMap(
    httpGet<TChatConversation, { id: string }>((p) => `/api/conversations/${p.id}`, { silentStatuses: [404] }),
    fromApiConversation
  ),
  getAssociateConversation: withResponseMap(
    httpGet<TChatConversation[], { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/associated`
    ),
    (list) => list.map(fromApiConversation)
  ),
  listByCronJob: withResponseMap(
    httpGet<TChatConversation[], { cron_job_id: string }>((p) => `/api/cron/jobs/${p.cron_job_id}/conversations`),
    (list) => list.map(fromApiConversation)
  ),
  remove: httpDelete<boolean, { id: string }>((p) => `/api/conversations/${p.id}`),
  update: httpPatch<boolean, { id: string; updates: Partial<TChatConversation>; merge_extra?: boolean }>(
    (p) => `/api/conversations/${p.id}`,
    (p) => {
      const updates = p.updates as Record<string, unknown>;
      const { model: rawModel, ...rest } = updates;
      const model = toApiModelOptional(rawModel as TProviderWithModel | undefined);
      return {
        ...rest,
        ...(model ? { model } : {}),
        merge_extra: p.merge_extra,
      };
    }
  ),
  reset: httpPost<void, IResetConversationParams>((p) => `/api/conversations/${p.id}/reset`),
  warmup: httpPost<void, { conversation_id: string }>((p) => `/api/conversations/${p.conversation_id}/warmup`),
  stop: httpPost<{ runtime: TConversationRuntimeSummary }, { conversation_id: string; turn_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/cancel`,
    (p) => ({ turn_id: p.turn_id })
  ),
  activeCount: httpGet<{ count: number }>('/api/conversations/active-count'),
  sendMessage: httpPost<ISendMessageResult, ISendMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/messages`,
    (p) => ({
      content: p.input,
      files: p.files,
      loading_id: p.loading_id,
      inject_skills: p.inject_skills,
    })
  ),
  getSlashCommands: httpGet<AcpSlashCommandApiItem[], { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/slash-commands`
  ),
  askSideQuestion: httpPost<ConversationSideQuestionResult, { conversation_id: string; question: string }>(
    (p) => `/api/conversations/${p.conversation_id}/side-question`,
    (p) => ({ question: p.question })
  ),
  confirmMessage: httpPost<void, IConfirmMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/confirmations/${encodeURIComponent(p.call_id)}/confirm`,
    (p) => ({ msg_id: p.msg_id, data: p.confirm_key })
  ),
  listArtifacts: httpGet<IConversationArtifact[], { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/artifacts`
  ),
  updateArtifact: httpPatch<
    IConversationArtifact,
    { conversation_id: string; artifact_id: string; status: IConversationArtifactStatus }
  >(
    (p) => `/api/conversations/${p.conversation_id}/artifacts/${p.artifact_id}`,
    (p) => ({ status: p.status })
  ),
  responseStream: wsEmitter<IResponseMessage>('message.stream'),
  userCreated: wsEmitter<{
    conversation_id: string;
    msg_id: string;
    content: string;
    position: 'right';
    status: 'finish';
    hidden: boolean;
    created_at: number;
  }>('message.userCreated'),
  artifactStream: wsEmitter<IConversationArtifact>('conversation.artifact'),
  turnCompleted: wsMappedEmitter<IConversationTurnCompletedEvent>('turn.completed', (raw) => {
    const r = raw as Record<string, unknown>;
    const rawLast = (r.last_message ?? r.lastMessage) as Record<string, unknown> | undefined;
    const last_message: IConversationTurnCompletedEvent['last_message'] = rawLast
      ? {
          id: rawLast.id as string | undefined,
          type: rawLast.type as string | undefined,
          content: rawLast.content ?? null,
          status: rawLast.status as string | null | undefined,
          created_at: (rawLast.created_at ?? rawLast.createdAt ?? Date.now()) as number,
        }
      : {
          content: null,
          created_at: Date.now(),
        };
    const rawRuntime = (r.runtime ?? {}) as Record<string, unknown>;
    const runtime: IConversationTurnCompletedEvent['runtime'] = {
      state: (rawRuntime.state ?? 'idle') as IConversationTurnCompletedEvent['runtime']['state'],
      can_send_message: (rawRuntime.can_send_message ?? rawRuntime.canSendMessage ?? true) as boolean,
      has_task: (rawRuntime.has_task ?? rawRuntime.hasTask ?? false) as boolean,
      task_status: (rawRuntime.task_status ??
        rawRuntime.taskStatus) as IConversationTurnCompletedEvent['runtime']['task_status'],
      is_processing: (rawRuntime.is_processing ?? rawRuntime.isProcessing ?? false) as boolean,
      pending_confirmations: (rawRuntime.pending_confirmations ?? rawRuntime.pendingConfirmations ?? 0) as number,
      turn_id: (rawRuntime.turn_id ?? rawRuntime.turnId ?? null) as string | null,
    };
    const rawModel = (r.model ?? {}) as Record<string, unknown>;
    const model: IConversationTurnCompletedEvent['model'] = {
      platform: (rawModel.platform ?? '') as string,
      name: (rawModel.name ?? '') as string,
      use_model: (rawModel.use_model ?? rawModel.useModel ?? '') as string,
    };
    return {
      session_id: (r.session_id ?? r.sessionId ?? r.conversation_id ?? '') as string,
      turn_id: (r.turn_id ?? r.turnId ?? runtime.turn_id ?? '') as string,
      status: (r.status ?? 'finished') as IConversationTurnCompletedEvent['status'],
      state: (r.state ??
        (r.status === 'finished' ? 'ai_waiting_input' : 'unknown')) as IConversationTurnCompletedEvent['state'],
      detail: (r.detail ?? '') as string,
      can_send_message: (r.can_send_message ?? r.canSendMessage ?? r.status === 'finished') as boolean,
      runtime,
      workspace: (r.workspace ?? '') as string,
      model,
      last_message,
    };
  }),
  listChanged: wsEmitter<IConversationListChangedEvent>('conversation.listChanged'),
  // Uses httpRequest directly (instead of httpGet + withResponseMap) because the
  // response mapper needs `workspace` from params to build fullPath/relativePath,
  // and withResponseMap's map function does not receive the original params.
  getWorkspace: {
    provider: () => {},
    invoke: (async (p: { conversation_id: string; workspace: string; path: string; search?: string }) => {
      const rel = absoluteToRelativePath(p.path, p.workspace);
      const url = `/api/conversations/${p.conversation_id}/workspace?path=${encodeURIComponent(rel)}${p.search ? `&search=${encodeURIComponent(p.search)}` : ''}`;
      const raw = await httpRequest<Array<{ name: string; type: string }>>('GET', url);
      return fromBackendWorkspaceList(raw, p.workspace, rel);
    }) as (p: { conversation_id: string; workspace: string; path: string; search?: string }) => Promise<IDirOrFile[]>,
  },
  responseSearchWorkSpace: stubProvider<void, { file: number; dir: number; match?: IDirOrFile }>(
    'responseSearchWorkSpace',
    undefined as unknown as void
  ),
  confirmation: {
    add: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.add'),
    update: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.update'),
    confirm: httpPost<
      void,
      { conversation_id: string; msg_id: string; data: unknown; call_id: string; always_allow?: boolean }
    >(
      (p) => `/api/conversations/${p.conversation_id}/confirmations/${encodeURIComponent(p.call_id)}/confirm`,
      (p) => ({ msg_id: p.msg_id, data: p.data, always_allow: p.always_allow ?? false })
    ),
    list: httpGet<IConfirmation<unknown>[], { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/confirmations`
    ),
    remove: wsEmitter<{ conversation_id: string; id: string }>('confirmation.remove'),
  },
  approval: {
    check: httpGet<{ approved: boolean }, { conversation_id: string; action: string; command_type?: string }>(
      (p) =>
        `/api/conversations/${p.conversation_id}/approvals/check?action=${encodeURIComponent(p.action)}${p.command_type ? `&command_type=${encodeURIComponent(p.command_type)}` : ''}`
    ),
  },
};

export const runtime = {
  statusChanged: wsEmitter<IRuntimeStatusEvent>('runtime.statusChanged'),
};

// ---------------------------------------------------------------------------
// CDP status / config types (used by application, stays IPC)
// ---------------------------------------------------------------------------

export interface ICdpStatus {
  enabled: boolean;
  port: number | null;
  startupEnabled: boolean;
  instances: Array<{
    pid: number;
    port: number;
    cwd: string;
    startTime: number;
  }>;
  configEnabled: boolean;
  isDevMode: boolean;
}

export interface ICdpConfig {
  enabled?: boolean;
  port?: number;
}

export type RuntimeStatusScopeKind = 'conversation' | 'mcp' | 'custom_agent';
export type RuntimeResourceKind = 'node' | 'acp_tool';
export type RuntimeStatusPhase = 'waiting_for_lock' | 'downloading' | 'extracting' | 'validating' | 'ready' | 'failed';
export type RuntimeFailureKind =
  | 'timeout'
  | 'download_failed'
  | 'http_status'
  | 'checksum_mismatch'
  | 'validation_failed'
  | 'unsupported_platform'
  | 'bundled_resource_missing'
  | 'bundled_resource_invalid'
  | 'unknown';

export interface IRuntimeStatusScope {
  kind: RuntimeStatusScopeKind;
  id: string;
}

export interface IRuntimeStatusEvent {
  resource: RuntimeResourceKind;
  resource_id?: string;
  scope: IRuntimeStatusScope;
  phase: RuntimeStatusPhase;
  failure_kind?: RuntimeFailureKind;
  message?: string;
  status_code?: number;
}

export interface IStartOnBootStatus {
  supported: boolean;
  enabled: boolean;
  isPackaged: boolean;
  platform: string;
}

/** Hardware acceleration / GPU recovery status — see process/utils/gpuRecovery */
export type IGpuOverride = 'force-on' | 'force-off';

export interface IGpuStatus {
  /** User-set override; null means follow auto-recovery */
  userOverride: IGpuOverride | null;
  /** Whether auto-recovery has disabled hardware acceleration after repeated crashes */
  autoDisabled: boolean;
  crashCount: number;
  lastCrashAt: number | null;
}

export interface IAppRestartResult {
  restarted: boolean;
  manualRestartRequired: boolean;
  reason?: 'dev-mode';
}

export type IAppLogDirectoryUpdateResult = {
  schema: 'opl_app_log_directory_update.v1';
  hostLogDir: string;
};

export type IRendererLogLevel = 'info' | 'warn' | 'error';

export interface IRendererLogEntry {
  level: IRendererLogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

export type IDesktopNavigationCommand = 'back' | 'forward' | 'previous-task' | 'next-task';

export type IDesktopNavigationState = {
  canBack: boolean;
  canForward: boolean;
  canPreviousTask: boolean;
  canNextTask: boolean;
};

export type IDesktopAppInfo = {
  platform: string;
  arch: string;
  version: string;
};

// ---------------------------------------------------------------------------
// Application — stays IPC (Electron-native)
// ---------------------------------------------------------------------------

export const application = {
  restart: bridge.buildProvider<IAppRestartResult, void>('restart-app'),
  openExternalUrl: bridge.buildProvider<void, { url: string }>('app.open-external-url'),
  getDesktopAppInfo: bridge.buildProvider<IDesktopAppInfo, void>('app.get-desktop-app-info'),
  openDevTools: bridge.buildProvider<boolean, void>('open-dev-tools'),
  isDevToolsOpened: bridge.buildProvider<boolean, void>('is-dev-tools-opened'),
  systemInfo: withResponseMap(
    httpGet<{ cache_dir: string; work_dir: string; log_dir: string; platform: string; arch: string }, void>(
      '/api/system/info'
    ),
    (raw) => ({
      cacheDir: raw.cache_dir,
      workDir: raw.work_dir,
      logDir: raw.log_dir,
      platform: raw.platform,
      arch: raw.arch,
    })
  ),
  getPath: bridge.buildProvider<string, { name: 'desktop' | 'home' | 'downloads' }>('app.get-path'),
  // Electron-local: copies cache dir + persists to ProcessEnv, paired with restart.
  // The backend reads AIONUI_*_DIR env vars on boot, so it does not own this config.
  updateSystemInfo: bridge.buildProvider<void, { cacheDir: string; workDir: string; logDir?: string }>(
    'update-system-info'
  ),
  setLogDirectory: bridge.buildProvider<IAppLogDirectoryUpdateResult, { path: string }>('app.set-log-directory'),
  getZoomFactor: bridge.buildProvider<number, void>('app.get-zoom-factor'),
  setZoomFactor: bridge.buildProvider<number, { factor: number }>('app.set-zoom-factor'),
  getCdpStatus: bridge.buildProvider<IBridgeResponse<ICdpStatus>, void>('app.get-cdp-status'),
  updateCdpConfig: bridge.buildProvider<IBridgeResponse<ICdpConfig>, Partial<ICdpConfig>>('app.update-cdp-config'),
  getStartOnBootStatus: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, void>('app.get-start-on-boot-status'),
  setStartOnBoot: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, { enabled: boolean }>(
    'app.set-start-on-boot'
  ),
  getGpuStatus: bridge.buildProvider<IBridgeResponse<IGpuStatus>, void>('app.get-gpu-status'),
  setGpuOverride: bridge.buildProvider<IBridgeResponse<IGpuStatus>, { override: IGpuOverride | null }>(
    'app.set-gpu-override'
  ),
  writeRendererLog: bridge.buildProvider<void, IRendererLogEntry>('app.write-renderer-log'),
  setDesktopNavigationState: bridge.buildProvider<void, IDesktopNavigationState>('app.set-desktop-navigation-state'),
  desktopNavigationCommand: bridge.buildEmitter<{ command: IDesktopNavigationCommand }>(
    'app.desktop-navigation-command'
  ),
  logStream: bridge.buildEmitter<{ level: 'log' | 'warn' | 'error'; tag: string; message: string; data?: unknown }>(
    'app.log-stream'
  ),
  devToolsStateChanged: bridge.buildEmitter<{ isOpen: boolean }>('app.devtools-state-changed'),
};

export type IOplRuntimeDetailLevel = 'summary' | 'full';
export type IOplAppStateProfile = 'fast' | 'full';

export type IOplDomainDetailViewRequest = {
  itemId: string;
  viewId: string;
  ifRevision?: number;
};

export type IOplRuntimeActionRequest = {
  actionId: string;
  dryRun: boolean;
  payloadRefsOnlyJson?: Record<string, unknown>;
  payloadJson?: Record<string, unknown>;
};

export type IOplConfigureCodexRequest = {
  apiKey: string;
};

export type IOplGatewayAccountErrorCode =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'mfa_or_challenge_required'
  | 'session_not_persistable'
  | 'group_selection_required'
  | 'auth_expired'
  | 'network_unreachable'
  | 'rate_limited'
  | 'managed_key_missing'
  | 'managed_key_conflict'
  | 'managed_key_identity_drift'
  | 'disconnect_pending'
  | 'invalid_request'
  | 'internal_contract_violation'
  | 'gateway_account_failed';

export type IOplGatewayAccountLoginRequest = {
  email: string;
  password: string;
  deviceLabel?: string;
};

export type IOplGatewayAccountMutationResult = {
  ok: boolean;
  errorCode?: IOplGatewayAccountErrorCode;
  stateRefreshRequired: boolean;
};

export type IOplManagedUpdateLifecycleId = 'opl_base' | 'opl_app' | 'opl_packages';

export type IOplUpdateComponentRequest = {
  componentId: IOplManagedUpdateLifecycleId;
  packageId?: string;
};

export type IOplUpdateRepairRequest = {
  componentId: IOplManagedUpdateLifecycleId;
  packageId?: string;
  receiptId?: string;
};

export type IOplRuntimeCommandResult = {
  surface:
    | 'app_state_fast'
    | 'app_state_full'
    | 'domain_detail_view'
    | 'runtime_summary'
    | 'runtime_full'
    | 'app_action'
    | 'system_initialize'
    | 'install_prep'
    | 'configure_codex'
    | 'gateway_account'
    | 'startup_maintenance'
    | 'reconcile_modules'
    | 'update_status'
    | 'update_check'
    | 'update_plan'
    | 'update_apply'
    | 'update_repair'
    | 'update_rollback';
  command: string;
  stdout: string;
  parsed: unknown;
  ok?: boolean;
  error?: {
    message: string;
    code?: string;
    stderr?: string;
    exitCode?: number | null;
    timedOut?: boolean;
  };
};

export type IOplSystemInitializeEvent = {
  surface_id: string;
  event_type: string;
  phase: string;
  label: string;
  sequence: number;
  observed_at: string;
  duration_ms?: number;
  payload?: unknown;
};

export type IOplStartupMaintenanceCompletedEvent = {
  schema: 'opl.desktop_startup_maintenance.completed.v1';
  observed_at: string;
  outcome: 'completed' | 'needs_attention' | 'failed';
  command_ok: boolean;
  maintenance_status: string | null;
  refresh_profile: 'fast';
};

function isWebUiBrowserMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    !(window as Window & { electronAPI?: unknown }).electronAPI
  );
}

function runtimeProvider<Data, Params>(
  channel: string,
  webRoute: string,
  mapBody?: (params: Params) => unknown
): BridgeProvider<Data, Params> {
  const electronProvider = bridge.buildProvider<Data, Params>(channel);
  const webProvider = httpPost<Data, Params>(webRoute, mapBody);
  return {
    provider: electronProvider.provider,
    invoke: ((params?: Params) => {
      const provider = isWebUiBrowserMode() ? webProvider : electronProvider;
      return (provider.invoke as (p?: Params) => Promise<Data>)(params);
    }) as BridgeProvider<Data, Params>['invoke'],
  };
}

function runtimeEmitter<Params>(channel: string, eventName: string) {
  const electronEmitter = bridge.buildEmitter<Params>(channel);
  const webEmitter = wsMappedEmitter<Params>(eventName, (raw) => raw as Params);
  return {
    on: (callback: Params extends undefined ? () => void : (params: Params) => void) => {
      const emitter = isWebUiBrowserMode() ? webEmitter : electronEmitter;
      return emitter.on(callback as never);
    },
    emit: ((params?: Params) => {
      const emitter = isWebUiBrowserMode() ? webEmitter : electronEmitter;
      return (emitter.emit as (p?: Params) => void)(params);
    }) as Params extends undefined ? () => void : (params: Params) => void,
  };
}

// ---------------------------------------------------------------------------
// OPL Runtime — narrow App/operator CLI proxy.
// ---------------------------------------------------------------------------

export const oplRuntime = {
  getAppState: runtimeProvider<IOplRuntimeCommandResult, { profile: IOplAppStateProfile }>(
    'opl-runtime.get-app-state',
    '/api/opl-runtime/app-state'
  ),
  readDomainDetailView: runtimeProvider<IOplRuntimeCommandResult, IOplDomainDetailViewRequest>(
    'opl-runtime.read-domain-detail-view',
    '/api/opl-runtime/domain-detail-view'
  ),
  getInitialize: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.get-initialize',
    '/api/opl-runtime/initialize'
  ),
  initializeEvent: runtimeEmitter<IOplSystemInitializeEvent>(
    'opl-runtime.initialize-event',
    'opl-runtime.initialize-event'
  ),
  startupMaintenanceCompleted: runtimeEmitter<IOplStartupMaintenanceCompletedEvent>(
    'opl-runtime.startup-maintenance-completed',
    'opl-runtime.startup-maintenance-completed'
  ),
  runInstallPrep: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.run-install-prep',
    '/api/opl-runtime/install-prep'
  ),
  configureCodex: runtimeProvider<IOplRuntimeCommandResult, IOplConfigureCodexRequest>(
    'opl-runtime.configure-codex',
    '/api/opl-runtime/configure-codex'
  ),
  // Desktop-only secret channel. Browser WebUI must never receive the user's Gateway password.
  loginGatewayAccount: bridge.buildProvider<IOplGatewayAccountMutationResult, IOplGatewayAccountLoginRequest>(
    'opl-runtime.login-gateway-account'
  ),
  runStartupMaintenance: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.run-startup-maintenance',
    '/api/opl-runtime/startup-maintenance'
  ),
  runReconcileModules: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.run-reconcile-modules',
    '/api/opl-runtime/reconcile-modules'
  ),
  getDrilldown: runtimeProvider<IOplRuntimeCommandResult, { detail: IOplRuntimeDetailLevel }>(
    'opl-runtime.get-drilldown',
    '/api/opl-runtime/drilldown'
  ),
  executeAction: runtimeProvider<IOplRuntimeCommandResult, IOplRuntimeActionRequest>(
    'opl-runtime.execute-action',
    '/api/opl-runtime/execute-action'
  ),
  getUpdateStatus: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.get-managed-update-status',
    '/api/opl-runtime/update-status'
  ),
  runUpdateCheck: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.get-managed-update-check',
    '/api/opl-runtime/update-check'
  ),
  getUpdatePlan: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.get-managed-update-plan',
    '/api/opl-runtime/update-plan'
  ),
  applyUpdatePlan: runtimeProvider<IOplRuntimeCommandResult, void>(
    'opl-runtime.run-managed-update-plan-apply',
    '/api/opl-runtime/update-plan-apply'
  ),
  applyUpdateComponent: runtimeProvider<IOplRuntimeCommandResult, IOplUpdateComponentRequest>(
    'opl-runtime.run-managed-update-apply',
    '/api/opl-runtime/update-apply'
  ),
  repairUpdate: runtimeProvider<IOplRuntimeCommandResult, IOplUpdateRepairRequest>(
    'opl-runtime.run-managed-update-repair',
    '/api/opl-runtime/update-repair'
  ),
  rollbackUpdateComponent: runtimeProvider<IOplRuntimeCommandResult, IOplUpdateComponentRequest>(
    'opl-runtime.run-managed-update-rollback',
    '/api/opl-runtime/update-rollback'
  ),
};

// ---------------------------------------------------------------------------
// Codex app-server threads — direct Electron host adapter.
// ---------------------------------------------------------------------------

export const codexThreads = {
  list: bridge.buildProvider<CodexThreadDirectory, CodexThreadDirectoryRequest>('codex-threads.list'),
  read: bridge.buildProvider<CodexThreadDetail, CodexThreadIdRequest>('codex-threads.read'),
  start: bridge.buildProvider<CodexThreadDescriptor, CodexThreadStartRequest>('codex-threads.start'),
  resume: bridge.buildProvider<CodexThreadDescriptor, CodexThreadIdRequest>('codex-threads.resume'),
  fork: bridge.buildProvider<CodexThreadDescriptor, CodexThreadIdRequest>('codex-threads.fork'),
  rename: bridge.buildProvider<void, CodexThreadRenameRequest>('codex-threads.rename'),
  updateSettings: bridge.buildProvider<void, CodexThreadSettingsUpdateRequest>('codex-threads.update-settings'),
  archive: bridge.buildProvider<void, CodexThreadIdRequest>('codex-threads.archive'),
  unarchive: bridge.buildProvider<CodexThreadDescriptor, CodexThreadIdRequest>('codex-threads.unarchive'),
  delete: bridge.buildProvider<void, CodexThreadIdRequest>('codex-threads.delete'),
  startReview: bridge.buildProvider<CodexReviewStartResult, CodexReviewStartRequest>('codex-threads.start-review'),
};

export type LocalDataLifecycleSectionId = 'updater_cache' | 'user_data_artifacts' | 'runtime_substrate' | 'logs';

export type LocalDataCleanupMode =
  | 'stale_installer_package_cleanup_allowed'
  | 'archive_required_before_cleanup'
  | 'pointer_based_dry_run_required'
  | 'bounded_rotation_dry_run_required';

export type LocalDataLifecycleInventoryRoot = {
  path: string;
  exists: boolean;
  bytes: number;
};

export type LocalDataLifecycleInventorySection = {
  id: LocalDataLifecycleSectionId;
  cleanup_mode: LocalDataCleanupMode;
  silent_delete_allowed: boolean;
  roots: LocalDataLifecycleInventoryRoot[];
  bytes: number;
};

export type LocalDataLifecycleInventory = {
  schema: 'opl_local_data_lifecycle_inventory.v1';
  total_bytes: number;
  sections: LocalDataLifecycleInventorySection[];
};

export type LocalDataLifecycleInventorySnapshot = {
  schema: 'opl_local_data_lifecycle_inventory_snapshot.v1';
  inventory: LocalDataLifecycleInventory | null;
  observed_at: string | null;
  scan_duration_ms: number | null;
  stale: boolean;
  error: string | null;
};

export type LocalDataLifecycleReceipt =
  | LocalDataLifecycleConversationArchiveReceipt
  | LocalDataLifecycleConversationDeleteReceipt
  | LocalDataLifecycleConversationRestoreReceipt
  | LocalDataLifecycleRuntimePruneReceipt
  | LocalDataLifecycleLogRotationReceipt
  | LocalDataLifecycleUpdaterCacheReceipt;

export type LocalDataLifecycleConversationArchiveReceipt = {
  schema: 'opl_conversation_archive_receipt.v1';
  conversation_id: string;
  source_paths: string[];
  archive_path: string;
  archive_sha256: string;
  manifest_path: string;
  restore_probe_path: string;
  receipt_path: string;
  created_at: string;
};

export type LocalDataLifecycleConversationDeleteReceipt = {
  schema: 'opl_conversation_delete_receipt.v1';
  conversation_id: string;
  deleted_paths: string[];
  archive_receipt_path: string;
  confirmed_at: string;
  receipt_path: string;
  created_at: string;
};

export type LocalDataLifecycleConversationRestoreReceipt = {
  schema: 'opl_conversation_restore_receipt.v1';
  conversation_id: string;
  restored_paths: string[];
  archive_receipt_path: string;
  archive_sha256: string;
  receipt_path: string;
  created_at: string;
};

export type LocalDataLifecycleRuntimePruneCandidate = {
  path: string;
  bytes: number;
  reason: 'unreferenced_runtime_root' | 'unreferenced_staged_runtime';
};

export type LocalDataLifecycleRuntimePrunePlan = {
  schema: 'opl_runtime_pointer_prune_plan.v1';
  mode: 'dry_run';
  plan_id: string;
  plan_hash: string;
  runtime_root: string;
  protected_paths: string[];
  remove_candidates: LocalDataLifecycleRuntimePruneCandidate[];
  remove_bytes: number;
  created_at: string;
};

export type LocalDataLifecycleRuntimePruneReceipt = {
  schema: 'opl_runtime_pointer_prune_receipt.v1';
  runtime_root: string;
  dry_run_plan_id: string;
  protected_paths: string[];
  deleted_paths: string[];
  deleted_bytes: number;
  receipt_path: string;
  created_at: string;
};

export type LocalDataLifecycleLogRetentionCandidate = {
  path: string;
  bytes: number;
  reason: 'older_than_retention_days' | 'exceeds_retained_file_count' | 'exceeds_total_log_bytes';
};

export type LocalDataLifecycleLogRetentionPlan = {
  schema: 'opl_log_retention_plan.v1';
  mode: 'dry_run';
  plan_id: string;
  plan_hash: string;
  logs_root: string;
  keep_paths: string[];
  remove_candidates: LocalDataLifecycleLogRetentionCandidate[];
  remove_bytes: number;
  created_at: string;
};

export type LocalDataLifecycleLogRotationReceipt = {
  schema: 'opl_log_rotation_receipt.v1';
  logs_root: string;
  dry_run_plan_id: string;
  deleted_paths: string[];
  deleted_bytes: number;
  receipt_path: string;
  created_at: string;
};

export type LocalDataLifecycleUpdaterCachePlan = {
  schema: 'opl_updater_cache_cleanup_plan.v1';
  mode: 'dry_run';
  plan_id: string;
  plan_hash: string;
  cache_roots: string[];
  keep_paths: string[];
  remove_candidates: Array<{ path: string; bytes: number; reason: 'stale_installer_package' }>;
  remove_bytes: number;
  created_at: string;
};

export type LocalDataLifecycleUpdaterCacheReceipt = {
  schema: 'opl_updater_cache_cleanup_receipt.v1';
  dry_run_plan_id: string;
  cache_roots: string[];
  deleted_paths: string[];
  deleted_bytes: number;
  receipt_path: string;
  created_at: string;
};

export const localDataLifecycle = {
  getInventory: bridge.buildProvider<LocalDataLifecycleInventory, void>('local-data-lifecycle.get-inventory'),
  getInventorySnapshot: bridge.buildProvider<LocalDataLifecycleInventorySnapshot, void>(
    'local-data-lifecycle.get-inventory-snapshot'
  ),
  refreshInventory: bridge.buildProvider<LocalDataLifecycleInventorySnapshot, void>(
    'local-data-lifecycle.refresh-inventory'
  ),
  inventoryUpdated: bridge.buildEmitter<LocalDataLifecycleInventorySnapshot>('local-data-lifecycle.inventory-updated'),
  archiveConversations: bridge.buildProvider<LocalDataLifecycleConversationArchiveReceipt, void>(
    'local-data-lifecycle.archive-conversations'
  ),
  restoreConversationProof: bridge.buildProvider<LocalDataLifecycleConversationArchiveReceipt, { receiptPath: string }>(
    'local-data-lifecycle.restore-conversation-proof'
  ),
  restoreConversationArchive: bridge.buildProvider<
    LocalDataLifecycleConversationRestoreReceipt,
    { receiptPath: string }
  >('local-data-lifecycle.restore-conversation-archive'),
  deleteConversationArtifacts: bridge.buildProvider<
    LocalDataLifecycleConversationDeleteReceipt,
    { receiptPath: string; confirmation: string }
  >('local-data-lifecycle.delete-conversation-artifacts'),
  planRuntimePrune: bridge.buildProvider<LocalDataLifecycleRuntimePrunePlan, void>(
    'local-data-lifecycle.plan-runtime-prune'
  ),
  executeRuntimePrune: bridge.buildProvider<
    LocalDataLifecycleRuntimePruneReceipt,
    { plan: LocalDataLifecycleRuntimePrunePlan; planHash?: string }
  >('local-data-lifecycle.execute-runtime-prune'),
  planLogRotation: bridge.buildProvider<LocalDataLifecycleLogRetentionPlan, void>(
    'local-data-lifecycle.plan-log-rotation'
  ),
  executeLogRotation: bridge.buildProvider<
    LocalDataLifecycleLogRotationReceipt,
    { plan: LocalDataLifecycleLogRetentionPlan; planHash?: string }
  >('local-data-lifecycle.execute-log-rotation'),
  planUpdaterCacheCleanup: bridge.buildProvider<LocalDataLifecycleUpdaterCachePlan, void>(
    'local-data-lifecycle.plan-updater-cache-cleanup'
  ),
  executeUpdaterCacheCleanup: bridge.buildProvider<
    LocalDataLifecycleUpdaterCacheReceipt,
    { plan: LocalDataLifecycleUpdaterCachePlan; planHash?: string }
  >('local-data-lifecycle.execute-updater-cache-cleanup'),
};

// ---------------------------------------------------------------------------
// Update — stays IPC (Electron-native auto-updater)
// ---------------------------------------------------------------------------

export const update = {
  open: bridge.buildEmitter<{ source?: 'menu' | 'about' }>('update.open'),
  check: bridge.buildProvider<IBridgeResponse<UpdateCheckResult>, UpdateCheckRequest>('update.check'),
  download: bridge.buildProvider<IBridgeResponse<UpdateDownloadResult>, UpdateDownloadRequest>('update.download'),
  downloadProgress: bridge.buildEmitter<UpdateDownloadProgressEvent>('update.download.progress'),
};

export const autoUpdate = {
  check: bridge.buildProvider<
    IBridgeResponse<{
      checked?: boolean;
      updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string };
    }>,
    { channel?: 'stable' | 'nightly'; includeNightly?: boolean; includePrerelease?: boolean }
  >('auto-update.check'),
  getStatusSnapshot: bridge.buildProvider<AutoUpdateStatus | null, void>('auto-update.get-status-snapshot'),
  download: bridge.buildProvider<IBridgeResponse, void>('auto-update.download'),
  quitAndInstall: bridge.buildProvider<void, AutoUpdateInstallRequest>('auto-update.quit-and-install'),
  status: bridge.buildEmitter<AutoUpdateStatus>('auto-update.status'),
};

// ---------------------------------------------------------------------------
// Star Office — routed to backend
// ---------------------------------------------------------------------------

export const starOffice = {
  detectUrl: httpPost<{ url: string | null }, { preferredUrl?: string; force?: boolean; timeoutMs?: number }>(
    '/api/star-office/detect'
  ),
};

// ---------------------------------------------------------------------------
// Dialog — stays IPC (native file picker)
// ---------------------------------------------------------------------------

export const dialog = {
  showOpen: bridge.buildProvider<
    string[] | undefined,
    | { defaultPath?: string; properties?: OpenDialogOptions['properties']; filters?: OpenDialogOptions['filters'] }
    | undefined
  >('show-open'),
};

// ---------------------------------------------------------------------------
// File System — routed to /api/fs/* and /api/skills/*
// ---------------------------------------------------------------------------

export const fs = {
  getFilesByDir: httpPost<Array<IDirOrFile>, { dir: string; root: string }>('/api/fs/dir'),
  listWorkspaceFiles: withResponseMap(
    httpPost<Array<RawWorkspaceFlatFile>, { root: string }>('/api/fs/list'),
    fromBackendWorkspaceFlatFiles
  ),
  getImageBase64: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/image-base64'),
  fetchRemoteImage: httpPost<string, { url: string }>('/api/fs/fetch-remote-image'),
  readFile: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/read'),
  readFileBuffer: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/read-buffer'),
  createTempFile: httpPost<string, { file_name: string }>('/api/fs/temp'),
  writeFile: httpPost<boolean, { path: string; data: string }>('/api/fs/write'),
  createZip: httpPost<
    boolean,
    {
      path: string;
      request_id?: string;
      files: Array<{
        name: string;
        content?: string | Uint8Array;
        source_path?: string;
      }>;
    }
  >('/api/fs/zip'),
  cancelZip: httpPost<boolean, { request_id: string }>('/api/fs/zip/cancel'),
  getFileMetadata: httpPost<IFileMetadata, { path: string; workspace?: string }>('/api/fs/metadata'),
  copyFilesToWorkspace: httpPost<
    { copied_files: string[]; failed_files?: Array<{ path: string; error: string }> },
    { file_paths: string[]; workspace: string; source_root?: string }
  >('/api/fs/copy'),
  removeEntry: httpPost<void, { path: string }>('/api/fs/remove'),
  renameEntry: httpPost<{ new_path: string }, { path: string; new_name: string }>('/api/fs/rename'),
  readBuiltinRule: httpPost<string, { file_name: string }>('/api/skills/builtin-rule'),
  readBuiltinSkill: httpPost<string, { file_name: string }>('/api/skills/builtin-skill'),
  readAssistantRule: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-rule/read'),
  writeAssistantRule: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-rule/write'
  ),
  deleteAssistantRule: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-rule/${p.assistant_id}`
  ),
  readAssistantSkill: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-skill/read'),
  writeAssistantSkill: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-skill/write'
  ),
  deleteAssistantSkill: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-skill/${p.assistant_id}`
  ),
  listAvailableSkills: httpGet<
    Array<{
      name: string;
      description: string;
      location: string;
      relative_location?: string;
      is_custom: boolean;
      source: 'builtin' | 'custom' | 'extension';
    }>,
    void
  >('/api/skills'),
  listBuiltinAutoSkills: withResponseMap(
    httpGet<Array<{ name: string; description: string; location: string; is_auto_inject: boolean }>, void>(
      '/api/skills'
    ),
    (skills) =>
      skills
        .filter((skill) => skill.is_auto_inject === true)
        .map(({ name, description, location }) => ({ name, description, location }))
  ),
  materializeSkillsForAgent: httpPost<
    { skills: Array<{ name: string; source_path: string }> },
    { conversation_id: string; skills: string[] }
  >('/api/skills/materialize-for-agent'),
  readSkillInfo: httpPost<{ name: string; description: string }, { skill_path: string }>('/api/skills/info'),
  importSkill: httpPost<{ skill_name: string }, { skill_path: string }>('/api/skills/import'),
  scanForSkills: httpPost<Array<{ name: string; description: string; path: string }>, { folder_path: string }>(
    '/api/skills/scan'
  ),
  detectCommonSkillPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/detect-paths'),
  detectAndCountExternalSkills: httpGet<
    Array<{
      name: string;
      path: string;
      source: string;
      skills: Array<{ name: string; description: string; path: string }>;
    }>,
    void
  >('/api/skills/detect-external'),
  importSkillWithSymlink: httpPost<{ skill_name: string; skill_names?: string[] }, { skill_path: string }>(
    '/api/skills/import-symlink'
  ),
  deleteSkill: httpDelete<void, { skill_name: string }>((p) => `/api/skills/${p.skill_name}`),
  getSkillPaths: httpGet<{ user_skills_dir: string; builtin_skills_dir: string }, void>('/api/skills/paths'),
  getCustomExternalPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/external-paths'),
  addCustomExternalPath: httpPost<void, { name: string; path: string }>('/api/skills/external-paths'),
  removeCustomExternalPath: httpDelete<void, { path: string }>(
    (p) => `/api/skills/external-paths?path=${encodeURIComponent(p.path)}`
  ),
  enableSkillsMarket: httpPost<void, void>('/api/skills/market/enable'),
  disableSkillsMarket: httpPost<void, void>('/api/skills/market/disable'),
};

// ---------------------------------------------------------------------------
// File Watch — routed to /api/fs/watch/*
// ---------------------------------------------------------------------------

export const fileWatch = {
  startWatch: httpPost<void, { file_path: string }>('/api/fs/watch/start'),
  stopWatch: httpPost<void, { file_path: string }>('/api/fs/watch/stop'),
  stopAllWatches: httpPost<void, void>('/api/fs/watch/stop-all'),
  fileChanged: wsEmitter<{ file_path: string; event_type: string }>('fileWatch.fileChanged'),
};

// Workspace Office file watch
export const workspaceOfficeWatch = {
  start: httpPost<void, { workspace: string }>('/api/fs/office-watch/start'),
  stop: httpPost<void, { workspace: string }>('/api/fs/office-watch/stop'),
  fileAdded: wsEmitter<{ file_path: string; workspace: string }>('workspaceOfficeWatch.fileAdded'),
};

// File streaming updates (real-time content push when agent writes)
export const fileStream = {
  contentUpdate: wsEmitter<{
    file_path: string;
    content: string;
    workspace: string;
    relative_path: string;
    operation: 'write' | 'delete';
  }>('fileStream.contentUpdate'),
};

// File snapshot providers
export const fileSnapshot = {
  init: httpPost<import('@/common/types/platform/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/init'
  ),
  compare: withResponseMap(
    httpPost<RawCompareResult, { workspace: string }>('/api/fs/snapshot/compare'),
    fromBackendCompareResult
  ),
  getBaselineContent: httpPost<string | null, { workspace: string; file_path: string }>('/api/fs/snapshot/baseline'),
  getInfo: httpPost<import('@/common/types/platform/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/info'
  ),
  dispose: httpPost<void, { workspace: string }>('/api/fs/snapshot/dispose'),
  stageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/stage'),
  stageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/stage-all'),
  unstageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/unstage'),
  unstageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/unstage-all'),
  discardFile: httpPost<
    void,
    {
      workspace: string;
      file_path: string;
      operation: import('@/common/types/platform/fileSnapshot').FileChangeOperation;
    }
  >('/api/fs/snapshot/discard'),
  resetFile: httpPost<
    void,
    {
      workspace: string;
      file_path: string;
      operation: import('@/common/types/platform/fileSnapshot').FileChangeOperation;
    }
  >('/api/fs/snapshot/reset'),
  getBranches: httpPost<string[], { workspace: string }>('/api/fs/snapshot/branches'),
};

// Git workspace lifecycle stays in the desktop main process. File staging,
// unstaging, and diff reads remain owned by fileSnapshot above.
export const gitWorkspace = {
  inspect: bridge.buildProvider<GitWorkspaceInspection, GitWorkspaceInspectRequest>('git-workspace.inspect'),
  commitStaged: bridge.buildProvider<GitCommitStagedResult, GitCommitStagedRequest>('git-workspace.commit-staged'),
  pushCurrentBranch: bridge.buildProvider<GitPushCurrentBranchResult, GitPushCurrentBranchRequest>(
    'git-workspace.push-current-branch'
  ),
};

// ---------------------------------------------------------------------------
// Google Auth — stubbed (Electron-native OAuth flow)
// ---------------------------------------------------------------------------

export const googleAuth = {
  status: stubProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('googleAuth.status', {
    success: false,
    msg: 'Google Auth not available in backend mode',
  }),
};

// ---------------------------------------------------------------------------
// Google subscription status (Google OAuth provider path, used by aionrs)
// ---------------------------------------------------------------------------

export const google = {
  subscriptionStatus: httpGet<
    { isSubscriber: boolean; tier?: string; lastChecked: number; message?: string },
    { proxy?: string }
  >('/api/google/subscription-status'),
};

// ---------------------------------------------------------------------------
// Bedrock connection test
// ---------------------------------------------------------------------------

export const bedrock = {
  testConnection: httpPost<
    { msg?: string },
    {
      bedrock_config: {
        auth_method: 'accessKey' | 'profile';
        region: string;
        access_key_id?: string;
        secret_access_key?: string;
        profile?: string;
      };
    }
  >('/api/bedrock/test-connection'),
};

// ---------------------------------------------------------------------------
// Mode (Provider management) — routed to /api/providers/*
// ---------------------------------------------------------------------------

export const mode = {
  listProviders: httpGet<IProvider[], void>('/api/providers'),
  createProvider: httpPost<IProvider, CreateProviderRequest>('/api/providers'),
  updateProvider: httpPut<IProvider, { id: string } & UpdateProviderRequest>(
    (p) => `/api/providers/${p.id}`,
    (p) => {
      const { id: _id, ...body } = p;
      return body;
    }
  ),
  deleteProvider: httpDelete<void, { id: string }>((p) => `/api/providers/${p.id}`),
  fetchProviderModels: httpPost<FetchModelsResponse, { id: string; try_fix?: boolean }>(
    (p) => `/api/providers/${p.id}/models`,
    (p) => ({ try_fix: p.try_fix })
  ),
  /**
   * Pre-create form preview — anonymous fetch-models (T1b).
   * Takes credentials in the body, no provider row required. Used by
   * AddPlatformModal / EditModeModal / ApiKeyEditorModal while the
   * dropdown is still being populated.
   */
  fetchModelList: httpPost<FetchModelsResponse, FetchModelsAnonymousRequest>('/api/providers/fetch-models'),
  detectProtocol: httpPost<ProtocolDetectionResponse, ProtocolDetectionRequest>('/api/providers/detect-protocol'),
};

// ---------------------------------------------------------------------------
// ACP Conversation — routed to /api/agents/* + conversation routes
// ---------------------------------------------------------------------------

export const acpConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  getManagedAgents: httpGet<ManagedAgent[], void>('/api/agents/management'),
  testCustomAgent: httpPost<
    { step: 'success' } | { step: 'fail_cli'; error: string } | { step: 'fail_acp'; error: string },
    { command: string; acp_args?: string[]; env?: Record<string, string>; runtime_scope_id?: string }
  >('/api/agents/custom/try-connect'),
  createCustomAgent: httpPost<
    AgentMetadata,
    {
      name: string;
      command: string;
      icon?: string;
      args?: string[];
      env?: Array<{ name: string; value: string; description?: string }>;
      advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        behavior_policy?: { supports_side_question?: boolean };
        description?: string;
      };
    }
  >('/api/agents/custom'),
  updateCustomAgent: httpPut<
    AgentMetadata,
    {
      id: string;
      name: string;
      command: string;
      icon?: string;
      args?: string[];
      env?: Array<{ name: string; value: string; description?: string }>;
      advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        behavior_policy?: { supports_side_question?: boolean };
        description?: string;
      };
    }
  >(
    (p) => `/api/agents/custom/${p.id}`,
    (p) => {
      const { id: _id, ...rest } = p;
      return rest;
    }
  ),
  deleteCustomAgent: httpDelete<{ deleted: boolean }, { id: string }>((p) => `/api/agents/custom/${p.id}`),
  setAgentEnabled: httpPatch<AgentMetadata, { id: string; enabled: boolean }>(
    (p) => `/api/agents/${encodeURIComponent(p.id)}/enabled`,
    (p) => ({ enabled: p.enabled })
  ),
  checkManagedAgentHealthById: httpPost<ManagedAgent, { id: string }>(
    (p) => `/api/agents/${encodeURIComponent(p.id)}/health-check`,
    () => undefined
  ),
  checkProviderHealth: httpPost<ProviderHealthCheckResponse, ProviderHealthCheckRequest>(
    '/api/agents/provider-health-check'
  ),
  getConfigOptions: httpGet<GetConfigOptionsResponse, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/config-options`,
    { silentStatuses: [404] }
  ),
  setConfigOption: httpPut<SetConfigOptionResponse, { conversation_id: string; option_id: string; value: string }>(
    (p) => `/api/conversations/${p.conversation_id}/config-options/${encodeURIComponent(p.option_id)}`,
    (p): SetConfigOptionRequest => ({ value: p.value })
  ),
  setMode: httpPut<{ mode: string; initialized: boolean }, { conversation_id: string; mode: string }>(
    (p) => `/api/conversations/${p.conversation_id}/mode`,
    (p) => ({ mode: p.mode })
  ),
  // 404 is the expected pre-warmup response from `/api/conversations/:id/mode`
  // and `/api/conversations/:id/model` — the agent has not attached yet, so
  // we have nothing to read. AcpModeSelector / AcpModelSelector both fall back
  // to handshake metadata in that case. Silence the bridge log so this
  // ordinary state doesn't pollute Sentry breadcrumbs (ELECTRON-1BT).
  getMode: httpGet<{ mode: string; initialized: boolean }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/mode`,
    { silentStatuses: [404] }
  ),
  getModel: httpGet<{ model_info: AcpModelInfo | null }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/model`,
    { silentStatuses: [404] }
  ),
  setModel: httpPut<{ model_info: AcpModelInfo | null }, { conversation_id: string; model_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/model`,
    (p) => ({ model_id: p.model_id })
  ),
};

// ---------------------------------------------------------------------------
// MCP Service — routed to /api/mcp/*
// ---------------------------------------------------------------------------

export const mcpService = {
  listServers: httpGet<IMcpServer[], void>('/api/mcp/servers'),
  createServer: httpPost<
    IMcpServer,
    Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
  >('/api/mcp/servers'),
  importServers: httpPost<
    IMcpServer[],
    { servers: Array<Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>> }
  >('/api/mcp/servers/import'),
  updateServer: httpPut<
    IMcpServer,
    {
      id: string;
      data: Partial<Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>>;
    }
  >(
    (p) => `/api/mcp/servers/${p.id}`,
    (p) => p.data
  ),
  deleteServer: httpDelete<void, { id: string }>((p) => `/api/mcp/servers/${p.id}`),
  toggleServer: httpPost<IMcpServer, { id: string }>(
    (p) => `/api/mcp/servers/${p.id}/toggle`,
    () => undefined
  ),
  batchImportServers: httpPost<
    IMcpServer[],
    { servers: Array<Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>> }
  >('/api/mcp/servers/import'),
  getAgentMcpConfigs: httpGet<
    Array<{
      source: string;
      servers: Array<
        IMcpServer & {
          importable: boolean;
          import_skip_reason?: string;
        }
      >;
    }>,
    void
  >('/api/mcp/agent-configs'),
  testMcpConnection: httpPost<
    {
      success: boolean;
      tools?: Array<{
        name: string;
        description?: string;
        input_schema?: unknown;
        _meta?: Record<string, unknown>;
      }>;
      error?: string;
      code?: string;
      details?: unknown;
      needsAuth?: boolean;
      needs_auth?: boolean;
      authMethod?: 'oauth' | 'basic';
      auth_method?: 'oauth' | 'basic';
      wwwAuthenticate?: string;
      www_authenticate?: string;
    },
    IMcpServer & { runtime_scope_id?: string }
  >('/api/mcp/test-connection'),
  checkOAuthStatus: httpPost<{ authenticated: boolean }, { server_url: string }>('/api/mcp/oauth/check-status'),
  loginMcpOAuth: httpPost<{ success: boolean; error?: string }, { server_url: string }>('/api/mcp/oauth/login'),
  logoutMcpOAuth: httpPost<void, { server_url: string }>('/api/mcp/oauth/logout'),
  getAuthenticatedServers: httpGet<string[], void>('/api/mcp/oauth/authenticated'),
};

export const openclawConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  getRuntime: httpGet<
    {
      conversation_id: string;
      runtime: {
        workspace?: string;
        backend?: string;
        agent_name?: string;
        cli_path?: string;
        model?: string;
        session_key?: string | null;
        is_connected?: boolean;
        has_active_session?: boolean;
        identity_hash?: string | null;
      };
      expected?: {
        expected_workspace?: string;
        expected_backend?: string;
        expected_agent_name?: string;
        expected_cli_path?: string;
        expected_model?: string;
        expected_identity_hash?: string | null;
        switched_at?: number;
      };
    },
    { conversation_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/openclaw/runtime`),
};

// ---------------------------------------------------------------------------
// Remote Agent — routed to /api/remote-agents/*
// ---------------------------------------------------------------------------

export const remoteAgent = {
  list: httpGet<import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig[], void>('/api/remote-agents'),
  get: httpGet<import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig | null, { id: string }>(
    (p) => `/api/remote-agents/${p.id}`
  ),
  create: httpPost<
    import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig,
    import('@/common/types/agent/remoteAgentTypes').RemoteAgentInput
  >('/api/remote-agents'),
  update: httpPut<
    boolean,
    { id: string; updates: Partial<import('@/common/types/agent/remoteAgentTypes').RemoteAgentInput> }
  >(
    (p) => `/api/remote-agents/${p.id}`,
    (p) => p.updates
  ),
  delete: httpDelete<boolean, { id: string }>((p) => `/api/remote-agents/${p.id}`),
  testConnection: httpPost<
    { success: boolean; error?: string },
    { url: string; auth_type: string; auth_token?: string; allow_insecure?: boolean }
  >('/api/remote-agents/test-connection'),
  handshake: httpPost<{ status: 'ok' | 'pending_approval' | 'error'; error?: string }, { id: string }>(
    (p) => `/api/remote-agents/${p.id}/handshake`
  ),
};

// ---------------------------------------------------------------------------
// Database — routed to conversation/message endpoints
// ---------------------------------------------------------------------------

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  has_more: boolean;
};

export type ConversationMessagesCursorRequest = {
  conversation_id: string;
  limit?: number;
  before?: string;
  after?: string;
  anchor_message_id?: string;
  content_mode?: 'compact' | 'full';
};

export type ConversationMessagesCursorResult<T> = {
  items: T[];
  oldest_cursor?: string;
  newest_cursor?: string;
  has_more_before?: boolean;
  has_more_after?: boolean;
  oldestCursor?: string;
  newestCursor?: string;
  hasMoreBefore?: boolean;
  hasMoreAfter?: boolean;
};

export const database = {
  getConversationMessages: httpGet<
    PaginatedResult<import('@/common/chat/chatLib').TMessage>,
    { conversation_id: string; page?: number; page_size?: number; order?: string; content_mode?: 'compact' | 'full' }
  >(
    (p) =>
      `/api/conversations/${p.conversation_id}/messages?page=${p.page ?? 1}&page_size=${p.page_size ?? 50}${p.order ? `&order=${p.order}` : ''}${p.content_mode ? `&content_mode=${p.content_mode}` : ''}`
  ),
  getConversationMessagesCursor: httpGet<
    ConversationMessagesCursorResult<import('@/common/chat/chatLib').TMessage>,
    ConversationMessagesCursorRequest
  >((p) => {
    const params = new URLSearchParams();
    if (p.limit !== undefined) params.set('limit', String(p.limit));
    if (p.before) params.set('before', p.before);
    if (p.after) params.set('after', p.after);
    if (p.anchor_message_id) params.set('anchor_message_id', p.anchor_message_id);
    if (p.content_mode) params.set('content_mode', p.content_mode);
    const query = params.toString();
    return `/api/conversations/${p.conversation_id}/messages${query ? `?${query}` : ''}`;
  }),
  getConversationMessage: httpGet<
    import('@/common/chat/chatLib').TMessage,
    { conversation_id: string; message_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/messages/${encodeURIComponent(p.message_id)}`),
  getUserConversations: withResponseMap(
    httpGet<PaginatedResult<import('@/common/config/storage').TChatConversation>, { cursor?: string; limit?: number }>(
      (p) => {
        const params = new URLSearchParams();
        if (p.cursor) params.set('cursor', p.cursor);
        if (p.limit) params.set('limit', String(p.limit));
        const qs = params.toString();
        return `/api/conversations${qs ? `?${qs}` : ''}`;
      }
    ),
    fromApiPaginatedConversations
  ),
  searchConversationMessages: withResponseMap(
    httpGet<PaginatedResult<ApiMessageSearchItem>, { keyword: string; page?: number; page_size?: number }>(
      (p) =>
        `/api/messages/search?keyword=${encodeURIComponent(p.keyword)}&page=${p.page ?? 1}&page_size=${p.page_size ?? 50}`
    ),
    fromApiSearchResult
  ),
};

// ---------------------------------------------------------------------------
// Preview History — routed to /api/preview-history/*
// ---------------------------------------------------------------------------

function mapPreviewTarget(target: PreviewHistoryTarget): Record<string, unknown> {
  return { ...target, content_type: target.contentType, contentType: undefined };
}

export const previewHistory = {
  list: httpPost<PreviewSnapshotInfo[], { target: PreviewHistoryTarget }>('/api/preview-history/list', (p) => ({
    target: mapPreviewTarget(p.target),
  })),
  save: httpPost<PreviewSnapshotInfo, { target: PreviewHistoryTarget; content: string }>(
    '/api/preview-history/save',
    (p) => ({ target: mapPreviewTarget(p.target), content: p.content })
  ),
  getContent: httpPost<
    { snapshot: PreviewSnapshotInfo; content: string } | null,
    { target: PreviewHistoryTarget; snapshot_id: string }
  >('/api/preview-history/get-content', (p) => ({ target: mapPreviewTarget(p.target), snapshot_id: p.snapshot_id })),
};

// Preview panel
export const preview = {
  open: wsEmitter<{
    content: string;
    content_type: import('../types/office/preview').PreviewContentType;
    metadata?: {
      title?: string;
      file_name?: string;
    };
  }>('preview.open'),
};

// ---------------------------------------------------------------------------
// Document conversion
// ---------------------------------------------------------------------------

export const document = {
  convert: httpPost<
    import('../types/office/conversion').DocumentConversionResponse,
    import('../types/office/conversion').DocumentConversionRequest
  >('/api/document/convert'),
};

// ---------------------------------------------------------------------------
// Office Previews — routed to /api/*-preview/*
// ---------------------------------------------------------------------------

export const pptPreview = {
  start: httpPost<{ url: string; error?: string }, { file_path: string; workspace?: string }>('/api/ppt-preview/start'),
  stop: httpPost<void, { file_path: string }>('/api/ppt-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('ppt-preview.status'),
};

export const wordPreview = {
  start: httpPost<{ url: string; error?: string }, { file_path: string; workspace?: string }>(
    '/api/word-preview/start'
  ),
  stop: httpPost<void, { file_path: string }>('/api/word-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('word-preview.status'),
};

export const excelPreview = {
  start: httpPost<{ url: string; error?: string }, { file_path: string; workspace?: string }>(
    '/api/excel-preview/start'
  ),
  stop: httpPost<void, { file_path: string }>('/api/excel-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('excel-preview.status'),
};

// ---------------------------------------------------------------------------
// Deep Link — stays IPC (Electron protocol handler)
// ---------------------------------------------------------------------------

export const deepLink = {
  received: bridge.buildEmitter<DeepLinkNavigatePayload>('deep-link.received'),
  takePending: bridge.buildProvider<DeepLinkNavigatePayload[], void>('deep-link.take-pending'),
};

export type DeepLinkNavigatePayload = {
  action: 'navigate';
  params: {
    route: string;
  };
};

// ---------------------------------------------------------------------------
// Window Controls — stays IPC (Electron-native)
// ---------------------------------------------------------------------------

export const windowControls = {
  minimize: bridge.buildProvider<void, void>('window-controls:minimize'),
  maximize: bridge.buildProvider<void, void>('window-controls:maximize'),
  unmaximize: bridge.buildProvider<void, void>('window-controls:unmaximize'),
  close: bridge.buildProvider<void, void>('window-controls:close'),
  isMaximized: bridge.buildProvider<boolean, void>('window-controls:is-maximized'),
  maximizedChanged: bridge.buildEmitter<{ is_maximized: boolean }>('window-controls:maximized-changed'),
};

// ---------------------------------------------------------------------------
// Theme — stays IPC (main process owns the resolved-theme cache)
// ---------------------------------------------------------------------------

export const theme = {
  // main → all renderers: the resolved active theme changed
  changed: bridge.buildEmitter<Theme>('theme:changed'),
  // renderer → main: publish a newly resolved theme (main caches + re-emits `changed`)
  setActive: bridge.buildProvider<void, Theme>('theme:set-active'),
  // any window → main: pull the currently cached resolved theme on load (null if none yet)
  requestCurrent: bridge.buildProvider<Theme | null, void>('theme:request-current'),
};

// ---------------------------------------------------------------------------
// System Settings — routed to /api/settings/* unless they need Electron-native side effects.
// ---------------------------------------------------------------------------

export const systemSettings = {
  getCloseToTray: bridge.buildProvider<boolean, void>('system-settings:get-close-to-tray'),
  setCloseToTray: bridge.buildProvider<void, { enabled: boolean }>('system-settings:set-close-to-tray'),
  getNotificationEnabled: httpGet<boolean, void>('/api/settings/client?key=notificationEnabled'),
  setNotificationEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    notificationEnabled: p.enabled,
  })),
  getCronNotificationEnabled: httpGet<boolean, void>('/api/settings/client?key=cronNotificationEnabled'),
  setCronNotificationEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    cronNotificationEnabled: p.enabled,
  })),
  getKeepAwake: httpGet<boolean, void>('/api/settings/client?key=keepAwake'),
  setKeepAwake: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({ keepAwake: p.enabled })),
  changeLanguage: httpPatch<void, { language: string }>('/api/settings', (p) => ({ language: p.language })),
  languageChanged: wsEmitter<{ language: string }>('system-settings:language-changed'),
  getSaveUploadToWorkspace: httpGet<boolean, void>('/api/settings/client?key=saveUploadToWorkspace'),
  setSaveUploadToWorkspace: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    saveUploadToWorkspace: p.enabled,
  })),
  getAutoPreviewOfficeFiles: httpGet<boolean, void>('/api/settings/client?key=autoPreviewOfficeFiles'),
  setAutoPreviewOfficeFiles: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    autoPreviewOfficeFiles: p.enabled,
  })),
  getPetEnabled: bridge.buildProvider<boolean, void>('system-settings:get-pet-enabled'),
  setPetEnabled: bridge.buildProvider<void, { enabled: boolean }>('system-settings:set-pet-enabled'),
  getPetSize: bridge.buildProvider<number, void>('system-settings:get-pet-size'),
  setPetSize: bridge.buildProvider<void, { size: number }>('system-settings:set-pet-size'),
  getPetDnd: bridge.buildProvider<boolean, void>('system-settings:get-pet-dnd'),
  setPetDnd: bridge.buildProvider<void, { dnd: boolean }>('system-settings:set-pet-dnd'),
  getPetConfirmEnabled: bridge.buildProvider<boolean, void>('system-settings:get-pet-confirm-enabled'),
  setPetConfirmEnabled: bridge.buildProvider<void, { enabled: boolean }>('system-settings:set-pet-confirm-enabled'),
  ensureNodeRuntime: httpPost<{ ready: boolean }, { scope: IRuntimeStatusScope }>('/api/system/ensure-node-runtime'),
  ensureManagedAcpTool: httpPost<{ ready: boolean }, { scope: IRuntimeStatusScope; tool_id: string }>(
    '/api/system/ensure-managed-acp-tool'
  ),
};

// ---------------------------------------------------------------------------
// Notification — stays IPC (Electron-native Notification API)
// ---------------------------------------------------------------------------

export type INotificationOptions = {
  title: string;
  body: string;
  icon?: string;
  conversation_id?: string;
};

export const notification = {
  show: bridge.buildProvider<void, INotificationOptions>('notification.show'),
  clicked: bridge.buildEmitter<{ conversation_id?: string }>('notification.clicked'),
};

// ---------------------------------------------------------------------------
// Task management — stubbed (internal process management)
// ---------------------------------------------------------------------------

export const task = {
  stopAll: stubProvider<{ success: boolean; count: number }, void>('task.stopAll', { success: true, count: 0 }),
  getRunningCount: stubProvider<{ success: boolean; count: number }, void>('task.getRunningCount', {
    success: true,
    count: 0,
  }),
};

// ---------------------------------------------------------------------------
// WebUI — mix: start/stop/getStatus/statusChanged stay IPC (Electron-only
// lifecycle owned by the main process, can't run in backend); credential
// operations route to backend /api/webui/* under local-mode.
// ---------------------------------------------------------------------------

export interface IWebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

export interface IWebUIStartResult {
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string;
}

export const webui = {
  getStatus: bridge.buildProvider<IWebUIStatus, void>('webui.get-status'),
  start: bridge.buildProvider<IWebUIStartResult, { port?: number; allowRemote?: boolean }>('webui.start'),
  stop: bridge.buildProvider<void, void>('webui.stop'),
  statusChanged: bridge.buildEmitter<{
    running: boolean;
    port?: number;
    localUrl?: string;
    networkUrl?: string;
    lanIP?: string;
    initialPassword?: string;
  }>('webui.status-changed'),
  changePassword: httpPost<void, { newPassword: string }>('/api/webui/change-password', (p) => ({
    new_password: p.newPassword,
  })),
  changeUsername: httpPost<{ username: string }, { newUsername: string }>('/api/webui/change-username', (p) => ({
    new_username: p.newUsername,
  })),
  resetPassword: httpPost<{ new_password: string }, void>('/api/webui/reset-password'),
  generateQRToken: httpPost<{ token: string; expires_at_ms: number }, void>('/api/webui/generate-qr-token'),
};

// ---------------------------------------------------------------------------
// Cron — routed to /api/cron/*
// ---------------------------------------------------------------------------

type ApiCronSchedule =
  | { kind: 'at'; at_ms: number; description?: string }
  | { kind: 'every'; every_ms: number; description?: string }
  | { kind: 'cron'; expr: string; tz?: string; description?: string };

export function toCronWriteSchedule(schedule: ICronSchedule | undefined): ApiCronSchedule | undefined {
  if (!schedule) return undefined;
  if (schedule.kind === 'at') {
    return { kind: 'at', at_ms: schedule.atMs, description: schedule.description };
  }
  if (schedule.kind === 'every') {
    return { kind: 'every', every_ms: schedule.everyMs, description: schedule.description };
  }
  return schedule;
}

function toCronWriteAgentConfig(config: ICronAgentConfigWrite | undefined): Record<string, unknown> | undefined {
  if (!config) return undefined;
  return {
    name: config.name,
    cli_path: config.cli_path,
    assistant_id: config.assistant_id,
    mode: config.mode,
    model_id: config.model_id,
    model: config.model,
    config_options: config.config_options,
    workspace: config.workspace,
  };
}

export function toCronWritePayload(input: ICreateCronJobParams | ICronJobUpdateParams): Record<string, unknown> {
  const isCreate = 'conversation_id' in input;
  const updateInput = isCreate ? undefined : input;
  const target = updateInput?.target;
  const metadata = updateInput?.metadata;
  const state = updateInput?.state;
  const create = isCreate ? input : undefined;

  return {
    name: input.name,
    description: input.description,
    enabled: updateInput?.enabled,
    schedule: toCronWriteSchedule(input.schedule),
    message: create ? (create.message ?? create.prompt) : target?.payload?.text,
    conversation_id: create?.conversation_id,
    conversation_title: create?.conversation_title ?? metadata?.conversation_title,
    created_by: create?.created_by,
    execution_mode: create?.execution_mode ?? target?.execution_mode,
    agent_config: toCronWriteAgentConfig(create?.agent_config ?? metadata?.agent_config),
    max_retries: state?.max_retries,
  };
}

export const cron = {
  listJobs: httpGet<ICronJob[], void>('/api/cron/jobs'),
  listJobsByConversation: httpGet<ICronJob[], { conversation_id: string }>(
    (p) => `/api/cron/jobs?conversation_id=${encodeURIComponent(p.conversation_id)}`
  ),
  getJob: httpGet<ICronJob | null, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}`),
  addJob: httpPost<ICronJob, ICreateCronJobParams>('/api/cron/jobs', toCronWritePayload),
  updateJob: httpPut<ICronJob, { job_id: string; updates: ICronJobUpdateParams }>(
    (p) => `/api/cron/jobs/${p.job_id}`,
    (p) => toCronWritePayload(p.updates)
  ),
  removeJob: httpDelete<void, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}`),
  runNow: httpPost<{ conversation_id: string }, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/run`),
  saveSkill: httpPost<void, { job_id: string; content: string }>(
    (p) => `/api/cron/jobs/${p.job_id}/skill`,
    (p) => ({ content: p.content })
  ),
  hasSkill: withResponseMap(
    httpGet<{ has_skill: boolean }, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/skill`),
    (data) => Boolean(data?.has_skill)
  ),
  deleteSkill: httpDelete<void, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/skill`),
  onJobCreated: wsEmitter<ICronJob>('cron.job-created'),
  onJobUpdated: wsEmitter<ICronJob>('cron.job-updated'),
  onJobRemoved: wsEmitter<{ job_id: string }>('cron.job-removed'),
  onJobExecuted: wsEmitter<{ job_id: string; status: 'ok' | 'error' | 'skipped' | 'missed'; error?: string }>(
    'cron.job-executed'
  ),
};

// ---------------------------------------------------------------------------
// Cron types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type ICronSchedule =
  | { kind: 'at'; atMs: number; description: string }
  | { kind: 'every'; everyMs: number; description: string }
  | { kind: 'cron'; expr: string; tz?: string; description: string };

export interface ICronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: ICronSchedule;
  target: {
    payload: { kind: 'message'; text: string };
    execution_mode?: 'existing' | 'new_conversation';
  };
  metadata: {
    conversation_id: string;
    conversation_title?: string;
    agent_type: string;
    created_by: 'user' | 'agent';
    created_at: number;
    updated_at: number;
    agent_config?: ICronAgentConfig;
  };
  state: {
    next_run_at_ms?: number;
    last_run_at_ms?: number;
    last_status?: 'ok' | 'error' | 'skipped' | 'missed';
    last_error?: string;
    run_count: number;
    retry_count: number;
    max_retries: number;
  };
}

export interface ICronAgentConfigRead {
  backend?: string;
  name: string;
  cli_path?: string;
  is_preset?: boolean;
  assistant_id?: string;
  custom_agent_id?: string;
  preset_agent_type?: string;
  mode?: string;
  model_id?: string;
  model?: { provider_id: string; model: string; use_model?: string };
  config_options?: Record<string, string>;
  workspace?: string;
}

export interface ICronAgentConfigWrite {
  name: string;
  cli_path?: string;
  assistant_id?: string;
  mode?: string;
  model_id?: string;
  model?: { provider_id: string; model: string; use_model?: string };
  config_options?: Record<string, string>;
  workspace?: string;
}

export type ICronAgentConfig = ICronAgentConfigRead;

export interface ICreateCronJobParams {
  name: string;
  description?: string;
  schedule: ICronSchedule;
  prompt?: string;
  message?: string;
  conversation_id: string;
  conversation_title?: string;
  created_by: 'user' | 'agent';
  execution_mode?: 'existing' | 'new_conversation';
  agent_config?: ICronAgentConfigWrite;
}

export interface ICronJobUpdateParams {
  name?: string;
  description?: string;
  enabled?: boolean;
  schedule?: ICronSchedule;
  target?: {
    payload?: { kind: 'message'; text: string };
    execution_mode?: 'existing' | 'new_conversation';
  };
  metadata?: {
    conversation_title?: string;
    agent_config?: ICronAgentConfigWrite;
  };
  state?: {
    max_retries?: number;
  };
}

// ---------------------------------------------------------------------------
// Shared types (re-exported for consumers)
// ---------------------------------------------------------------------------

interface ISendMessageParams {
  input: string;
  conversation_id: string;
  files?: string[];
  loading_id?: string;
  inject_skills?: string[];
}

// Server-assigned identifier for the newly created user message. Clients must
// use this as the canonical msg_id when rendering an optimistic bubble so the
// local state aligns with DB rows and WebSocket stream events.
export interface ISendMessageResult {
  msg_id: string;
  turn_id: string;
  runtime: TConversationRuntimeSummary;
}

export interface IConfirmMessageParams {
  confirm_key: string;
  msg_id: string;
  conversation_id: string;
  call_id: string;
}

export interface ICreateConversationParams {
  type?: 'acp' | 'aionrs';
  id?: string;
  name?: string;
  model?: TProviderWithModel;
  assistant?: {
    id: string;
    locale?: string;
    conversation_overrides?: {
      model?: string;
      permission?: string;
      thought_level?: string;
      skill_ids?: string[];
      disabled_builtin_skill_ids?: string[];
      mcp_ids?: string[];
    };
  };
  extra: {
    workspace?: string;
    custom_workspace?: boolean;
    default_files?: string[];
    backend?: string;
    cli_path?: string;
    gateway?: {
      host?: string;
      port?: number;
      token?: string;
      password?: string;
      use_external_gateway?: boolean;
      cli_path?: string;
    };
    web_search_engine?: 'google' | 'default';
    agent_name?: string;
    agent_id?: string;
    custom_agent_id?: string;
    context?: string;
    context_file_name?: string;
    preset_rules?: string;
    /** Transient: preset opt-in skills. Consumed by backend create handler
     *  and stripped before persistence. */
    preset_enabled_skills?: string[];
    /** Transient: auto-inject skills the user opted out of on the Guid page.
     *  Consumed by backend create handler and stripped before persistence. */
    exclude_auto_inject_skills?: string[];
    opl_assistant_route?: {
      route_kind: string;
      executor: string;
      assistant_id: string;
      assistant_short_name: string;
      source: string;
    };
    opl_agent_package_invocation?: {
      route_kind: string;
      executor: string;
      package_id: string;
      shortcut_id: string;
      codex_visible_entry: string;
      required_skill_ids: string[];
      source: string;
    };
    opl_agent_package_activation?: {
      action_id: 'agent_package_activate';
      package_id: string;
      package_version?: string;
      scope?: string;
      target_workspace?: string;
      use_boundary_id?: string;
      launch_allowed: true;
      use_receipt_ref?: string;
      use_binding?: Record<string, unknown>;
    };
    opl_flow_context?: {
      flow_id: string;
      source: string;
      delivery: string;
      language: string;
      user_agents_policy: string;
    };
    opl_app_session_context?: {
      owner: string;
      source: string;
      additional_instructions: boolean;
      effect: string;
    };
    /** Transient: MCP server ids selected on the Guid page. Consumed by the
     *  backend create handler and snapshotted into conversation.extra. */
    selected_mcp_server_ids?: string[];
    /** Transient: session-scoped MCP server configs that are not stored in the
     *  backend catalog (currently built-in MCP servers). */
    selected_session_mcp_servers?: ISessionMcpServer[];
    preset_context?: string;
    preset_assistant_id?: string;
    session_mode?: string;
    codex_model?: string;
    current_model_id?: string;
    cached_config_options?: import('../types/platform/acpTypes').AcpSessionConfigOption[];
    pending_config_options?: Record<string, string>;
    runtime_validation?: {
      expected_workspace?: string;
      expected_backend?: string;
      expected_agent_name?: string;
      expected_cli_path?: string;
      expected_model?: string;
      expected_identity_hash?: string | null;
      switched_at?: number;
    };
    /** Legacy marker for pre-provider-probe health-check conversations. */
    is_health_check?: boolean;
    remote_agent_id?: string;
    extra_skill_paths?: string[];
    team_id?: string;
  };
}

interface IResetConversationParams {
  id?: string;
}

export interface IDirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}

export interface IFileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  isDirectory?: boolean;
}

export type IWorkspaceFlatFile = {
  name: string;
  fullPath: string;
  relativePath: string;
};

export interface IResponseMessage {
  type: string;
  data: unknown;
  msg_id: string;
  turn_id: string;
  conversation_id: string;
  created_at?: number;
  hidden?: boolean;
  /** Replace accumulated text for the same msg_id instead of appending. */
  replace?: boolean;
}

export type IConversationArtifactKind = 'cron_trigger' | 'skill_suggest';
export type IConversationArtifactStatus = 'active' | 'pending' | 'dismissed' | 'saved';

export interface IConversationArtifactBase<
  Kind extends IConversationArtifactKind,
  Payload extends Record<string, unknown>,
> {
  id: string;
  conversation_id: string;
  cron_job_id?: string;
  kind: Kind;
  status: IConversationArtifactStatus;
  payload: Payload;
  created_at: number;
  updated_at: number;
}

export type ICronTriggerArtifact = IConversationArtifactBase<
  'cron_trigger',
  {
    cron_job_id: string;
    cron_job_name: string;
    triggered_at: number;
  }
>;

export type ISkillSuggestArtifact = IConversationArtifactBase<
  'skill_suggest',
  {
    cron_job_id: string;
    name: string;
    description: string;
    skillContent?: string;
    skill_content?: string;
  }
>;

export type IConversationArtifact = ICronTriggerArtifact | ISkillSuggestArtifact;

export interface IConversationTurnCompletedEvent {
  session_id: string;
  turn_id: string;
  status: 'pending' | 'running' | 'finished';
  state:
    | 'ai_generating'
    | 'ai_waiting_input'
    | 'ai_waiting_confirmation'
    | 'initializing'
    | 'stopped'
    | 'error'
    | 'unknown';
  detail: string;
  can_send_message: boolean;
  runtime: {
    state: 'idle' | 'starting' | 'running' | 'waiting_confirmation';
    can_send_message: boolean;
    has_task: boolean;
    task_status?: 'pending' | 'running' | 'finished';
    is_processing: boolean;
    pending_confirmations: number;
    turn_id: string | null;
  };
  workspace: string;
  model: {
    platform: string;
    name: string;
    use_model: string;
  };
  last_message: {
    id?: string;
    type?: string;
    content: unknown;
    status?: string | null;
    created_at: number;
  };
}

export interface IConversationListChangedEvent {
  conversation_id: string;
  action: 'created' | 'updated' | 'deleted';
  source?: string;
}

export type ConversationSideQuestionResult =
  | { status: 'ok'; answer: string }
  | { status: 'noAnswer' }
  | { status: 'unsupported' }
  | { status: 'invalid'; reason: 'emptyQuestion' }
  | { status: 'toolsRequired' };

interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}

// ---------------------------------------------------------------------------
// Extensions API
// ---------------------------------------------------------------------------

export interface IExtensionInfo {
  name: string;
  display_name: string;
  version: string;
  description?: string;
  source: string;
  enabled: boolean;
}

export interface IExtensionPermissionSummary {
  name: string;
  description: string;
  level: 'safe' | 'moderate' | 'dangerous';
  granted: boolean;
}

export interface IExtensionSettingsTab {
  id: string;
  label: string;
  icon?: string;
  url: string;
  position?: { relativeTo: string; placement: 'before' | 'after' };
  order: number;
  extensionName: string;
}

export interface IExtensionWebuiContribution {
  extensionName: string;
  apiRoutes: Array<{ path: string; auth: boolean }>;
  staticAssets: Array<{ urlPrefix: string; directory: string }>;
}

export type AgentActivityState = 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error';

export interface IExtensionAgentActivityEvent {
  conversationId: string;
  at: number;
  kind: 'status' | 'tool' | 'message';
  text: string;
}

export interface IExtensionAgentActivityItem {
  id: string;
  backend: string;
  agentName: string;
  state: AgentActivityState;
  runtimeStatus: 'pending' | 'running' | 'finished' | 'unknown';
  conversations: number;
  activeConversations: number;
  lastActiveAt: number;
  lastStatus?: string;
  currentTask?: string;
  recentEvents: IExtensionAgentActivityEvent[];
}

export interface IExtensionAgentActivitySnapshot {
  generatedAt: number;
  totalConversations: number;
  runningConversations: number;
  agents: IExtensionAgentActivityItem[];
}

export const extensions = {
  getThemes: httpGet<ICssTheme[], void>('/api/extensions/themes'),
  getLoadedExtensions: httpGet<IExtensionInfo[], void>('/api/extensions'),
  getAssistants: httpGet<Record<string, unknown>[], void>('/api/extensions/assistants'),
  getAgents: httpGet<Record<string, unknown>[], void>('/api/extensions/agents'),
  getAcpAdapters: httpGet<Record<string, unknown>[], void>('/api/extensions/acp-adapters'),
  getMcpServers: httpGet<Record<string, unknown>[], void>('/api/extensions/mcp-servers'),
  getSkills: httpGet<Array<{ name: string; description: string; location: string }>, void>('/api/extensions/skills'),
  getSettingsTabs: httpGet<IExtensionSettingsTab[], void>('/api/extensions/settings-tabs'),
  getWebuiContributions: httpGet<IExtensionWebuiContribution[], void>('/api/extensions/webui'),
  getAgentActivitySnapshot: httpGet<IExtensionAgentActivitySnapshot, void>('/api/extensions/agent-activity'),
  getExtI18nForLocale: httpPost<Record<string, unknown>, { locale: string }>('/api/extensions/i18n'),
  enableExtension: httpPost<void, { name: string }>('/api/extensions/enable'),
  disableExtension: httpPost<void, { name: string; reason?: string }>('/api/extensions/disable'),
  getPermissions: httpPost<IExtensionPermissionSummary[], { name: string }>('/api/extensions/permissions'),
  getRiskLevel: httpPost<string, { name: string }>('/api/extensions/risk-level'),
  stateChanged: wsEmitter<{ name: string; enabled: boolean; reason?: string }>('extensions.state-changed'),
};

// ---------------------------------------------------------------------------
// Channel API — routed to /api/channel/*
// ---------------------------------------------------------------------------

import type {
  IChannelAssistantBindingWrite,
  IChannelPairingRequest,
  IChannelPlatformSettings,
  IChannelPluginStatus,
  IChannelSession,
  IChannelUser,
} from '@/common/types/channel/channel';

type RawPluginStatus = Record<string, unknown>;
type RawPairing = Record<string, unknown>;
type RawUser = Record<string, unknown>;
type RawSession = Record<string, unknown>;

function toPluginStatus(raw: RawPluginStatus): IChannelPluginStatus {
  return {
    id: (raw.plugin_id ?? raw.id) as string,
    type: (raw.type ?? raw.plugin_type) as string,
    name: raw.name as string,
    enabled: raw.enabled as boolean,
    connected: (raw.connected ?? false) as boolean,
    status: raw.status as string | undefined,
    last_connected: raw.last_connected as number | undefined,
    activeUsers: (raw.active_users ?? 0) as number,
    botUsername: raw.bot_username as string | undefined,
    hasToken: (raw.has_token ?? false) as boolean,
    isExtension: raw.is_extension as boolean | undefined,
    extensionMeta: raw.extension_meta as IChannelPluginStatus['extensionMeta'],
  };
}

function toPairing(raw: RawPairing): IChannelPairingRequest {
  return {
    code: raw.code as string,
    platformUserId: raw.platform_user_id as string,
    platformType: raw.platform_type as string,
    display_name: raw.display_name as string | undefined,
    requestedAt: raw.requested_at as number,
    expiresAt: raw.expires_at as number,
  };
}

function toChannelUser(raw: RawUser): IChannelUser {
  return {
    id: raw.id as string,
    platformUserId: raw.platform_user_id as string,
    platformType: raw.platform_type as string,
    display_name: raw.display_name as string | undefined,
    authorizedAt: raw.authorized_at as number,
    lastActive: raw.last_active as number | undefined,
    session_id: raw.session_id as string | undefined,
  };
}

function toChannelSession(raw: RawSession): IChannelSession {
  return {
    id: raw.id as string,
    user_id: raw.user_id as string,
    agent_type: raw.agent_type as string,
    conversation_id: raw.conversation_id as string | undefined,
    workspace: raw.workspace as string | undefined,
    chatId: raw.chat_id as string | undefined,
    created_at: raw.created_at as number,
    lastActivity: raw.last_activity as number,
  };
}

export const channel = {
  getPluginStatus: withResponseMap(httpGet<RawPluginStatus[], void>('/api/channel/plugins'), (raw) =>
    raw.map(toPluginStatus)
  ),
  enablePlugin: httpPost<void, { plugin_id: string; config: Record<string, unknown> }>('/api/channel/plugins/enable'),
  disablePlugin: httpPost<void, { plugin_id: string }>('/api/channel/plugins/disable'),
  testPlugin: httpPost<
    { success: boolean; bot_username?: string; error?: string },
    { plugin_id: string; token: string; extra_config?: { app_id?: string; app_secret?: string } }
  >('/api/channel/plugins/test'),
  getPendingPairings: withResponseMap(httpGet<RawPairing[], void>('/api/channel/pairings'), (raw) =>
    raw.map(toPairing)
  ),
  approvePairing: httpPost<void, { code: string }>('/api/channel/pairings/approve'),
  rejectPairing: httpPost<void, { code: string }>('/api/channel/pairings/reject'),
  getAuthorizedUsers: withResponseMap(httpGet<RawUser[], void>('/api/channel/users'), (raw) => raw.map(toChannelUser)),
  revokeUser: httpPost<void, { user_id: string }>('/api/channel/users/revoke'),
  getActiveSessions: withResponseMap(httpGet<RawSession[], void>('/api/channel/sessions'), (raw) =>
    raw.map(toChannelSession)
  ),
  getPlatformSettings: httpGet<IChannelPlatformSettings, { platform: string }>(
    (p) => `/api/channel/settings/${encodeURIComponent(p.platform)}`
  ),
  setAssistantSetting: httpPut<void, { platform: string; assistant: IChannelAssistantBindingWrite }>(
    (p) => `/api/channel/settings/${encodeURIComponent(p.platform)}/assistant`,
    (p) => p.assistant
  ),
  syncChannelSettings: httpPost<void, { platform: string }>('/api/channel/settings/sync'),
  pairingRequested: wsMappedEmitter<IChannelPairingRequest>('channel.pairing-requested', (raw) =>
    toPairing(raw as RawPairing)
  ),
  pluginStatusChanged: wsMappedEmitter<{ plugin_id: string; status: IChannelPluginStatus }>(
    'channel.plugin-status-changed',
    (raw) => {
      const r = raw as Record<string, unknown>;
      return {
        plugin_id: r.plugin_id as string,
        status: toPluginStatus(r.status as RawPluginStatus),
      };
    }
  ),
  userAuthorized: wsMappedEmitter<IChannelUser>('channel.user-authorized', (raw) => toChannelUser(raw as RawUser)),
};

// ---------------------------------------------------------------------------
// Agent Hub API — routed to /api/hub/*
// ---------------------------------------------------------------------------

import type { HubExtensionStatus, IHubAgentItem } from '@/common/types/agent/hub';
import type { AgentMetadata, ManagedAgent } from '@/renderer/utils/model/agentTypes';

export const hub = {
  getExtensionList: httpGet<IHubAgentItem[], void>('/api/hub/extensions'),
  install: httpPost<void, { name: string }>('/api/hub/install'),
  uninstall: httpPost<void, { name: string }>('/api/hub/uninstall'),
  retryInstall: httpPost<void, { name: string }>('/api/hub/retry-install'),
  checkUpdates: httpPost<{ name: string }[], void>('/api/hub/check-updates'),
  update: httpPost<void, { name: string }>('/api/hub/update'),
  onStateChanged: wsEmitter<{ name: string; status: HubExtensionStatus; error?: string }>('hub.state-changed'),
};

// ---------------------------------------------------------------------------
// Team Mode API — routed to /api/teams/*
// ---------------------------------------------------------------------------

export type { IAddTeamAgentParams, ICreateTeamParams } from './teamMapper';

export const team = {
  create: disabledTeamMutation(
    withResponseMap(
      httpPost<TTeam, ICreateTeamParams>('/api/teams', (p) => ({
        name: p.name,
        agents: p.agents.map(toBackendAgent),
        ...(p.workspace ? { workspace: p.workspace } : {}),
      })),
      fromBackendTeam
    )
  ),
  list: withResponseMap(
    httpGet<TTeam[], { user_id: string }>((p) => `/api/teams?user_id=${encodeURIComponent(p.user_id)}`),
    fromBackendTeamList
  ),
  get: withResponseMap(
    httpGet<TTeam | null, { id: string }>((p) => `/api/teams/${p.id}`),
    fromBackendTeamOptional
  ),
  remove: disabledTeamMutation(httpDelete<void, { id: string }>((p) => `/api/teams/${p.id}`)),
  addAgent: disabledTeamMutation(
    withResponseMap(
      httpPost<TeamAgent, IAddTeamAgentParams>(
        (p) => `/api/teams/${p.team_id}/agents`,
        (p) => toBackendAgent(p.agent)
      ),
      fromBackendAgent
    )
  ),
  removeAgent: disabledTeamMutation(
    httpDelete<void, { team_id: string; slot_id: string }>((p) => `/api/teams/${p.team_id}/agents/${p.slot_id}`)
  ),
  stop: disabledTeamMutation(httpDelete<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`)),
  ensureSession: disabledTeamMutation(httpPost<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`)),
  renameAgent: disabledTeamMutation(
    httpPatch<void, { team_id: string; slot_id: string; new_name: string }>(
      (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/name`,
      (p) => ({ name: p.new_name })
    )
  ),
  renameTeam: disabledTeamMutation(
    httpPatch<void, { id: string; name: string }>(
      (p) => `/api/teams/${p.id}/name`,
      (p) => ({ name: p.name })
    )
  ),
  setSessionMode: disabledTeamMutation(
    httpPost<void, { team_id: string; session_mode: string }>(
      (p) => `/api/teams/${p.team_id}/session-mode`,
      (p) => ({ session_mode: p.session_mode })
    )
  ),
  agentStatusChanged: wsMappedEmitter<ITeamAgentStatusEvent>(
    'team.agentStatusChanged',
    fromBackendTeamAgentStatusEvent
  ),
  agentSpawned: wsMappedEmitter<ITeamAgentSpawnedEvent>('team.agentSpawned', fromBackendTeamAgentSpawnedEvent),
  agentRemoved: wsEmitter<ITeamAgentRemovedEvent>('team.agentRemoved'),
  agentRenamed: wsMappedEmitter<ITeamAgentRenamedEvent>('team.agentRenamed', fromBackendTeamAgentRenamedEvent),
  listChanged: wsEmitter<ITeamListChangedEvent>('team.listChanged'),
  created: wsEmitter<ITeamCreatedEvent>('team.created'),
  teammateMessage: wsEmitter<ITeamTeammateMessageEvent>('team.teammateMessage'),
};
