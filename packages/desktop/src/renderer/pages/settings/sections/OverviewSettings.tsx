/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { CloudStorage, DashboardOne, Terminal } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { readGatewayAccountProjection } from '../accessProjection';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type OverviewSettingsProps = {
  withWrapper?: boolean;
};

type AttentionItem = {
  key: string;
  title: string;
  description: string;
  label: string;
  route: string;
};

type TemporalStatusKind = 'ready' | 'not_configured' | 'not_installed' | 'paused' | 'attention' | 'unknown';

type TemporalStatusProjection = {
  server: TemporalStatusKind;
  worker: TemporalStatusKind;
  scheduler: TemporalStatusKind;
};

const TEMPORAL_NOT_CONFIGURED_STATUSES = new Set([
  'not_configured',
  'provider_code_landed_unconfigured',
  'temporal_runtime_not_configured',
]);
const TEMPORAL_ATTENTION_STATUSES = new Set([
  'attention_needed',
  'attention_required',
  'needs_attention',
  'degraded',
  'failed',
  'blocked',
]);
const TEMPORAL_WORKER_ATTENTION_STATUSES = new Set([
  ...TEMPORAL_ATTENTION_STATUSES,
  'duplicate_worker',
  'server_unreachable',
  'worker_dependency_unavailable',
  'worker_exited',
  'worker_not_ready',
  'worker_source_stale',
]);
const TEMPORAL_WORKER_RESTART_STATUSES = new Set(['duplicate_worker', 'worker_source_stale']);
const TEMPORAL_SCHEDULER_NOT_INSTALLED_STATUSES = new Set(['not_installed', 'missing', 'absent']);
const TEMPORAL_RECOVERY_REFRESH_INTERVAL_MS = 3_000;
const TEMPORAL_RECOVERY_REFRESH_MAX_ATTEMPTS = 30;
const TEMPORAL_RECOVERY_REFRESH_MAX_DURATION_MS = 90_000;

function normalizedStatus(value: unknown): string | null {
  return oplString(value)?.toLowerCase() ?? null;
}

function normalizedStatusList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizedStatus).filter((entry): entry is string => entry !== null) : [];
}

function workerStatusNeedsRestart(status: string): boolean {
  return (
    TEMPORAL_WORKER_RESTART_STATUSES.has(status) ||
    status.includes('worker_source_stale') ||
    status.includes('duplicate_worker')
  );
}

function workerStatusNeedsAttention(status: string): boolean {
  return (
    TEMPORAL_WORKER_ATTENTION_STATUSES.has(status) ||
    status.includes('blocked') ||
    status.includes('worker_not_ready') ||
    status.includes('dependency_unavailable') ||
    status.includes('process_exited') ||
    workerStatusNeedsRestart(status)
  );
}

