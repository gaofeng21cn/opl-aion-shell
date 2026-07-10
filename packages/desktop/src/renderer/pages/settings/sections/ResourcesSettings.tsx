/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Message, Tag, Tooltip, Typography } from '@arco-design/web-react';
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
type ResourceReadiness = 'ready' | 'notConfigured' | 'unverified';

function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

function statusToken(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function resourceReadiness(status: string): ResourceReadiness {
  const normalized = statusToken(status);
  if (
    ['ready', 'healthy', 'configured', 'connected', 'running', 'runtimeready', 'resourceready'].includes(normalized)
  ) {
    return 'ready';
  }
  if (['missing', 'notconfigured', 'notinstalled', 'disabled'].includes(normalized)) return 'notConfigured';
  return 'unverified';
}

function dockerResourceReadiness(dockerWebui: DockerWebuiProjection): ResourceReadiness {
  const normalized = statusToken(dockerWebui.status);
  if (['healthy', 'configured', 'connected', 'running', 'runtimeready', 'resourceready'].includes(normalized)) {
    return 'ready';
  }
  if (['missing', 'notconfigured', 'notinstalled', 'disabled'].includes(normalized)) return 'notConfigured';
  return 'unverified';
}

function resourceReadinessLabel(
  readiness: ResourceReadiness,
  t: (key: string, options?: Record<string, string>) => string
): string {
  if (readiness === 'ready') {
    return t('settings.resourcesPage.statusLabels.resourceReady', { defaultValue: 'Ready' });
  }
  if (readiness === 'notConfigured') {
    return t('settings.resourcesPage.statusLabels.not_configured');
  }
  return t('settings.resourcesPage.statusLabels.unverified', { defaultValue: 'Not verified' });
}

function resourceReadinessColor(readiness: ResourceReadiness): 'orange' | 'gray' {
  return readiness === 'notConfigured' ? 'orange' : 'gray';
}

function dockerActionKind(action: DockerWebuiAction): 'open' | 'check' | 'configure' | 'other' {
  const actionId = action.actionId.toLowerCase();
  if (actionId.includes('open')) return 'open';
  if (actionId.includes('diagnose') || actionId.includes('startup')) return 'check';
  if (actionId.includes('install') || actionId.includes('configure') || actionId.includes('select')) {
    return 'configure';
  }
  return 'other';
}

function dockerActionCtaLabel(
  action: DockerWebuiAction,
  t: (key: string, options?: Record<string, string>) => string
): string {
  const kind = dockerActionKind(action);
  if (kind === 'open') return t('settings.resourcesPage.docker.openResource');
  if (kind === 'check') return t('settings.resourcesPage.docker.recheck');
  if (kind === 'configure') return t('settings.resourcesPage.docker.prepareEnvironment');
  return t('settings.resourcesPage.docker.runDryRoute');
}

function preferredDockerAction(actions: DockerWebuiAction[], readiness: ResourceReadiness): DockerWebuiAction | null {
  const runnable = actions.filter((action) => !action.payloadRequired);
  const candidates = runnable.length > 0 ? runnable : actions;
  const priority =
    readiness === 'ready'
      ? { open: 0, check: 1, configure: 2, other: 3 }
      : readiness === 'notConfigured'
        ? { configure: 0, check: 1, open: 2, other: 3 }
        : { check: 0, configure: 1, open: 2, other: 3 };
  return (
    candidates.toSorted((left, right) => priority[dockerActionKind(left)] - priority[dockerActionKind(right)])[0] ??
    null
  );
}

export const ResourcesSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const { dockerWebui, resourceSources } = buildAccessProjection(appStateQuery.appState, t);
  const workspaceSources = resourceSources.filter((source) => source.category === 'oplWorkspace');
  const externalSources = resourceSources.filter((source) => source.category !== 'oplWorkspace');
  const dockerReadiness = dockerResourceReadiness(dockerWebui);
  const primaryDockerAction = preferredDockerAction(dockerWebui.actions, dockerReadiness);
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
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='resources-settings-page'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.resourcesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.resourcesPage.description')}</Typography.Text>
        </div>
      </header>

      <section className='opl-settings-section' data-testid='opl-settings-server-webui'>
        <div className='opl-settings-section__header'>
          <div>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.resourcesPage.sections.serverWebui.title', { defaultValue: 'Server WebUI' })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.resourcesPage.sections.serverWebui.description', {
                defaultValue:
                  'Configure, verify, or open the browser workbench without treating an available action as resource readiness.',
              })}
            </Typography.Text>
          </div>
        </div>

        <div className='opl-settings-list'>
          <div className='opl-settings-row'>
            <div className='opl-settings-row__main flex min-w-0 items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                <Toolkit theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.resourcesPage.docker.docker')}
                </Typography.Text>
                {primaryDockerAction && (
                  <Typography.Text className='block break-words text-12px text-t-secondary'>
                    {t(`settings.resourcesPage.docker.actions.${primaryDockerAction.actionId}`, {
                      defaultValue: primaryDockerAction.label,
                    })}
                  </Typography.Text>
                )}
              </div>
            </div>
            <div className='opl-settings-row__meta flex flex-wrap items-center gap-10px'>
              <Tag color={resourceReadinessColor(dockerReadiness)}>{resourceReadinessLabel(dockerReadiness, t)}</Tag>
              {primaryDockerAction ? (
                <DockerActionButton
                  action={primaryDockerAction}
                  loading={runningActionId === primaryDockerAction.actionId}
                  primary
                  onAction={handleDockerAction}
                />
              ) : (
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.resourcesPage.docker.noActions')}
                </Typography.Text>
              )}
            </div>
          </div>
        </div>

        {secondaryDockerActions.length > 0 && (
          <DockerMoreActions
            actions={secondaryDockerActions}
            runningActionId={runningActionId}
            onAction={handleDockerAction}
          />
        )}
      </section>

      {resourceSources.length === 0 ? (
        <section className='opl-settings-section'>
          <div className='opl-settings-empty' data-testid='opl-settings-resource-sources-empty'>
            <LinkCloud theme='outline' />
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.resourcesPage.connections.empty', {
                defaultValue: 'No workspace or external connection has been reported.',
              })}
            </Typography.Text>
            <Tooltip
              content={t('settings.resourcesPage.connections.addConnectionUnavailable', {
                defaultValue: 'No connection setup action is currently reported.',
              })}
            >
              <span>
                <Button size='small' disabled data-testid='opl-settings-add-connection'>
                  {t('settings.resourcesPage.connections.addConnection', { defaultValue: 'Add connection' })}
                </Button>
              </span>
            </Tooltip>
          </div>
        </section>
      ) : (
        <>
          <section className='opl-settings-section'>
            <div className='opl-settings-section__header'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.resourcesPage.connections.workspaceTitle')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.resourcesPage.connections.workspaceDescription')}
                </Typography.Text>
              </div>
            </div>
            <ResourceSources
              sources={workspaceSources}
              emptyKey='settings.resourcesPage.connections.noWorkspaceSources'
              testId='opl-settings-workspace-resource-sources'
              hideTitles
            />
          </section>

          <section className='opl-settings-section'>
            <div className='opl-settings-section__header'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.resourcesPage.connections.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.resourcesPage.connections.description')}
                </Typography.Text>
              </div>
            </div>
            <ResourceSources
              sources={externalSources}
              emptyKey='settings.resourcesPage.connections.noSources'
              testId='opl-settings-resource-sources'
            />
          </section>
        </>
      )}
    </div>
  );
};

