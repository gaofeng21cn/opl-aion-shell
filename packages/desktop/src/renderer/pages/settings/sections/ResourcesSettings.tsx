/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Message, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { LinkCloud, Open, Toolkit } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  buildAccessProjection,
  type DockerWebuiAction,
  type DockerWebuiProjection,
  type ResourceSourceProjection,
} from '../accessProjection';

type OplCommandResult = Awaited<ReturnType<typeof ipcBridge.oplRuntime.executeAction.invoke>>;

function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

export const ResourcesSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const { dockerWebui, resourceSources } = buildAccessProjection(appStateQuery.appState, t);
  const dockerSummaryTags = dockerDeploymentSummaryTags(dockerWebui, t);

  const handleDockerAction = async (action: DockerWebuiAction) => {
    if (action.payloadRequired) return;
    setRunningActionId(action.actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: action.actionId,
        dryRun: true,
      });
      assertOplCommandOk(result);
      Message.success(t('settings.resourcesPage.docker.actionDryRunSuccess'));
      await appStateQuery.load('fast', { showRefreshing: true });
    } catch {
      Message.error(t('settings.resourcesPage.docker.actionDryRunFailed'));
    } finally {
      setRunningActionId(null);
    }
  };

  return (
    <div className='flex flex-col gap-16px'>
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.resourcesPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.resourcesPage.description')}</Typography.Text>
      </div>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px'>
          <div className='flex flex-col gap-8px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0 flex flex-col gap-6px'>
              <div className='flex flex-wrap items-center gap-8px'>
                <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  <Toolkit theme='outline' />
                </span>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.resourcesPage.docker.title')}
                </Typography.Text>
                <Tag color='gray'>{t('settings.resourcesPage.docker.docker')}</Tag>
                <Tag color='blue'>{t('settings.resourcesPage.docker.workspace')}</Tag>
                {dockerSummaryTags.map((tag) => (
                  <Tag key={tag.key} color={tag.color}>
                    {tag.label}
                  </Tag>
                ))}
              </div>
              <Typography.Text className='text-13px text-t-secondary break-words'>
                {t('settings.resourcesPage.docker.description')}
              </Typography.Text>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-10px'>
            {dockerWebui.actions.map((action) => {
              const actionLabel = t(`settings.resourcesPage.docker.actions.${action.actionId}`, {
                defaultValue: action.label,
              });
              const actionButton = (
                <Button
                  data-testid={`opl-settings-docker-webui-action-${action.actionId}`}
                  type={action.dangerLevel === 'none' ? 'secondary' : 'primary'}
                  icon={<Open theme='outline' />}
                  loading={runningActionId === action.actionId}
                  disabled={action.payloadRequired}
                  onClick={() => void handleDockerAction(action)}
                >
                  {action.payloadRequired
                    ? t('settings.resourcesPage.docker.payloadRequired')
                    : dockerActionCtaLabel(action, t)}
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
                      <Typography.Text className='font-600 text-t-primary break-words'>{actionLabel}</Typography.Text>
                    </div>
                    <Space wrap>
                      <Tag color={action.state === 'ready' ? 'green' : 'orange'}>
                        {accessStatusLabel(action.state, t)}
                      </Tag>
                      {action.confirmationRequired && (
                        <Tag color='orange'>{t('settings.resourcesPage.docker.confirmationRequired')}</Tag>
                      )}
                    </Space>
                  </div>
                  {action.payloadRequired ? (
                    <Tooltip content={t('settings.resourcesPage.docker.payloadRequiredHelp')}>{actionButton}</Tooltip>
                  ) : (
                    actionButton
                  )}
                  <DockerActionTechnicalDetails action={action} />
                </div>
              );
            })}
          </div>

          {dockerWebui.actions.length === 0 && (
            <Typography.Text className='text-13px text-t-secondary'>
              {t('settings.resourcesPage.docker.noActions')}
            </Typography.Text>
          )}
        </div>
      </Card>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px'>
          <div className='flex items-center gap-8px'>
            <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
              <LinkCloud theme='outline' />
            </span>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.resourcesPage.connections.title')}
            </Typography.Text>
          </div>
          <Typography.Text className='text-13px text-t-secondary'>
            {t('settings.resourcesPage.connections.description')}
          </Typography.Text>
          <ResourceSources sources={resourceSources} />
        </div>
      </Card>
    </div>
  );
};

const ResourcesSettings: React.FC = () => (
  <SettingsPageWrapper>
    <ResourcesSettingsContent />
  </SettingsPageWrapper>
);

export default ResourcesSettings;

function accessStatusLabel(status: string, t: (key: string, options?: Record<string, string>) => string): string {
  return t(`settings.resourcesPage.statusLabels.${status}`, { defaultValue: status });
}

