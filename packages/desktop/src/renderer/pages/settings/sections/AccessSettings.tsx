/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Card, Tag, Typography } from '@arco-design/web-react';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { useTranslation } from 'react-i18next';

type StatusCard = {
  key: string;
  title: string;
  status: string;
  detail: string;
  tone: 'green' | 'orange';
};

function normalizeStatus(status: string | null, fallback: string): string {
  if (!status) return fallback;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

function compactDetail(parts: Array<string | null | undefined>, fallback: string): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ') || fallback;
}

export const AccessSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const executor = oplRecord(core.executor);
  const codexConfig = oplRecord(codex.config);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const temporalDetails = oplRecord(temporal.details);

  const codexStatus = normalizeStatus(
    oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : null),
    'unknown'
  );
  const apiKeyPresent =
    codex.api_key_present === true || codexConfig.api_key_present === true || oplString(codexConfig.status) === 'ready';
  const providerStatus = normalizeStatus(
    oplString(provider.health_status) ?? oplString(provider.status) ?? oplString(temporal.health_status),
    'unknown'
  );
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'full-access';

  const cards: StatusCard[] = [
    {
      key: 'codex',
      title: t('settings.accessPage.cards.codex.title'),
      status: codexStatus,
      detail: compactDetail(
        [oplString(codex.version), oplString(codex.binary_path)],
        t('settings.accessPage.cards.codex.fallback')
      ),
      tone: codexStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'key',
      title: t('settings.accessPage.cards.key.title'),
      status: apiKeyPresent ? 'ready' : 'attention_required',
      detail: apiKeyPresent
        ? t('settings.accessPage.cards.key.configured')
        : t('settings.accessPage.cards.key.missing'),
      tone: apiKeyPresent ? 'green' : 'orange',
    },
    {
      key: 'provider',
      title: t('settings.accessPage.cards.provider.title'),
      status: providerStatus,
      detail: compactDetail(
        [
          oplString(provider.provider_kind),
          oplString(temporal.status),
          oplString(temporal.address) ?? oplString(temporalDetails.address),
        ],
        t('settings.accessPage.cards.provider.fallback')
      ),
      tone: providerStatus === 'ready' || providerStatus === 'ok' ? 'green' : 'orange',
    },
    {
      key: 'permission',
      title: t('settings.accessPage.cards.permission.title'),
      status: permissionMode,
      detail: t('settings.accessPage.cards.permission.detail'),
      tone: 'green',
    },
  ];

  return (
    <div className='flex flex-col gap-16px'>
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.accessPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.accessPage.description')}</Typography.Text>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-14px'>
        {cards.map((card) => (
          <Card key={card.key} bordered className='rd-8px'>
            <div className='flex flex-col gap-8px min-w-0'>
              <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
              <Tag color={card.tone}>
                {t(`settings.oplEnvironmentPage.status.${card.status}`, { status: card.status })}
              </Tag>
              <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
            </div>
          </Card>
        ))}
      </div>
      <Card bordered className='rd-8px'>
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
