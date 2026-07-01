/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type StatusCard = {
  key: string;
  title: string;
  status: string;
  statusLabel?: string;
  detail: string;
  help?: string;
  tone: 'green' | 'orange';
};

export type DockerWebuiAction = {
  actionId: string;
  label: string;
  state: string;
  route: string;
  dryRunRoute: string;
  payloadRequired: boolean;
  confirmationRequired: boolean;
  dangerLevel: string;
};

export type DockerWebuiProjection = {
  status: string;
  runtimeStatus: string;
  recoveryStatus: string;
  actions: DockerWebuiAction[];
};

export type ResourceSourceProjection = {
  key: string;
  title: string;
  status: string;
  refs: string[];
};

export type AccessProjection = {
  cards: StatusCard[];
  dockerWebui: DockerWebuiProjection;
  resourceSources: ResourceSourceProjection[];
};

export function normalizeAccessStatus(status: string | null, fallback: string): string {
  if (!status) return fallback;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

export function compactAccessDetail(parts: Array<string | null | undefined>, fallback: string): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ') || fallback;
}

function readDockerAction(value: Record<string, unknown>): DockerWebuiAction | null {
  const actionId = oplString(value.action_id);
  if (!actionId) return null;
  return {
    actionId,
    label: oplString(value.label) ?? actionId,
    state: oplString(value.state) ?? 'unknown',
    route: oplString(value.route) ?? '',
    dryRunRoute: oplString(value.dry_run_route) ?? '',
    payloadRequired: value.payload_required === true,
    confirmationRequired: value.confirmation_required === true,
    dangerLevel: oplString(value.danger_level) ?? 'unknown',
  };
}

function readRef(value: unknown): string | null {
  const direct = oplString(value);
  if (direct) return direct;
  const record = oplRecord(value);
  return (
    oplString(record.ref) ??
    oplString(record.reference) ??
    oplString(record.uri) ??
    oplString(record.url) ??
    oplString(record.path)
  );
}

function readRefList(...values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map(readRef)
        .filter((ref): ref is string => Boolean(ref))
    ),
  ];
}

function buildResourceSourceProjection(
  appState: Record<string, unknown>,
  t: (key: string, options?: Record<string, string>) => string
): ResourceSourceProjection[] {
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const sources = oplRecord(appSettingsReadModel.resource_sources ?? appState.resource_sources);
  const cloud = oplRecord(sources.cloud_remote_access ?? sources.cloud_remote ?? sources.remote_access);
  const gateway = oplRecord(sources.opl_gateway ?? sources.gateway);
  const workspace = oplRecord(sources.opl_workspace ?? sources.workspace);
  const fabric = oplRecord(sources.opl_fabric ?? sources.fabric);
  const entries = [
    {
      key: 'cloudRemoteAccess',
      title: t('settings.accessPage.resourceSources.cloudRemoteAccess'),
      record: cloud,
      refs: readRefList(
        cloud.resource_source_ref,
        cloud.resource_source_refs,
        cloud.status_ref,
        cloud.gateway_status_ref
      ),
    },
    {
      key: 'oplGateway',
      title: t('settings.accessPage.resourceSources.oplGateway'),
      record: gateway,
      refs: readRefList(
        gateway.resource_source_ref,
        gateway.resource_source_refs,
        gateway.status_ref,
        gateway.gateway_status_ref
      ),
    },
    {
      key: 'oplWorkspace',
      title: t('settings.accessPage.resourceSources.oplWorkspace'),
      record: workspace,
      refs: readRefList(
        workspace.resource_source_ref,
        workspace.resource_source_refs,
        workspace.environment_ref,
        workspace.storage_ref
      ),
    },
    {
      key: 'oplFabric',
      title: t('settings.accessPage.resourceSources.oplFabric'),
      record: fabric,
      refs: readRefList(fabric.resource_source_ref, fabric.resource_source_refs, fabric.status_ref),
    },
  ];
  return entries
    .filter((entry) => Object.keys(entry.record).length > 0 || entry.refs.length > 0)
    .map(({ key, title, record, refs }) => ({
      key,
      title,
      status: oplString(record.status) ?? oplString(record.state) ?? 'unknown',
      refs,
    }));
}

export function buildDockerWebuiProjection(appState: Record<string, unknown>): DockerWebuiProjection {
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const dockerWebui = oplRecord(appSettingsReadModel.docker_webui);
  const runtimeProxy = oplRecord(dockerWebui.runtime_proxy);
  const failureRecovery = oplRecord(dockerWebui.failure_recovery);
  const actions = oplRecordList(dockerWebui.ordinary_next_actions)
    .map(readDockerAction)
    .filter((action): action is DockerWebuiAction => Boolean(action));

  return {
    status: oplString(dockerWebui.ordinary_status) ?? 'unknown',
    runtimeStatus: oplString(runtimeProxy.status) ?? 'unknown',
    recoveryStatus: oplString(failureRecovery.status) ?? 'unknown',
    actions,
  };
}

export function buildAccessProjection(
  appState: Record<string, unknown>,
  t: (key: string, options?: Record<string, string>) => string
): AccessProjection {
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const executor = oplRecord(core.executor);
  const codexConfig = oplRecord(codex.config);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);

  const codexStatus = normalizeAccessStatus(
    oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : null),
    'unknown'
  );
  const apiKeyPresent =
    codex.api_key_present === true || codexConfig.api_key_present === true || oplString(codexConfig.status) === 'ready';
  const providerStatus = normalizeAccessStatus(
    oplString(provider.health_status) ?? oplString(provider.status) ?? oplString(temporal.health_status),
    'unknown'
  );
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'full-access';

  const modelName =
    oplString(codex.model) ??
    oplString(codexConfig.model) ??
    oplString(provider.model) ??
    oplString(provider.default_model) ??
    t('settings.accessPage.cards.model.fallback');
  const accountStatus = apiKeyPresent
    ? t('settings.accessPage.cards.account.configured')
    : t('settings.accessPage.cards.account.missing');
  const modelAccessStatus =
    codexStatus === 'ready' && apiKeyPresent && (providerStatus === 'ready' || providerStatus === 'ok')
      ? 'ready'
      : 'attention_required';

  const cards: StatusCard[] = [
    {
      key: 'model',
      title: t('settings.accessPage.cards.model.title'),
      status: codexStatus,
      detail: compactAccessDetail([modelName, oplString(codex.version)], t('settings.accessPage.cards.model.fallback')),
      tone: codexStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'account',
      title: t('settings.accessPage.cards.account.title'),
      status: apiKeyPresent ? 'ready' : 'attention_required',
      detail: accountStatus,
      tone: apiKeyPresent ? 'green' : 'orange',
    },
    {
      key: 'modelAccess',
      title: t('settings.accessPage.cards.modelAccess.title'),
      status: modelAccessStatus,
      detail: t('settings.accessPage.cards.provider.summary', {
        status:
          modelAccessStatus === 'ready'
            ? t('settings.accessPage.cards.provider.ready')
            : t('settings.accessPage.cards.provider.needsAttention'),
      }),
      help: t('settings.accessPage.cards.modelAccess.detail'),
      tone: modelAccessStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'permission',
      title: t('settings.accessPage.cards.permission.title'),
      status: permissionMode,
      statusLabel: t(`agentMode.${permissionMode}`, { defaultValue: permissionMode }),
      detail: t('settings.accessPage.cards.permission.detail'),
      tone: 'green',
    },
  ];

  return {
    cards,
    dockerWebui: buildDockerWebuiProjection(appState),
    resourceSources: buildResourceSourceProjection(appState, t),
  };
}
