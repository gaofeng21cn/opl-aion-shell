/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Earth, FolderOpen, Lightning, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type OverviewSettingsProps = {
  withWrapper?: boolean;
};

const OverviewSettings: React.FC<OverviewSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const executor = oplRecord(core.executor);
  const paths = oplRecord(appState.paths);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ??
    oplString(paths.workspace_root) ??
    oplString(oplRecord(paths.family_workspace_root).path) ??
    oplString(paths.family_workspace_root);
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'unknown';

  const openWorkspace = () => {
    if (!workspaceRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: workspaceRoot, tool: 'explorer' });
  };

  const quickEntries = [
    {
      key: 'modelAccount',
      title: t('settings.overviewPage.quickEntries.modelAccount.title'),
      value: t('settings.overviewPage.quickEntries.modelAccount.description'),
      icon: <CheckOne theme='outline' />,
      route: '/settings/access',
    },
    {
      key: 'maintenance',
      title: t('settings.overviewPage.quickEntries.maintenance.title'),
      value: t('settings.overviewPage.quickEntries.maintenance.description'),
      icon: <Toolkit theme='outline' />,
      route: '/settings/environment',
    },
    {
      key: 'capabilities',
      title: t('settings.overviewPage.quickEntries.capabilities.title'),
      value: t('settings.overviewPage.quickEntries.capabilities.description'),
      icon: <Lightning theme='outline' />,
      route: '/settings/capabilities',
    },
    {
      key: 'remote',
      title: t('settings.overviewPage.quickEntries.remote.title'),
      value: t('settings.overviewPage.quickEntries.remote.description'),
      icon: <Earth theme='outline' />,
      route: '/settings/access#web-remote',
    },
  ];

  const content = (
    <div className='flex flex-col gap-16px'>
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.overviewPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.overviewPage.description')}</Typography.Text>
      </div>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <div className='flex items-center gap-8px mb-8px'>
                <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  <FolderOpen theme='outline' />
                </span>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.overviewPage.workspace.title')}
                </Typography.Text>
              </div>
              <Typography.Text className='block text-13px text-t-secondary break-all'>
                {workspaceRoot
                  ? t('settings.overviewPage.workspace.currentPath', { path: workspaceRoot })
                  : t('settings.overviewPage.workspace.notConfigured')}
              </Typography.Text>
            </div>
            <Space wrap>
              <Button disabled={!workspaceRoot} onClick={openWorkspace}>
                {t('settings.overviewPage.workspace.open')}
              </Button>
              <Button type='primary' onClick={() => navigate('/settings/environment#workspace')}>
                {t('settings.overviewPage.workspace.changeOrVerify')}
              </Button>
            </Space>
          </div>
          <div className='flex flex-col gap-8px md:flex-row md:items-center md:justify-between'>
            <Space wrap>
              <Tag color={workspaceRoot ? 'green' : 'orange'}>
                {workspaceRoot
                  ? t('settings.overviewPage.workspace.status.ready')
                  : t('settings.overviewPage.workspace.status.needsAction')}
              </Tag>
              <Tag color='blue'>
                {t('settings.overviewPage.workspace.permissionStatus', {
                  mode: t(`agentMode.${permissionMode}`, { defaultValue: permissionMode }),
                })}
              </Tag>
            </Space>
            <Button size='small' onClick={() => navigate('/settings/access')}>
              {t('settings.overviewPage.workspace.openPermissions')}
            </Button>
          </div>
        </div>
      </Card>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
        {quickEntries.map((card) => (
          <Card key={card.key} bordered className='rd-8px'>
            <div className='flex items-start justify-between gap-14px'>
              <div className='min-w-0'>
                <div className='flex items-center gap-8px mb-8px'>
                  <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                    {card.icon}
                  </span>
                  <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
                </div>
                <Typography.Text className='block text-13px text-t-secondary break-words'>{card.value}</Typography.Text>
              </div>
              <Button size='small' onClick={() => navigate(card.route)}>
                {t('common.open', { defaultValue: 'Open' })}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px'>
          <Typography.Text className='font-600 text-t-primary'>
            {t('settings.overviewPage.maintenanceTitle')}
          </Typography.Text>
          <Typography.Text className='text-t-secondary'>
            {t('settings.overviewPage.maintenanceDescription')}
          </Typography.Text>
          <Space wrap>
            <Button type='primary' onClick={() => navigate('/runtime')}>
              {t('settings.overviewPage.actions.openRuntimeStatus')}
            </Button>
            <Button onClick={() => navigate('/settings/environment')}>
              {t('settings.overviewPage.actions.openRuntimeSettings')}
            </Button>
            <Button onClick={() => navigate('/settings/capabilities')}>
              {t('settings.overviewPage.actions.openFoundryAgents')}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper contentClassName='max-w-1080px'>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
