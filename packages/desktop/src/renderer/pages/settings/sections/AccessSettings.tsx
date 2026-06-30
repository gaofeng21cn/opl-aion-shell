/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Input, Message, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CheckOne, Earth, Open, Repair, Toolkit, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { useTranslation } from 'react-i18next';
import { buildAccessProjection, type DockerWebuiAction } from '../accessProjection';

type OplCommandResult = Awaited<ReturnType<typeof ipcBridge.oplRuntime.executeAction.invoke>>;

function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

export const AccessSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [codexApiKey, setCodexApiKey] = useState('');
  const [configureLoading, setConfigureLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const { cards, dockerWebui } = buildAccessProjection(appStateQuery.appState, t);

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

  const handleDockerAction = async (action: DockerWebuiAction) => {
    if (action.payloadRequired) return;
    setRunningActionId(action.actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: action.actionId,
        dryRun: true,
      });
      assertOplCommandOk(result);
      Message.success(t('settings.accessPage.remote.actionDryRunSuccess'));
      await appStateQuery.load('fast', { showRefreshing: true });
    } catch {
      Message.error(t('settings.accessPage.remote.actionDryRunFailed'));
    } finally {
      setRunningActionId(null);
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
              <div className='mt-10px flex flex-wrap gap-8px'>
                <Tag color='blue'>{t('settings.accessPage.remote.status', { status: dockerWebui.status })}</Tag>
                <Tag color='gray'>
                  {t('settings.accessPage.remote.runtimeStatus', { status: dockerWebui.runtimeStatus })}
                </Tag>
                <Tag color='green'>
                  {t('settings.accessPage.remote.recoveryStatus', { status: dockerWebui.recoveryStatus })}
                </Tag>
              </div>
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
          <div className='grid grid-cols-1 md:grid-cols-2 gap-10px'>
            {dockerWebui.actions.map((action) => {
              const actionButton = (
                <Button
                  data-testid={`opl-settings-docker-webui-action-${action.actionId}`}
                  aria-label={`opl-settings-docker-webui-action-${action.actionId}`}
                  type={action.dangerLevel === 'none' ? 'secondary' : 'primary'}
                  icon={<Open theme='outline' />}
                  loading={runningActionId === action.actionId}
                  disabled={action.payloadRequired}
                  onClick={() => void handleDockerAction(action)}
                >
                  {action.payloadRequired
                    ? t('settings.accessPage.remote.payloadRequired')
                    : t('settings.accessPage.remote.runDryRoute')}
                </Button>
              );
              return (
                <div
                  key={action.actionId}
                  className='flex flex-col gap-8px p-12px rd-8px bg-fill-1 min-w-0'
                  data-testid={`opl-settings-docker-webui-route-${action.actionId}`}
                >
                  <div className='flex flex-col gap-8px md:flex-row md:items-start md:justify-between'>
                    <div className='min-w-0'>
                      <Typography.Text className='font-600 text-t-primary break-words'>{action.label}</Typography.Text>
                      <Typography.Text className='block text-12px text-t-secondary break-words'>
                        {action.dryRunRoute || action.route || action.actionId}
                      </Typography.Text>
                    </div>
                    <Space wrap>
                      <Tag color={action.state === 'ready' ? 'green' : 'orange'}>{action.state}</Tag>
                      {action.confirmationRequired && (
                        <Tag color='orange'>{t('settings.accessPage.remote.confirmationRequired')}</Tag>
                      )}
                    </Space>
                  </div>
                  {action.payloadRequired ? (
                    <Tooltip content={t('settings.accessPage.remote.payloadRequiredHelp')}>{actionButton}</Tooltip>
                  ) : (
                    actionButton
                  )}
                </div>
              );
            })}
          </div>
          {dockerWebui.actions.length === 0 && (
            <Typography.Text className='text-13px text-t-secondary'>
              {t('settings.accessPage.remote.noActions')}
            </Typography.Text>
          )}
        </div>
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