function temporalStatusProjection(
  appState: Record<string, unknown>,
  statusSummary: Record<string, unknown>
): TemporalStatusProjection {
  const temporal = oplRecord(oplRecord(appState.provider).temporal);
  const details = oplRecord(temporal.details);
  const workerReadiness = oplRecord(details.worker_readiness);
  const serviceLifecycle = oplRecord(workerReadiness.temporal_service_lifecycle);
  const serviceSupervisor = oplRecord(serviceLifecycle.supervisor);
  const workerMutationGuard = oplRecord(workerReadiness.worker_mutation_guard ?? details.worker_mutation_guard);
  const schedulerReadiness = oplRecord(details.scheduler);
  const providerCandidates = [
    normalizedStatus(temporal.status),
    normalizedStatus(temporal.degraded_reason),
    normalizedStatus(statusSummary.temporal_provider),
    normalizedStatus(temporal.health_status),
  ].filter((value): value is string => Boolean(value));
  const addressSource = normalizedStatus(details.address_source);
  const serviceReady = typeof workerReadiness.service_ready === 'boolean' ? workerReadiness.service_ready : null;
  const supervisorSupported = typeof serviceSupervisor.supported === 'boolean' ? serviceSupervisor.supported : null;
  const supervisorApplicable = typeof serviceSupervisor.applicable === 'boolean' ? serviceSupervisor.applicable : null;
  const projectedSupervisorRequired =
    typeof serviceSupervisor.required === 'boolean' ? serviceSupervisor.required : null;
  const supervisorRequired =
    projectedSupervisorRequired ??
    !(
      supervisorSupported === false ||
      supervisorApplicable === false ||
      normalizedStatus(serviceLifecycle.service_status) === 'external_running'
    );
  const supervisorReady = typeof serviceSupervisor.ready === 'boolean' ? serviceSupervisor.ready : null;
  const supervisorError = oplString(serviceSupervisor.error);
  const serverNotConfigured =
    addressSource !== null
      ? TEMPORAL_NOT_CONFIGURED_STATUSES.has(addressSource)
      : serviceReady === null && providerCandidates.some((value) => TEMPORAL_NOT_CONFIGURED_STATUSES.has(value));
  const server =
    serviceReady === true
      ? supervisorRequired && (supervisorReady !== true || supervisorError !== null)
        ? 'attention'
        : 'ready'
      : serverNotConfigured
        ? 'not_configured'
        : serviceReady === false
          ? 'attention'
          : providerCandidates.some((value) => TEMPORAL_ATTENTION_STATUSES.has(value))
            ? 'attention'
            : 'unknown';

  const workerCandidates = [
    normalizedStatus(workerReadiness.lifecycle_status),
    normalizedStatus(workerReadiness.readiness_status),
    normalizedStatus(temporal.worker_status),
    normalizedStatus(workerMutationGuard.mutation_guard_status),
    ...normalizedStatusList(workerReadiness.blockers),
  ].filter((value): value is string => Boolean(value));
  const workerNeedsRestart = workerCandidates.some(workerStatusNeedsRestart);
  const workerNotConfigured = workerCandidates.some((value) => TEMPORAL_NOT_CONFIGURED_STATUSES.has(value));
  const workerReadyValue = typeof workerReadiness.worker_ready === 'boolean' ? workerReadiness.worker_ready : null;
  const workerError = oplString(workerReadiness.error) ?? oplString(workerReadiness.last_error);
  const worker = workerNotConfigured
    ? 'not_configured'
    : workerError ||
        workerNeedsRestart ||
        workerCandidates.some(workerStatusNeedsAttention) ||
        workerReadyValue === false
      ? 'attention'
      : workerReadyValue === true
        ? 'ready'
        : 'unknown';

  const schedulerCandidates = [
    normalizedStatus(schedulerReadiness.status),
    normalizedStatus(schedulerReadiness.schedule_status),
    normalizedStatus(schedulerReadiness.health_status),
    normalizedStatus(schedulerReadiness.degraded_reason),
    normalizedStatus(details.scheduler_status),
  ].filter((value): value is string => Boolean(value));
  const schedulerReadyValue = typeof schedulerReadiness.ready === 'boolean' ? schedulerReadiness.ready : null;
  const schedulerError = oplString(schedulerReadiness.error) ?? oplString(schedulerReadiness.last_error);
  const scheduler = schedulerCandidates.some((value) => TEMPORAL_NOT_CONFIGURED_STATUSES.has(value))
    ? 'not_configured'
    : schedulerCandidates.some((value) => TEMPORAL_SCHEDULER_NOT_INSTALLED_STATUSES.has(value))
      ? 'not_installed'
      : schedulerCandidates.includes('paused')
        ? 'paused'
        : schedulerError
          ? 'attention'
          : schedulerReadyValue === true
            ? 'ready'
            : schedulerReadyValue === false ||
                schedulerCandidates.some(
                  (value) => TEMPORAL_ATTENTION_STATUSES.has(value) || value === 'error' || value === 'unhealthy'
                )
              ? 'attention'
              : 'unknown';

  return { server, worker, scheduler };
}

