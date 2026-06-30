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

export type AccessProjection = {
  cards: StatusCard[];
  dockerWebui: DockerWebuiProjection;
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

  return { cards, dockerWebui: buildDockerWebuiProjection(appState) };
}
