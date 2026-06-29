/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Input, Message, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Earth, Repair, Toolkit, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { useTranslation } from 'react-i18next';

type StatusCard = {
  key: string;
  title: string;
  status: string;
  statusLabel?: string;
  detail: string;
  help?: string;
  tone: 'green' | 'orange';
};

export type AccessProjection = {
  cards: StatusCard[];
  temporalAddress: string | null;
};

export function normalizeAccessStatus(status: string | null, fallback: string): string {
  if (!status) return fallback;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

export function compactAccessDetail(parts: Array<string | null | undefined>, fallback: string): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ') || fallback;
}

export function buildAccessProjection(
  appState: Record<string, unknown>,
  t: (key: string, options?: Record<string, string>) => string
): AccessProjection {
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const executor = oplRecord(core.executor);
  const codexConfig = oplRecord(codex.config);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const temporalDetails = oplRecord(temporal.details);

  const codexStatus = normalizeAccessStatus(
    oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : null),
    'unknown'
  );
  const apiKeyPresent =
    codex.api_key_present === true || codexConfig.api_key_present === true || oplString(codexConfig.status) === 'ready';
  const providerStatus = normalizeAccessStatus(
    oplString(provider.health_status) ?? oplString(provider.status) ?? oplString(temporal.health_status),
    'unknown'
  );
  const providerKind = oplString(provider.provider_kind);
  const temporalStatus = oplString(temporal.status);
  const temporalAddress = oplString(temporal.address) ?? oplString(temporalDetails.address);
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'full-access';

  const modelName =
    oplString(codex.model) ??
    oplString(codexConfig.model) ??
    oplString(provider.model) ??
    oplString(provider.default_model) ??
    t('settings.accessPage.cards.model.fallback');
  const accountStatus = apiKeyPresent
    ? t('settings.accessPage.cards.account.configured')
    : t('settings.accessPage.cards.account.missing');
  const modelAccessStatus =
    codexStatus === 'ready' && apiKeyPresent && (providerStatus === 'ready' || providerStatus === 'ok')
      ? 'ready'
      : 'attention_required';

  const cards: StatusCard[] = [
    {
      key: 'model',
      title: t('settings.accessPage.cards.model.title'),
      status: codexStatus,
      detail: compactAccessDetail(
        [modelName, oplString(codex.version), oplString(codex.binary_path)],
        t('settings.accessPage.cards.model.fallback')
      ),
      tone: codexStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'account',
      title: t('settings.accessPage.cards.account.title'),
      status: apiKeyPresent ? 'ready' : 'attention_required',
      detail: accountStatus,
      tone: apiKeyPresent ? 'green' : 'orange',
    },
    {
      key: 'modelAccess',
      title: t('settings.accessPage.cards.modelAccess.title'),
      status: modelAccessStatus,
      detail: t('settings.accessPage.cards.provider.summary', {
        kind: providerKind || t('settings.accessPage.cards.provider.localRuntime'),
        status: temporalStatus || providerStatus,
      }),
      help: t('settings.accessPage.cards.modelAccess.detail'),
      tone: modelAccessStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'permission',
      title: t('settings.accessPage.cards.permission.title'),
      status: permissionMode,
      statusLabel: t(`agentMode.${permissionMode}`, { defaultValue: permissionMode }),
      detail: t('settings.accessPage.cards.permission.detail'),
      tone: 'green',
    },
  ];

  return { cards, temporalAddress };
}

export const AccessSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [codexApiKey, setCodexApiKey] = useState('');
  const [configureLoading, setConfigureLoading] = useState(false);
  const { cards, temporalAddress } = buildAccessProjection(appStateQuery.appState, t);

  const handleConfigureCodex = async () => {
    const trimmed = codexApiKey.trim();
    if (!trimmed) {
      Message.error(t('settings.accessPage.modelAccount.apiKeyRequired'));
      return;
    }

    setConfigureLoading(true);
    try {
      await ipcBridge.oplRuntime.configureCodex.invoke({ apiKey: trimmed });
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
            </div>
            <Typography.Text className='block text-13px text-t-secondary break-words'>
              {t('settings.accessPage.modelAccount.description')}
            </Typography.Text>
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
            <Button
              icon={<Repair theme='outline' />}
              onClick={() => {
                window.location.hash = '#/settings/environment';
              }}
            >
              {t('settings.accessPage.actions.fix')}
            </Button>
          </Space>
        </div>
      </Card>

      <div className='grid grid-cols-1 md:grid-cols-4 gap-14px'>
        {cards.map((card) => (
          <Card key={card.key} bordered className='rd-8px'>
            <div className='flex flex-col gap-8px min-w-0'>
              <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
              <Tag color={card.tone}>
                {card.statusLabel ?? t(`settings.oplEnvironmentPage.status.${card.status}`, { status: card.status })}
              </Tag>
              {card.help && <Typography.Text className='text-12px text-t-secondary'>{card.help}</Typography.Text>}
              <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
            </div>
          </Card>
        ))}
      </div>
      {temporalAddress && (
        <Typography.Text className='text-12px text-t-secondary'>
          {t('settings.accessPage.localServiceTechnicalDetail', { address: temporalAddress })}
        </Typography.Text>
      )}

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
            </div>
            <Space wrap>
              <Tag color='blue'>
                <span className='inline-flex items-center gap-4px'>
                  <Earth theme='outline' size='14' />
                  {t('settings.accessPage.remote.webui')}
                </span>
              </Tag>
              <Tag color='gray'>
                <span className='inline-flex items-center gap-4px'>
                  <Toolkit theme='outline' size='14' />
                  {t('settings.accessPage.remote.docker')}
                </span>
              </Tag>
              <Tag color='blue'>
                <span className='inline-flex items-center gap-4px'>
                  <CheckOne theme='outline' size='14' />
                  {t('settings.accessPage.remote.remoteAccess')}
                </span>
              </Tag>
            </Space>
          </div>
        </div>
        <WebuiModalContent />
      </Card>
    </div>
  );
};

const AccessSettings: React.FC = () => (
  <SettingsPageWrapper>
    <AccessSettingsContent />
  </SettingsPageWrapper>
);

export default AccessSettings;
