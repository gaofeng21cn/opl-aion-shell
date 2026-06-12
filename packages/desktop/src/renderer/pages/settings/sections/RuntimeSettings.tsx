/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, Button, Card, Message, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CheckOne, FolderSearch, Repair, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplCodexSessionContext } from '@/common/config/oplProductProfile';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import {
  executeManagedUpdateMutation,
  executeManagedUpdateRead,
  useManagedUpdateMaintenance,
  type ManagedUpdateMaintenanceSnapshot,
} from '@/renderer/services/managedUpdateMaintenance';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type RuntimeModuleItem = Record<string, unknown>;

type ManagedUpdateComponentId = 'app_binary' | 'runtime_toolchain' | 'agent_package_channel' | 'capability_exposure';

type ManagedUpdateCondition = {
  id: string;
  type: string;
  status: string;
  reason?: string;
  message?: string;
};

type ManagedUpdateComponent = {
  id: ManagedUpdateComponentId;
  label: string;
  state: string;
  conditions: ManagedUpdateCondition[];
  receiptRef?: string;
  repairAction?: string;
  repairReceiptId?: string;
  rollbackRef?: string;
  needsRestart: boolean;
  needsReload: boolean;
  reloadGuidance?: string;
  manualGuidance?: string;
  safeToApply: boolean;
  repairAllowed: boolean;
  rollbackAllowed: boolean;
};

type ManagedUpdatePlane = {
  operation?: string;
  operationMode?: string;
  updateChannel?: string;
  lockStatus?: string;
  summary?: string;
  reloadGuidance?: string;
  components: ManagedUpdateComponent[];
};

const OPL_MODULE_DISPLAY_LABELS: Record<string, string> = {
  medautoscience: 'Med Auto Science',
  medautogrant: 'Med Auto Grant',
  redcube: 'RedCube AI',
  oplmetaagent: 'OPL Meta Agent',
};

const OPL_RUNTIME_MODULE_IDS = ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent'];
const MANAGED_UPDATE_COMPONENT_IDS: ManagedUpdateComponentId[] = [
  'app_binary',
  'runtime_toolchain',
  'agent_package_channel',
  'capability_exposure',
];
const MANAGED_UPDATE_LABELS: Record<ManagedUpdateComponentId, string> = {
  app_binary: 'App binary',
  runtime_toolchain: 'Runtime/toolchain',
  agent_package_channel: 'Agent packages',
  capability_exposure: 'Capability exposure',
};

type RuntimeSettingsProps = {
  withWrapper?: boolean;
};

function normalizeStatus(status: string | undefined | null): string | null {
  if (!status) return null;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

function formatStatus(status: string | undefined | null, t: (key: string, options?: Record<string, string>) => string) {
  const normalized = normalizeStatus(status);
  if (!normalized) return t('settings.oplEnvironmentPage.status.unknown');
  return t(`settings.oplEnvironmentPage.status.${normalized}`, { status: normalized });
}

function compactToolDetail(parts: Array<string | null | undefined>, fallback: string) {
  const detail = parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ');
  return detail || fallback;
}

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

function oplBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function firstOplString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = oplString(value);
    if (stringValue) return stringValue;
  }
  return undefined;
}

function formatReleaseChannel(
  channel: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  const normalized = channel?.trim() || 'stable';
  return t(`settings.runtimePage.releaseChannels.${normalized}`, { channel: normalized });
}

function localAppVersion(): string {
  return __OPL_RELEASE_VERSION__ || __APP_VERSION__;
}

function moduleId(module: RuntimeModuleItem): string {
  return (
    oplString(module.module_id) ??
    oplString(module.id) ??
    oplString(module.name)
      ?.replace(/[^a-z0-9]/gi, '')
      .toLowerCase() ??
    ''
  );
}

function normalizeModule(module: RuntimeModuleItem): RuntimeModuleItem {
  const id = moduleId(module);
  return {
    ...module,
    module_id: id,
    label: oplString(module.display_name) ?? oplString(module.label) ?? OPL_MODULE_DISPLAY_LABELS[id] ?? id,
  };
}