const ResourcesSettings: React.FC = () => (
  <SettingsPageWrapper>
    <ResourcesSettingsContent />
  </SettingsPageWrapper>
);

export default ResourcesSettings;

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
      className='opl-settings-details'
      data-testid='opl-settings-docker-webui-more-actions'
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
    >
      <summary className='cursor-pointer text-12px text-t-secondary'>
        {t('settings.resourcesPage.docker.moreActions')}
      </summary>
      {detailsOpen && (
        <div className='opl-settings-list mt-10px'>
          {actions.map((action) => (
            <div
              key={action.actionId}
              className='opl-settings-row'
              data-testid={`opl-settings-docker-webui-route-${action.actionId}`}
            >
              <div className='opl-settings-row__main min-w-0'>
                <Typography.Text className='block break-words font-600 text-t-primary'>
                  {t(`settings.resourcesPage.docker.actions.${action.actionId}`, {
                    defaultValue: action.label,
                  })}
                </Typography.Text>
                <DockerActionTechnicalDetails action={action} />
              </div>
              <div className='opl-settings-row__meta flex flex-wrap items-center gap-8px'>
                {action.payloadRequired && (
                  <Tag color='orange'>{t('settings.resourcesPage.docker.payloadRequired')}</Tag>
                )}
                {action.confirmationRequired && (
                  <Tag color='gray'>{t('settings.resourcesPage.docker.confirmationRequired')}</Tag>
                )}
                <DockerActionButton
                  action={action}
                  loading={runningActionId === action.actionId}
                  size='small'
                  onAction={onAction}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
};

const DockerActionTechnicalDetails: React.FC<{ action: DockerWebuiAction }> = ({ action }) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <details className='mt-4px' onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
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

const ResourceSources: React.FC<{
  sources: ResourceSourceProjection[];
  emptyKey: string;
  testId: string;
  hideTitles?: boolean;
}> = ({ sources, emptyKey, testId, hideTitles = false }) => {
  const { t } = useTranslation();
  if (sources.length === 0) {
    return (
      <div className='opl-settings-empty'>
        <Typography.Text className='text-13px text-t-secondary'>{t(emptyKey)}</Typography.Text>
      </div>
    );
  }
  return (
    <div className='opl-settings-list' data-testid={testId}>
      {sources.map((source) => (
        <ResourceSourceRow key={source.key} source={source} hideTitle={hideTitles} />
      ))}
    </div>
  );
};

const ResourceSourceRow: React.FC<{ source: ResourceSourceProjection; hideTitle: boolean }> = ({
  source,
  hideTitle,
}) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const refs = [...source.managementRefs, ...source.environmentRefs, ...source.refs];
  const readiness = resourceReadiness(source.status);

  return (
    <div className='opl-settings-row'>
      <div className='opl-settings-row__main min-w-0'>
        {!hideTitle && (
          <Typography.Text className='block break-words font-600 text-t-primary'>{source.title}</Typography.Text>
        )}
        <div className='mt-4px flex flex-wrap gap-6px'>
          {source.category !== 'oplWorkspace' && (
            <Tag color='gray'>{t(`settings.resourcesPage.resourceSources.categories.${source.category}`)}</Tag>
          )}
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
        {refs.length === 0 ? (
          <Typography.Text className='mt-4px block text-12px text-t-secondary'>
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
                  <Typography.Text key={`${source.key}-${ref}`} className='break-words text-12px text-t-secondary'>
                    {ref}
                  </Typography.Text>
                ))}
              </div>
            )}
          </details>
        )}
      </div>
      <div className='opl-settings-row__meta'>
        <Tag color={resourceReadinessColor(readiness)}>{resourceReadinessLabel(readiness, t)}</Tag>
      </div>
    </div>
  );
};
