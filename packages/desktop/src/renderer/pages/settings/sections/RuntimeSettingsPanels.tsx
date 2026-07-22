/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Tag, Typography } from '@arco-design/web-react';
import { Right, Schedule, Server, Worker } from '@icon-park/react';

export type RuntimeSettingsTone = 'green' | 'orange' | 'gray';

export type RuntimeReadinessCard = {
  key: string;
  title: string;
  value: string;
  detail: string;
  nextAction: string;
  tone: RuntimeSettingsTone;
};

export type RuntimeHealthSummaryItem = {
  key: string;
  label: string;
  value: string;
  tone: RuntimeSettingsTone;
};

export type RuntimeMaintenanceHubItem = {
  key: string;
  title: string;
  detail: string;
  status: string;
  tone: RuntimeSettingsTone;
  icon: React.ReactNode;
  actionLabel: string;
  actionHelp?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction: () => void;
};

export type TemporalMaintenanceActionId =
  | 'provider_service_status'
  | 'provider_service_start'
  | 'provider_service_restart'
  | 'provider_scheduler_status'
  | 'provider_scheduler_install'
  | 'provider_scheduler_trigger'
  | 'provider_worker_status'
  | 'provider_worker_start'
  | 'provider_worker_restart';

export type TemporalMaintenanceAction = {
  actionId: TemporalMaintenanceActionId;
  label: string;
};

export type TemporalMaintenanceSnapshot = {
  providerStatus: string;
  healthStatus: string;
  ready: boolean;
  address: string | null;
  addressSource: string;
  namespace: string;
  taskQueue: string;
  serviceReady: boolean | null;
  serverReachable: boolean | null;
  serviceSupervisorInstalled: boolean;
  serviceSupervisorLoaded: boolean;
  serviceSupervisorSupported: boolean | null;
  serviceSupervisorApplicable: boolean | null;
  serviceSupervisorRequired: boolean;
  serviceSupervisorReady: boolean | null;
  serviceSupervisorConfigurationCurrent: boolean;
  serviceSupervisorStatus: string;
  serviceSupervisorObservedAt: string | null;
  serviceSupervisorError: string | null;
  workerReady: boolean;
  workerStatus: string;
  workerError: string | null;
  workerMutationGuardStatus: string | null;
  schedulerStatus: string;
  schedulerReady: boolean | null;
  schedulerObservedAt: string | null;
  schedulerError: string | null;
  blockers: string[];
};

export type TemporalMaintenanceEvidence = {
  actionId: TemporalMaintenanceActionId;
  outcome: 'checked' | 'completed' | 'needsAttention' | 'blocked' | 'failed';
  observedAt: string;
};

type RuntimeSettingsPanelsTranslate = (key: string, options?: Record<string, string | number>) => string;

