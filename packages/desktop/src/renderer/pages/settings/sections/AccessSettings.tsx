/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Input, Message, Typography } from '@arco-design/web-react';
import { CheckOne, Key, Terminal, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { useTranslation } from 'react-i18next';
import { buildAccessProjection } from '../accessProjection';
import { useLocation } from 'react-router-dom';
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
  const appStateQuery = useOplAppState('fast');
  const [codexApiKey, setCodexApiKey] = useState('');
  const [gatewayFormVisible, setGatewayFormVisible] = useState(false);
  const [configureLoading, setConfigureLoading] = useState(false);
  const { cards } = buildAccessProjection(appStateQuery.appState, t);
  const modelAccessCard = cards.find((card) => card.key === 'account');
  const codexCard = cards.find((card) => card.key === 'model');
  const modelAccessNeedsAttention = modelAccessCard?.tone === 'orange';
  const modelAccessStatus =
    modelAccessCard?.statusLabel ??
    t(`settings.oplEnvironmentPage.status.${modelAccessCard?.status ?? 'unknown'}`, {
      status: modelAccessCard?.status ?? 'unknown',
    });
  const modelAccessCompactStatus =
    modelAccessCard?.tone === 'green'
      ? t('settings.accessPage.statusLabels.connected')
      : modelAccessNeedsAttention
        ? t('settings.accessPage.statusLabels.needsAttention')
        : t('settings.accessPage.statusLabels.unknown');
  const modelAccessStatusModifier =
    modelAccessCard?.tone === 'green'
      ? 'opl-settings-status--ready'
      : modelAccessCard?.tone === 'orange'
        ? 'opl-settings-status--attention'
        : '';
  const modelAccessSource = modelAccessCard?.detail || null;
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
    <div className='opl-settings-page' data-testid='settings-page-access'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>{t('settings.accessPage.title')}</Typography.Title>
          <Typography.Text>{t('settings.accessPage.modelAccessSection.description')}</Typography.Text>
        </div>
      </header>

      <div className='grid grid-cols-1 gap-14px md:grid-cols-2'>
        <section
          className={`opl-settings-section opl-settings-surface--status ${
            modelAccessNeedsAttention ? 'opl-settings-section--attention' : ''
          }`}
          id='provider-source'
          data-testid='settings-access-primary'
        >
          <span id='model-access' aria-hidden='true' />
          {modelAccessNeedsAttention && <span data-testid='settings-access-exception' aria-hidden='true' />}
          <div className='opl-settings-row h-full items-start'>
            <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                <CheckOne theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.accessPage.cards.account.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {modelAccessSource ?? modelAccessStatus}
                </Typography.Text>
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <span
                className={`opl-settings-status ${modelAccessStatusModifier}`.trim()}
                data-testid='settings-access-model-status'
              >
                {modelAccessCompactStatus}
              </span>
            </div>
          </div>
        </section>

        <section
          className='opl-settings-section opl-settings-surface--status'
          id='codex-cli'
          data-testid='settings-access-codex-cli'
        >
          <span id='model' aria-hidden='true' />
          <div className='opl-settings-row h-full items-start'>
            <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                <Terminal theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {codexCard?.title ?? t('settings.accessPage.cards.codexCli.title')}
                </Typography.Text>
                {codexDetailLines.map((line) => (
                  <Typography.Text key={line} className='block break-words text-12px text-t-secondary'>
                    {line}
                  </Typography.Text>
                ))}
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <Button
                type='text'
                icon={<UpdateRotation theme='outline' />}
                loading={appStateQuery.refreshing}
                onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
              >
                {t('settings.accessPage.actions.recheck')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section
        className='opl-settings-section opl-settings-surface--configuration'
        id='authentication'
        data-testid='settings-access-gateway'
      >
        <span id='opl-gateway' aria-hidden='true' />
        <div className='opl-settings-row'>
          <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
            <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
              <Key theme='outline' />
            </span>
            <div className='min-w-0 flex-1'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.accessPage.modelAccount.keyTitle')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.accessPage.modelAccount.description')}
              </Typography.Text>
              {gatewayFormVisible && (
                <div className='mt-10px flex max-w-560px flex-col gap-8px md:flex-row'>
                  <Input.Password
                    data-testid='opl-settings-codex-api-key-input'
                    aria-label={t('settings.accessPage.modelAccount.keyTitle')}
                    value={codexApiKey}
                    placeholder={t('settings.accessPage.modelAccount.apiKeyPlaceholder')}
                    autoComplete='off'
                    className='min-w-0 flex-1'
                    onChange={setCodexApiKey}
                    onPressEnter={() => void handleConfigureCodex()}
                  />
                  <Button
                    data-testid='opl-settings-configure-codex-button'
                    aria-label={t('settings.accessPage.modelAccount.configureButton')}
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
          </div>
          {!gatewayFormVisible && (
            <div className='opl-settings-row__meta'>
              <span data-testid='settings-access-primary-action'>
                <Button
                  type={modelAccessNeedsAttention ? 'primary' : 'secondary'}
                  data-testid='opl-settings-show-gateway-config-button'
                  onClick={() => setGatewayFormVisible(true)}
                >
                  {t('settings.accessPage.modelAccount.showConfigButton')}
                </Button>
              </span>
            </div>
          )}
        </div>
      </section>
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