function moduleStatus(module: RuntimeModuleItem): string {
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

function isReadyStatus(status: string): boolean {
  return status === 'ready' || status === 'compatible' || status === 'ok' || status === 'installed';
}

function modulePath(module: RuntimeModuleItem): string {
  return (
    oplString(module.path) ??
    oplString(module.checkout_path) ??
    oplString(module.managed_checkout_path) ??
    oplString(module.repo_url) ??
    ''
  );
}

function moduleVersionDetail(module: RuntimeModuleItem, t: (key: string, options?: Record<string, string>) => string) {
  const parts = [
    oplString(module.version),
    oplString(module.source),
    oplString(module.install_origin),
    oplString(oplRecord(module.git).short_sha),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(' · ');
  return moduleId(module) || t('settings.oplEnvironmentPage.status.unknown');
}

function modulePathSource(
  module: RuntimeModuleItem,
  familyWorkspaceRoot: string | null,
  modulesSource: string | null,
  t: (key: string, options?: Record<string, string>) => string
) {
  const source = oplString(module.source) ?? oplString(module.install_origin) ?? modulesSource ?? 'unknown';
  const modulePathValue = modulePath(module);
  if (familyWorkspaceRoot && modulePathValue.startsWith(familyWorkspaceRoot)) {
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot', {
      root: familyWorkspaceRoot,
    });
  }
  if (source === 'sibling_workspace')
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.siblingWorkspace');
  if (source === 'env_override') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.envOverride');
  if (source === 'managed_root') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.managedRoot');
  if (source === 'missing') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.missing');
  if (source === 'invalid_checkout') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.invalidCheckout');
  return t('settings.oplEnvironmentPage.moduleVersion.pathSources.unknown');
}

function formatModuleAction(action: string, t: (key: string, options?: Record<string, string>) => string) {
  return t(`settings.oplEnvironmentPage.moduleActions.${action}`, { action });
}

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

function managedUpdateRoot(parsed: unknown, appState: Record<string, unknown>): Record<string, unknown> {
  const parsedRecord = oplRecord(parsed);
  const parsedAppState = oplRecord(parsedRecord.app_state);
  return oplRecord(
    parsedRecord.managed_update ??
      parsedRecord.managed_update_plane ??
      parsedAppState.managed_update_plane ??
      appState.managed_update_plane
  );
}

function managedUpdateComponentRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const rawComponents = root.components ?? root.planes ?? root.items;
  if (Array.isArray(rawComponents)) return oplRecordList(rawComponents);
  const componentMap = oplRecord(rawComponents);
  return Object.entries(componentMap).map(([id, value]) => ({ ...oplRecord(value), component_id: id }));
}

function findRepairAction(root: Record<string, unknown>, componentId: string): Record<string, unknown> {
  return (
    oplRecordList(root.repair_actions).find(
      (action) => firstOplString(action.component_id, action.componentId) === componentId
    ) ?? {}
  );
}

function readManagedUpdateConditions(value: unknown, componentId: string): ManagedUpdateCondition[] {
  return oplRecordList(value).map((condition, index) => {
    const type = firstOplString(condition.type, condition.condition_type, condition.id) ?? `condition-${index + 1}`;
    const status = firstOplString(condition.status, condition.state) ?? 'Unknown';
    return {
      id: `${componentId}-${type}-${index + 1}`,
      type,
      status,
      reason: firstOplString(condition.reason),
      message: firstOplString(condition.message, condition.description),
    };
  });
}