export function MaintenanceDisclosure({
  needsAttention,
  controlsId,
  toggleTestId,
  summary,
  children,
}: {
  needsAttention: boolean;
  controlsId: string;
  toggleTestId: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(needsAttention);

  React.useEffect(() => {
    setExpanded(needsAttention);
  }, [needsAttention]);

  return (
    <details className='opl-settings-details' open={expanded}>
      <summary
        aria-expanded={expanded}
        aria-controls={controlsId}
        data-testid={toggleTestId}
        onClick={(event) => {
          event.preventDefault();
          setExpanded((visible) => !visible);
        }}
      >
        {summary}
      </summary>
      {children}
    </details>
  );
}

/** Formats maintenance evidence for people while keeping raw timestamps out of the primary surface. */
export function formatMaintenanceTimestamp(
  value: string | null | undefined,
  t: RuntimeSettingsPanelsTranslate,
  locale?: string
): string {
  if (!value) return t('settings.uiOptimization.maintenance.time.unknown');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t('settings.uiOptimization.maintenance.time.unknown');
  const differenceMinutes = (Date.now() - timestamp) / 60_000;
  const elapsedMinutes = Math.floor(Math.abs(differenceMinutes));
  const isFuture = differenceMinutes < 0;
  const relative =
    elapsedMinutes < 1
      ? t('settings.uiOptimization.maintenance.time.justNow')
      : elapsedMinutes < 60
        ? t(
            isFuture
              ? 'settings.uiOptimization.maintenance.time.minutesLater'
              : 'settings.uiOptimization.maintenance.time.minutesAgo',
            { count: elapsedMinutes }
          )
        : elapsedMinutes < 1_440
          ? t(
              isFuture
                ? 'settings.uiOptimization.maintenance.time.hoursLater'
                : 'settings.uiOptimization.maintenance.time.hoursAgo',
              { count: Math.floor(elapsedMinutes / 60) }
            )
          : t(
              isFuture
                ? 'settings.uiOptimization.maintenance.time.daysLater'
                : 'settings.uiOptimization.maintenance.time.daysAgo',
              { count: Math.floor(elapsedMinutes / 1_440) }
            );
  const local = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
  return t('settings.uiOptimization.maintenance.time.localWithRelative', { local, relative });
}

export function RuntimeReadinessGrid({
  cards,
  t,
}: {
  cards: RuntimeReadinessCard[];
  t: RuntimeSettingsPanelsTranslate;
}) {
  return (
    <div className='opl-settings-section bg-transparent' data-testid='opl-runtime-readiness-grid'>
      <div className='opl-settings-list'>
        {cards.map((card) => (
          <div key={`runtime-card-${card.key}`} className='opl-settings-row'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
              <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
              <Typography.Text className='text-12px text-t-secondary break-words'>
                {t('settings.oplEnvironmentPage.summary.nextAction', { action: card.nextAction })}
              </Typography.Text>
            </div>
            <div className='opl-settings-row__meta'>
              <Tag color={card.tone}>{card.value}</Tag>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RuntimeHealthSummary({ items }: { items: RuntimeHealthSummaryItem[] }) {
  return (
    <div className='opl-settings-list' data-testid='opl-runtime-health-summary'>
      {items.map((item) => (
        <div key={`runtime-health-${item.key}`} className='opl-settings-row'>
          <div className='opl-settings-row__main'>
            <Typography.Text className='font-500 text-t-primary'>{item.label}</Typography.Text>
          </div>
          <div className='opl-settings-row__meta'>
            <span
              className={`opl-settings-status ${
                item.tone === 'green'
                  ? 'opl-settings-status--ready'
                  : item.tone === 'orange'
                    ? 'opl-settings-status--attention'
                    : ''
              }`}
            >
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function temporalStatusClass(ready: boolean, failed = false): string {
  if (ready) return 'opl-settings-status opl-settings-status--ready';
  if (failed) return 'opl-settings-status opl-settings-status--error';
  return 'opl-settings-status opl-settings-status--attention';
}

const TEMPORAL_NOT_CONFIGURED_STATUSES = new Set([
  'not_configured',
  'provider_code_landed_unconfigured',
  'temporal_runtime_not_configured',
]);

function temporalAddressSourceLabel(source: string, t: RuntimeSettingsPanelsTranslate): string {
  const normalizedSource = source.trim().toLowerCase();
  if (
    normalizedSource === 'managed' ||
    normalizedSource === 'managed_local_service_state' ||
    normalizedSource === 'managed_service_supervisor' ||
    normalizedSource === 'packaged_local_default'
  ) {
    return t('settings.oplEnvironmentPage.temporal.addressSources.managed');
  }
  if (normalizedSource === 'environment') {
    return t('settings.oplEnvironmentPage.temporal.addressSources.environment');
  }
  if (normalizedSource === 'not_configured') {
    return t('settings.oplEnvironmentPage.temporal.addressSources.notConfigured');
  }
  return t('settings.oplEnvironmentPage.temporal.addressSources.unknown');
}

function temporalServiceSupervisorLabel(
  snapshot: TemporalMaintenanceSnapshot,
  t: RuntimeSettingsPanelsTranslate
): string {
  if (!snapshot.serviceSupervisorRequired) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorNotApplicable');
  }
  if (!snapshot.serviceSupervisorInstalled) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorNotInstalled');
  }
  if (!snapshot.serviceSupervisorConfigurationCurrent) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorConfigurationDrift');
  }
  if (!snapshot.serviceSupervisorLoaded) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorNotLoaded');
  }
  if (snapshot.serviceSupervisorError) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorReportedError');
  }
  if (snapshot.serviceSupervisorReady === true) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorReady');
  }
  return t('settings.oplEnvironmentPage.temporal.server.supervisorNeedsRepair');
}

function temporalWorkerStatusLabel(snapshot: TemporalMaintenanceSnapshot, t: RuntimeSettingsPanelsTranslate): string {
  if (snapshot.workerError) return t('settings.oplEnvironmentPage.temporal.values.needsAttention');
  if (snapshot.workerReady) return t('settings.oplEnvironmentPage.temporal.values.ready');
  if (snapshot.workerStatus === 'not_configured') {
    return t('settings.oplEnvironmentPage.temporal.values.notConfigured');
  }
  if (snapshot.workerStatus === 'server_unreachable') {
    return t('settings.oplEnvironmentPage.temporal.values.unreachable');
  }
  if (snapshot.workerStatus === 'worker_source_stale' || snapshot.workerStatus === 'duplicate_worker') {
    return t('settings.oplEnvironmentPage.temporal.values.restartRequired');
  }
  if (snapshot.workerStatus === 'not_checked' || snapshot.workerStatus === 'unknown') {
    return t('settings.oplEnvironmentPage.temporal.values.needsCheck');
  }
  return t('settings.oplEnvironmentPage.temporal.values.needsAttention');
}

function temporalSchedulerStatusLabel(
  snapshot: TemporalMaintenanceSnapshot,
  t: RuntimeSettingsPanelsTranslate
): string {
  const status = snapshot.schedulerStatus;
  if (snapshot.schedulerError) return t('settings.oplEnvironmentPage.temporal.values.needsAttention');
  if (snapshot.schedulerReady === true) return t('settings.oplEnvironmentPage.temporal.values.ready');
  if (status === 'not_installed') return t('settings.oplEnvironmentPage.temporal.values.notInstalled');
  if (status === 'paused') return t('settings.oplEnvironmentPage.temporal.values.paused');
  if (snapshot.schedulerReady === null || status === 'not_checked' || status === 'unknown') {
    return t('settings.oplEnvironmentPage.temporal.values.needsCheck');
  }
  return t('settings.oplEnvironmentPage.temporal.values.needsAttention');
}

function temporalBlockerLabel(blocker: string, t: RuntimeSettingsPanelsTranslate): string {
  const keyByBlocker: Record<string, string> = {
    temporal_runtime_not_configured: 'notConfigured',
    temporal_server_unreachable: 'serverUnreachable',
    temporal_worker_dependency_unavailable: 'workerDependencyUnavailable',
    temporal_worker_duplicate_foreground: 'duplicateWorker',
    temporal_worker_process_exited: 'workerExited',
    temporal_worker_source_stale: 'workerSourceStale',
    temporal_worker_not_ready: 'workerNotReady',
    temporal_service_supervisor_unready: 'serviceSupervisorUnready',
    temporal_service_supervisor_configuration_drift: 'serviceSupervisorConfigurationDrift',
    temporal_service_supervisor_not_loaded: 'serviceSupervisorNotLoaded',
  };
  return t(`settings.oplEnvironmentPage.temporal.blockers.${keyByBlocker[blocker] ?? 'unknown'}`);
}

function temporalActionLabel(actionId: TemporalMaintenanceActionId, t: RuntimeSettingsPanelsTranslate): string {
  const keyByAction: Record<TemporalMaintenanceActionId, string> = {
    provider_service_status: 'checkServer',
    provider_service_start: 'configureAndStartServer',
    provider_service_restart: 'restartServer',
    provider_worker_status: 'checkWorker',
    provider_worker_start: 'startWorker',
    provider_worker_restart: 'restartWorker',
    provider_scheduler_status: 'checkScheduler',
    provider_scheduler_install: 'installScheduler',
    provider_scheduler_trigger: 'triggerScheduler',
  };
  return t(`settings.oplEnvironmentPage.temporal.actions.${keyByAction[actionId]}`);
}

function TemporalActionButton({
  actionId,
  action,
  label,
  unavailableHelp: _unavailableHelp,
  busyActionId,
  disabled,
  onAction,
}: {
  actionId: TemporalMaintenanceActionId;
  action?: TemporalMaintenanceAction;
  label: string;
  unavailableHelp: string;
  busyActionId: TemporalMaintenanceActionId | null;
  disabled: boolean;
  onAction: (actionId: TemporalMaintenanceActionId) => void;
}) {
  if (!action) return null;
  const button = (
    <Button
      size='small'
      type='secondary'
      loading={busyActionId === actionId}
      disabled={disabled}
      onClick={() => onAction(action.actionId)}
      data-testid={`settings-maintenance-temporal-action-${actionId}`}
    >
      {label}
    </Button>
  );
  return button;
}

export function TemporalMaintenancePanel({
  snapshot,
  actions,
  evidence,
  busyActionId,
  disabled,
  onAction,
  onOpenWorkerSourceSettings,
  onRepairWorkerDependency,
  locale,
  t,
}: {
  snapshot: TemporalMaintenanceSnapshot;
  actions: Partial<Record<TemporalMaintenanceActionId, TemporalMaintenanceAction>>;
  evidence: TemporalMaintenanceEvidence | null;
  busyActionId: TemporalMaintenanceActionId | null;
  disabled: boolean;
  onAction: (actionId: TemporalMaintenanceActionId) => void;
  onOpenWorkerSourceSettings: () => void;
  onRepairWorkerDependency: () => void;
  locale?: string;
  t: RuntimeSettingsPanelsTranslate;
}) {
  const serverNotConfigured =
    !snapshot.address &&
    (snapshot.addressSource === 'not_configured' ||
      TEMPORAL_NOT_CONFIGURED_STATUSES.has(snapshot.providerStatus) ||
      TEMPORAL_NOT_CONFIGURED_STATUSES.has(snapshot.healthStatus));
  const serverReady =
    snapshot.serviceReady === true &&
    (!snapshot.serviceSupervisorRequired || snapshot.serviceSupervisorReady === true) &&
    snapshot.serviceSupervisorError === null;
  const serverFailed =
    (snapshot.serviceReady === false && !serverNotConfigured) || snapshot.serviceSupervisorError !== null;
  const supervisorStatusLabel = temporalServiceSupervisorLabel(snapshot, t);
  const workerNeedsRestart = ['worker_source_stale', 'duplicate_worker'].includes(snapshot.workerStatus);
  const workerMutationBlocked = snapshot.workerMutationGuardStatus === 'blocked_developer_checkout_shared_state';
  const workerDependencyUnavailable =
    snapshot.workerStatus.includes('dependency_unavailable') ||
    snapshot.blockers.some((blocker) => blocker.includes('worker_dependency_unavailable'));
  const unavailableHelp = t('settings.oplEnvironmentPage.temporal.actions.unavailable');
  const blockerText = snapshot.blockers.length
    ? snapshot.blockers.map((blocker) => temporalBlockerLabel(blocker, t)).join(', ')
    : t('settings.oplEnvironmentPage.temporal.values.none');
  const workerStatusLabel = temporalWorkerStatusLabel(snapshot, t);
  const schedulerStatusLabel = temporalSchedulerStatusLabel(snapshot, t);
  const providerNotConfigured =
    TEMPORAL_NOT_CONFIGURED_STATUSES.has(snapshot.providerStatus) ||
    TEMPORAL_NOT_CONFIGURED_STATUSES.has(snapshot.healthStatus);
  const componentFailureReported =
    serverFailed ||
    (!providerNotConfigured &&
      snapshot.serviceSupervisorRequired &&
      (!snapshot.serviceSupervisorInstalled ||
        !snapshot.serviceSupervisorLoaded ||
        !snapshot.serviceSupervisorConfigurationCurrent ||
        snapshot.serviceSupervisorReady === false ||
        snapshot.serviceSupervisorError !== null)) ||
    (!snapshot.workerReady && !['not_checked', 'unknown', 'not_configured'].includes(snapshot.workerStatus)) ||
    snapshot.workerError !== null ||
    snapshot.schedulerReady === false ||
    snapshot.schedulerError !== null;
  const aggregateStatusLabel = snapshot.ready
    ? t('settings.oplEnvironmentPage.temporal.values.ready')
    : componentFailureReported
      ? t('settings.oplEnvironmentPage.temporal.values.needsAttention')
      : providerNotConfigured
        ? t('settings.oplEnvironmentPage.temporal.values.notConfigured')
        : t('settings.oplEnvironmentPage.temporal.values.needsCheck');
  const needsAttention =
    !snapshot.ready ||
    componentFailureReported ||
    serverNotConfigured ||
    !serverReady ||
    !snapshot.workerReady ||
    workerMutationBlocked ||
    workerDependencyUnavailable ||
    snapshot.schedulerReady !== true ||
    snapshot.blockers.length > 0;

  return (
    <section
      className='opl-settings-section opl-temporal-maintenance'
      id='temporal-runtime'
      data-testid='settings-maintenance-temporal'
    >
      <MaintenanceDisclosure
        needsAttention={needsAttention}
        controlsId='temporal-runtime-details'
        toggleTestId='settings-maintenance-temporal-toggle'
        summary={
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.oplEnvironmentPage.temporal.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.oplEnvironmentPage.temporal.description')}
              </Typography.Text>
            </div>
            <span className={temporalStatusClass(snapshot.ready)} data-testid='settings-maintenance-temporal-status'>
              {aggregateStatusLabel}
            </span>
          </div>
        }
      >
        <div className='opl-settings-list' id='temporal-runtime-details'>
          <div className='opl-settings-row' data-testid='settings-maintenance-temporal-server'>
            <div className='opl-settings-row__main flex-row items-start gap-10px'>
              <span className='opl-settings-icon' aria-hidden='true'>
                <Server theme='outline' size='16' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.temporal.server.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {t('settings.oplEnvironmentPage.temporal.server.address', {
                    address: snapshot.address ?? t('settings.oplEnvironmentPage.temporal.values.notConfigured'),
                    source: temporalAddressSourceLabel(snapshot.addressSource, t),
                  })}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {t('settings.oplEnvironmentPage.temporal.server.namespace', { namespace: snapshot.namespace })}
                </Typography.Text>
                <Typography.Text
                  className='block text-12px text-t-secondary break-words'
                  data-testid='settings-maintenance-temporal-supervisor-status'
                >
                  {supervisorStatusLabel}
                </Typography.Text>
                {snapshot.serviceSupervisorObservedAt && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.temporal.server.supervisorObservedAt', {
                      observedAt: formatMaintenanceTimestamp(snapshot.serviceSupervisorObservedAt, t, locale),
                    })}
                  </Typography.Text>
                )}
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <span className={temporalStatusClass(serverReady, serverFailed)}>
                {serverReady
                  ? t('settings.oplEnvironmentPage.temporal.values.reachable')
                  : serverFailed
                    ? t('settings.oplEnvironmentPage.temporal.values.unreachable')
                    : snapshot.serviceReady === true
                      ? t('settings.oplEnvironmentPage.temporal.values.needsAttention')
                      : !serverNotConfigured
                        ? t('settings.oplEnvironmentPage.temporal.values.notChecked')
                        : t('settings.oplEnvironmentPage.temporal.values.notConfigured')}
              </span>
              <TemporalActionButton
                actionId='provider_service_status'
                action={actions.provider_service_status}
                label={t('settings.oplEnvironmentPage.temporal.actions.checkServer')}
                unavailableHelp={unavailableHelp}
                busyActionId={busyActionId}
                disabled={disabled}
                onAction={onAction}
              />
              <TemporalActionButton
                actionId={serverReady ? 'provider_service_restart' : 'provider_service_start'}
                action={serverReady ? actions.provider_service_restart : actions.provider_service_start}
                label={
                  serverReady
                    ? t('settings.oplEnvironmentPage.temporal.actions.restartServer')
                    : t('settings.oplEnvironmentPage.temporal.actions.configureAndStartServer')
                }
                unavailableHelp={unavailableHelp}
                busyActionId={busyActionId}
                disabled={disabled}
                onAction={onAction}
              />
            </div>
          </div>

          <div className='opl-settings-row' data-testid='settings-maintenance-temporal-worker'>
            <div className='opl-settings-row__main flex-row items-start gap-10px'>
              <span className='opl-settings-icon' aria-hidden='true'>
                <Worker theme='outline' size='16' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.temporal.worker.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {t('settings.oplEnvironmentPage.temporal.worker.taskQueue', { taskQueue: snapshot.taskQueue })}
                </Typography.Text>
                {(!snapshot.workerReady || workerMutationBlocked) && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {workerMutationBlocked
                      ? t('settings.oplEnvironmentPage.temporal.worker.developerGuardBlocked')
                      : t('settings.oplEnvironmentPage.temporal.worker.blockers', { blockers: blockerText })}
                  </Typography.Text>
                )}
                {workerMutationBlocked && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.temporal.worker.developerGuardNextSteps')}
                  </Typography.Text>
                )}
                {workerDependencyUnavailable && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.temporal.worker.dependencyUnavailable')}
                  </Typography.Text>
                )}
                {snapshot.workerError && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.temporal.worker.reportedError')}
                  </Typography.Text>
                )}
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <span
                className={temporalStatusClass(
                  snapshot.workerReady && !snapshot.workerError,
                  Boolean(snapshot.workerError)
                )}
              >
                {workerStatusLabel}
              </span>
              <TemporalActionButton
                actionId='provider_worker_status'
                action={actions.provider_worker_status}
                label={t('settings.oplEnvironmentPage.temporal.actions.checkWorker')}
                unavailableHelp={unavailableHelp}
                busyActionId={busyActionId}
                disabled={disabled}
                onAction={onAction}
              />
              <TemporalActionButton
                actionId={
                  snapshot.workerReady || workerNeedsRestart ? 'provider_worker_restart' : 'provider_worker_start'
                }
                action={
                  snapshot.workerReady || workerNeedsRestart
                    ? actions.provider_worker_restart
                    : actions.provider_worker_start
                }
                label={
                  snapshot.workerReady || workerNeedsRestart
                    ? t('settings.oplEnvironmentPage.temporal.actions.restartWorker')
                    : t('settings.oplEnvironmentPage.temporal.actions.startWorker')
                }
                unavailableHelp={unavailableHelp}
                busyActionId={busyActionId}
                disabled={disabled || !serverReady || workerMutationBlocked || workerDependencyUnavailable}
                onAction={onAction}
              />
              {workerMutationBlocked && (
                <Button
                  size='small'
                  type='text'
                  icon={<Right theme='outline' size='14' />}
                  onClick={onOpenWorkerSourceSettings}
                  data-testid='settings-maintenance-temporal-worker-source'
                >
                  {t('settings.oplEnvironmentPage.temporal.worker.manageSources')}
                </Button>
              )}
              {workerDependencyUnavailable && (
                <Button
                  size='small'
                  type='text'
                  disabled={disabled}
                  onClick={onRepairWorkerDependency}
                  data-testid='settings-maintenance-temporal-worker-repair-dependency'
                >
                  {t('settings.oplEnvironmentPage.temporal.worker.repairDependency')}
                </Button>
              )}
            </div>
          </div>

          <div className='opl-settings-row' data-testid='settings-maintenance-temporal-scheduler'>
            <div className='opl-settings-row__main flex-row items-start gap-10px'>
              <span className='opl-settings-icon' aria-hidden='true'>
                <Schedule theme='outline' size='16' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.temporal.scheduler.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {t('settings.oplEnvironmentPage.temporal.scheduler.description')}
                </Typography.Text>
                {snapshot.schedulerObservedAt && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.temporal.scheduler.observedAt', {
                      observedAt: formatMaintenanceTimestamp(snapshot.schedulerObservedAt, t, locale),
                    })}
                  </Typography.Text>
                )}
                {snapshot.schedulerError && (
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {t('settings.oplEnvironmentPage.temporal.scheduler.reportedError')}
                  </Typography.Text>
                )}
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <span
                className={temporalStatusClass(
                  snapshot.schedulerReady === true && !snapshot.schedulerError,
                  Boolean(snapshot.schedulerError) ||
                    (snapshot.schedulerReady === false &&
                      !['not_installed', 'paused'].includes(snapshot.schedulerStatus))
                )}
              >
                {schedulerStatusLabel}
              </span>
              <TemporalActionButton
                actionId='provider_scheduler_status'
                action={actions.provider_scheduler_status}
                label={t('settings.oplEnvironmentPage.temporal.actions.checkScheduler')}
                unavailableHelp={unavailableHelp}
                busyActionId={busyActionId}
                disabled={disabled}
                onAction={onAction}
              />
              {snapshot.schedulerStatus === 'not_installed' && (
                <TemporalActionButton
                  actionId='provider_scheduler_install'
                  action={actions.provider_scheduler_install}
                  label={t('settings.oplEnvironmentPage.temporal.actions.installScheduler')}
                  unavailableHelp={unavailableHelp}
                  busyActionId={busyActionId}
                  disabled={disabled || !serverReady || !snapshot.workerReady}
                  onAction={onAction}
                />
              )}
              <TemporalActionButton
                actionId='provider_scheduler_trigger'
                action={actions.provider_scheduler_trigger}
                label={t('settings.oplEnvironmentPage.temporal.actions.triggerScheduler')}
                unavailableHelp={unavailableHelp}
                busyActionId={busyActionId}
                disabled={disabled || !serverReady || !snapshot.workerReady || snapshot.schedulerReady !== true}
                onAction={onAction}
              />
            </div>
          </div>
        </div>

        {evidence && (
          <div className='opl-temporal-action-readback' data-testid='settings-maintenance-temporal-readback'>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.temporal.readback', {
                action: temporalActionLabel(evidence.actionId, t),
                outcome: t(`settings.oplEnvironmentPage.temporal.outcomes.${evidence.outcome}`),
                observedAt: formatMaintenanceTimestamp(evidence.observedAt, t, locale),
              })}
            </Typography.Text>
          </div>
        )}
      </MaintenanceDisclosure>
    </section>
  );
}
