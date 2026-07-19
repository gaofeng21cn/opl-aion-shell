/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Message,
  Modal,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import { Application, Command, Copy, FolderSearch, Puzzle, Server, Terminal, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplSettingsControlPlaneActionContract } from '@/common/config/oplProductProfile';
import { useDesktopAutoUpdateStatus } from '@/renderer/hooks/ui/useDesktopAutoUpdateStatus';
import {
  getAppState,
  oplRecord,
  oplRecordList,
  oplString,
  useOplAppState,
} from '@/renderer/hooks/system/useOplAppState';
import { projectDesktopAutoUpdateStatus } from '@/renderer/services/desktopAutoUpdateProjection';
import {
  executeManagedUpdateMutation,
  executeManagedUpdateRead,
  useManagedUpdateMaintenance,
  type ManagedUpdateMaintenanceSnapshot,
} from '@/renderer/services/managedUpdateMaintenance';
import {
  readManagedUpdatePlane,
  type ManagedDependency,
  type ManagedUpdateComponent,
  type ManagedUpdatePlane,
} from '@/renderer/services/managedUpdateProjection';
import { copyText } from '@/renderer/utils/ui/clipboard';
import OplRefreshIconButton from '@/renderer/components/opl/OplRefreshIconButton';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  formatModuleAction,
  formatStatus,
  isTruthyFlag,
  isUserUsableStatus,
  moduleDisplayLabel,
  moduleId,
  modulePath,
  modulePathSource,
  moduleSource,
  moduleStatus,
  moduleVersionDetail,
  type Translate,
} from './runtimeStateView';
import {
  componentStatusTone,
  componentUserSummary,
  findRecommendedUpdateAction,
  updateComponentUserAction,
} from '../RuntimeSettings/environmentProjection';
import { buildRuntimeSettingsViewModel } from '../RuntimeSettings/runtimeSettingsViewModel';
import {
  RuntimeHealthSummary,
  TemporalMaintenancePanel,
  type TemporalMaintenanceAction,
  type TemporalMaintenanceActionId,
  type TemporalMaintenanceEvidence,
  type TemporalMaintenanceSnapshot,
} from './RuntimeSettingsPanels';

const DEVELOPER_SOURCE_MODES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

type RuntimeSettingsProps = {
  withWrapper?: boolean;
};

type PendingUpdateAction = {
  kind: 'apply' | 'repair' | 'rollback';
  component: ManagedUpdateComponent;
} | null;

type SettingsAppActionId = 'doctor' | 'repair';

const TEMPORAL_MAINTENANCE_ACTION_IDS = new Set<TemporalMaintenanceActionId>([
  'provider_service_status',
  'provider_service_start',
  'provider_service_restart',
  'provider_scheduler_status',
  'provider_scheduler_install',
  'provider_scheduler_trigger',
  'provider_worker_status',
  'provider_worker_start',
  'provider_worker_restart',
]);

const TEMPORAL_POSTCONDITION_ACTION_IDS = new Set<TemporalMaintenanceActionId>([
  'provider_service_start',
  'provider_service_restart',
  'provider_scheduler_install',
  'provider_scheduler_trigger',
  'provider_worker_start',
  'provider_worker_restart',
]);

const SETTINGS_ACTION_CONTRACT = getOplSettingsControlPlaneActionContract();

function maintenanceDiagnosticsRequested(): boolean {
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('section') === 'diagnostics';
}

function runSettingsControlPlaneAction(actionId: SettingsAppActionId): Promise<IOplRuntimeCommandResult> {
  return ipcBridge.oplRuntime.executeAction.invoke({
    actionId: SETTINGS_ACTION_CONTRACT.recommended_action_ids[actionId],
    dryRun: false,
  });
}

function componentDisplayLabel(component: ManagedUpdateComponent | undefined, t: Translate): string {
  if (!component) return t('settings.oplEnvironmentPage.updates.components.unknown');
  return t(`settings.oplEnvironmentPage.updates.components.${component.id}`, {
    defaultValue: component.label || t('settings.oplEnvironmentPage.updates.components.unknown'),
  });
}

function updateReadActionHelp(operation: 'status' | 'check' | 'plan', t: Translate): string {
  return t(`settings.oplEnvironmentPage.updates.actionHelp.${operation}`);
}

function mutationKindLabel(kind: 'apply' | 'repair' | 'rollback' | 'auto_apply', t: Translate): string {
  if (kind === 'repair') return t('settings.oplEnvironmentPage.updates.actions.repair');
  if (kind === 'rollback') return t('settings.oplEnvironmentPage.updates.actions.rollback');
  if (kind === 'auto_apply') return t('settings.oplEnvironmentPage.updates.actions.autoApply');
  return t('settings.oplEnvironmentPage.updates.actions.applyUpdate');
}

function mutationWillChange(
  kind: 'apply' | 'repair' | 'rollback',
  component: ManagedUpdateComponent,
  t: Translate
): string {
  if (kind === 'repair') return t('settings.oplEnvironmentPage.updates.confirmation.willRepair');
  if (kind === 'rollback') {
    return component.rollbackRef
      ? t('settings.oplEnvironmentPage.updates.confirmation.willRollbackTo', { ref: component.rollbackRef })
      : t('settings.oplEnvironmentPage.updates.confirmation.willRollback');
  }
  return t('settings.oplEnvironmentPage.updates.confirmation.willApply');
}

function mutationWillNotChange(kind: 'apply' | 'repair' | 'rollback', t: Translate): string {
  if (kind === 'rollback') return t('settings.oplEnvironmentPage.updates.confirmation.willNotRollback');
  return t('settings.oplEnvironmentPage.updates.confirmation.willNotApplyUnsafe');
}

function rollbackOrReceiptText(component: ManagedUpdateComponent, t: Translate): string {
  if (component.rollbackRef) {
    return t('settings.oplEnvironmentPage.updates.confirmation.rollbackRef', { ref: component.rollbackRef });
  }
  if (component.repairReceiptId ?? component.receiptRef) {
    return t('settings.oplEnvironmentPage.updates.confirmation.receiptRef', {
      ref: component.repairReceiptId ?? component.receiptRef ?? '',
    });
  }
  return t('settings.oplEnvironmentPage.updates.confirmation.noReceiptYet');
}

function componentApplyAllowed(component: ManagedUpdateComponent): boolean {
  return (component.id === 'opl_base' || component.id === 'opl_packages') && component.safeToApply;
}

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

function isTemporalMaintenanceActionId(value: string | null): value is TemporalMaintenanceActionId {
  return Boolean(value && TEMPORAL_MAINTENANCE_ACTION_IDS.has(value as TemporalMaintenanceActionId));
}

function temporalMaintenanceActions(
  appState: Record<string, unknown>
): Partial<Record<TemporalMaintenanceActionId, TemporalMaintenanceAction>> {
  return Object.fromEntries(
    oplRecordList(appState.actions).flatMap((entry) => {
      const actionId = oplString(entry.action_id);
      if (!isTemporalMaintenanceActionId(actionId)) return [];
      return [
        [
          actionId,
          {
            actionId,
            label: oplString(entry.label) ?? actionId,
          },
        ],
      ];
    })
  );
}

function temporalStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function temporalMaintenanceSnapshot(
  appState: Record<string, unknown>,
  schedulerStatusOverride?: string | null,
  workerMutationGuardOverride?: string | null,
  serverReachableOverride?: boolean | null
): TemporalMaintenanceSnapshot {
  const temporal = oplRecord(oplRecord(appState.provider).temporal);
  const details = oplRecord(temporal.details);
  const workerReadiness = oplRecord(details.worker_readiness);
  const temporalServiceLifecycle = oplRecord(workerReadiness.temporal_service_lifecycle);
  const serviceSupervisor = oplRecord(temporalServiceLifecycle.supervisor);
  const workerMutationGuard = oplRecord(workerReadiness.worker_mutation_guard ?? details.worker_mutation_guard);
  const scheduler = oplRecord(details.scheduler);
  const address = oplString(details.address);
  const projectedServiceReady =
    typeof workerReadiness.service_ready === 'boolean' ? workerReadiness.service_ready : null;
  const projectedServerReachable =
    typeof workerReadiness.server_reachable === 'boolean' ? workerReadiness.server_reachable : null;
  const serverReachable = projectedServerReachable ?? serverReachableOverride;
  const serviceReady = projectedServiceReady;
  const projectedWorkerReady = typeof workerReadiness.worker_ready === 'boolean' ? workerReadiness.worker_ready : null;
  const workerReady = projectedWorkerReady === true;
  const workerStatus =
    oplString(workerReadiness.lifecycle_status) ??
    oplString(workerReadiness.readiness_status) ??
    oplString(temporal.worker_status) ??
    (workerReady ? 'ready' : 'not_checked');
  const projectedSchedulerStatus =
    oplString(scheduler.status) ?? oplString(details.scheduler_status) ?? oplString(scheduler.health_status);
  const schedulerStatus = projectedSchedulerStatus ?? schedulerStatusOverride ?? 'not_checked';
  const schedulerReady = typeof scheduler.ready === 'boolean' ? scheduler.ready : null;
  const schedulerObservedAt = oplString(scheduler.observed_at);
  const schedulerError = oplString(scheduler.error) ?? oplString(scheduler.last_error);
  const projectedWorkerMutationGuardStatus = oplString(workerMutationGuard.mutation_guard_status);
  const workerError = oplString(workerReadiness.error) ?? oplString(workerReadiness.last_error);
  const serviceSupervisorInstalled = serviceSupervisor.installed === true;
  const serviceSupervisorLoaded = serviceSupervisor.loaded === true;
  const serviceSupervisorSupported =
    typeof serviceSupervisor.supported === 'boolean' ? serviceSupervisor.supported : null;
  const serviceSupervisorApplicable =
    typeof serviceSupervisor.applicable === 'boolean' ? serviceSupervisor.applicable : null;
  const serviceStatus = oplString(temporalServiceLifecycle.service_status);
  const projectedServiceSupervisorRequired =
    typeof serviceSupervisor.required === 'boolean' ? serviceSupervisor.required : null;
  const serviceSupervisorRequired =
    projectedServiceSupervisorRequired ??
    !(
      serviceSupervisorApplicable === false ||
      serviceSupervisorSupported === false ||
      serviceStatus === 'external_running'
    );
  const serviceSupervisorReady = typeof serviceSupervisor.ready === 'boolean' ? serviceSupervisor.ready : null;
  const serviceSupervisorConfigurationCurrent = serviceSupervisor.configuration_current === true;
  const serviceSupervisorError = oplString(serviceSupervisor.error);
  return {
    providerStatus: oplString(temporal.status) ?? 'unknown',
    healthStatus: oplString(temporal.health_status) ?? 'unknown',
    ready:
      serviceReady === true &&
      (!serviceSupervisorRequired || serviceSupervisorReady === true) &&
      workerReady &&
      schedulerReady === true &&
      serviceSupervisorError === null &&
      workerError === null &&
      schedulerError === null,
    address,
    addressSource: oplString(details.address_source) ?? 'unknown',
    namespace: oplString(details.namespace) ?? 'default',
    taskQueue: oplString(details.task_queue) ?? 'opl-stage-attempts',
    serviceReady,
    serverReachable,
    serviceSupervisorInstalled,
    serviceSupervisorLoaded,
    serviceSupervisorSupported,
    serviceSupervisorApplicable,
    serviceSupervisorRequired,
    serviceSupervisorReady,
    serviceSupervisorConfigurationCurrent,
    serviceSupervisorStatus: oplString(serviceSupervisor.status) ?? 'not_checked',
    serviceSupervisorObservedAt: oplString(serviceSupervisor.observed_at),
    serviceSupervisorError,
    workerReady,
    workerStatus,
    workerError,
    workerMutationGuardStatus: projectedWorkerMutationGuardStatus ?? workerMutationGuardOverride,
    schedulerStatus,
    schedulerReady,
    schedulerObservedAt,
    schedulerError,
    blockers: temporalStringList(workerReadiness.blockers),
  };
}