function readManagedUpdatePlane(parsed: unknown, appState: Record<string, unknown>): ManagedUpdatePlane {
  const root = managedUpdateRoot(parsed, appState);
  const byId = new Map<string, Record<string, unknown>>();
  for (const component of managedUpdateComponentRecords(root)) {
    const id = firstOplString(component.component_id, component.componentId, component.id);
    if (id) byId.set(id, component);
  }
  const components = MANAGED_UPDATE_COMPONENT_IDS.map((id) => {
    const component = byId.get(id) ?? {};
    const receipt = oplRecord(component.receipt ?? component.receipts);
    const repairAction = findRepairAction(root, id);
    const state = firstOplString(component.state, component.status, component.health_status) ?? 'unknown';
    const receiptRef = firstOplString(
      component.receipt_ref,
      component.last_receipt_ref,
      receipt.last_receipt_ref,
      receipt.receipt_ref,
      receipt.ref
    );
    const repairReceiptId = firstOplString(
      component.repair_receipt_ref,
      receipt.repair_receipt_ref,
      repairAction.receipt_ref,
      repairAction.receiptId,
      receiptRef
    );
    const rollbackRef = firstOplString(
      component.rollback_ref,
      component.rollbackRef,
      receipt.rollback_ref,
      receipt.rollbackRef
    );
    const repairActionRef = firstOplString(
      component.repair_action,
      receipt.repair_action,
      repairAction.action_ref,
      repairAction.ref
    );
    const safeToApply =
      oplBoolean(component.safe_to_apply) || oplBoolean(component.apply_allowed) || oplBoolean(component.can_apply);
    const repairAllowed =
      oplBoolean(component.repair_allowed) ||
      oplBoolean(component.can_repair) ||
      state === 'failed_with_repair' ||
      Boolean(repairActionRef);
    const rollbackAllowed =
      oplBoolean(component.rollback_allowed) || oplBoolean(component.can_rollback) || Boolean(rollbackRef);
    return {
      id,
      label: firstOplString(component.display_group, component.label, component.name) ?? MANAGED_UPDATE_LABELS[id],
      state,
      conditions: readManagedUpdateConditions(component.conditions, id),
      receiptRef,
      repairAction: repairActionRef,
      repairReceiptId,
      rollbackRef,
      needsRestart: oplBoolean(component.needs_restart) || oplBoolean(component.restart_required),
      needsReload: oplBoolean(component.needs_reload) || oplBoolean(component.reload_required),
      reloadGuidance: firstOplString(component.reload_guidance, component.restart_guidance, root.reload_guidance),
      manualGuidance: firstOplString(
        component.manual_guidance,
        component.rollback_manual_guidance,
        component.repair_manual_guidance
      ),
      safeToApply,
      repairAllowed,
      rollbackAllowed,
    };
  });
  return {
    operation: firstOplString(root.operation),
    operationMode: firstOplString(root.operation_mode, root.operationMode),
    updateChannel: firstOplString(root.update_channel, root.channel),
    lockStatus: firstOplString(oplRecord(root.idempotency_lock).status, oplRecord(root.lock).status),
    summary: firstOplString(oplRecord(root.summary).message, root.summary),
    reloadGuidance: firstOplString(root.reload_guidance),
    components,
  };
}