function dockerActionCtaLabel(
  action: DockerWebuiAction,
  t: (key: string, options?: Record<string, string>) => string
): string {
  const normalizedActionId = action.actionId.toLowerCase();
  if (normalizedActionId.includes('open')) return t('settings.resourcesPage.docker.openResource');
  if (normalizedActionId.includes('diagnose') || normalizedActionId.includes('startup')) {
    return t('settings.resourcesPage.docker.recheck');
  }
  if (
    normalizedActionId.includes('install') ||
    normalizedActionId.includes('configure') ||
    normalizedActionId.includes('select')
  ) {
    return t('settings.resourcesPage.docker.prepareEnvironment');
  }
  return t('settings.resourcesPage.docker.runDryRoute');
}

function isQuietDockerStatus(status: string): boolean {
  return ['action_available', 'available', 'diagnose_with_doctor', 'healthy', 'ok', 'ready'].includes(status);
}

function dockerDeploymentSummaryTags(
  dockerWebui: DockerWebuiProjection,
  t: (key: string, options?: Record<string, string>) => string
): Array<{ key: string; label: string; color: 'orange' | 'gray' }> {
  return [
    ['status', dockerWebui.status],
    ['runtime', dockerWebui.runtimeStatus],
    ['recovery', dockerWebui.recoveryStatus],
  ].flatMap(([key, status]) =>
    isQuietDockerStatus(status) ? [] : [{ key, label: accessStatusLabel(status, t), color: 'orange' as const }]
  );
}

const DockerActionTechnicalDetails: React.FC<{ action: DockerWebuiAction }> = ({ action }) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <details className='mt-2px' onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
      <summary className='cursor-pointer text-12px text-t-secondary'>
        {t('settings.resourcesPage.docker.technicalDetails')}
      </summary>
      {detailsOpen && (
        <div className='mt-6px grid grid-cols-1 gap-4px text-12px text-t-secondary'>
          <Typography.Text className='break-words'>
            {t('settings.resourcesPage.docker.technicalState')}: {action.state}
          </Typography.Text>
          <Typography.Text className='break-words'>
            {t('settings.resourcesPage.docker.technicalActionId')}: {action.actionId}
          </Typography.Text>
          {action.route && (
            <Typography.Text className='break-words'>
              {t('settings.resourcesPage.docker.technicalCommand')}: {action.route}
            </Typography.Text>
          )}
          {action.dryRunRoute && (
            <Typography.Text className='break-words'>
              {t('settings.resourcesPage.docker.technicalPreviewCommand')}: {action.dryRunRoute}
            </Typography.Text>
          )}
        </div>
      )}
    </details>
  );
};

const ResourceSources: React.FC<{ sources: ResourceSourceProjection[] }> = ({ sources }) => {
  const { t } = useTranslation();
  if (sources.length === 0) {
    return (
      <Typography.Text className='text-13px text-t-secondary'>
        {t('settings.resourcesPage.connections.noSources')}
      </Typography.Text>
    );
  }
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-10px' data-testid='opl-settings-resource-sources'>
      {sources.map((source) => (
        <ResourceSourceCard key={source.key} source={source} />
      ))}
    </div>
  );
};

const ResourceSourceCard: React.FC<{ source: ResourceSourceProjection }> = ({ source }) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const refs = [...source.managementRefs, ...source.environmentRefs, ...source.refs];

  return (
    <div className='flex flex-col gap-6px p-12px rd-8px bg-fill-1 min-w-0'>
      <div className='flex flex-wrap items-center gap-8px'>
        <Typography.Text className='font-600 text-t-primary break-words'>{source.title}</Typography.Text>
        <Tag color='blue'>
          {t('settings.resourcesPage.resourceSources.status', { status: accessStatusLabel(source.status, t) })}
        </Tag>
        <Tag color='gray'>{t(`settings.resourcesPage.resourceSources.categories.${source.category}`)}</Tag>
        {source.management && (
          <Tag color={source.management === 'consoleManaged' ? 'arcoblue' : 'gray'}>
            {t(`settings.resourcesPage.resourceSources.management.${source.management}`)}
          </Tag>
        )}
      </div>
      {source.managementRefs.length > 0 && (
        <Tag color='gray'>{t('settings.resourcesPage.resourceSources.managementRefs')}</Tag>
      )}
      {source.environmentRefs.length > 0 && (
        <Tag color='gray'>{t('settings.resourcesPage.resourceSources.environmentRefs')}</Tag>
      )}
      {refs.length === 0 ? (
        <Typography.Text className='text-12px text-t-secondary'>
          {t('settings.resourcesPage.resourceSources.noRefs')}
        </Typography.Text>
      ) : (
        <details className='mt-4px' onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary className='cursor-pointer text-12px text-t-secondary'>
            {t('settings.resourcesPage.resourceSources.technicalRefs')}
          </summary>
          {detailsOpen && (
            <div className='mt-6px grid grid-cols-1 gap-4px'>
              {refs.map((ref) => (
                <Typography.Text key={`${source.key}-${ref}`} className='text-12px text-t-secondary break-words'>
                  {ref}
                </Typography.Text>
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  );
};
