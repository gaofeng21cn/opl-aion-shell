/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Message, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { LinkCloud, Open, Toolkit } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  buildAccessProjection,
  normalizeAccessStatus,
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
  const workspaceSources = resourceSources.filter((source) => source.category === 'oplWorkspace');
  const cloudExternalSources = resourceSources.filter((source) => source.category !== 'oplWorkspace');
  const primaryDockerAction = preferredDockerAction(dockerWebui.actions);
  const secondaryDockerActions = dockerWebui.actions.filter((action) => action !== primaryDockerAction);

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

          {primaryDockerAction ? (
            <div
              className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'
              data-testid='opl-settings-docker-webui-primary-action'
            >
              <div className='flex flex-col gap-10px md:flex-row md:items-start md:justify-between'>
                <div className='min-w-0 flex flex-col gap-6px'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.resourcesPage.docker.primaryActionTitle')}
                  </Typography.Text>
                  <DockerActionTitle action={primaryDockerAction} />
                </div>
                <div className='shrink-0'>
                  <DockerActionButton
                    action={primaryDockerAction}
                    loading={runningActionId === primaryDockerAction.actionId}
                    primary
                    onAction={handleDockerAction}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Typography.Text className='text-13px text-t-secondary'>
              {t('settings.resourcesPage.docker.noActions')}
            </Typography.Text>
          )}

          {secondaryDockerActions.length > 0 && (
            <DockerMoreActions
              actions={secondaryDockerActions}
              runningActionId={runningActionId}
              onAction={handleDockerAction}
            />
          )}
        </div>
      </Card>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-14px'>
          <div className='flex items-center gap-8px'>
            <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
              <LinkCloud theme='outline' />
            </span>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.resourcesPage.connections.workspaceTitle')}
            </Typography.Text>
          </div>
          <Typography.Text className='text-13px text-t-secondary'>
            {t('settings.resourcesPage.connections.workspaceDescription')}
          </Typography.Text>
          <ResourceSources
            sources={workspaceSources}
            emptyKey='settings.resourcesPage.connections.noWorkspaceSources'
            testId='opl-settings-workspace-resource-sources'
          />
        </div>
      </Card>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-14px'>
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
          <ResourceSources
            sources={cloudExternalSources}
            emptyKey='settings.resourcesPage.connections.noSources'
            testId='opl-settings-resource-sources'
          />
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

function dockerActionPriority(action: DockerWebuiAction): number {
  const normalizedActionId = action.actionId.toLowerCase();
  if (action.payloadRequired) return 50;
  if (normalizedActionId.includes('open')) return 0;
  if (normalizedActionId.includes('diagnose')) return 1;
  if (normalizedActionId.includes('startup')) return 2;
  if (normalizedActionId.includes('configure')) return 10;
  if (normalizedActionId.includes('install')) return 20;
  return 30;
}

function preferredDockerAction(actions: DockerWebuiAction[]): DockerWebuiAction | null {
  const runnable = actions.filter((action) => !action.payloadRequired);
  if (runnable.length === 0) return actions[0] ?? null;
  return [...runnable].sort((left, right) => dockerActionPriority(left) - dockerActionPriority(right))[0] ?? null;
}

function dockerActionStatusLabel(
  action: DockerWebuiAction,
  t: (key: string, options?: Record<string, string>) => string
): string {
  if (action.payloadRequired) return t('settings.resourcesPage.statusLabels.needs_input');
  return accessStatusLabel(normalizeAccessStatus(action.state, 'unknown'), t);
}

const DockerActionTitle: React.FC<{ action: DockerWebuiAction }> = ({ action }) => {
  const { t } = useTranslation();
  const actionLabel = t(`settings.resourcesPage.docker.actions.${action.actionId}`, {
    defaultValue: action.label,
  });

  return (
    <div className='flex flex-wrap items-center gap-8px'>
      <Typography.Text className='font-600 text-t-primary break-words'>{actionLabel}</Typography.Text>
      <Tag color={action.payloadRequired ? 'orange' : action.state === 'ready' ? 'green' : 'orange'}>
        {dockerActionStatusLabel(action, t)}
      </Tag>
      {action.confirmationRequired && <Tag color='gray'>{t('settings.resourcesPage.docker.confirmationRequired')}</Tag>}
    </div>
  );
};

