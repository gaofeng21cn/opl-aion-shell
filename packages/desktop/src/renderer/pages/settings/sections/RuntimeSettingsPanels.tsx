/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Download, PlayOne, Refresh, Right, Schedule, Search, Server, Worker } from '@icon-park/react';

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
  if (source === 'managed_local_service_state' || source === 'managed_service_supervisor') {
    return t('settings.oplEnvironmentPage.temporal.addressSources.managed');
  }
  if (source === 'environment') {
    return t('settings.oplEnvironmentPage.temporal.addressSources.environment');
  }
  if (source === 'not_configured') {
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
  if (snapshot.serviceSupervisorReady === true) {
    return t('settings.oplEnvironmentPage.temporal.server.supervisorReady');
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
  return t('settings.oplEnvironmentPage.temporal.server.supervisorNeedsRepair');
}

function temporalWorkerStatusLabel(snapshot: TemporalMaintenanceSnapshot, t: RuntimeSettingsPanelsTranslate): string {
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
  unavailableHelp,
  busyActionId,
  disabled,
  icon,
  onAction,
}: {
  actionId: TemporalMaintenanceActionId;
  action?: TemporalMaintenanceAction;
  label: string;
  unavailableHelp: string;
  busyActionId: TemporalMaintenanceActionId | null;
  disabled: boolean;
  icon: React.ReactNode;
  onAction: (actionId: TemporalMaintenanceActionId) => void;
}) {
  const button = (
    <Button
      size='small'
      type='secondary'
      icon={icon}
      loading={busyActionId === actionId}
      disabled={disabled || !action}
      onClick={() => action && onAction(action.actionId)}
      data-testid={`settings-maintenance-temporal-action-${actionId}`}
    >
      {label}
    </Button>
  );
  return action ? button : <Tooltip content={unavailableHelp}>{button}</Tooltip>;
}

export function TemporalMaintenancePanel({
  snapshot,
  actions,
  evidence,
  busyActionId,
  disabled,
  onAction,
  onOpenWorkerSourceSettings,
  t,
}: {
  snapshot: TemporalMaintenanceSnapshot;
  actions: Partial<Record<TemporalMaintenanceActionId, TemporalMaintenanceAction>>;
  evidence: TemporalMaintenanceEvidence | null;
  busyActionId: TemporalMaintenanceActionId | null;
  disabled: boolean;
  onAction: (actionId: TemporalMaintenanceActionId) => void;
  onOpenWorkerSourceSettings: () => void;
  t: RuntimeSettingsPanelsTranslate;
}) {
  const serverNotConfigured =
    !snapshot.address &&
    (snapshot.addressSource === 'not_configured' ||
      TEMPORAL_NOT_CONFIGURED_STATUSES.has(snapshot.providerStatus) ||
      TEMPORAL_NOT_CONFIGURED_STATUSES.has(snapshot.healthStatus));
  const serverReady =
    snapshot.serviceReady === true && (!snapshot.serviceSupervisorRequired || snapshot.serviceSupervisorReady === true);
  const serverFailed = snapshot.serviceReady === false && !serverNotConfigured;
  const supervisorStatusLabel = temporalServiceSupervisorLabel(snapshot, t);
  const workerNeedsRestart = ['worker_source_stale', 'duplicate_worker'].includes(snapshot.workerStatus);
  const workerMutationBlocked = snapshot.workerMutationGuardStatus === 'blocked_developer_checkout_shared_state';
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
    snapshot.schedulerReady === false;
  const aggregateStatusLabel = snapshot.ready
    ? t('settings.oplEnvironmentPage.temporal.values.ready')
    : componentFailureReported
      ? t('settings.oplEnvironmentPage.temporal.values.needsAttention')
      : providerNotConfigured
        ? t('settings.oplEnvironmentPage.temporal.values.notConfigured')
        : t('settings.oplEnvironmentPage.temporal.values.needsCheck');

  return (
    <section
      className='opl-settings-section opl-temporal-maintenance'
      id='temporal-runtime'
      data-testid='settings-maintenance-temporal'
    >
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

      <div className='opl-settings-list'>
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
                    observedAt: snapshot.serviceSupervisorObservedAt,
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
              icon={<Search theme='outline' size='14' />}
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
              icon={serverReady ? <Refresh theme='outline' size='14' /> : <Download theme='outline' size='14' />}
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
            </div>
          </div>
          <div className='opl-settings-row__meta'>
            <span className={temporalStatusClass(snapshot.workerReady)}>{workerStatusLabel}</span>
            <TemporalActionButton
              actionId='provider_worker_status'
              action={actions.provider_worker_status}
              label={t('settings.oplEnvironmentPage.temporal.actions.checkWorker')}
              unavailableHelp={unavailableHelp}
              busyActionId={busyActionId}
              disabled={disabled}
              icon={<Search theme='outline' size='14' />}
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
              disabled={disabled || !serverReady || workerMutationBlocked}
              icon={<Refresh theme='outline' size='14' />}
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
                    observedAt: snapshot.schedulerObservedAt,
                  })}
                </Typography.Text>
              )}
            </div>
          </div>
          <div className='opl-settings-row__meta'>
            <span
              className={temporalStatusClass(
                snapshot.schedulerReady === true,
                snapshot.schedulerReady === false && !['not_installed', 'paused'].includes(snapshot.schedulerStatus)
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
              icon={<Search theme='outline' size='14' />}
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
                icon={<Download theme='outline' size='14' />}
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
              icon={<PlayOne theme='outline' size='14' />}
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
              observedAt: evidence.observedAt,
            })}
          </Typography.Text>
        </div>
      )}
    </section>
  );
}
