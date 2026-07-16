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
import {
  formatGatewayObservedAt,
  formatGatewayTokenCount,
  gatewayAccountInitials,
  readGatewayAccountProjection,
} from '../accessProjection';
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

function issueSettingsRoute(issue: Record<string, unknown>): string {
  const issueId = oplString(issue.issue_id) ?? '';
  const actionId = oplString(issue.recommended_action_id) ?? '';
  if (issueId === 'provider_failed_with_repair') return '/settings/environment';
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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const coreCodex = oplRecord(oplRecord(appState.core).codex);
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const statusSummary = oplRecord(settingsControlCenter.status_summary);
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
  const attentionItems: AttentionItem[] = actionableIssues.map((issue, index) => {
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
          ? t('settings.overviewPage.quickEntries.localServices.description')
          : t('settings.overviewPage.attention.capabilitiesDescription'),
      label: t('common.open'),
      route,
    };
  });
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
  const gatewayAccountName =
    gatewayAccount?.account?.display_name ||
    gatewayAccount?.account?.email ||
    t('settings.accessPage.gatewayAccount.unknownAccount');
  const gatewayObservedAt = formatGatewayObservedAt(
    gatewayAccount?.freshness.observed_at ?? null,
    i18n.resolvedLanguage
  );
  const formatGatewayAmount = (value: number | null | undefined, currency: string | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    const amount = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 2 }).format(value);
    return `${amount}${currency ? ` ${currency}` : ''}`;
  };
  const technicalUnknown = t('settings.oplEnvironmentPage.status.unknown');
  const technicalRows = [
    {
      id: 'codex',
      label: t('settings.overviewPage.technical.codex'),
      value: [codexVersion, codexStatusLabel].filter(Boolean).join(' · ') || technicalUnknown,
    },
    {
      id: 'gateway',
      label: t('settings.overviewPage.technical.gatewayFreshness'),
      value: gatewayObservedAt ?? technicalUnknown,
    },
    {
      id: 'background',
      label: t('settings.overviewPage.technical.backgroundService'),
      value: oplString(statusSummary.temporal_provider) ?? technicalUnknown,
    },
    {
      id: 'capabilities',
      label: t('settings.overviewPage.technical.capabilities'),
      value: oplString(statusSummary.runtime_source_carrier_health) ?? technicalUnknown,
    },
  ];

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
        className='opl-settings-list border-t border-solid border-border-1'
        id='common-actions'
        data-testid='settings-overview-summary-grid'
      >
        <div className='opl-settings-row' data-testid='settings-overview-card-codex'>
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

        <div className='opl-settings-row' id='gateway-usage' data-testid='settings-overview-card-gateway'>
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
                {gatewayConnected && gatewayAccount?.account && (
                  <div
                    className='mt-8px flex min-w-0 items-center gap-8px'
                    data-testid='settings-overview-gateway-account'
                  >
                    <span className='flex size-28px shrink-0 items-center justify-center rd-full bg-success-1 text-11px font-600 text-success-6'>
                      {gatewayAccountInitials(gatewayAccount.account.display_name, gatewayAccount.account.email)}
                    </span>
                    <div className='min-w-0'>
                      <Typography.Text className='block truncate text-12px font-500 text-t-primary'>
                        {gatewayAccountName}
                      </Typography.Text>
                      {gatewayAccount.account.email && (
                        <Typography.Text className='block break-all text-11px text-t-secondary'>
                          {gatewayAccount.account.email}
                        </Typography.Text>
                      )}
                    </div>
                  </div>
                )}

                {gatewayConnected && gatewayAccount?.account && (
                  <div
                    className='mt-8px flex flex-wrap gap-x-16px gap-y-4px'
                    data-testid='settings-overview-gateway-metrics'
                  >
                    {[
                      {
                        id: 'today-tokens',
                        label: t('settings.accessPage.gatewayAccount.metrics.todayTokens'),
                        value: formatGatewayTokenCount(
                          gatewayAccount.usage?.today_tokens ?? null,
                          i18n.resolvedLanguage
                        ),
                      },
                      {
                        id: 'today-cost',
                        label: t('settings.accessPage.gatewayAccount.metrics.todayCost'),
                        value: formatGatewayAmount(
                          gatewayAccount.usage?.today_actual_cost,
                          gatewayAccount.usage?.currency
                        ),
                      },
                      {
                        id: 'balance',
                        label: t('settings.accessPage.gatewayAccount.metrics.balance'),
                        value: formatGatewayAmount(
                          gatewayAccount.account.balance.amount,
                          gatewayAccount.account.balance.currency
                        ),
                      },
                      {
                        id: 'availability',
                        label: t('settings.overviewPage.gateway.metrics.availability'),
                        value: gatewayStatusLabel,
                      },
                    ].map((metric) => (
                      <span className='min-w-0 text-11px text-t-secondary' key={metric.id}>
                        {metric.label}: <strong className='font-500 text-t-primary'>{metric.value}</strong>
                      </span>
                    ))}
                  </div>
                )}
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

      <section className='opl-settings-section' data-testid='settings-overview-technical-details'>
        <div className='opl-settings-section__header'>
          <Typography.Text className='text-12px text-t-secondary'>
            {t('settings.overviewPage.technical.description')}
          </Typography.Text>
        </div>
        <div className='opl-settings-list'>
          {technicalRows.map((row) => (
            <div className='opl-settings-row' key={row.id} data-testid={`settings-overview-technical-${row.id}`}>
              <Typography.Text className='font-500 text-t-primary'>{row.label}</Typography.Text>
              <Typography.Text className='break-all text-right text-12px text-t-secondary'>{row.value}</Typography.Text>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