function useTemporalRecoveryRefresh(hydrated: boolean, ready: boolean, refresh: () => Promise<unknown>): void {
  const readyRef = React.useRef(ready);
  const refreshRef = React.useRef(refresh);

  React.useEffect(() => {
    readyRef.current = ready;
    refreshRef.current = refresh;
  }, [ready, refresh]);

  React.useEffect(() => {
    if (!hydrated || ready) return undefined;

    let active = true;
    let attempts = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const deadlineTimer = setTimeout(() => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    }, TEMPORAL_RECOVERY_REFRESH_MAX_DURATION_MS);

    const runRefresh = (): void => {
      if (!active || readyRef.current || attempts >= TEMPORAL_RECOVERY_REFRESH_MAX_ATTEMPTS) return;
      attempts += 1;
      void refreshRef.current().then(
        () => {
          if (!active || readyRef.current || attempts >= TEMPORAL_RECOVERY_REFRESH_MAX_ATTEMPTS) return;
          refreshTimer = setTimeout(runRefresh, TEMPORAL_RECOVERY_REFRESH_INTERVAL_MS);
        },
        () => {
          if (!active || readyRef.current || attempts >= TEMPORAL_RECOVERY_REFRESH_MAX_ATTEMPTS) return;
          refreshTimer = setTimeout(runRefresh, TEMPORAL_RECOVERY_REFRESH_INTERVAL_MS);
        }
      );
    };

    runRefresh();
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearTimeout(deadlineTimer);
    };
  }, [hydrated, ready]);
}

function issueSettingsRoute(issue: Record<string, unknown>): string {
  const issueId = oplString(issue.issue_id) ?? '';
  const actionId = oplString(issue.recommended_action_id) ?? '';
  if (issueId === 'provider_failed_with_repair') return '/settings/environment?section=services';
  if (actionId === 'settings_configure_webui_api_key' || actionId === 'settings_repair_model_access') {
    return '/settings/gateway';
  }
  if (actionId === 'settings_verify_workspace') return '/settings/workspace';
  if (actionId === 'settings_sync_capabilities') return '/settings/capabilities';
  if (actionId === 'settings_apply_opl_packages' || actionId === 'agent_package_activate') return '/settings/agents';
  if (actionId === 'settings_check_app_update') return '/settings/about';
  if (actionId === 'settings_prune_runtime_roots_dry_run') return '/settings/storage';
  return '/settings/environment';
}

