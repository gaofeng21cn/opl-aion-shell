/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { Puzzle, Server, Terminal, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import OplRefreshIconButton from '@/renderer/components/opl/OplRefreshIconButton';
import {
  formatStatus,
  isReadyStatus,
  moduleDisplayLabel,
  moduleId,
  moduleNeedsManualHandling,
  moduleRecords,
  moduleStatus,
  normalizeModule,
} from './runtimeStateView';

type LocalServicesSettingsProps = {
  withWrapper?: boolean;
};

type ServiceCard = {
  key: string;
  title: string;
  detail: string;
  status: string;
  tone: 'green' | 'orange';
};

const LocalServicesSettings: React.FC<LocalServicesSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const modulesPayload = oplRecord(appState.modules);
  const modules = useMemo(
    () => moduleRecords(modulesPayload.items ?? modulesPayload.modules).map(normalizeModule),
    [modulesPayload.items, modulesPayload.modules]
  );
  const codexStatus = oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : 'unknown');
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status) ?? 'unknown';
  const temporalAddress =
    oplString(temporal.address) ??
    oplString(temporal.endpoint) ??
    oplString(temporal.url) ??
    oplString(provider.temporal_address);
  const readyModules = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const modulesStatus = readyModules >= modules.length ? 'ready' : 'attention_required';
  const serviceCards: ServiceCard[] = [
    {
      key: 'codex',
      title: t('settings.localServicesPage.cards.codex.title'),
      detail: t('settings.localServicesPage.cards.codex.description'),
      status: formatStatus(codexStatus, t),
      tone: isReadyStatus(codexStatus) ? 'green' : 'orange',
    },
    {
      key: 'background',
      title: t('settings.localServicesPage.cards.background.title'),
      detail: temporalAddress
        ? t('settings.localServicesPage.cards.background.address', { address: temporalAddress })
        : t('settings.localServicesPage.cards.background.description'),
      status: formatStatus(temporalStatus, t),
      tone: isReadyStatus(temporalStatus) ? 'green' : 'orange',
    },
    {
      key: 'modules',
      title: t('settings.localServicesPage.cards.modules.title'),
      detail: t('settings.localServicesPage.cards.modules.description'),
      status: t('settings.oplEnvironmentPage.modulesReadyCount', {
        ready: readyModules,
        total: modules.length,
      }),
      tone: isReadyStatus(modulesStatus) ? 'green' : 'orange',
    },
  ];
  const attentionModules = modules.filter(
    (module) => !isReadyStatus(moduleStatus(module)) || moduleNeedsManualHandling(module)
  );

  const refresh = () => {
    void appStateQuery.load('fast', { showRefreshing: true });
  };

  const content = (
    <div className='opl-settings-page' data-testid='settings-page-local-services'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.localServicesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.localServicesPage.description')}</Typography.Text>
        </div>
        <div className='opl-settings-page-header__actions'>
          <OplRefreshIconButton label={t('common.refresh')} loading={appStateQuery.refreshing} onClick={refresh} />
        </div>
      </header>

      <div className='opl-settings-flat-stack' data-testid='opl-local-services-cards'>
        <section className='opl-settings-section'>
          <div className='opl-settings-list'>
            {serviceCards.map((card) => {
              const icon =
                card.key === 'codex' ? (
                  <Terminal theme='outline' size='16' fill='currentColor' />
                ) : card.key === 'background' ? (
                  <Server theme='outline' size='16' fill='currentColor' />
                ) : (
                  <Puzzle theme='outline' size='16' fill='currentColor' />
                );
              return (
                <div className='opl-settings-row' key={card.key} data-testid={`opl-local-service-${card.key}`}>
                  <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
                    <span className='opl-settings-icon'>{icon}</span>
                    <div className='min-w-0'>
                      <Typography.Text className='block font-600 text-t-primary'>{card.title}</Typography.Text>
                      <Typography.Text className='block break-words text-12px text-t-secondary'>
                        {card.detail}
                      </Typography.Text>
                    </div>
                  </div>
                  <div className='opl-settings-row__meta'>
                    <span
                      className={`opl-settings-status ${
                        card.tone === 'green' ? 'opl-settings-status--ready' : 'opl-settings-status--attention'
                      }`}
                    >
                      {card.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className='opl-settings-section' data-testid='opl-local-services-module-health'>
          <div className='opl-settings-section__header'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.localServicesPage.modules.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.localServicesPage.modules.description')}
              </Typography.Text>
            </div>
            <span
              className={`opl-settings-status ${
                attentionModules.length === 0 ? 'opl-settings-status--ready' : 'opl-settings-status--attention'
              }`}
            >
              {attentionModules.length === 0
                ? t('settings.oplEnvironmentPage.healthSummary.values.none')
                : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: attentionModules.length })}
            </span>
          </div>

          <div className='opl-settings-list'>
            {modules.map((module, index) => {
              const id = moduleId(module) || `module-${index + 1}`;
              const status = moduleStatus(module);
              const needsManualHandling = moduleNeedsManualHandling(module);
              const ready = isReadyStatus(status) && !needsManualHandling;
              return (
                <div className='opl-settings-row' key={id}>
                  <div className='opl-settings-row__main'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {moduleDisplayLabel(module)}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {needsManualHandling
                        ? t('settings.localServicesPage.modules.manualAttention')
                        : t('settings.localServicesPage.modules.normal')}
                    </Typography.Text>
                  </div>
                  <div className='opl-settings-row__meta'>
                    <span
                      className={`opl-settings-status ${
                        ready ? 'opl-settings-status--ready' : 'opl-settings-status--attention'
                      }`}
                    >
                      {needsManualHandling
                        ? `${t('settings.localServicesPage.modules.manualTag')} · ${formatStatus(status, t)}`
                        : formatStatus(status, t)}
                    </span>
                  </div>
                </div>
              );
            })}
            {modules.length === 0 && (
              <div className='opl-settings-empty'>
                <Typography.Text className='text-13px text-t-secondary'>
                  {t('settings.localServicesPage.modules.empty')}
                </Typography.Text>
              </div>
            )}
          </div>
        </section>

        <section className='opl-settings-section'>
          <div className='opl-settings-row'>
            <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
              <span className='opl-settings-icon'>
                <Toolkit theme='outline' size='16' fill='currentColor' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.localServicesPage.maintenance.title')}
                </Typography.Text>
                <Typography.Text className='block break-words text-12px text-t-secondary'>
                  {t('settings.localServicesPage.maintenance.description')}
                </Typography.Text>
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <Button
                icon={<Toolkit theme='outline' size='16' fill='currentColor' />}
                onClick={() => navigate('/settings/environment')}
              >
                {t('settings.localServicesPage.actions.openMaintenance')}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default LocalServicesSettings;