const DockerActionButton: React.FC<{
  action: DockerWebuiAction;
  loading: boolean;
  onAction: (action: DockerWebuiAction) => void;
  primary?: boolean;
  size?: 'mini' | 'small';
}> = ({ action, loading, onAction, primary = false, size }) => {
  const { t } = useTranslation();
  const actionButton = (
    <Button
      data-testid={`opl-settings-docker-webui-action-${action.actionId}`}
      type={primary ? 'primary' : 'secondary'}
      size={size}
      icon={<Open theme='outline' />}
      loading={loading}
      disabled={action.payloadRequired}
      onClick={() => void onAction(action)}
    >
      {action.payloadRequired ? t('settings.resourcesPage.docker.payloadRequired') : dockerActionCtaLabel(action, t)}
    </Button>
  );

  return action.payloadRequired ? (
    <Tooltip content={t('settings.resourcesPage.docker.payloadRequiredHelp')}>{actionButton}</Tooltip>
  ) : (
    actionButton
  );
};

const DockerMoreActions: React.FC<{
  actions: DockerWebuiAction[];
  runningActionId: string | null;
  onAction: (action: DockerWebuiAction) => void;
}> = ({ actions, runningActionId, onAction }) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <details
      data-testid='opl-settings-docker-webui-more-actions'
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
    >
      <summary className='cursor-pointer text-12px text-t-secondary'>
        {t('settings.resourcesPage.docker.moreActions')}
      </summary>
      {detailsOpen && (
        <div className='mt-10px flex flex-col divide-y divide-border-1'>
          {actions.map((action) => (
            <div
              key={action.actionId}
              className='py-12px min-w-0'
              data-testid={`opl-settings-docker-webui-route-${action.actionId}`}
            >
              <div className='flex flex-col gap-10px md:flex-row md:items-start md:justify-between'>
                <div className='min-w-0 flex flex-col gap-6px'>
                  <DockerActionTitle action={action} />
                  <DockerActionTechnicalDetails action={action} />
                </div>
                <div className='shrink-0'>
                  <DockerActionButton
                    action={action}
                    loading={runningActionId === action.actionId}
                    size='small'
                    onAction={onAction}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
};

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

const ResourceSources: React.FC<{ sources: ResourceSourceProjection[]; emptyKey: string; testId: string }> = ({
  sources,
  emptyKey,
  testId,
}) => {
  const { t } = useTranslation();
  if (sources.length === 0) {
    return <Typography.Text className='text-13px text-t-secondary'>{t(emptyKey)}</Typography.Text>;
  }
  return (
    <div className='flex flex-col divide-y divide-border-1' data-testid={testId}>
      {sources.map((source) => (
        <ResourceSourceRow key={source.key} source={source} />
      ))}
    </div>
  );
};

const ResourceSourceRow: React.FC<{ source: ResourceSourceProjection }> = ({ source }) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const refs = [...source.managementRefs, ...source.environmentRefs, ...source.refs];

  return (
    <div className='py-12px min-w-0'>
      <div className='flex flex-col gap-8px md:flex-row md:items-start md:justify-between'>
        <div className='min-w-0 flex flex-col gap-6px'>
          <div className='flex flex-wrap items-center gap-8px'>
            <Typography.Text className='font-600 text-t-primary break-words'>{source.title}</Typography.Text>
            <Tag color={source.status === 'ready' || source.status === 'available' ? 'green' : 'orange'}>
              {accessStatusLabel(source.status, t)}
            </Tag>
          </div>
          <div className='flex flex-wrap gap-6px'>
            <Tag color='gray'>{t(`settings.resourcesPage.resourceSources.categories.${source.category}`)}</Tag>
            {source.management && (
              <Tag color={source.management === 'consoleManaged' ? 'arcoblue' : 'gray'}>
                {t(`settings.resourcesPage.resourceSources.management.${source.management}`)}
              </Tag>
            )}
            {source.managementRefs.length > 0 && (
              <Tag color='gray'>{t('settings.resourcesPage.resourceSources.managementRefs')}</Tag>
            )}
            {source.environmentRefs.length > 0 && (
              <Tag color='gray'>{t('settings.resourcesPage.resourceSources.environmentRefs')}</Tag>
            )}
          </div>
        </div>
      </div>
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
