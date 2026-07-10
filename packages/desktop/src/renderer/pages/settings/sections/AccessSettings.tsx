/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Input, Message, Modal, Typography } from '@arco-design/web-react';
import { Open, Repair, UpdateRotation } from '@icon-park/react';
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

function splitAccessDetail(detail: string): string[] {
  return detail.split(' · ').filter((line) => line.trim().length > 0);
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
  const modelAccessCard = cards.find((card) => card.key === 'account');
  const codexCard = cards.find((card) => card.key === 'model');
  const hasAccessIssue = cards.some((card) => card.tone === 'orange');
  const modelAccessStatus =
    modelAccessCard?.statusLabel ??
    t(`settings.oplEnvironmentPage.status.${modelAccessCard?.status ?? 'unknown'}`, {
      status: modelAccessCard?.status ?? 'unknown',
    });
  const modelAccessSource = modelAccessCard
    ? splitAccessDetail(modelAccessCard.detail).find((line) => line !== modelAccessStatus)
    : null;
  const codexDetailLines = codexCard ? splitAccessDetail(codexCard.detail) : [];

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
    <div className='opl-settings-page'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>{t('settings.accessPage.title')}</Typography.Title>
          <Typography.Text>{t('settings.accessPage.description')}</Typography.Text>
        </div>
        <div className='opl-settings-page-header__actions'>
          {hasAccessIssue && (
            <Button icon={<Repair theme='outline' />} onClick={() => navigate('/settings/environment#health')}>
              {t('settings.accessPage.actions.fix')}
            </Button>
          )}
          <Button
            type={hasAccessIssue ? 'secondary' : 'text'}
            icon={<UpdateRotation theme='outline' />}
            loading={appStateQuery.refreshing}
            onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
          >
            {t('settings.accessPage.actions.recheck')}
          </Button>
        </div>
      </header>

      <section className='opl-settings-section' id='model-access'>
        <div className='opl-settings-section__header'>
          <div>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.accessPage.modelAccessSection.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.accessPage.modelAccessSection.description')}
            </Typography.Text>
          </div>
        </div>
        <div className='opl-settings-list'>
          <div className='opl-settings-row' id='opl-gateway'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-500 text-t-primary'>
                {t('settings.accessPage.cards.account.title')}
              </Typography.Text>
              <Typography.Text className='text-12px text-t-secondary'>
                {modelAccessSource ?? modelAccessStatus}
              </Typography.Text>
              {gatewayFormVisible && (
                <div className='mt-8px flex max-w-560px flex-col gap-8px md:flex-row'>
                  <Input.Password
                    data-testid='opl-settings-codex-api-key-input'
                    aria-label='opl-settings-codex-api-key-input'
                    value={codexApiKey}
                    placeholder={t('settings.accessPage.modelAccount.apiKeyPlaceholder')}
                    autoComplete='off'
                    className='min-w-0 flex-1'
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
                  <Button onClick={() => setGatewayFormVisible(false)}>{t('common.cancel')}</Button>
                </div>
              )}
            </div>
            <div className='opl-settings-row__meta'>
              <span
                className={`opl-settings-status ${modelAccessCard?.tone === 'green' ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
              >
                {modelAccessStatus}
              </span>
              {!gatewayFormVisible && (
                <Button
                  data-testid='opl-settings-show-gateway-config-button'
                  onClick={() => setGatewayFormVisible(true)}
                >
                  {t('settings.accessPage.modelAccount.showConfigButton')}
                </Button>
              )}
            </div>
          </div>

          <div className='opl-settings-row' id='codex-cli'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-500 text-t-primary'>
                {codexCard?.title ?? t('settings.accessPage.cards.codexCli.title')}
              </Typography.Text>
              {codexDetailLines.map((line) => (
                <Typography.Text key={line} className='text-12px text-t-secondary'>
                  {line}
                </Typography.Text>
              ))}
            </div>
            <div className='opl-settings-row__meta'>
              <span
                className={`opl-settings-status ${codexCard?.tone === 'green' ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
              >
                {codexCard?.statusLabel ??
                  t(`settings.oplEnvironmentPage.status.${codexCard?.status ?? 'unknown'}`, {
                    status: codexCard?.status ?? 'unknown',
                  })}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className='opl-settings-section' id='browser-access'>
        <span id='web-remote' aria-hidden='true' />
        <div className='opl-settings-section__header'>
          <div>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.accessPage.remote.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.accessPage.remote.description')}
            </Typography.Text>
          </div>
        </div>
        <div className='opl-settings-list'>
          <div className='opl-settings-row'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-500 text-t-primary'>
                {t('settings.accessPage.remote.nativeTitle')}
              </Typography.Text>
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
            <div className='opl-settings-row__meta'>
              <Button
                data-testid='opl-settings-open-native-remote-settings'
                icon={<Open theme='outline' />}
                onClick={() => setRemoteSettingsVisible(true)}
              >
                {t('settings.accessPage.remote.openNativeSettings')}
              </Button>
            </div>
          </div>
          <div className='opl-settings-row'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-500 text-t-primary'>
                {t('settings.accessPage.remote.dockerTitle')}
              </Typography.Text>
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.accessPage.remote.dockerDescription')}
              </Typography.Text>
            </div>
            <div className='opl-settings-row__meta'>
              <Button
                icon={<Open theme='outline' />}
                data-testid='opl-settings-open-resources-connections'
                onClick={() => void navigate('/settings/resources')}
              >
                {t('settings.accessPage.remote.openResources')}
              </Button>
            </div>
          </div>
        </div>
      </section>

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

const AccessSettings: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <SettingsPageWrapper>
      {pathname.endsWith('/resources') ? <ResourcesSettingsContent /> : <AccessSettingsContent />}
    </SettingsPageWrapper>
  );
};

export default AccessSettings;