function nestedStringForKeys(value: unknown, keys: ReadonlySet<string>, depth = 0): string | null {
  const record = oplRecord(value);
  for (const [key, candidate] of Object.entries(record)) {
    if (keys.has(key) && typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  if (depth >= 5) return null;
  for (const candidate of Object.values(record)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const nested = nestedStringForKeys(candidate, keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function nestedStringsForKeys(value: unknown, keys: ReadonlySet<string>, depth = 0): string[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) {
    return value.flatMap((candidate) => nestedStringsForKeys(candidate, keys, depth + 1));
  }
  const record = oplRecord(value);
  const matches = Object.entries(record).flatMap(([key, candidate]) =>
    keys.has(key) && typeof candidate === 'string' && candidate.trim() ? [candidate.trim()] : []
  );
  const nested = Object.values(record).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    return nestedStringsForKeys(candidate, keys, depth + 1);
  });
  return [...matches, ...nested];
}

function nestedBooleanForKeys(value: unknown, keys: ReadonlySet<string>, depth = 0): boolean | null {
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const nested = nestedBooleanForKeys(candidate, keys, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }
  const record = oplRecord(value);
  for (const [key, candidate] of Object.entries(record)) {
    if (keys.has(key) && typeof candidate === 'boolean') return candidate;
  }
  for (const candidate of Object.values(record)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const nested = nestedBooleanForKeys(candidate, keys, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

const TEMPORAL_STATUS_KEYS = new Set([
  'status',
  'start_status',
  'restart_status',
  'service_status',
  'lifecycle_status',
  'readiness_status',
  'schedule_status',
  'health_status',
  'install_status',
]);

function temporalActionFailure(result: IOplRuntimeCommandResult): 'blocked' | 'failed' | null {
  const statusValues = [
    ...nestedStringsForKeys(result.parsed, TEMPORAL_STATUS_KEYS),
    ...nestedStringsForKeys(result.parsed, new Set(['mutation_guard_status'])),
  ].map((status) => status.toLowerCase());
  if (statusValues.some((status) => status.startsWith('blocked'))) return 'blocked';
  return statusValues.some(
    (status) =>
      /^(failed|error)/.test(status) ||
      /(^|[_-])unready($|[_-])/.test(status) ||
      /(^|[_-])stale($|[_-])/.test(status) ||
      /(^|[_-])guidance_only($|[_-])/.test(status) ||
      status === 'launcher_missing' ||
      status === 'unavailable'
  )
    ? 'failed'
    : null;
}

function temporalReadbackGeneratedAfterAction(appState: Record<string, unknown>, actionStartedAtMs: number): boolean {
  const generatedAt = oplString(oplRecord(appState.meta).generated_at);
  if (!generatedAt) return false;
  const generatedAtMs = Date.parse(generatedAt);
  return Number.isFinite(generatedAtMs) && generatedAtMs >= actionStartedAtMs;
}

function temporalReadbackObservedAt(appState: Record<string, unknown>): string {
  const generatedAt = oplString(oplRecord(appState.meta).generated_at);
  if (!generatedAt) return new Date().toLocaleTimeString();
  const parsed = Date.parse(generatedAt);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleTimeString() : new Date().toLocaleTimeString();
}

function temporalSnapshotHasNoErrors(snapshot: TemporalMaintenanceSnapshot): boolean {
  return snapshot.serviceSupervisorError === null && snapshot.workerError === null && snapshot.schedulerError === null;
}

function temporalSchedulerStatusFromResult(result: IOplRuntimeCommandResult): string | null {
  const statuses = nestedStringsForKeys(result.parsed, new Set(['schedule_status', 'health_status', 'status'])).map(
    (status) => status.toLowerCase()
  );
  if (statuses.some((status) => ['not_installed', 'missing', 'absent'].includes(status))) return 'not_installed';
  if (statuses.includes('paused')) return 'paused';
  if (statuses.some((status) => ['active', 'healthy', 'ok', 'ready', 'installed'].includes(status))) {
    return 'ready';
  }
  return null;
}

function temporalPostconditionSatisfied(
  actionId: TemporalMaintenanceActionId,
  snapshot: TemporalMaintenanceSnapshot
): boolean {
  if (actionId === 'provider_service_start' || actionId === 'provider_service_restart') {
    return (
      snapshot.serviceReady === true &&
      (!snapshot.serviceSupervisorRequired || snapshot.serviceSupervisorReady === true)
    );
  }
  if (actionId === 'provider_worker_start' || actionId === 'provider_worker_restart') {
    return snapshot.workerReady;
  }
  if (actionId === 'provider_scheduler_install') {
    return snapshot.schedulerReady === true;
  }
  if (actionId === 'provider_scheduler_trigger') {
    return snapshot.ready;
  }
  return true;
}

function capabilitySyncNeedsManualHandling(result: IOplRuntimeCommandResult): boolean {
  const parsed = oplRecord(result.parsed);
  const execution = oplRecord(parsed.app_action_execution);
  const actionResult = oplRecord(execution.result);
  const managedUpdate = oplRecord(actionResult.managed_update);
  const capabilityPackages = oplRecordList(managedUpdate.components).find((component) => {
    const componentId = oplString(component.component_id);
    return componentId === 'opl_packages' || componentId === 'capability_packages';
  });
  if (!capabilityPackages) return false;
  const state = oplString(capabilityPackages.state);
  const statusDetail = oplRecord(capabilityPackages.status_detail);
  const receiptStatusDetail = oplRecord(oplRecord(capabilityPackages.receipt).status_detail);
  return (
    state === 'manual_required' ||
    state === 'skipped_manual_required' ||
    Number(statusDetail.manual_required_targets_count ?? receiptStatusDetail.manual_required_targets_count ?? 0) > 0
  );
}

function HostRouteDetail({ component, t }: { component: ManagedUpdateComponent; t: Translate }) {
  if (component.id !== 'opl_app') return null;
  const routeLines = [
    component.hostUpdateRoute
      ? t('settings.oplEnvironmentPage.updates.hostUpdateRoute', { route: component.hostUpdateRoute })
      : null,
    component.hostUpdateRouteExamples.length > 0
      ? t('settings.oplEnvironmentPage.updates.hostUpdateRouteExamples', {
          value: component.hostUpdateRouteExamples.join(', '),
        })
      : null,
    component.manualGuidance
      ? t('settings.oplEnvironmentPage.updates.manualGuidance', { guidance: component.manualGuidance })
      : null,
    component.dataVolumePreservation
      ? t('settings.oplEnvironmentPage.updates.dataVolumePreservation', {
          value: component.dataVolumePreservation,
        })
      : null,
    component.preservedMounts.length > 0
      ? t('settings.oplEnvironmentPage.updates.preservedMounts', {
          value: component.preservedMounts.join(', '),
        })
      : null,
    component.requiredPreservationEvidence.length > 0
      ? t('settings.oplEnvironmentPage.updates.requiredPreservationEvidence', {
          value: component.requiredPreservationEvidence.join(', '),
        })
      : null,
  ].filter((line): line is string => Boolean(line));
  if (routeLines.length === 0) return null;
  const copyValue = [
    component.hostUpdateRoute,
    component.hostUpdateRouteExamples.join('\n'),
    component.manualGuidance,
    component.dataVolumePreservation,
    component.preservedMounts.join(', '),
    component.requiredPreservationEvidence.join(', '),
  ]
    .filter(Boolean)
    .join('\n');
  const handleCopy = () => {
    void copyText(copyValue)
      .then(() => Message.success(t('common.copySuccess')))
      .catch(() => Message.error(t('common.copyFailed')));
  };
  return (
    <div className='opl-settings-technical-subgroup' data-testid={`opl-managed-update-host-route-${component.id}`}>
      <div className='flex items-center justify-between gap-8px'>
        <Typography.Text className='font-600 text-t-primary break-words'>
          {t('settings.oplEnvironmentPage.updates.hostManualRouteTitle')}
        </Typography.Text>
        <Tooltip content={t('common.copy')}>
          <Button
            size='mini'
            type='text'
            icon={<Copy theme='outline' size='14' />}
            onClick={handleCopy}
            data-testid={`opl-managed-update-copy-host-route-${component.id}`}
          />
        </Tooltip>
      </div>
      <div className='mt-6px flex flex-col gap-4px text-12px text-t-secondary break-words'>
        {routeLines.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </div>
    </div>
  );
}

function dependencyDisplayLabel(dependency: ManagedDependency, t: Translate): string {
  return t(`settings.oplEnvironmentPage.dependencies.items.${dependency.id}`, {
    defaultValue: dependency.id,
  });
}

function dependencyIcon(dependency: Pick<ManagedDependency, 'id'>): React.ReactNode {
  if (dependency.id === 'codex-cli') return <Terminal theme='outline' size='16' />;
  if (dependency.id === 'temporal-runtime') return <Server theme='outline' size='16' />;
  if (dependency.id === 'temporal-system-cli') return <Command theme='outline' size='16' />;
  return <Toolkit theme='outline' size='16' />;
}

const PRIMARY_BASE_DEPENDENCY_IDS = ['codex-cli', 'temporal-runtime', 'temporal-system-cli'] as const;

function normalizedDependencyPath(dependency: ManagedDependency): string | null {
  const normalized = (dependency.realPath ?? dependency.binaryPath)?.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized || null;
}

function dependencyStableKey(dependency: ManagedDependency, fallback: string): string {
  return `${dependency.id}:${normalizedDependencyPath(dependency) ?? fallback}`;
}

function dependencySourceLabel(dependency: ManagedDependency, t: Translate): string {
  const owner = dependency.ownership.toLowerCase();
  if (owner.startsWith('opl_')) return t('settings.oplEnvironmentPage.dependencies.sources.oplManaged');
  if (owner.includes('homebrew')) return t('settings.oplEnvironmentPage.dependencies.sources.homebrew');
  if (owner.includes('global') || owner.includes('system')) {
    return t('settings.oplEnvironmentPage.dependencies.sources.system');
  }
  return t('settings.oplEnvironmentPage.dependencies.sources.detected');
}

function dependencyGuidanceLabel(dependency: ManagedDependency, t: Translate): string {
  if (!dependency.installed && dependency.id === 'temporal-system-cli') {
    return t('settings.oplEnvironmentPage.dependencies.guidance.optional');
  }
  if (dependency.updateMode === 'silent_managed') {
    return t('settings.oplEnvironmentPage.dependencies.guidance.oplManaged');
  }
  if (dependency.updateMode === 'explicit_owner_delegated') {
    return t('settings.oplEnvironmentPage.dependencies.guidance.externalOwner', {
      owner: dependencySourceLabel(dependency, t),
    });
  }
  return t('settings.oplEnvironmentPage.dependencies.guidance.originalInstaller');
}

function BaseDependencySummary({ component, t }: { component?: ManagedUpdateComponent; t: Translate }) {
  if (!component) return null;
  const primaryDependencies =
    component.dependencyCatalog?.dependencies.filter((dependency) => !dependency.external) ?? [];

  return (
    <section
      className='opl-settings-section bg-transparent'
      id='base-dependencies'
      data-testid='settings-maintenance-base-dependency-summary'
    >
      <div className='opl-settings-section__header'>
        <div>
          <Typography.Text className='block font-600 text-t-primary'>
            {t('settings.oplEnvironmentPage.dependencies.summaryTitle')}
          </Typography.Text>
          <Typography.Text className='block text-12px text-t-secondary'>
            {t('settings.oplEnvironmentPage.dependencies.summaryDescription')}
          </Typography.Text>
        </div>
      </div>
      <div className='opl-settings-list'>
        {PRIMARY_BASE_DEPENDENCY_IDS.map((dependencyId) => {
          const dependency = primaryDependencies.find((candidate) => candidate.id === dependencyId);
          const version = dependency?.installed
            ? (dependency.version ?? t('settings.oplEnvironmentPage.status.unknown'))
            : dependency
              ? t('settings.oplEnvironmentPage.dependencies.currentness.missing')
              : t('settings.oplEnvironmentPage.status.unknown');
          const currentness = dependency
            ? t(`settings.oplEnvironmentPage.dependencies.currentness.${dependency.currentness}`, {
                defaultValue: formatStatus(dependency.currentness, t),
              })
            : t('settings.oplEnvironmentPage.status.unknown');
          const attention =
            dependency?.currentness === 'update_available' ||
            (dependency?.currentness === 'missing' && dependency.id !== 'temporal-system-cli');

          return (
            <div
              key={dependencyId}
              className='opl-settings-row'
              data-testid={`opl-base-dependency-summary-${dependencyId}`}
            >
              <div className='opl-settings-row__main flex-row items-start gap-10px'>
                <span className='opl-settings-icon' aria-hidden='true'>
                  {dependencyIcon({ id: dependencyId })}
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary break-words'>
                    {t(`settings.oplEnvironmentPage.dependencies.items.${dependencyId}`)}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.dependencies.version', { value: version })}
                    {dependency
                      ? ` · ${t('settings.oplEnvironmentPage.dependencies.source', {
                          value: dependencySourceLabel(dependency, t),
                        })}`
                      : ''}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {dependency
                      ? dependencyGuidanceLabel(dependency, t)
                      : t('settings.oplEnvironmentPage.dependencies.guidance.notChecked')}
                  </Typography.Text>
                </div>
              </div>
              <div className='opl-settings-row__meta'>
                <Tag color={attention ? 'orange' : 'gray'}>{currentness}</Tag>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function managedComponentIcon(component: ManagedUpdateComponent): React.ReactNode {
  if (component.id === 'opl_app') return <Application theme='outline' size='16' />;
  if (component.id === 'opl_packages') return <Puzzle theme='outline' size='16' />;
  return <Toolkit theme='outline' size='16' />;
}

function BaseDependencyCatalog({
  component,
  busyDependencyId,
  onRequestExternalUpdate,
  t,
}: {
  component: ManagedUpdateComponent;
  busyDependencyId: string | null;
  onRequestExternalUpdate: (dependency: ManagedDependency) => void;
  t: Translate;
}) {
  const catalog = component.dependencyCatalog;
  if (!catalog || catalog.dependencies.length === 0) return null;

  const primaryDependencies = catalog.dependencies.filter((dependency) => !dependency.external);
  const orphanExternalDependencies = catalog.dependencies.filter(
    (dependency) => dependency.external && !primaryDependencies.some((primary) => primary.id === dependency.parentId)
  );

  const renderDependencyRow = (dependency: ManagedDependency, rowId: string, externalInstallation: boolean) => {
    const canDelegateUpdate =
      dependency.updateMode === 'explicit_owner_delegated' &&
      Boolean(dependency.updateAction) &&
      dependency.updateAction?.surface === 'opl app action execute' &&
      dependency.updateAction?.payloadFields.length === 0 &&
      dependency.updateAction?.confirmationRequired === true &&
      dependency.updateAction?.autoApplyAllowed === false;
    const versionDetail =
      dependency.latestVersion && dependency.latestVersion !== dependency.version
        ? `${dependency.version ?? t('settings.oplEnvironmentPage.status.unknown')} -> ${dependency.latestVersion}`
        : (dependency.version ?? t('settings.oplEnvironmentPage.status.unknown'));
    const displayLabel =
      externalInstallation && dependency.binaryPath ? dependency.binaryPath : dependencyDisplayLabel(dependency, t);

    return (
      <div
        key={dependencyStableKey(dependency, rowId)}
        className='opl-settings-row'
        data-testid={`opl-base-dependency-${rowId}`}
      >
        <div className='opl-settings-row__main flex-row items-start gap-10px'>
          <span className='opl-settings-icon' aria-hidden='true'>
            {dependencyIcon(dependency)}
          </span>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-6px'>
              <Typography.Text className='font-600 text-t-primary break-words'>{displayLabel}</Typography.Text>
              {externalInstallation && <Tag>{t('settings.oplEnvironmentPage.dependencies.external')}</Tag>}
            </div>
            {!externalInstallation && dependency.binaryPath && (
              <Typography.Text className='block text-12px text-t-secondary break-all'>
                {t('settings.oplEnvironmentPage.dependencies.path', { value: dependency.binaryPath })}
              </Typography.Text>
            )}
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.dependencies.version', { value: versionDetail })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.dependencies.ownership', { value: dependency.ownership })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t(`settings.oplEnvironmentPage.dependencies.updateModes.${dependency.updateMode}`)}
            </Typography.Text>
            {dependency.guidance && (
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {dependency.guidance}
              </Typography.Text>
            )}
          </div>
        </div>
        <div className='opl-settings-row__meta'>
          <Tag
            color={
              dependency.currentness === 'update_available' || dependency.currentness === 'missing' ? 'orange' : 'gray'
            }
          >
            {t(`settings.oplEnvironmentPage.dependencies.currentness.${dependency.currentness}`, {
              defaultValue: formatStatus(dependency.currentness, t),
            })}
          </Tag>
          {canDelegateUpdate && dependency.currentness === 'update_available' && (
            <Button
              size='small'
              loading={busyDependencyId === dependency.id}
              disabled={Boolean(busyDependencyId)}
              onClick={() => onRequestExternalUpdate(dependency)}
              data-testid={`opl-base-dependency-update-${rowId}`}
            >
              {dependency.updateAction?.label ?? t('settings.oplEnvironmentPage.dependencies.actions.updateViaOwner')}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className='opl-settings-technical-subgroup opl-settings-flat-tools'
      id='managed-dependencies'
      data-testid='settings-maintenance-managed-dependencies'
    >
      <span data-testid='opl-base-dependency-catalog' aria-hidden='true' />
      <div className='opl-settings-section__header'>
        <div>
          <Typography.Text className='block font-600 text-t-primary'>
            {t('settings.oplEnvironmentPage.dependencies.title')}
          </Typography.Text>
          <Typography.Text className='block text-12px text-t-secondary'>
            {t('settings.oplEnvironmentPage.dependencies.description')}
          </Typography.Text>
        </div>
      </div>
      <div className='opl-settings-list'>
        {primaryDependencies.map((dependency) => {
          const rowId = dependency.id.replace(/[^a-z0-9-]/gi, '-');
          const externalInstallations = catalog.dependencies.filter(
            (candidate) => candidate.external && candidate.parentId === dependency.id
          );
          return (
            <React.Fragment key={dependencyStableKey(dependency, rowId)}>
              {renderDependencyRow(dependency, rowId, false)}
              {externalInstallations.length > 0 && (
                <Collapse bordered={false} data-testid={`opl-base-dependency-other-installations-${rowId}`}>
                  <Collapse.Item
                    header={t('settings.oplEnvironmentPage.dependencies.otherInstallations', {
                      count: externalInstallations.length,
                    })}
                    name={`external-installations-${rowId}`}
                  >
                    <div className='opl-settings-list'>
                      {externalInstallations.map((externalDependency, index) =>
                        renderDependencyRow(externalDependency, `${rowId}-external-${index + 1}`, true)
                      )}
                    </div>
                  </Collapse.Item>
                </Collapse>
              )}
            </React.Fragment>
          );
        })}
        {orphanExternalDependencies.map((dependency, index) =>
          renderDependencyRow(
            dependency,
            `${dependency.id.replace(/[^a-z0-9-]/gi, '-')}-external-orphan-${index + 1}`,
            true
          )
        )}
      </div>
    </div>
  );
}

function PostUpdateNotice({
  maintenance,
  plane,
  t,
}: {
  maintenance: ManagedUpdateMaintenanceSnapshot;
  plane: ManagedUpdatePlane;
  t: Translate;
}) {
  const action = maintenance.lastAction;
  if (!action) return null;

  const actionComponentIds = action.componentIds ?? [action.componentId];
  const actionComponents = actionComponentIds
    .map((componentId) => plane.components.find((entry) => entry.id === componentId))
    .filter((component): component is ManagedUpdateComponent => Boolean(component));
  const component = actionComponents[0];
  const componentLabel = actionComponents.map((entry) => componentDisplayLabel(entry, t)).join(', ');
  const reloadGuidance = action.reloadGuidance ?? maintenance.reloadGuidance ?? component?.reloadGuidance;
  const receiptRef = action.receiptRef ?? component?.receiptRef ?? component?.repairReceiptId;
  const statusKey =
    action.status === 'failed'
      ? 'settings.oplEnvironmentPage.updates.postAction.failed'
      : action.status === 'skipped'
        ? 'settings.oplEnvironmentPage.updates.postAction.skipped'
        : 'settings.oplEnvironmentPage.updates.postAction.completed';

  return (
    <Alert
      type={action.status === 'failed' ? 'error' : 'info'}
      data-testid='opl-managed-update-post-action-notice'
      title={t('settings.oplEnvironmentPage.updates.postAction.title')}
      content={
        <div className='flex flex-col gap-6px'>
          <span className='break-words'>
            {t(statusKey, {
              action: mutationKindLabel(action.kind, t),
              component: componentLabel,
            })}
          </span>
          {receiptRef && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.receiptRef', { ref: receiptRef })}
            </span>
          )}
          {maintenance.nextRunAt && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.nextCheck', { value: maintenance.nextRunAt })}
            </span>
          )}
          {reloadGuidance ? (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.reloadGuidance', { guidance: reloadGuidance })}
            </span>
          ) : maintenance.restartRequired ? (
            <span className='break-words'>{t('settings.oplEnvironmentPage.updates.userSummaries.needsRestart')}</span>
          ) : action.status === 'completed' ? (
            <span className='break-words'>{t('settings.oplEnvironmentPage.updates.postAction.noReloadGuidance')}</span>
          ) : null}
        </div>
      }
    />
  );
}

function ManagedUpdatesPanel({
  plane,
  maintenance,
  maintenanceOperationBusy,
  activeReadOperation,
  pendingAction,
  onRefresh,
  onCheck,
  onPlan,
  onRequestAction,
  onCancelAction,
  onConfirmAction,
  busyDependencyId,
  onRequestExternalUpdate,
  t,
}: {
  plane: ManagedUpdatePlane;
  maintenance: ManagedUpdateMaintenanceSnapshot;
  maintenanceOperationBusy: boolean;
  activeReadOperation: 'status' | 'check' | 'plan' | null;
  pendingAction: PendingUpdateAction;
  onRefresh: () => void;
  onCheck: () => void;
  onPlan: () => void;
  onRequestAction: (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
  busyDependencyId: string | null;
  onRequestExternalUpdate: (dependency: ManagedDependency) => void;
  t: Translate;
}) {
  const refreshLoading = activeReadOperation === 'status';
  const checkLoading = activeReadOperation === 'check';
  const planLoading = activeReadOperation === 'plan';
  const busyAction = maintenance.busyAction;
  const recommendedAction = findRecommendedUpdateAction(plane.components);
  const recommendedActionLoading =
    recommendedAction.kind === 'check'
      ? checkLoading
      : Boolean(
          recommendedAction.component && busyAction === `${recommendedAction.kind}:${recommendedAction.component.id}`
        );
  const recommendedActionDisabled =
    maintenanceOperationBusy ||
    (recommendedAction.kind === 'check'
      ? Boolean(activeReadOperation && activeReadOperation !== 'check')
      : Boolean(activeReadOperation));
  const runRecommendedAction = () => {
    if (recommendedAction.kind === 'repair' && recommendedAction.component) {
      onRequestAction('repair', recommendedAction.component);
      return;
    }
    if (recommendedAction.kind === 'apply' && recommendedAction.component) {
      onRequestAction('apply', recommendedAction.component);
      return;
    }
    onCheck();
  };
  const showDiagnostics =
    Boolean(plane.lockStatus) ||
    Boolean(plane.operationMode) ||
    maintenance.executionStatus !== 'idle' ||
    Boolean(maintenance.lastAction) ||
    Boolean(maintenance.lastSkipReason) ||
    Boolean(maintenance.reloadGuidance);

  return (
    <div className='opl-settings-technical-group' data-testid='opl-managed-updates'>
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
            </Space>
          </div>
          <Space wrap>
            <Button
              type='primary'
              data-testid='opl-managed-update-recommended-action'
              loading={recommendedActionLoading}
              disabled={recommendedActionDisabled}
              onClick={runRecommendedAction}
            >
              {recommendedAction.kind === 'repair'
                ? t('settings.oplEnvironmentPage.updates.actions.recommendedRepair')
                : recommendedAction.kind === 'apply'
                  ? t('settings.oplEnvironmentPage.updates.actions.recommendedApply')
                  : t('settings.oplEnvironmentPage.updates.actions.recommendedCheck')}
            </Button>
            <OplRefreshIconButton
              data-testid='opl-managed-update-refresh'
              label={t('settings.oplEnvironmentPage.updates.actions.refreshStatus')}
              loading={refreshLoading}
              disabled={maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'status')}
              onClick={onRefresh}
            />
          </Space>
        </div>

        <PostUpdateNotice maintenance={maintenance} plane={plane} t={t} />

        {plane.summary && <Alert type='info' content={plane.summary} />}
        {plane.reloadGuidance && <Alert type='info' content={plane.reloadGuidance} />}

        {pendingAction && (
          <Alert
            type={pendingAction.kind === 'apply' ? 'warning' : 'info'}
            data-testid='opl-managed-update-confirmation'
            title={t('settings.updateConfirm')}
            content={
              <div className='flex flex-col gap-8px'>
                <span className='break-words'>
                  {mutationKindLabel(pendingAction.kind, t)} · {componentDisplayLabel(pendingAction.component, t)}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.confirmation.willChange', {
                    detail: mutationWillChange(pendingAction.kind, pendingAction.component, t),
                  })}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.confirmation.willNotChange', {
                    detail: mutationWillNotChange(pendingAction.kind, t),
                  })}
                </span>
                <span className='break-words'>{rollbackOrReceiptText(pendingAction.component, t)}</span>
                <Space wrap size='small'>
                  <Button size='small' onClick={onCancelAction}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size='small'
                    type='primary'
                    status={pendingAction.kind === 'rollback' ? 'danger' : undefined}
                    loading={busyAction === `${pendingAction.kind}:${pendingAction.component.id}`}
                    disabled={maintenanceOperationBusy}
                    onClick={onConfirmAction}
                  >
                    {pendingAction.kind === 'repair'
                      ? t('settings.oplEnvironmentPage.updates.actions.repair')
                      : pendingAction.kind === 'rollback'
                        ? t('settings.oplEnvironmentPage.updates.actions.rollback')
                        : t('settings.oplEnvironmentPage.updates.actions.applyUpdate')}
                  </Button>
                </Space>
              </div>
            }
          />
        )}

        <div className='opl-settings-list border-0 border-t border-solid border-border-1'>
          {plane.components.map((component) => (
            <div
              key={component.id}
              className='opl-settings-row items-start'
              data-testid={`opl-managed-update-${component.id}`}
            >
              <div className='opl-settings-row__main flex-row items-start gap-10px'>
                <span className='opl-settings-icon' aria-hidden='true'>
                  {managedComponentIcon(component)}
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary break-words'>
                    {componentDisplayLabel(component, t)}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {componentUserSummary(component, t)}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.updates.nextStep', {
                      action: updateComponentUserAction(component, t),
                    })}
                  </Typography.Text>
                  <HostRouteDetail component={component} t={t} />
                  {(component.conditions.length > 0 ||
                    component.substatuses.length > 0 ||
                    component.receiptRef ||
                    component.repairAction ||
                    component.rollbackRef ||
                    component.reloadGuidance ||
                    component.manualGuidance ||
                    component.hostUpdateRoute ||
                    component.dataVolumePreservation ||
                    component.preservedMounts.length > 0 ||
                    component.requiredPreservationEvidence.length > 0 ||
                    Boolean(component.dependencyCatalog)) && (
                    <Collapse className='mt-6px' bordered={false}>
                      <Collapse.Item
                        header={t('settings.oplEnvironmentPage.updates.diagnostics.componentDetails')}
                        name={`component-${component.id}`}
                      >
                        <div className='flex flex-col gap-6px text-12px text-t-secondary break-words'>
                          {component.substatuses.map((substatus) => (
                            <div key={substatus.id} data-testid={`opl-managed-update-substatus-${substatus.id}`}>
                              <Tag size='small'>{formatStatus(substatus.state, t)}</Tag>
                              <span className='ml-6px font-500 text-t-primary'>
                                {t(`settings.oplEnvironmentPage.updates.substatuses.${substatus.id}`)}
                              </span>
                              {substatus.summary && <span className='ml-6px'>{substatus.summary}</span>}
                            </div>
                          ))}
                          {component.conditions.map((condition) => (
                            <div key={condition.id}>
                              <Tag size='small'>{condition.status}</Tag>
                              <span className='ml-6px font-500 text-t-primary'>{condition.type}</span>
                              {condition.reason && <span className='ml-6px'>{condition.reason}</span>}
                              {condition.message && <span className='ml-6px'>{condition.message}</span>}
                            </div>
                          ))}
                          {component.receiptRef && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.receiptRef', { ref: component.receiptRef })}
                            </span>
                          )}
                          {component.repairAction && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.repairAction', {
                                action: component.repairAction,
                              })}
                            </span>
                          )}
                          {component.rollbackRef && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.rollbackRef', { ref: component.rollbackRef })}
                            </span>
                          )}
                          {component.needsRestart && (
                            <span>{t('settings.oplEnvironmentPage.updates.needsRestart')}</span>
                          )}
                          {component.needsReload && <span>{t('settings.oplEnvironmentPage.updates.needsReload')}</span>}
                          {component.reloadGuidance && <span>{component.reloadGuidance}</span>}
                          {component.manualGuidance && <span>{component.manualGuidance}</span>}
                          {component.hostUpdateRoute && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.hostUpdateRoute', {
                                route: component.hostUpdateRoute,
                              })}
                            </span>
                          )}
                          {component.dataVolumePreservation && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.dataVolumePreservation', {
                                value: component.dataVolumePreservation,
                              })}
                            </span>
                          )}
                          {component.preservedMounts.length > 0 && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.preservedMounts', {
                                value: component.preservedMounts.join(', '),
                              })}
                            </span>
                          )}
                          {component.requiredPreservationEvidence.length > 0 && (
                            <span>
                              {t('settings.oplEnvironmentPage.updates.requiredPreservationEvidence', {
                                value: component.requiredPreservationEvidence.join(', '),
                              })}
                            </span>
                          )}
                          {component.id === 'opl_base' && (
                            <BaseDependencyCatalog
                              component={component}
                              busyDependencyId={busyDependencyId}
                              onRequestExternalUpdate={onRequestExternalUpdate}
                              t={t}
                            />
                          )}
                        </div>
                      </Collapse.Item>
                    </Collapse>
                  )}
                </div>
              </div>
              <div className='opl-settings-row__meta'>
                <Tag color={componentStatusTone(component)}>{formatStatus(component.state, t)}</Tag>
                <Space wrap size='small'>
                  {componentApplyAllowed(component) && (
                    <Button
                      data-testid={`opl-managed-update-apply-${component.id}`}
                      size='small'
                      type='primary'
                      loading={busyAction === `apply:${component.id}`}
                      disabled={maintenanceOperationBusy}
                      onClick={() => onRequestAction('apply', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.applyUpdate')}
                    </Button>
                  )}
                  {component.repairAllowed && (
                    <Button
                      data-testid={`opl-managed-update-repair-${component.id}`}
                      size='small'
                      loading={busyAction === `repair:${component.id}`}
                      disabled={maintenanceOperationBusy}
                      onClick={() => onRequestAction('repair', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.repair')}
                    </Button>
                  )}
                  {component.rollbackAllowed && (
                    <Button
                      data-testid={`opl-managed-update-rollback-${component.id}`}
                      size='small'
                      loading={busyAction === `rollback:${component.id}`}
                      disabled={maintenanceOperationBusy}
                      onClick={() => onRequestAction('rollback', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.rollback')}
                    </Button>
                  )}
                </Space>
              </div>
            </div>
          ))}
        </div>
        <Collapse bordered={false}>
          <Collapse.Item
            header={t('settings.oplEnvironmentPage.updates.advancedActions')}
            name='managed-update-advanced-actions'
          >
            <Space wrap>
              <Tooltip content={updateReadActionHelp('check', t)}>
                <Button
                  data-testid='opl-managed-update-check'
                  loading={checkLoading}
                  disabled={maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'check')}
                  onClick={onCheck}
                >
                  {t('settings.oplEnvironmentPage.updates.actions.check')}
                </Button>
              </Tooltip>
              <Tooltip content={updateReadActionHelp('plan', t)}>
                <Button
                  data-testid='opl-managed-update-plan'
                  loading={planLoading}
                  disabled={maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'plan')}
                  onClick={onPlan}
                >
                  {t('settings.oplEnvironmentPage.updates.actions.previewChanges')}
                </Button>
              </Tooltip>
            </Space>
          </Collapse.Item>
        </Collapse>
        {showDiagnostics && (
          <Collapse bordered={false}>
            <Collapse.Item
              header={t('settings.oplEnvironmentPage.updates.diagnostics.title')}
              name='managed-update-diagnostics'
            >
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
                {plane.lockStatus && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.lockStatus', { status: plane.lockStatus })}
                  </span>
                )}
                {plane.operationMode && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.operationMode', { mode: plane.operationMode })}
                  </span>
                )}
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.background.lastFailure', {
                    value: maintenance.lastFailure ?? t('settings.oplEnvironmentPage.updates.background.noFailure'),
                  })}
                </span>
                {maintenance.executionStatus !== 'idle' && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.executionStatus', {
                      status: maintenance.executionStatus,
                    })}
                  </span>
                )}
                {maintenance.lastAction && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.background.lastAction', {
                      action: maintenance.lastAction.kind,
                      componentId: (maintenance.lastAction.componentIds ?? [maintenance.lastAction.componentId]).join(
                        ', '
                      ),
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
            </Collapse.Item>
          </Collapse>
        )}
      </div>
    </div>
  );
}

