/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Input, Message, Modal, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Earth, Open, Repair, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { useTranslation } from 'react-i18next';
import { buildAccessProjection } from '../accessProjection';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';
import { useLocation, useNavigate } from 'react-router-dom';
import { ResourcesSettingsContent } from './ResourcesSettings';

type OplCommandResult = Awaited<ReturnType<typeof ipcBridge.oplRuntime.executeAction.invoke>>;

function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

export const AccessSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const [codexApiKey, setCodexApiKey] = useState('');
  const [gatewayFormVisible, setGatewayFormVisible] = useState(false);
  const [remoteSettingsVisible, setRemoteSettingsVisible] = useState(false);
  const [configureLoading, setConfigureLoading] = useState(false);
  const { cards } = buildAccessProjection(appStateQuery.appState, t);
  const gatewayCard = cards.find((card) => card.key === 'account');
  const readinessCards = cards.filter((card) => card.key !== 'account');
  const hasAccessIssue = cards.some((card) => card.tone === 'orange');

  const handleConfigureCodex = async () => {
    const trimmed = codexApiKey.trim();
    if (!trimmed) {
      Message.error(t('settings.accessPage.modelAccount.apiKeyRequired'));
      return;
    }

    setConfigureLoading(true);
    try {
      const result = await ipcBridge.oplRuntime.configureCodex.invoke({ apiKey: trimmed });
      assertOplCommandOk(result);
      setCodexApiKey('');
      Message.success(t('settings.accessPage.modelAccount.configureSuccess'));
      await appStateQuery.load('fast', { showRefreshing: true });
    } catch {
      Message.error(t('settings.accessPage.modelAccount.configureFailed'));
    } finally {
      setConfigureLoading(false);
    }
  };

  return (
    <div className='flex flex-col gap-16px'>
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.accessPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.accessPage.description')}</Typography.Text>
      </div>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <div className='flex items-center gap-8px mb-8px'>
              <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                <CheckOne theme='outline' />
              </span>
              <Typography.Text className='font-600 text-t-primary'>
                {t('settings.accessPage.modelAccount.title')}
              </Typography.Text>
              {gatewayCard && (
                <Tag color={gatewayCard.tone}>
                  {gatewayCard.statusLabel ??
                    t(`settings.oplEnvironmentPage.status.${gatewayCard.status}`, { status: gatewayCard.status })}
                </Tag>
              )}
            </div>
            <Typography.Text className='block text-13px text-t-secondary break-words'>
              {t('settings.accessPage.modelAccount.description')}
            </Typography.Text>
            {gatewayCard && gatewayCard.tone !== 'green' && (
              <div className='mt-8px flex flex-col gap-4px'>
                {splitAccessDetail(gatewayCard.detail).map((line) => (
                  <Typography.Text key={line} className='text-12px text-t-secondary break-words'>
                    {line}
                  </Typography.Text>
                ))}
              </div>
            )}
            {!gatewayFormVisible ? (
              <Button
                className='mt-12px'
                data-testid='opl-settings-show-gateway-config-button'
                onClick={() => setGatewayFormVisible(true)}
              >
                {t('settings.accessPage.modelAccount.showConfigButton')}
              </Button>
            ) : (
              <div className='mt-12px flex flex-col gap-8px md:flex-row md:items-center'>
                <Input.Password
                  data-testid='opl-settings-codex-api-key-input'
                  aria-label='opl-settings-codex-api-key-input'
                  value={codexApiKey}
                  placeholder={t('settings.accessPage.modelAccount.apiKeyPlaceholder')}
                  autoComplete='off'
                  className='md:max-w-420px'
                  onChange={setCodexApiKey}
                  onPressEnter={() => void handleConfigureCodex()}
                />
                <Button
                  data-testid='opl-settings-configure-codex-button'
                  aria-label='opl-settings-configure-codex-button'
                  type='primary'
                  loading={configureLoading}
                  onClick={() => void handleConfigureCodex()}
                >
                  {t('settings.accessPage.modelAccount.configureButton')}
                </Button>
              </div>
            )}
          </div>
          <Space wrap>
            <Button
              type='primary'
              icon={<UpdateRotation theme='outline' />}
              loading={appStateQuery.refreshing}
              onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
            >
              {t('settings.accessPage.actions.recheck')}
            </Button>
            {hasAccessIssue && (
              <Button
                icon={<Repair theme='outline' />}
                onClick={() => {
                  window.location.hash = '#/settings/environment';
                }}
              >
                {t('settings.accessPage.actions.fix')}
              </Button>
            )}
          </Space>
        </div>
      </Card>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-14px'>
        {readinessCards.map((card) => (
          <Card key={card.key} bordered className='rd-8px'>
            <div className='flex flex-col gap-8px min-w-0'>
              <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
              <Tag color={card.tone}>
                {card.statusLabel ?? t(`settings.oplEnvironmentPage.status.${card.status}`, { status: card.status })}
              </Tag>
              {card.help && <Typography.Text className='text-12px text-t-secondary'>{card.help}</Typography.Text>}
              <div className='flex flex-col gap-3px'>
                {splitAccessDetail(card.detail).map((line) => (
                  <Typography.Text key={line} className='text-12px text-t-secondary break-words'>
                    {line}
                  </Typography.Text>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card bordered className='rd-8px' id='web-remote'>
        <div className='flex flex-col gap-12px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <div className='flex items-center gap-8px mb-8px'>
                <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  <Earth theme='outline' />
                </span>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.accessPage.remote.title')}
                </Typography.Text>
              </div>
              <Typography.Text className='block text-13px text-t-secondary break-words'>
                {t('settings.accessPage.remote.description')}
              </Typography.Text>
              <Button
                className='mt-12px'
                type='secondary'
                icon={<Open theme='outline' />}
                data-testid='opl-settings-open-resources-connections'
                onClick={() => void navigate('/settings/resources')}
              >
                {t('settings.accessPage.remote.openResources')}
              </Button>
            </div>
          </div>
          <div className='grid grid-cols-1 gap-10px'>
            <div className='flex flex-col gap-8px p-12px rd-8px bg-fill-1 min-w-0'>
              <div className='flex flex-wrap items-center gap-8px'>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.accessPage.remote.nativeTitle')}
                </Typography.Text>
                <Tag color='blue'>{t('settings.accessPage.remote.webui')}</Tag>
                <Tag color='blue'>{t('settings.accessPage.remote.remoteAccess')}</Tag>
              </div>
              <div className='grid grid-cols-1 gap-4px'>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.nativePort')}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.nativeAccount')}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.nativePassword')}
                </Typography.Text>
              </div>
              <Button
                data-testid='opl-settings-open-native-remote-settings'
                type='secondary'
                icon={<Open theme='outline' />}
                onClick={() => setRemoteSettingsVisible(true)}
              >
                {t('settings.accessPage.remote.openNativeSettings')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
      <Modal
        visible={remoteSettingsVisible}
        title={t('settings.accessPage.remote.nativeTitle')}
        footer={null}
        className='settings-sub-modal'
        style={{ width: 'min(820px, calc(100vw - 48px))' }}
        onCancel={() => setRemoteSettingsVisible(false)}
      >
        <WebuiModalContent />
      </Modal>
    </div>
  );
};

function splitAccessDetail(detail: string): string[] {
  return detail.split(' · ').filter((line) => line.trim().length > 0);
}

const AccessSettings: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <SettingsPageWrapper>
      {pathname.endsWith('/resources') ? <ResourcesSettingsContent /> : <AccessSettingsContent />}
    </SettingsPageWrapper>
  );
};

export default AccessSettings;
