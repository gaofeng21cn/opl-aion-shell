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
  tone: 'green' | 'orange' | 'neutral';
};

export type DockerWebuiAction = {
  actionId: string;
  label: string;
  state: string;
  route: string;
  dryRunRoute: string;
  payloadRequired: boolean;
  payloadFields: string[];
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
  category: string;
  management: 'consoleManaged' | 'selfManaged' | null;
  refs: string[];
  environmentRefs: string[];
  managementRefs: string[];
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
    payloadFields: Array.isArray(value.payload_fields)
      ? value.payload_fields.filter((field): field is string => typeof field === 'string')
      : [],
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

function sourceText(key: string, record: Record<string, unknown>, refs: string[]): string {
  return [
    key,
    oplString(record.kind),
    oplString(record.type),
    oplString(record.category),
    oplString(record.source_kind),
    oplString(record.resource_kind),
    ...refs,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sourceCategory(key: string, record: Record<string, unknown>, refs: string[]): string {
  const text = sourceText(key, record, refs);
  if (text.includes('gateway')) return 'gateway';
  if (key === 'cloud_remote_access' || key === 'cloud_remote' || key === 'remote_access') return 'remote';
  if (key.includes('workspace')) return 'oplWorkspace';
  if (text.includes('docker') || text.includes('webui')) return 'dockerWebui';
  if (text.includes('local')) return 'local';
  if (text.includes('ssh') || text.includes('hpc') || text.includes('slurm')) return 'sshHpc';
  if (text.includes('institution') || text.includes('dataset') || text.includes('data-source')) {
    return 'institutionalData';
  }
  if (text.includes('storage') || text.includes('s3') || text.includes('bucket') || text.includes('volume')) {
    return 'managedStorage';
  }
  if (text.includes('cloud') || text.includes('managed-compute') || text.includes('compute')) return 'oplCloudCompute';
  if (text.includes('workspace')) return 'oplWorkspace';
  if (text.includes('fabric')) return 'fabric';
  return 'remote';
}

function sourceTitle(
  key: string,
  record: Record<string, unknown>,
  category: string,
  t: (key: string, options?: Record<string, string>) => string
): string {
  if (key === 'cloud_remote_access' || key === 'cloud_remote' || key === 'remote_access') {
    return t('settings.accessPage.resourceSources.cloudRemoteAccess');
  }
  if (key === 'opl_gateway' || key === 'gateway') return t('settings.accessPage.resourceSources.oplGateway');
  if (key === 'opl_workspace' || key === 'workspace') return t('settings.accessPage.resourceSources.oplWorkspace');
  if (key === 'opl_fabric' || key === 'fabric') return t('settings.accessPage.resourceSources.oplFabric');
  return (
    oplString(record.title) ??
    oplString(record.label) ??
    oplString(record.name) ??
    t(`settings.accessPage.resourceSources.categories.${category}`)
  );
}

function sourceManagement(record: Record<string, unknown>, category: string): 'consoleManaged' | 'selfManaged' | null {
  const managementRefs = readRefList(
    record.console_policy_ref,
    record.quota_ref,
    record.billing_ref,
    record.permission_ref
  );
  if (record.console_managed === true || record.managed_by_console === true || managementRefs.length > 0) {
    return 'consoleManaged';
  }
  if (
    record.self_managed === true ||
    record.user_provided === true ||
    ['local', 'dockerWebui', 'sshHpc'].includes(category)
  ) {
    return 'selfManaged';
  }
  return null;
}

function modelAccessSourceLabel(source: string | null | undefined, t: (key: string) => string): string | null {
  switch (source) {
    case 'opl_gateway':
      return t('settings.accessPage.cards.account.source.oplGateway');
    case 'codex_login':
      return t('settings.accessPage.cards.account.source.codexLogin');
    case 'custom_provider':
      return t('settings.accessPage.cards.account.source.customProvider');
    case 'env_api_key':
      return t('settings.accessPage.cards.account.source.envApiKey');
    default:
      return null;
  }
}

function buildResourceSourceProjection(
  appState: Record<string, unknown>,
  t: (key: string, options?: Record<string, string>) => string
): ResourceSourceProjection[] {
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const codexConfig = oplRecord(codex.config);
  const provider = oplRecord(appState.provider);
  const access = oplRecord(appState.access);
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const sources = oplRecord(appSettingsReadModel.resource_sources ?? appState.resource_sources);
  const gatewayFallbackRefs = readRefList(
    access.gateway_status_ref,
    access.model_access_ref,
    access.key_status_ref,
    access.provider_policy_ref,
    access.provider_policy_refs,
    provider.gateway_status_ref,
    provider.provider_policy_ref,
    provider.provider_policy_refs,
    codex.gateway_status_ref,
    codex.model_access_ref,
    codex.api_key_status_ref,
    codex.provider_policy_ref,
    codexConfig.api_key_status_ref,
    codexConfig.provider_policy_ref
  );
  const knownSources: Array<[string, unknown]> = [
    ['cloud_remote_access', sources.cloud_remote_access ?? sources.cloud_remote ?? sources.remote_access],
    ['opl_gateway', sources.opl_gateway ?? sources.gateway],
    ['opl_workspace', sources.opl_workspace ?? sources.workspace],
    ['opl_fabric', sources.opl_fabric ?? sources.fabric],
  ];
  const knownKeys = new Set([
    'cloud_remote_access',
    'cloud_remote',
    'remote_access',
    'opl_gateway',
    'gateway',
    'opl_workspace',
    'workspace',
    'opl_fabric',
    'fabric',
  ]);
  const dynamicSources = Object.entries(sources).filter(([key]) => !knownKeys.has(key));
  const records = [...knownSources, ...dynamicSources]
    .map(([key, value]) => [key, oplRecord(value)] as const)
    .filter(([key, record]) => key === 'opl_gateway' || Object.keys(record).length > 0);

  return records
    .map(([key, record]) => {
      const refs = readRefList(
        record.resource_source_ref,
        record.resource_source_refs,
        record.status_ref,
        record.gateway_status_ref,
        record.model_access_ref,
        record.key_status_ref,
        record.api_key_status_ref,
        record.provider_policy_ref,
        record.provider_policy_refs,
        record.connector_ref,
        record.connector_refs,
        record.compute_ref,
        record.compute_refs,
        record.storage_ref,
        key === 'opl_gateway' ? gatewayFallbackRefs : null
      );
      const environmentRefs = readRefList(
        record.environment_ref,
        record.environment_refs,
        record.environment_template_ref,
        record.environment_template_refs,
        record.template_ref,
        record.template_refs,
        record.environment_version_ref,
        record.environment_version_refs,
        record.environment_source_ref,
        record.environment_source_refs,
        record.task_applicability_ref,
        record.task_applicability_refs,
        record.task_applicability
      );
      const managementRefs = readRefList(
        record.console_policy_ref,
        record.quota_ref,
        record.billing_ref,
        record.permission_ref
      );
      const category = sourceCategory(key, record, [...refs, ...environmentRefs, ...managementRefs]);
      return {
        key,
        title: sourceTitle(key, record, category, t),
        status: oplString(record.status) ?? oplString(record.state) ?? 'unknown',
        category,
        management: sourceManagement(record, category),
        refs,
        environmentRefs,
        managementRefs,
        hasRecord: Object.keys(record).length > 0,
      };
    })
    .filter(
      (entry) =>
        entry.hasRecord || entry.refs.length > 0 || entry.environmentRefs.length > 0 || entry.managementRefs.length > 0
    )
    .map(({ hasRecord: _hasRecord, ...entry }) => entry);
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
  const codexConfig = oplRecord(codex.config);
  const codexDefaultProfile = oplRecord(codex.default_profile);
  const codexStateAvailable = Object.keys(codex).length > 0;

  const codexStatus = normalizeAccessStatus(
    oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : null),
    'unknown'
  );
  const apiKeyPresent =
    codex.api_key_present === true || codexConfig.api_key_present === true || oplString(codexConfig.status) === 'ready';
  const oplGatewayConfigured = codex.opl_gateway_configured === true;
  const modelAccessReady = codex.model_access_ready === true || apiKeyPresent;
  const modelAccessSource = oplString(codex.model_access_source);
  const modelFallback = t('settings.accessPage.cards.model.fallback');

  const modelName =
    oplString(codex.default_model) ??
    oplString(codexConfig.default_model) ??
    oplString(codexDefaultProfile.model) ??
    oplString(codexConfig.model) ??
    modelFallback;
  const accountStatus = !codexStateAvailable
    ? t('settings.accessPage.statusLabels.unknown')
    : oplGatewayConfigured
      ? t('settings.accessPage.cards.account.oplGatewayConfigured')
      : modelAccessReady
        ? t('settings.accessPage.cards.account.existingCodexConfigured')
        : t('settings.accessPage.cards.account.missing');
  const accountSourceLabel = modelAccessSourceLabel(modelAccessSource, t);
  const modelLine = t('settings.accessPage.cards.codexCli.model', { model: modelName });
  const codexVersionLine = oplString(codex.version)
    ? t('settings.accessPage.cards.codexCli.version', { version: oplString(codex.version) ?? '' })
    : null;

  const cards: StatusCard[] = [
    {
      key: 'model',
      title: t('settings.accessPage.cards.codexCli.title'),
      status: codexStatus,
      detail: compactAccessDetail([codexVersionLine, modelLine], modelFallback),
      tone: codexStatus === 'ready' ? 'green' : codexStatus === 'unknown' ? 'neutral' : 'orange',
    },
    {
      key: 'account',
      title: t('settings.accessPage.cards.account.title'),
      status: !codexStateAvailable ? 'unknown' : modelAccessReady ? 'ready' : 'attention_required',
      statusLabel: accountStatus,
      detail: accountSourceLabel ?? '',
      tone: !codexStateAvailable ? 'neutral' : modelAccessReady ? 'green' : 'orange',
    },
  ];

  return {
    cards,
    dockerWebui: buildDockerWebuiProjection(appState),
    resourceSources: buildResourceSourceProjection(appState, t),
  };
}
