/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { faCircleInfo, faCloud, faGaugeHigh, faTerminal } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import {
  buildAccessProjection,
  formatGatewayObservedAt,
  formatGatewayTokenCount,
  gatewayAccountInitials,
  readGatewayAccountProjection,
} from '../accessProjection';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { isReadyStatus, moduleRecords, moduleSource, moduleStatus } from './runtimeStateView';

const DEVELOPER_SOURCE_MODES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

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

function formatGatewayNumber(value: number | null | undefined, locale?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

const OverviewSettings: React.FC<OverviewSettingsProps> = ({ withWrapper = true }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const modules = oplRecord(appState.modules);
  const modulesSummary = oplRecord(modules.summary);
  const moduleItems = moduleRecords(modules.items ?? modules.modules);
  const totalModules = Number(modulesSummary.default_modules_count ?? modulesSummary.total ?? 0);
  const readyModules = Number(modulesSummary.healthy_default_modules_count ?? modulesSummary.ready ?? 0);
  const modulesSourceMode = oplString(oplRecord(modules.source).mode) ?? oplString(modules.source);
  const developerSourceActive =
    Boolean(modulesSourceMode && DEVELOPER_SOURCE_MODES.has(modulesSourceMode)) ||
    moduleItems.some((module) => {
      const source = moduleSource(module);
      return Boolean(source && DEVELOPER_SOURCE_MODES.has(source));
    });
  const actionableModuleIssue = moduleItems.some((module) => {
    const source = moduleSource(module) ?? modulesSourceMode;
    return !isReadyStatus(moduleStatus(module)) && !(source && DEVELOPER_SOURCE_MODES.has(source));
  });
  const modulesNeedAction =
    actionableModuleIssue ||
    (moduleItems.length === 0 && totalModules > 0 && readyModules < totalModules && !developerSourceActive);

  const { cards: accessCards } = buildAccessProjection(appState, t);
  const codexCard = accessCards.find((card) => card.key === 'model');
  const modelAccessCard = accessCards.find((card) => card.key === 'account');
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
  const accessNeedsAction = codexCard?.tone === 'orange' || modelAccessCard?.tone === 'orange' || gatewayNeedsAction;
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status);
  const temporalNeedsAction = Boolean(temporalStatus && !isReadyStatus(temporalStatus));
  const attentionCount = Number(accessNeedsAction) + Number(temporalNeedsAction) + Number(modulesNeedAction);
  const overviewNeedsAction = attentionCount > 0;

  const attentionItems = [
    accessNeedsAction
      ? {
          key: 'codex-access',
          title: t('settings.overviewPage.attention.codexTitle'),
          description: t('settings.overviewPage.quickEntries.modelAccount.description'),
          label: t('common.open'),
          route: '/settings/access',
        }
      : null,
    temporalNeedsAction
      ? {
          key: 'local-services',
          title: t('settings.overviewPage.quickEntries.localServices.title'),
          description: t('settings.overviewPage.quickEntries.localServices.description'),
          label: t('settings.overviewPage.actions.openRuntimeSettings'),
          route: '/settings/environment',
        }
      : null,
    modulesNeedAction
      ? {
          key: 'capabilities',
          title: t('settings.overviewPage.attention.capabilitiesTitle'),
          description: t('settings.oplEnvironmentPage.modulesReadyCount', {
            ready: readyModules,
            total: totalModules,
          }),
          label: t('settings.overviewPage.actions.openRuntimeSettings'),
          route: '/settings/environment?section=packages',
        }
      : null,
  ].filter((item): item is AttentionItem => item !== null);
  const nextAction = attentionItems[0] ?? null;

  const codexStatusLabel =
    codexCard?.tone === 'green'
      ? t('settings.accessPage.statusLabels.connected')
      : codexCard?.tone === 'orange'
        ? t('settings.accessPage.statusLabels.needsAttention')
        : t('settings.accessPage.statusLabels.unknown');
  const codexStatusClass =
    codexCard?.tone === 'green'
      ? 'opl-settings-status--ready'
      : codexCard?.tone === 'orange'
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
  const gatewayObservedAt = formatGatewayObservedAt(
    gatewayAccount?.freshness.observed_at ?? null,
    i18n.resolvedLanguage
  );
  const gatewayAccountName =
    gatewayAccount?.account?.display_name ||
    gatewayAccount?.account?.email ||
    t('settings.accessPage.gatewayAccount.unknownAccount');

  const technicalRows = [
    {
      label: t('settings.overviewPage.technical.codex'),
      value: codexCard?.detail || t('settings.accessPage.statusLabels.unknown'),
    },
    {
      label: t('settings.overviewPage.technical.gatewayFreshness'),
      value: gatewayObservedAt ?? t('settings.accessPage.gatewayAccount.unknownObservedAt'),
    },
    {
      label: t('settings.overviewPage.technical.backgroundService'),
      value: temporalStatus ?? t('settings.accessPage.statusLabels.unknown'),
    },
    {
      label: t('settings.overviewPage.technical.capabilities'),
      value: t('settings.oplEnvironmentPage.modulesReadyCount', { ready: readyModules, total: totalModules }),
    },
  ];

  const content = (
    <div className='opl-settings-page' data-testid='settings-page-overview'>
      <header className='opl-settings-page-header'>
        <div className='flex min-w-0 items-start gap-10px'>
          <span
            className='mt-1px flex h-32px w-32px shrink-0 items-center justify-center rd-7px bg-primary-1 text-primary-6'
            data-testid='settings-overview-icon'
            aria-hidden='true'
          >
            <FontAwesomeIcon icon={faGaugeHigh} className='text-16px' />
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
        className='grid grid-cols-1 gap-14px md:grid-cols-2'
        id='common-actions'
        data-testid='settings-overview-summary-grid'
      >
        <section className='opl-settings-section flex' data-testid='settings-overview-card-codex'>
          <div className='flex min-w-0 flex-1 flex-col gap-12px p-16px'>
            <div className='flex min-w-0 items-start justify-between gap-12px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-primary-6'>
                <FontAwesomeIcon icon={faTerminal} className='text-14px' aria-hidden='true' />
              </span>
              <span className={`opl-settings-status ${codexStatusClass}`.trim()}>{codexStatusLabel}</span>
            </div>
            <div className='min-w-0 flex-1'>
              <Typography.Text className='block font-600 text-t-primary'>
                {codexCard?.title ?? t('settings.overviewPage.codexTitle')}
              </Typography.Text>
              <Typography.Text className='block break-words text-12px text-t-secondary'>
                {codexCard?.detail || t('settings.overviewPage.codexDescription')}
              </Typography.Text>
            </div>
            <Button type='text' className='self-start px-0' onClick={() => navigate('/settings/access')}>
              {t('common.open')}
            </Button>
          </div>
        </section>

        <section className='opl-settings-section flex' id='gateway-usage' data-testid='settings-overview-card-gateway'>
          <div className='flex min-w-0 flex-1 flex-col'>
            <div className='flex min-w-0 flex-1 flex-col gap-12px p-16px'>
              <div className='flex min-w-0 items-start justify-between gap-12px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-[rgb(var(--blue-6))]'>
                  <FontAwesomeIcon icon={faCloud} className='text-14px' aria-hidden='true' />
                </span>
                <span className={`opl-settings-status ${gatewayStatusClass}`.trim()}>{gatewayStatusLabel}</span>
              </div>
              <div className='min-w-0'>
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

            {gatewayConnected && gatewayAccount?.account && (
              <div
                className='border-t border-solid border-[var(--border-base)]'
                data-testid='settings-overview-gateway-account'
              >
                <div className='flex min-w-0 items-center gap-10px px-16px py-12px'>
                  <span className='flex h-34px w-34px shrink-0 items-center justify-center rd-full bg-primary-1 text-12px font-600 text-primary-6'>
                    {gatewayAccountInitials(gatewayAccount.account.display_name, gatewayAccount.account.email)}
                  </span>
                  <div className='min-w-0'>
                    <Typography.Text className='block truncate font-600 text-t-primary'>
                      {gatewayAccountName}
                    </Typography.Text>
                    {gatewayAccount.account.email && (
                      <Typography.Text className='block break-all text-12px text-t-secondary'>
                        {gatewayAccount.account.email}
                      </Typography.Text>
                    )}
                  </div>
                </div>
                <div
                  className='grid grid-cols-1 border-t border-solid border-[var(--border-base)] sm:grid-cols-3'
                  data-testid='settings-overview-gateway-metrics'
                >
                  <div className='min-w-0 px-16px py-11px'>
                    <Typography.Text className='block text-16px font-600 text-t-primary'>
                      {formatGatewayTokenCount(gatewayAccount.usage?.today_tokens ?? null, i18n.resolvedLanguage)}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.todayTokens')}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0 px-16px py-11px'>
                    <Typography.Text className='block text-16px font-600 text-t-primary'>
                      {formatGatewayNumber(gatewayAccount.usage?.today_actual_cost, i18n.resolvedLanguage)}{' '}
                      {gatewayAccount.usage?.currency ?? ''}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.todayCost')}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0 px-16px py-11px'>
                    <Typography.Text className='block text-16px font-600 text-t-primary'>
                      {formatGatewayNumber(gatewayAccount.account.balance.amount, i18n.resolvedLanguage)}{' '}
                      {gatewayAccount.account.balance.currency}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.balance')}
                    </Typography.Text>
                  </div>
                </div>
              </div>
            )}

            <div className='mt-auto flex justify-between gap-12px border-t border-solid border-[var(--border-base)] px-16px py-10px'>
              <Typography.Text className='min-w-0 break-words text-12px text-t-secondary'>
                {t('settings.overviewPage.gateway.updatedAt', {
                  observedAt: gatewayObservedAt ?? t('settings.accessPage.gatewayAccount.unknownObservedAt'),
                })}
              </Typography.Text>
              <Button type='text' className='shrink-0 px-0' onClick={() => navigate('/settings/access')}>
                {t('common.open')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section
        className='opl-settings-section opl-settings-surface--diagnostic'
        id='technical-details'
        data-testid='settings-overview-technical-details'
      >
        <div className='opl-settings-section__header'>
          <div className='flex min-w-0 items-start gap-10px'>
            <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
              <FontAwesomeIcon icon={faCircleInfo} className='text-14px' aria-hidden='true' />
            </span>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('common.technical_details')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.overviewPage.technical.description')}
              </Typography.Text>
            </div>
          </div>
        </div>
        <div className='opl-settings-list'>
          {technicalRows.map((row) => (
            <div className='opl-settings-row' key={row.label}>
              <Typography.Text className='text-12px text-t-secondary'>{row.label}</Typography.Text>
              <Typography.Text className='min-w-0 break-words text-right text-12px text-t-primary'>
                {row.value}
              </Typography.Text>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
