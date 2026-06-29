/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Button, Card, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Refresh, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
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
  const attentionModules = modules.filter((module) => !isReadyStatus(moduleStatus(module)) || moduleNeedsManualHandling(module));

  const refresh = () => {
    void appStateQuery.load('fast', { showRefreshing: true });
  };

  const content = (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-col gap-8px md:flex-row md:items-start md:justify-between'>
        <div className='min-w-0'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.localServicesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>
            {t('settings.localServicesPage.description')}
          </Typography.Text>
        </div>
        <Button icon={<Refresh theme='outline' />} loading={appStateQuery.refreshing} onClick={refresh}>
          {t('common.refresh')}
        </Button>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-14px' data-testid='opl-local-services-cards'>
        {serviceCards.map((card) => (
          <Card key={card.key} bordered className='rd-8px'>
            <div className='flex flex-col gap-10px min-w-0'>
              <div className='flex items-start justify-between gap-10px'>
                <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  {card.key === 'background' ? <Toolkit theme='outline' /> : <CheckOne theme='outline' />}
                </span>
                <Tag color={card.tone}>{card.status}</Tag>
              </div>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>{card.title}</Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card bordered className='rd-8px' data-testid='opl-local-services-module-health'>
        <div className='flex flex-col gap-12px'>
          <div className='flex flex-col gap-4px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.localServicesPage.modules.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.localServicesPage.modules.description')}
              </Typography.Text>
            </div>
            <Tag color={attentionModules.length === 0 ? 'green' : 'orange'}>
              {attentionModules.length === 0
                ? t('settings.oplEnvironmentPage.healthSummary.values.none')
                : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: attentionModules.length })}
            </Tag>
          </div>

          <div className='flex flex-col divide-y divide-border-1'>
            {modules.map((module, index) => {
              const id = moduleId(module) || `module-${index + 1}`;
              const status = moduleStatus(module);
              const needsManualHandling = moduleNeedsManualHandling(module);
              return (
                <div key={id} className='flex flex-col gap-6px md:flex-row md:items-center md:justify-between py-12px'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>{moduleDisplayLabel(module)}</Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {needsManualHandling
                        ? t('settings.localServicesPage.modules.manualAttention')
                        : t('settings.localServicesPage.modules.normal')}
                    </Typography.Text>
                  </div>
                  <Space wrap size='mini'>
                    {needsManualHandling && (
                      <Tag color='orange'>{t('settings.localServicesPage.modules.manualTag')}</Tag>
                    )}
                    <Tag color={isReadyStatus(status) && !needsManualHandling ? 'green' : 'orange'}>
                      {formatStatus(status, t)}
                    </Tag>
                  </Space>
                </div>
              );
            })}
          </div>
          {modules.length === 0 && (
            <Typography.Text className='text-13px text-t-secondary'>
              {t('settings.localServicesPage.modules.empty')}
            </Typography.Text>
          )}
        </div>
      </Card>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.localServicesPage.maintenance.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.localServicesPage.maintenance.description')}
            </Typography.Text>
          </div>
          <Button icon={<Toolkit theme='outline' />} onClick={() => navigate('/settings/environment')}>
            {t('settings.localServicesPage.actions.openMaintenance')}
          </Button>
        </div>
      </Card>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper contentClassName='max-w-1080px'>{content}</SettingsPageWrapper> : content;
};

export default LocalServicesSettings;