const OverviewSettings: React.FC<OverviewSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const coreCodex = oplRecord(oplRecord(appState.core).codex);
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const statusSummary = oplRecord(settingsControlCenter.status_summary);
  const temporalStatus = temporalStatusProjection(appState, statusSummary);
  const issueQueue = oplRecordList(settingsControlCenter.issue_queue);
  const actionableIssues = issueQueue.filter((issue) => {
    const severity = oplString(issue.severity);
    return severity !== 'info' && oplString(issue.issue_id) !== 'developer_profile_active';
  });
  const codexVersion = oplString(statusSummary.codex_version) ?? oplString(coreCodex.version);
  const modelAccessStatus = oplString(statusSummary.model_access);
  const codexReady =
    modelAccessStatus === 'ready' ||
    (coreCodex.installed === true &&
      coreCodex.model_access_ready === true &&
      oplString(coreCodex.version_status) !== 'incompatible');
  const codexNeedsAction =
    (Boolean(modelAccessStatus) && modelAccessStatus !== 'ready') ||
    coreCodex.installed === false ||
    coreCodex.model_access_ready === false ||
    oplString(coreCodex.version_status) === 'incompatible';
  const gatewayAccount = readGatewayAccountProjection(appState);
  const gatewayConnected = Boolean(
    gatewayAccount?.connection_mode === 'account' && gatewayAccount.account_card_visible && gatewayAccount.account
  );
  const gatewayNeedsAction = Boolean(
    gatewayAccount &&
    (gatewayAccount.status === 'reauth_required' ||
      gatewayAccount.status === 'attention_needed' ||
      gatewayAccount.status === 'disconnect_pending' ||
      gatewayAccount.freshness.last_error_code)
  );
  const issueAttentionItems: AttentionItem[] = actionableIssues.map((issue, index) => {
    const issueId = oplString(issue.issue_id) ?? `issue-${index}`;
    const route = issueSettingsRoute(issue);
    const isModelAccessIssue = route === '/settings/gateway';
    const isProviderIssue = issueId === 'provider_failed_with_repair';
    return {
      key: issueId,
      title: isModelAccessIssue
        ? t('settings.overviewPage.attention.codexTitle')
        : isProviderIssue
          ? t('settings.overviewPage.quickEntries.localServices.title')
          : t('settings.overviewPage.attention.capabilitiesTitle'),
      description: isModelAccessIssue
        ? t('settings.overviewPage.quickEntries.modelAccount.description')
        : isProviderIssue
          ? temporalStatus.server === 'not_configured' && temporalStatus.worker === 'not_configured'
            ? t('settings.overviewPage.technical.temporalNotConfigured', {
                defaultValue: 'Temporal server and worker are not configured; the scheduler still needs to be checked.',
              })
            : t('settings.overviewPage.technical.temporalNeedsAttention')
          : t('settings.overviewPage.attention.capabilitiesDescription'),
      label: t('common.open'),
      route,
    };
  });
  const temporalNeedsAction = [temporalStatus.server, temporalStatus.worker, temporalStatus.scheduler].some(
    (status) => status !== 'ready'
  );
  useTemporalRecoveryRefresh(appStateQuery.payload !== null && !appStateQuery.loading, !temporalNeedsAction, () =>
    appStateQuery.load('fast', { background: true, forceFresh: true })
  );
  const issueQueueHasTemporal = actionableIssues.some(
    (issue) => oplString(issue.issue_id) === 'provider_failed_with_repair'
  );
  const attentionItems: AttentionItem[] =
    temporalNeedsAction && !issueQueueHasTemporal
      ? [
          ...issueAttentionItems,
          {
            key: 'temporal-required-components',
            title: t('settings.overviewPage.quickEntries.localServices.title'),
            description: t('settings.overviewPage.technical.temporalNeedsAttention'),
            label: t('common.open'),
            route: '/settings/environment?section=services',
          },
        ]
      : issueAttentionItems;
  const attentionCount = attentionItems.length;
  const overviewNeedsAction = attentionCount > 0;
  const nextAction = attentionItems[0] ?? null;

  const codexStatusLabel = codexReady
    ? t('settings.accessPage.statusLabels.connected')
    : codexNeedsAction
      ? t('settings.accessPage.statusLabels.needsAttention')
      : t('settings.accessPage.statusLabels.unknown');
  const codexStatusClass = codexReady
    ? 'opl-settings-status--ready'
    : codexNeedsAction
      ? 'opl-settings-status--attention'
      : '';
  const gatewayStatusLabel = gatewayNeedsAction
    ? t('settings.overviewPage.gateway.status.needsAttention')
    : gatewayConnected
      ? t('settings.overviewPage.gateway.status.connected')
      : gatewayAccount?.connection_mode === 'manual_key'
        ? t('settings.overviewPage.gateway.status.manualKey')
        : t('settings.overviewPage.gateway.status.notConnected');
  const gatewayStatusClass = gatewayNeedsAction
    ? 'opl-settings-status--attention'
    : gatewayConnected || gatewayAccount?.connection_mode === 'manual_key'
      ? 'opl-settings-status--ready'
      : '';

  const content = (
    <div className='opl-settings-page' data-testid='settings-page-overview'>
      <header className='opl-settings-page-header'>
        <div className='flex min-w-0 items-start gap-10px'>
          <span
            className='mt-1px flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'
            data-testid='settings-overview-icon'
            aria-hidden='true'
          >
            <DashboardOne theme='outline' size='16' />
          </span>
          <div className='opl-settings-page-header__copy'>
            <Typography.Title heading={4}>{t('settings.overviewPage.title')}</Typography.Title>
            <Typography.Text>{t('settings.overviewPage.description')}</Typography.Text>
          </div>
        </div>
      </header>

      <section className='opl-settings-section' id='status' data-testid='settings-overview-primary'>
        <div className='opl-settings-row'>
          <div className='opl-settings-row__main'>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.overviewPage.overall.title')}
            </Typography.Text>
            <Typography.Text className='text-12px text-t-secondary'>
              {overviewNeedsAction
                ? t('settings.overviewPage.overall.attentionDescription')
                : t('settings.overviewPage.overall.readyDescription')}
            </Typography.Text>
          </div>
          <div className='opl-settings-row__meta'>
            <span
              className={`opl-settings-status ${overviewNeedsAction ? 'opl-settings-status--attention' : 'opl-settings-status--ready'}`}
              data-testid='settings-overview-status'
            >
              {overviewNeedsAction
                ? t('settings.overviewPage.overall.attentionCount', {
                    count: attentionCount,
                    defaultValue: t('settings.oplEnvironmentPage.healthSummary.values.count', {
                      count: attentionCount,
                    }),
                  })
                : t('settings.oplEnvironmentPage.healthSummary.values.canUse')}
            </span>
          </div>
        </div>
      </section>

      {nextAction && (
        <section
          className='opl-settings-section opl-settings-section--attention'
          id='next-action'
          data-testid='settings-overview-exception'
        >
          <span id='attention' aria-hidden='true' />
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.overviewPage.attention.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.overviewPage.attention.description')}
              </Typography.Text>
            </div>
          </div>
          <div className='opl-settings-list' data-testid='settings-overview-attention-list'>
            {attentionItems.map((item, index) => (
              <div className='opl-settings-row' key={item.key}>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>{item.title}</Typography.Text>
                  <Typography.Text className='text-12px text-t-secondary'>{item.description}</Typography.Text>
                </div>
                {index === 0 && (
                  <div className='opl-settings-row__meta'>
                    <Button
                      type='primary'
                      onClick={() => navigate(item.route)}
                      data-testid='settings-overview-primary-action'
                    >
                      {item.label}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div
        className='opl-settings-list border-0 border-t border-solid border-border-1'
        id='common-actions'
        data-testid='settings-overview-summary-grid'
      >
        <div className='opl-settings-row' id='codex' data-testid='settings-overview-card-codex'>
          <div className='opl-settings-row__main'>
            <div className='flex min-w-0 items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                <Terminal theme='outline' size='16' aria-hidden='true' />
              </span>
              <div className='min-w-0 flex-1'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.overviewPage.codexTitle')}
                </Typography.Text>
                <Typography.Text className='block break-words text-12px text-t-secondary'>
                  {codexVersion
                    ? t('settings.accessPage.cards.codexCli.version', { version: codexVersion })
                    : t('settings.overviewPage.codexDescription')}
                </Typography.Text>
              </div>
            </div>
          </div>
          <div className='opl-settings-row__meta'>
            <span className={`opl-settings-status ${codexStatusClass}`.trim()}>{codexStatusLabel}</span>
            <Button type='text' className='px-0' onClick={() => navigate('/settings/access')}>
              {t('common.open')}
            </Button>
          </div>
        </div>

        <div className='opl-settings-row' id='gateway' data-testid='settings-overview-card-gateway'>
          <div className='opl-settings-row__main'>
            <div className='flex min-w-0 items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                <CloudStorage theme='outline' size='16' aria-hidden='true' />
              </span>
              <div className='min-w-0 flex-1'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.overviewPage.gateway.title')}
                </Typography.Text>
                <Typography.Text className='block break-words text-12px text-t-secondary'>
                  {gatewayConnected
                    ? t('settings.overviewPage.gateway.connectedDescription')
                    : gatewayAccount?.connection_mode === 'manual_key'
                      ? t('settings.overviewPage.gateway.manualKeyDescription')
                      : t('settings.overviewPage.gateway.notConnectedDescription')}
                </Typography.Text>
              </div>
            </div>
          </div>
          <div className='opl-settings-row__meta'>
            <span className={`opl-settings-status ${gatewayStatusClass}`.trim()}>{gatewayStatusLabel}</span>
            <Button type='text' className='px-0' onClick={() => navigate('/settings/gateway')}>
              {t('common.open')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