function ManagedUpdatesPanel({
  plane,
  maintenance,
  onRefresh,
  onCheck,
  onPlan,
  onApply,
  onRepair,
  onRollback,
  t,
}: {
  plane: ManagedUpdatePlane;
  maintenance: ManagedUpdateMaintenanceSnapshot;
  onRefresh: () => void;
  onCheck: () => void;
  onPlan: () => void;
  onApply: (component: ManagedUpdateComponent) => void;
  onRepair: (component: ManagedUpdateComponent) => void;
  onRollback: (component: ManagedUpdateComponent) => void;
  t: (key: string, options?: Record<string, string | number>) => string;
}) {
  const loading = maintenance.running;
  const busyAction = maintenance.busyAction;

  return (
    <Card bordered className='rd-8px' data-testid='opl-managed-updates'>
      <div className='flex flex-col gap-14px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.updates.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.updates.description')}
            </Typography.Text>
            <Space wrap size='mini' className='mt-8px'>
              {plane.updateChannel && (
                <Tag>{t('settings.oplEnvironmentPage.updates.channel', { channel: plane.updateChannel })}</Tag>
              )}
              {plane.lockStatus && (
                <Tag>{t('settings.oplEnvironmentPage.updates.lockStatus', { status: plane.lockStatus })}</Tag>
              )}
              {plane.operationMode && (
                <Tag>{t('settings.oplEnvironmentPage.updates.operationMode', { mode: plane.operationMode })}</Tag>
              )}
              {maintenance.executionStatus !== 'idle' && (
                <Tag>
                  {t('settings.oplEnvironmentPage.updates.executionStatus', {
                    status: maintenance.executionStatus,
                  })}
                </Tag>
              )}
            </Space>
          </div>
          <Space wrap>
            <Button
              data-testid='opl-managed-update-refresh'
              icon={<UpdateRotation theme='outline' />}
              loading={loading}
              onClick={onRefresh}
            >
              {t('settings.oplEnvironmentPage.updates.actions.refreshStatus')}
            </Button>
            <Button loading={loading} onClick={onCheck}>
              {t('settings.oplEnvironmentPage.updates.actions.check')}
            </Button>
            <Button loading={loading} onClick={onPlan}>
              {t('settings.oplEnvironmentPage.updates.actions.plan')}
            </Button>
          </Space>
        </div>

        {plane.summary && <Alert type='info' content={plane.summary} />}
        {plane.reloadGuidance && <Alert type='info' content={plane.reloadGuidance} />}

        <div
          className='grid grid-cols-1 md:grid-cols-3 gap-8px text-12px text-t-secondary'
          data-testid='opl-managed-update-background-status'
        >
          <span className='break-words'>
            {t('settings.oplEnvironmentPage.updates.background.lastRunAt', {
              value: maintenance.lastRunAt ?? t('settings.oplEnvironmentPage.status.unknown'),
            })}
          </span>
          <span className='break-words'>
            {t('settings.oplEnvironmentPage.updates.background.nextRunAt', {
              value: maintenance.nextRunAt ?? t('settings.oplEnvironmentPage.status.unknown'),
            })}
          </span>
          <span className='break-words'>
            {t('settings.oplEnvironmentPage.updates.background.lastFailure', {
              value: maintenance.lastFailure ?? t('settings.oplEnvironmentPage.updates.background.noFailure'),
            })}
          </span>
          {maintenance.lastAction && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.background.lastAction', {
                action: maintenance.lastAction.kind,
                componentId: maintenance.lastAction.componentId,
                status: maintenance.lastAction.status,
              })}
            </span>
          )}
          {maintenance.lastSkipReason && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.background.lastSkipReason', {
                reason: maintenance.lastSkipReason,
              })}
            </span>
          )}
          {maintenance.reloadGuidance && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.background.reloadGuidance', {
                guidance: maintenance.reloadGuidance,
              })}
            </span>
          )}
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
          {plane.components.map((component) => (
            <div
              key={component.id}
              className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'
              data-testid={`opl-managed-update-${component.id}`}
            >
              <div className='flex flex-col gap-10px'>
                <div className='flex items-center justify-between gap-12px'>
                  <Typography.Text className='font-600 text-t-primary break-words'>
                    {t(`settings.oplEnvironmentPage.updates.components.${component.id}`, {
                      defaultValue: component.label,
                    })}
                  </Typography.Text>
                  <Tag color={component.state === 'current' ? 'green' : 'orange'}>
                    {formatStatus(component.state, t)}
                  </Tag>
                </div>

                {component.conditions.length > 0 && (
                  <div className='flex flex-col gap-6px'>
                    {component.conditions.map((condition) => (
                      <div key={condition.id} className='text-12px text-t-secondary break-words'>
                        <Tag size='small'>{condition.status}</Tag>
                        <span className='ml-6px font-500 text-t-primary'>{condition.type}</span>
                        {condition.reason && <span className='ml-6px'>{condition.reason}</span>}
                        {condition.message && <span className='ml-6px'>{condition.message}</span>}
                      </div>
                    ))}
                  </div>
                )}

                <div className='flex flex-col gap-4px text-12px text-t-secondary break-words'>
                  {component.receiptRef && (
                    <span>{t('settings.oplEnvironmentPage.updates.receiptRef', { ref: component.receiptRef })}</span>
                  )}
                  {component.repairAction && (
                    <span>
                      {t('settings.oplEnvironmentPage.updates.repairAction', { action: component.repairAction })}
                    </span>
                  )}
                  {component.rollbackRef && (
                    <span>{t('settings.oplEnvironmentPage.updates.rollbackRef', { ref: component.rollbackRef })}</span>
                  )}
                  {component.needsRestart && <span>{t('settings.oplEnvironmentPage.updates.needsRestart')}</span>}
                  {component.needsReload && <span>{t('settings.oplEnvironmentPage.updates.needsReload')}</span>}
                  {component.reloadGuidance && <span>{component.reloadGuidance}</span>}
                  {component.manualGuidance && <span>{component.manualGuidance}</span>}
                </div>

                <Space wrap size='small'>
                  {component.safeToApply && (
                    <Button
                      data-testid={`opl-managed-update-apply-${component.id}`}
                      size='small'
                      type='primary'
                      loading={busyAction === `apply:${component.id}`}
                      onClick={() => onApply(component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.applySelected')}
                    </Button>
                  )}
                  {component.repairAllowed && (
                    <Button
                      data-testid={`opl-managed-update-repair-${component.id}`}
                      size='small'
                      loading={busyAction === `repair:${component.id}`}
                      onClick={() => onRepair(component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.repair')}
                    </Button>
                  )}
                  {component.rollbackAllowed && (
                    <Button
                      data-testid={`opl-managed-update-rollback-${component.id}`}
                      size='small'
                      loading={busyAction === `rollback:${component.id}`}
                      onClick={() => onRollback(component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.rollback')}
                    </Button>
                  )}
                </Space>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const RuntimeSettings: React.FC<RuntimeSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const appStateQuery = useOplAppState('fast');
  const managedUpdateMaintenance = useManagedUpdateMaintenance();

  React.useEffect(() => {
    messageRef.current = message;
    tRef.current = t;
  }, [message, t]);

  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const defaultProfile = oplRecord(codex.default_profile);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const temporalDetails = oplRecord(temporal.details);
  const temporalWorkerReadiness = oplRecord(temporalDetails.worker_readiness);
  const paths = oplRecord(appState.paths);
  const modulesPayload = oplRecord(appState.modules);
  const modulesSourcePayload = oplRecord(modulesPayload.source);
  const release = oplRecord(appState.release);
  const managedUpdatePlane = useMemo(
    () => readManagedUpdatePlane(managedUpdateMaintenance.result?.parsed, appState),
    [appState, managedUpdateMaintenance.result]
  );
  const familyWorkspaceRoot = oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ?? oplPathString(paths.workspace_root) ?? familyWorkspaceRoot;
  const logsRoot = oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir);
  const modulesSourceMode = oplString(modulesSourcePayload.mode) ?? oplString(modulesPayload.source);
  const modulesSourceReason = oplString(modulesSourcePayload.reason);
  const modulesRoot =
    oplString(modulesSourcePayload.modules_root) ?? oplString(modulesPayload.modules_root) ?? familyWorkspaceRoot;

  const modules = useMemo(() => {
    const byId = new Map(
      oplRecordList(modulesPayload.items ?? modulesPayload.modules).map((item) => {
        const normalized = normalizeModule(item);
        return [moduleId(normalized), normalized];
      })
    );
    return OPL_RUNTIME_MODULE_IDS.map((id) => normalizeModule({ ...byId.get(id), module_id: id }));
  }, [modulesPayload.items, modulesPayload.modules]);

  const moduleReady = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const moduleValue = t('settings.oplEnvironmentPage.modulesReadyCount', {
    ready: moduleReady,
    total: modules.length,
  });
  const codexStatus = oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : 'unknown');
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status) ?? 'unknown';
  const workspaceStatus = workspaceRoot ? 'ready' : 'unknown';
  const appVersion = localAppVersion();
  const guiVersion = __SHELL_VERSION__;
  const releaseChannel = oplString(release.channel) ?? oplString(release.release_channel) ?? 'stable';
  const releaseRepo = oplString(release.repo) ?? oplString(release.release_repo);
  const latestStableVersion = oplString(release.app_version) ?? oplString(release.version);
  const runtimeCards = useMemo(
    () => [
      {
        key: 'codex',
        title: 'Codex CLI',
        value: formatStatus(codexStatus, t),
        detail: compactToolDetail(
          [
            oplString(codex.version),
            oplString(codex.binary_path),
            oplString(codex.default_model) ?? oplString(defaultProfile.model),
            oplString(codex.default_reasoning_effort) ?? oplString(defaultProfile.model_reasoning_effort),
            oplString(oplRecord(core.executor).permission_mode),
          ],
          t('settings.oplEnvironmentPage.status.unknown')
        ),
        tone: codexStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'temporal',
        title: 'Temporal',
        value: formatStatus(temporalStatus, t),
        detail: compactToolDetail(
          [
            oplString(temporal.version),
            oplString(temporalDetails.address),
            oplString(temporalDetails.namespace),
            oplString(temporalDetails.task_queue),
            oplString(temporalWorkerReadiness.readiness_status),
          ],
          t('settings.oplEnvironmentPage.status.unknown')
        ),
        tone: temporalStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'workspace',
        title: t('settings.oplEnvironmentPage.workspaceRootTitle'),
        value: formatStatus(workspaceStatus, t),
        detail: workspaceRoot || t('settings.oplEnvironmentPage.workspaceRootMissing'),
        tone: workspaceStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'modules',
        title: t('settings.oplEnvironmentPage.modulesTitle'),
        value: moduleValue,
        detail: modulesSourceReason
          ? `${modulesSourceMode ?? t('settings.oplEnvironmentPage.status.unknown')} · ${modulesSourceReason}`
          : modulesSourceMode || t('settings.oplEnvironmentPage.items.module.latest'),
        tone: moduleReady >= modules.length ? 'green' : 'orange',
      },
    ],
    [
      codex,
      codexStatus,
      core.executor,
      defaultProfile,
      moduleReady,
      moduleValue,
      modules.length,
      modulesSourceMode,
      modulesSourceReason,
      t,
      temporal,
      temporalDetails,
      temporalStatus,
      temporalWorkerReadiness,
      workspaceRoot,
      workspaceStatus,
    ]
  );

  const refreshRuntime = useCallback(() => {
    void appStateQuery.load('fast', { showRefreshing: true }).then((payload) => {
      if (payload) messageRef.current.success(t('common.refreshSuccess'));
      else messageRef.current.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
    });
  }, [appStateQuery.load, t]);

  const runManagedUpdateRead = useCallback(async (operation: 'status' | 'check' | 'plan') => {
    try {
      const translate = tRef.current;
      const result = await executeManagedUpdateRead(operation, {
        trigger:
          operation === 'check'
            ? 'manual_check_updates'
            : operation === 'plan'
              ? 'manual_plan'
              : 'manual_refresh_status',
      });
      if (!bridgeResultSucceeded(result)) {
        messageRef.current.error(
          result?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }
      if (operation !== 'status') {
        messageRef.current.success(translate('settings.oplEnvironmentPage.updates.messages.readComplete'));
      }
    } catch {
      messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
    }
  }, []);

  const runManagedUpdateMutation = useCallback(
    async (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => {
      try {
        const translate = tRef.current;
        const result = await executeManagedUpdateMutation(kind, {
          componentId: component.id,
          receiptId: component.repairReceiptId,
        });
        if (!bridgeResultSucceeded(result)) {
          messageRef.current.error(
            result?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
          );
          return;
        }
        messageRef.current.success(translate('settings.oplEnvironmentPage.updates.messages.actionComplete'));
        await appStateQuery.load('fast', { showRefreshing: true });
      } catch {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    },
    [appStateQuery.load]
  );

  React.useEffect(() => {
    if (!managedUpdateMaintenance.result && !managedUpdateMaintenance.running) {
      void runManagedUpdateRead('status');
    }
  }, [managedUpdateMaintenance.result, managedUpdateMaintenance.running, runManagedUpdateRead]);

  const runOplCommand = useCallback(
    async (args: string[], actionId: string, successText: string) => {
      try {
        const result =
          actionId === 'doctor'
            ? await ipcBridge.oplRuntime.getInitialize.invoke()
            : await ipcBridge.oplRuntime.runInstallPrep.invoke();
        if (bridgeResultSucceeded(result)) {
          message.success(successText);
          await appStateQuery.load('fast', { showRefreshing: true });
        } else {
          message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } catch {
        message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    },
    [appStateQuery.load, message, t]
  );

  const openLogDir = useCallback(() => {
    if (!logsRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: logsRoot, tool: 'explorer' });
  }, [logsRoot]);

  const openUpdateModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'settings-runtime' } }));
  }, []);

  const codexSessionContext = useMemo(() => getOplCodexSessionContext(), []);

  const content = (
    <>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.runtimePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.runtimePage.description')}</Typography.Text>
        </div>

        <Card bordered className='rd-8px'>
          <Space wrap>
            <Button
              key='runtime-action-doctor'
              type='primary'
              icon={<CheckOne theme='outline' />}
              onClick={() =>
                void runOplCommand(['doctor'], 'doctor', t('settings.oplEnvironmentPage.messages.doctorComplete'))
              }
            >
              {t('settings.oplEnvironmentPage.actions.doctor')}
            </Button>
            <Button
              key='runtime-action-refresh'
              icon={<UpdateRotation theme='outline' />}
              loading={appStateQuery.refreshing}
              onClick={refreshRuntime}
            >
              {t('settings.oplEnvironmentPage.actions.refresh')}
            </Button>
            <Button
              key='runtime-action-repair'
              icon={<Repair theme='outline' />}
              onClick={() =>
                void runOplCommand(['install'], 'repair', t('settings.oplEnvironmentPage.messages.repairComplete'))
              }
            >
              {t('settings.oplEnvironmentPage.actions.repair')}
            </Button>
          </Space>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('common.version')}</Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {t('settings.runtimePage.versionDetail', {
                  oplVersion: appVersion,
                  guiVersion,
                  channel: formatReleaseChannel(releaseChannel, t),
                })}
              </Typography.Text>
              {latestStableVersion && latestStableVersion !== appVersion ? (
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {t('settings.runtimePage.latestStableDetail', { version: latestStableVersion })}
                </Typography.Text>
              ) : null}
              {releaseRepo && (
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {releaseRepo}
                </Typography.Text>
              )}
            </div>
            <Button icon={<UpdateRotation theme='outline' />} onClick={openUpdateModal}>
              {t('settings.checkForUpdates')}
            </Button>
          </div>
        </Card>

        <ManagedUpdatesPanel
          plane={managedUpdatePlane}
          maintenance={managedUpdateMaintenance}
          onRefresh={() => void runManagedUpdateRead('status')}
          onCheck={() => void runManagedUpdateRead('check')}
          onPlan={() => void runManagedUpdateRead('plan')}
          onApply={(component) => void runManagedUpdateMutation('apply', component)}
          onRepair={(component) => void runManagedUpdateMutation('repair', component)}
          onRollback={(component) => void runManagedUpdateMutation('rollback', component)}
          t={t}
        />

        <div className='grid grid-cols-1 md:grid-cols-4 gap-14px'>
          {runtimeCards.map((card) => (
            <Card key={`runtime-card-${card.key}`} bordered className='rd-8px'>
              <div className='flex flex-col gap-8px min-w-0'>
                <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
                <Tag color={card.tone}>{card.value}</Tag>
                <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
              </div>
            </Card>
          ))}
        </div>

        <Card bordered className='rd-8px' id='workspace'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('settings.workDir')}</Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-all'>
                {workspaceRoot || t('settings.dirNotConfigured')}
              </Typography.Text>
            </div>
          </div>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('settings.logDir')}</Typography.Text>
              <Tooltip content={logsRoot || ''}>
                <Typography.Text className='block text-12px text-t-secondary break-all'>
                  {logsRoot || t('settings.dirNotConfigured')}
                </Typography.Text>
              </Tooltip>
            </div>
            <Button icon={<FolderSearch theme='outline' />} disabled={!logsRoot} onClick={openLogDir}>
              {t('common.open', { defaultValue: 'Open' })}
            </Button>
          </div>
        </Card>

        <Card bordered className='rd-8px overflow-hidden' id='modules'>
          <Alert type='info' content={t('settings.oplEnvironmentPage.moduleVersion.scopeDescription')} />
          {modulesRoot ? (
            <Typography.Text className='block text-12px text-t-secondary break-all px-0 pt-12px'>
              {t('settings.oplEnvironmentPage.moduleVersion.modulesRoot', { path: modulesRoot })}
            </Typography.Text>
          ) : null}
          <div className='flex flex-col divide-y divide-border-1'>
            {modules.map((module, moduleIndex) => {
              const status = moduleStatus(module);
              const pathValue = modulePath(module);
              const id = moduleId(module) || `module-${moduleIndex + 1}`;
              return (
                <div key={`runtime-module-${id}`} className='flex items-center justify-between gap-12px py-12px'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {oplString(module.label) ?? id}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {moduleVersionDetail(module, t)}
                    </Typography.Text>
                    {pathValue ? (
                      <Tooltip content={pathValue}>
                        <Typography.Text className='block text-12px text-t-secondary break-all'>
                          {t('settings.oplEnvironmentPage.moduleVersion.checkoutPath', { path: pathValue })}
                        </Typography.Text>
                      </Tooltip>
                    ) : null}
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.oplEnvironmentPage.moduleVersion.pathSource', {
                        source: modulePathSource(module, familyWorkspaceRoot, modulesSourceMode, t),
                      })}
                    </Typography.Text>
                    {oplString(module.repo_url) ? (
                      <Typography.Text className='block text-12px text-t-secondary break-all'>
                        {t('settings.oplEnvironmentPage.moduleVersion.repoUrl', {
                          url: oplString(module.repo_url) ?? '',
                        })}
                      </Typography.Text>
                    ) : null}
                  </div>
                  <Space wrap size='mini'>
                    {oplString(module.recommended_action) && (
                      <Tag key={`${id}-action`} color='orange'>
                        {formatModuleAction(oplString(module.recommended_action) ?? '', t)}
                      </Tag>
                    )}
                    <Tag key={`${id}-status`} color={isReadyStatus(status) ? 'green' : 'orange'}>
                      {formatStatus(status, t)}
                    </Tag>
                  </Space>
                </div>
              );
            })}
          </div>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-8px'>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.codexContext.title')}
            </Typography.Text>
            <Typography.Text className='text-12px text-t-secondary'>
              {t('settings.oplEnvironmentPage.codexContext.description')}
            </Typography.Text>
            <pre className='m-0 p-12px rd-8px bg-fill-2 text-12px text-t-primary whitespace-pre-wrap break-words max-h-280px overflow-auto'>
              {codexSessionContext}
            </pre>
          </div>
        </Card>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper contentClassName='max-w-1080px'>{content}</SettingsPageWrapper> : content;
};

export default RuntimeSettings;