const RuntimeSettings: React.FC<RuntimeSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const [activeReadOperation, setActiveReadOperation] = React.useState<'status' | 'check' | 'plan' | null>(null);
  const [maintenanceHubCheckTarget, setMaintenanceHubCheckTarget] = React.useState<'oplBase' | 'oplPackages' | null>(
    null
  );
  const [makeUsableRunning, setMakeUsableRunning] = React.useState(false);
  const [makeUsableConfirmationOpen, setMakeUsableConfirmationOpen] = React.useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = React.useState(maintenanceDiagnosticsRequested);
  const [updateChannelSaving, setUpdateChannelSaving] = React.useState(false);
  const [pendingUpdateAction, setPendingUpdateAction] = React.useState<PendingUpdateAction>(null);
  const [busyDependencyId, setBusyDependencyId] = React.useState<string | null>(null);
  const [busyTemporalActionId, setBusyTemporalActionId] = React.useState<TemporalMaintenanceActionId | null>(null);
  const [temporalActionEvidence, setTemporalActionEvidence] = React.useState<TemporalMaintenanceEvidence | null>(null);
  const [temporalSchedulerStatus, setTemporalSchedulerStatus] = React.useState<string | null>(null);
  const [temporalWorkerMutationGuard, setTemporalWorkerMutationGuard] = React.useState<string | null>(null);
  const [temporalServerReachable, setTemporalServerReachable] = React.useState<boolean | null>(null);
  const [maintenanceOperationRunning, setMaintenanceOperationRunning] = React.useState(false);
  const maintenanceOperationLockRef = useRef(false);

  React.useEffect(() => {
    const openRequestedDiagnostics = () => {
      if (maintenanceDiagnosticsRequested()) setDiagnosticsVisible(true);
    };
    window.addEventListener('hashchange', openRequestedDiagnostics);
    return () => window.removeEventListener('hashchange', openRequestedDiagnostics);
  }, []);
  const appStateQuery = useOplAppState('fast');
  const desktopAutoUpdateState = useDesktopAutoUpdateStatus();
  const desktopAutoUpdate = useMemo(
    () => projectDesktopAutoUpdateStatus(desktopAutoUpdateState.supported, desktopAutoUpdateState.status, t),
    [desktopAutoUpdateState.status, desktopAutoUpdateState.supported, t]
  );
  const managedUpdateMaintenance = useManagedUpdateMaintenance();
  const managedUpdateRunningRef = useRef(managedUpdateMaintenance.running);
  managedUpdateRunningRef.current = managedUpdateMaintenance.running;

  const beginMaintenanceOperation = useCallback(() => {
    if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return false;
    maintenanceOperationLockRef.current = true;
    setMaintenanceOperationRunning(true);
    return true;
  }, []);

  const finishMaintenanceOperation = useCallback(() => {
    maintenanceOperationLockRef.current = false;
    setMaintenanceOperationRunning(false);
  }, []);

  React.useEffect(() => {
    messageRef.current = message;
    tRef.current = t;
  }, [message, t]);

  const appState = appStateQuery.appState;
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const configurationCatalog = oplRecord(settingsControlCenter.configuration_catalog);
  const configurationItems = oplRecordList(configurationCatalog.items);
  const updateChannelConfiguration = configurationItems.find(
    (item) => oplString(item.configuration_id) === 'update_channel'
  );
  const updateChannelActionId = oplString(updateChannelConfiguration?.action_id);
  const updateChannelValue = oplString(updateChannelConfiguration?.current_value) ?? 'stable';
  const updateChannelOptions = Array.isArray(updateChannelConfiguration?.allowed_values)
    ? updateChannelConfiguration.allowed_values
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => ({
          value,
          label: t(`settings.oplEnvironmentPage.updateChannel.values.${value}`, { defaultValue: value }),
        }))
    : [];
  const managedUpdatePlane = useMemo(
    () => readManagedUpdatePlane(managedUpdateMaintenance.result?.parsed, appState),
    [appState, managedUpdateMaintenance.result]
  );

  const runManagedUpdateRead = useCallback(
    async (operation: 'status' | 'check' | 'plan', manual = true) => {
      if (!beginMaintenanceOperation()) return;
      if (manual) setActiveReadOperation(operation);
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
      } finally {
        if (manual) setActiveReadOperation(null);
        finishMaintenanceOperation();
      }
    },
    [beginMaintenanceOperation, finishMaintenanceOperation]
  );

  const updateUpdateChannel = useCallback(
    async (channel: string) => {
      if (!updateChannelActionId || channel === updateChannelValue) return;
      setUpdateChannelSaving(true);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: updateChannelActionId,
          dryRun: false,
          payloadRefsOnlyJson: { channel },
        });
        if (!bridgeResultSucceeded(result)) {
          messageRef.current.error(
            result?.error?.message || tRef.current('settings.oplEnvironmentPage.messages.commandFailed')
          );
          return;
        }
        await appStateQuery.load('fast', { showRefreshing: true });
        messageRef.current.success(
          tRef.current('settings.oplEnvironmentPage.updateChannel.saved', {
            defaultValue: 'Update channel saved.',
          })
        );
      } catch {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      } finally {
        setUpdateChannelSaving(false);
      }
    },
    [appStateQuery, updateChannelActionId, updateChannelValue]
  );

  const runMaintenanceHubCheck = useCallback(
    async (target: 'oplBase' | 'oplPackages') => {
      if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
      if (target === 'oplPackages') {
        if (!beginMaintenanceOperation()) return;
        setMaintenanceHubCheckTarget('oplPackages');
        try {
          const result = await ipcBridge.oplRuntime.executeAction.invoke({
            actionId: 'settings_sync_capabilities',
            dryRun: false,
          });
          if (!bridgeResultSucceeded(result)) {
            messageRef.current.error(
              result?.error?.message || tRef.current('settings.oplEnvironmentPage.messages.commandFailed')
            );
            return;
          }
          await appStateQuery.load('fast', { showRefreshing: true });
          if (capabilitySyncNeedsManualHandling(result)) {
            messageRef.current.warning(
              tRef.current('settings.oplEnvironmentPage.updates.messages.capabilitySyncManualRequired')
            );
          } else {
            messageRef.current.success(
              tRef.current('settings.oplEnvironmentPage.updates.messages.capabilitySyncComplete')
            );
          }
        } catch {
          messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
        } finally {
          setMaintenanceHubCheckTarget(null);
          finishMaintenanceOperation();
        }
        return;
      }
      setMaintenanceHubCheckTarget(target);
      try {
        await runManagedUpdateRead('check');
      } finally {
        setMaintenanceHubCheckTarget(null);
      }
    },
    [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation, runManagedUpdateRead]
  );

  const runManagedUpdateMutation = useCallback(
    async (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => {
      if (!beginMaintenanceOperation()) return;
      try {
        const translate = tRef.current;
        const result = await executeManagedUpdateMutation(kind, {
          componentId: component.id,
          packageId: component.packageId,
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
      } finally {
        finishMaintenanceOperation();
      }
    },
    [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation]
  );

  const runMakeOplUsable = useCallback(async () => {
    if (!beginMaintenanceOperation()) return;
    setMakeUsableConfirmationOpen(false);
    setMakeUsableRunning(true);
    try {
      const translate = tRef.current;
      const repairResult = await runSettingsControlPlaneAction('repair');
      if (!bridgeResultSucceeded(repairResult)) {
        messageRef.current.error(
          repairResult?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }

      await appStateQuery.load('fast', { showRefreshing: true });
      messageRef.current.success(translate('settings.oplEnvironmentPage.maintenanceHub.makeUsable.complete'));
    } catch {
      messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setMakeUsableRunning(false);
      finishMaintenanceOperation();
    }
  }, [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation]);

  const requestMakeOplUsable = useCallback(() => {
    if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
    setMakeUsableConfirmationOpen(true);
  }, []);

  const cancelMakeOplUsable = useCallback(() => {
    setMakeUsableConfirmationOpen(false);
  }, []);

  const requestManagedUpdateAction = useCallback(
    (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => {
      if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
      setPendingUpdateAction({ kind, component });
    },
    []
  );

  const cancelManagedUpdateAction = useCallback(() => {
    setPendingUpdateAction(null);
  }, []);

  const confirmManagedUpdateAction = useCallback(() => {
    if (!pendingUpdateAction || maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
    const action = pendingUpdateAction;
    setPendingUpdateAction(null);
    void runManagedUpdateMutation(action.kind, action.component);
  }, [pendingUpdateAction, runManagedUpdateMutation]);

  const requestExternalDependencyUpdate = useCallback(
    (dependency: ManagedDependency) => {
      const action = dependency.updateAction;
      if (
        !action ||
        dependency.updateMode !== 'explicit_owner_delegated' ||
        action.surface !== 'opl app action execute' ||
        action.payloadFields.length > 0 ||
        !action.confirmationRequired ||
        action.autoApplyAllowed ||
        busyDependencyId
      ) {
        return;
      }
      Modal.confirm({
        title: t('settings.oplEnvironmentPage.dependencies.confirmation.title', {
          name: dependencyDisplayLabel(dependency, t),
        }),
        content: t('settings.oplEnvironmentPage.dependencies.confirmation.description', {
          owner: action.ownerKind ?? dependency.ownership,
        }),
        okText: action.label ?? t('settings.oplEnvironmentPage.dependencies.actions.updateViaOwner'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          setBusyDependencyId(dependency.id);
          try {
            const result = await ipcBridge.oplRuntime.executeAction.invoke({
              actionId: action.actionId,
              dryRun: false,
            });
            if (!bridgeResultSucceeded(result)) {
              throw new Error(result?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
            }
            await executeManagedUpdateRead('status', { trigger: 'manual_refresh_status' });
            await appStateQuery.load('fast', { showRefreshing: true });
            message.success(t('settings.oplEnvironmentPage.dependencies.messages.ownerUpdateComplete'));
          } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
            throw error;
          } finally {
            setBusyDependencyId(null);
          }
        },
      });
    },
    [appStateQuery.load, busyDependencyId, message, t]
  );

  const runSettingsAppAction = useCallback(
    async (actionId: SettingsAppActionId, successText: string) => {
      if (!beginMaintenanceOperation()) return;
      try {
        const result = await runSettingsControlPlaneAction(actionId);
        if (bridgeResultSucceeded(result)) {
          message.success(successText);
          await appStateQuery.load('fast', { showRefreshing: true });
        } else {
          message.error(result?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } catch {
        message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
      } finally {
        finishMaintenanceOperation();
      }
    },
    [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation, message, t]
  );

  const runTemporalMaintenanceAction = useCallback(
    async (actionId: TemporalMaintenanceActionId) => {
      if (!beginMaintenanceOperation()) return;
      setBusyTemporalActionId(actionId);
      const actionStartedAtMs = Date.now();
      const completedAt = () => new Date().toLocaleTimeString();
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({ actionId, dryRun: false });
        if (!bridgeResultSucceeded(result)) {
          setTemporalActionEvidence({ actionId, outcome: 'failed', observedAt: completedAt() });
          message.error(t('settings.oplEnvironmentPage.temporal.messages.actionFailed'));
          return;
        }

        const actionFailure = temporalActionFailure(result);
        const workerGuardStatus = nestedStringForKeys(result.parsed, new Set(['mutation_guard_status']));
        const schedulerStatus = temporalSchedulerStatusFromResult(result);
        const serviceReachable = nestedBooleanForKeys(result.parsed, new Set(['service_ready', 'server_reachable']));
        if (workerGuardStatus) setTemporalWorkerMutationGuard(workerGuardStatus);
        if (schedulerStatus) setTemporalSchedulerStatus(schedulerStatus);
        if (serviceReachable !== null) setTemporalServerReachable(serviceReachable);

        if (actionFailure) {
          setTemporalActionEvidence({ actionId, outcome: actionFailure, observedAt: completedAt() });
          message.error(
            t(
              actionFailure === 'blocked'
                ? 'settings.oplEnvironmentPage.temporal.messages.actionBlocked'
                : 'settings.oplEnvironmentPage.temporal.messages.actionFailed'
            )
          );
          return;
        }

        const requiresPostcondition = TEMPORAL_POSTCONDITION_ACTION_IDS.has(actionId);
        const freshPayload = await appStateQuery.load('fast', {
          showRefreshing: true,
          forceFresh: true,
        });
        const freshAppState = getAppState(freshPayload);

        if (!freshPayload || !temporalReadbackGeneratedAfterAction(freshAppState, actionStartedAtMs)) {
          setTemporalActionEvidence({ actionId, outcome: 'failed', observedAt: completedAt() });
          message.error(t('settings.oplEnvironmentPage.temporal.messages.readbackFailed'));
          return;
        }
        const freshSnapshot = temporalMaintenanceSnapshot(
          freshAppState,
          schedulerStatus,
          workerGuardStatus,
          serviceReachable
        );
        const readbackObservedAt = temporalReadbackObservedAt(freshAppState);
        if (!temporalSnapshotHasNoErrors(freshSnapshot)) {
          setTemporalActionEvidence({ actionId, outcome: 'failed', observedAt: readbackObservedAt });
          message.error(t('settings.oplEnvironmentPage.temporal.messages.componentError'));
          return;
        }
        if (requiresPostcondition && !temporalPostconditionSatisfied(actionId, freshSnapshot)) {
          setTemporalActionEvidence({ actionId, outcome: 'failed', observedAt: readbackObservedAt });
          message.error(t('settings.oplEnvironmentPage.temporal.messages.postconditionFailed'));
          return;
        }

        const readNeedsAttention =
          (actionId === 'provider_service_status' &&
            (freshSnapshot.serviceReady !== true ||
              (freshSnapshot.serviceSupervisorRequired && freshSnapshot.serviceSupervisorReady !== true))) ||
          (actionId === 'provider_worker_status' &&
            (!freshSnapshot.workerReady ||
              freshSnapshot.workerMutationGuardStatus === 'blocked_developer_checkout_shared_state')) ||
          (actionId === 'provider_scheduler_status' && freshSnapshot.schedulerReady !== true);
        if (readNeedsAttention) {
          setTemporalActionEvidence({ actionId, outcome: 'needsAttention', observedAt: readbackObservedAt });
          message.warning(t('settings.oplEnvironmentPage.temporal.messages.needsAttention'));
          return;
        }

        if (requiresPostcondition && !freshSnapshot.ready) {
          setTemporalActionEvidence({ actionId, outcome: 'needsAttention', observedAt: readbackObservedAt });
          message.warning(t('settings.oplEnvironmentPage.temporal.messages.needsAttention'));
          return;
        }

        setTemporalActionEvidence({
          actionId,
          outcome: actionId.endsWith('_status') ? 'checked' : 'completed',
          observedAt: readbackObservedAt,
        });
        message.success(t('settings.oplEnvironmentPage.temporal.messages.actionComplete'));
      } catch {
        setTemporalActionEvidence({ actionId, outcome: 'failed', observedAt: completedAt() });
        message.error(t('settings.oplEnvironmentPage.temporal.messages.actionFailed'));
      } finally {
        setBusyTemporalActionId(null);
        finishMaintenanceOperation();
      }
    },
    [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation, message, t]
  );

  const openUpdateModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'settings-runtime' } }));
  }, []);

  const openTemporalWorkerSourceSettings = useCallback(() => {
    window.location.hash = '#/settings/agents?section=source';
  }, []);

  const viewModel = useMemo(
    () =>
      buildRuntimeSettingsViewModel({
        appState,
        managedUpdatePlane,
        managedUpdateMaintenance,
        desktopAutoUpdate,
        loadedAt: appStateQuery.loadedAt,
        activeReadOperation,
        maintenanceHubCheckTarget,
        makeUsableRunning,
        actions: {
          openUpdateModal,
          runMaintenanceHubCheck,
          runMakeOplUsable: requestMakeOplUsable,
          runServiceCheck: () =>
            void runSettingsAppAction('doctor', t('settings.oplEnvironmentPage.messages.doctorComplete')),
        },
        t,
      }),
    [
      activeReadOperation,
      appState,
      appStateQuery.loadedAt,
      desktopAutoUpdate,
      maintenanceHubCheckTarget,
      makeUsableRunning,
      managedUpdateMaintenance,
      managedUpdatePlane,
      openUpdateModal,
      requestMakeOplUsable,
      runMaintenanceHubCheck,
      runSettingsAppAction,
      t,
    ]
  );
  const {
    environment: {
      familyWorkspaceRoot,
      workspaceRoot,
      logsRoot,
      modulesSourceMode,
      modulesRoot,
      modules,
      healthSummaryItems,
      oplBaseComponent,
    },
    maintenanceHubItems,
  } = viewModel;
  const developerSourceActive =
    Boolean(modulesSourceMode && DEVELOPER_SOURCE_MODES.has(modulesSourceMode)) ||
    modules.some((module) => {
      const source = moduleSource(module);
      return Boolean(source && DEVELOPER_SOURCE_MODES.has(source));
    });
  const dirtyCheckoutActive = modules.some((module) => {
    const git = oplRecord(module.git);
    return (
      moduleStatus(module) === 'dirty' ||
      isTruthyFlag(module.checkout_dirty) ||
      isTruthyFlag(module.working_tree_dirty) ||
      isTruthyFlag(git.dirty)
    );
  });
  const maintenanceNeedsAction =
    healthSummaryItems.some((item) => item.tone === 'orange') ||
    maintenanceHubItems.some((item) => item.tone === 'orange');
  const maintenanceOperationBusy = maintenanceOperationRunning || managedUpdateMaintenance.running;
  const temporalActions = useMemo(() => temporalMaintenanceActions(appState), [appState]);
  const temporalSnapshot = useMemo(
    () =>
      temporalMaintenanceSnapshot(
        appState,
        temporalSchedulerStatus,
        temporalWorkerMutationGuard,
        temporalServerReachable
      ),
    [appState, temporalSchedulerStatus, temporalServerReachable, temporalWorkerMutationGuard]
  );
  const requestTemporalWorkerDependencyRepair = useCallback(() => {
    if (oplBaseComponent?.repairAllowed) {
      requestManagedUpdateAction('repair', oplBaseComponent);
      return;
    }
    requestMakeOplUsable();
  }, [oplBaseComponent, requestMakeOplUsable, requestManagedUpdateAction]);

  const openLogDir = useCallback(() => {
    if (!logsRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: logsRoot, tool: 'explorer' });
  }, [logsRoot]);

  const content = (
    <>
      {contextHolder}
      <div className='opl-settings-page' data-testid='settings-page-maintenance'>
        <header className='opl-settings-page-header'>
          <div className='opl-settings-page-header__copy'>
            <Typography.Title heading={4}>{t('settings.runtimePage.title')}</Typography.Title>
            <Typography.Text>{t('settings.runtimePage.description')}</Typography.Text>
          </div>
        </header>

        <section className='opl-settings-section opl-settings-surface--status' id='health'>
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.oplEnvironmentPage.healthSummary.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.oplEnvironmentPage.healthSummary.description')}
              </Typography.Text>
            </div>
          </div>
          <RuntimeHealthSummary items={healthSummaryItems} />
        </section>

        <BaseDependencySummary component={oplBaseComponent} t={t} />

        <TemporalMaintenancePanel
          snapshot={temporalSnapshot}
          actions={temporalActions}
          evidence={temporalActionEvidence}
          busyActionId={busyTemporalActionId}
          disabled={maintenanceOperationBusy}
          onAction={(actionId) => void runTemporalMaintenanceAction(actionId)}
          onOpenWorkerSourceSettings={openTemporalWorkerSourceSettings}
          onRepairWorkerDependency={requestTemporalWorkerDependencyRepair}
          t={t}
        />

        <div data-testid='settings-maintenance-daily-actions'>
          <div className='flex flex-col gap-14px' data-testid='settings-maintenance-primary'>
            <div className='flex flex-col gap-12px' data-testid='opl-maintenance-hub'>
              {maintenanceNeedsAction && <span data-testid='settings-maintenance-exception' aria-hidden='true' />}
              <div className='flex flex-wrap items-start justify-between gap-12px'>
                <div>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.title')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.description')}
                  </Typography.Text>
                </div>
                {managedUpdateMaintenance.lastRunAt && (
                  <Typography.Text className='text-12px text-t-tertiary'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.lastChecked', {
                      value: managedUpdateMaintenance.lastRunAt,
                    })}
                  </Typography.Text>
                )}
              </div>
              <div className='opl-settings-list' data-testid='maintenance-domain-grid'>
                {maintenanceHubItems.map((item) => {
                  const anchors: Record<string, string> = {
                    appUpdates: 'updates',
                    runtimeEnvironment: 'runtime-environment',
                    capabilitySurfaceSync: 'packages',
                    localServicesRepair: 'services',
                  };
                  return (
                    <div
                      key={`maintenance-hub-${item.key}`}
                      className='opl-settings-row opl-settings-surface--action'
                      id={anchors[item.key]}
                      data-testid={`opl-maintenance-hub-${item.key}`}
                    >
                      <div className='opl-settings-row__main'>
                        <div className='flex min-w-0 items-start gap-10px'>
                          <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
                            {item.icon}
                          </span>
                          <div className='min-w-0'>
                            <Typography.Text className='block font-600 text-t-primary'>{item.title}</Typography.Text>
                            <Typography.Text className='mt-4px block text-12px text-t-secondary'>
                              {item.detail}
                            </Typography.Text>
                          </div>
                        </div>
                      </div>
                      <div className='opl-settings-row__meta'>
                        <span className='opl-settings-action-result'>
                          {t('settings.oplEnvironmentPage.maintenanceHub.results.title')}: {item.status}
                        </span>
                        <Button
                          title={item.actionHelp}
                          loading={item.actionLoading}
                          disabled={maintenanceOperationBusy || item.actionDisabled}
                          onClick={item.onAction}
                          data-testid={`opl-maintenance-action-${item.key}`}
                        >
                          {item.actionLabel}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {makeUsableConfirmationOpen && (
              <Alert
                type='warning'
                title={t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmTitle')}
                data-testid='opl-maintenance-hub-make-usable-confirmation'
                content={
                  <div className='flex flex-col gap-8px'>
                    <span className='break-words'>
                      {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmWillChange')}
                    </span>
                    <span className='break-words'>
                      {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmWillNotChange')}
                    </span>
                    <span className='break-words'>
                      {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmRecovery')}
                    </span>
                    <Space wrap size='small'>
                      <Button size='small' onClick={cancelMakeOplUsable}>
                        {t('common.cancel')}
                      </Button>
                      <span data-testid='settings-maintenance-primary-action'>
                        <Button
                          size='small'
                          type='primary'
                          loading={makeUsableRunning}
                          disabled={maintenanceOperationBusy}
                          onClick={() => void runMakeOplUsable()}
                          data-testid='opl-maintenance-hub-make-usable-confirm'
                        >
                          {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmAction')}
                        </Button>
                      </span>
                    </Space>
                  </div>
                }
              />
            )}
          </div>
        </div>

        <section
          className='opl-settings-section opl-settings-surface--configuration'
          data-testid='settings-maintenance-inline-updates'
        >
          <ManagedUpdatesPanel
            plane={managedUpdatePlane}
            maintenance={managedUpdateMaintenance}
            maintenanceOperationBusy={maintenanceOperationBusy}
            activeReadOperation={activeReadOperation}
            pendingAction={pendingUpdateAction}
            onRefresh={() => void runManagedUpdateRead('status')}
            onCheck={() => void runManagedUpdateRead('check')}
            onPlan={() => void runManagedUpdateRead('plan')}
            onRequestAction={requestManagedUpdateAction}
            onCancelAction={cancelManagedUpdateAction}
            onConfirmAction={confirmManagedUpdateAction}
            busyDependencyId={busyDependencyId}
            onRequestExternalUpdate={requestExternalDependencyUpdate}
            t={t}
          />
        </section>

        {updateChannelActionId && updateChannelOptions.length > 0 && (
          <section
            className='opl-settings-section opl-settings-surface--configuration'
            data-testid='settings-maintenance-update-channel'
          >
            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.updateChannel.title', { defaultValue: 'Update channel' })}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.oplEnvironmentPage.updateChannel.description', {
                    defaultValue: 'Choose which OPL App and package updates this computer follows.',
                  })}
                </Typography.Text>
              </div>
              <div className='opl-settings-row__meta'>
                <Radio.Group
                  type='button'
                  value={updateChannelValue}
                  disabled={updateChannelSaving}
                  onChange={(value) => void updateUpdateChannel(String(value))}
                  data-testid='settings-maintenance-update-channel-select'
                >
                  {updateChannelOptions.map((option) => (
                    <Radio value={option.value} key={option.value}>
                      {option.label}
                    </Radio>
                  ))}
                </Radio.Group>
              </div>
            </div>
          </section>
        )}

        <details className='opl-settings-details opl-settings-surface--diagnostic' open={diagnosticsVisible}>
          <summary
            id='diagnostics'
            aria-expanded={diagnosticsVisible}
            aria-controls='advanced-maintenance'
            data-testid='settings-maintenance-diagnostics-action'
            onClick={(event) => {
              event.preventDefault();
              setDiagnosticsVisible((visible) => !visible);
            }}
          >
            <span className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.advancedDetails.title')}
            </span>
            <span className='mt-2px block text-12px font-400 text-t-secondary'>
              {t('settings.oplEnvironmentPage.advancedDetails.description')}
            </span>
          </summary>
          {diagnosticsVisible && (
            <div
              className='mt-14px min-w-0'
              id='advanced-maintenance'
              data-testid='settings-maintenance-technical-details'
            >
              <div className='flex flex-col gap-16px'>
                {(developerSourceActive || dirtyCheckoutActive) && (
                  <Alert
                    type='info'
                    data-testid='opl-runtime-developer-source-alert'
                    title={t('settings.oplEnvironmentPage.developerSource.title')}
                    content={
                      <span className='break-words'>
                        {dirtyCheckoutActive
                          ? t('settings.oplEnvironmentPage.developerSource.dirtyImpact')
                          : t('settings.oplEnvironmentPage.developerSource.impact')}
                      </span>
                    }
                  />
                )}
                <Collapse bordered={false}>
                  <Collapse.Item
                    header={t('settings.oplEnvironmentPage.diagnostics.title')}
                    name='environment-diagnostics'
                  >
                    <div className='flex flex-col gap-16px'>
                      <div
                        className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'
                        id='workspace'
                      >
                        <div className='min-w-0'>
                          <Typography.Text className='block font-600 text-t-primary'>
                            {t('settings.workDir')}
                          </Typography.Text>
                          <Typography.Text className='block text-12px text-t-secondary break-all'>
                            {workspaceRoot || t('settings.dirNotConfigured')}
                          </Typography.Text>
                        </div>
                      </div>

                      <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
                        <div className='min-w-0'>
                          <Typography.Text className='block font-600 text-t-primary'>
                            {t('settings.logDir')}
                          </Typography.Text>
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

                      <div className='min-w-0' id='modules'>
                        <Typography.Text className='block font-600 text-t-primary mb-8px'>
                          {t('settings.oplEnvironmentPage.diagnostics.modulesTitle')}
                        </Typography.Text>
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
                              <div
                                key={`runtime-module-${id}`}
                                className='flex items-center justify-between gap-12px py-12px'
                              >
                                <div className='min-w-0'>
                                  <Typography.Text className='block font-600 text-t-primary'>
                                    {moduleDisplayLabel(module)}
                                  </Typography.Text>
                                  <Typography.Text className='block text-12px text-t-secondary'>
                                    {moduleVersionDetail(module, t)}
                                  </Typography.Text>
                                  {pathValue ? (
                                    <Tooltip content={pathValue}>
                                      <Typography.Text className='block text-12px text-t-secondary break-all'>
                                        {t('settings.oplEnvironmentPage.moduleVersion.checkoutPath', {
                                          path: pathValue,
                                        })}
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
                                  <Tag key={`${id}-status`} color={isUserUsableStatus(status) ? 'gray' : 'orange'}>
                                    {formatStatus(status, t)}
                                  </Tag>
                                </Space>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </Collapse.Item>
                </Collapse>
              </div>
            </div>
          )}
        </details>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default RuntimeSettings;
