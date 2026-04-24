/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Grid, Message, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Repair, UpdateRotation } from '@icon-park/react';
import masLogo from '@/renderer/assets/logos/opl-modules/mas.svg';
import mdsLogo from '@/renderer/assets/logos/opl-modules/mds.svg';
import magLogo from '@/renderer/assets/logos/opl-modules/mag.svg';
import rcaLogo from '@/renderer/assets/logos/opl-modules/rca.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

type OplModuleStatus = {
  module_id: string;
  label: string;
  health_status?: string;
  install_origin?: string;
  installed?: boolean;
  git?: {
    branch?: string;
    short_sha?: string;
    dirty?: boolean;
  };
};

type OplModulesPayload = {
  modules?: {
    items?: OplModuleStatus[];
  };
};

type EnvironmentItem = {
  id: string;
  moduleId?: string;
  name: string;
  roleKey: string;
  latestVersionKey: string;
  logo?: string;
};

const OPL_ENVIRONMENT_ITEMS: EnvironmentItem[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    roleKey: 'settings.oplEnvironmentPage.items.codex.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.codex.latest',
  },
  {
    id: 'hermes',
    name: 'Hermes-Agent',
    roleKey: 'settings.oplEnvironmentPage.items.hermes.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.hermes.latest',
  },
  {
    id: 'mas',
    moduleId: 'medautoscience',
    name: 'MAS',
    roleKey: 'settings.oplEnvironmentPage.items.mas.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: masLogo,
  },
  {
    id: 'mds',
    moduleId: 'meddeepscientist',
    name: 'MDS',
    roleKey: 'settings.oplEnvironmentPage.items.mds.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: mdsLogo,
  },
  {
    id: 'mag',
    moduleId: 'medautogrant',
    name: 'MAG',
    roleKey: 'settings.oplEnvironmentPage.items.mag.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: magLogo,
  },
  {
    id: 'rca',
    moduleId: 'redcube',
    name: 'RCA',
    roleKey: 'settings.oplEnvironmentPage.items.rca.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: rcaLogo,
  },
  {
    id: 'gui',
    name: 'One Person Lab App',
    roleKey: 'settings.oplEnvironmentPage.items.gui.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.gui.latest',
  },
];

function parseModules(stdout: string): OplModuleStatus[] {
  try {
    const payload = JSON.parse(stdout) as OplModulesPayload;
    return payload.modules?.items ?? [];
  } catch {
    return [];
  }
}

function formatModuleVersion(status: OplModuleStatus | undefined, t: (key: string) => string): string {
  if (!status) return t('settings.oplEnvironmentPage.status.notDetected');
  if (!status.installed) return t('settings.oplEnvironmentPage.status.notInstalled');
  const sha = status.git?.short_sha ?? 'unknown';
  const branch = status.git?.branch ?? 'unknown';
  const dirty = status.git?.dirty ? ' dirty' : '';
  return `${branch}@${sha}${dirty}`;
}

const OplEnvironmentContent: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [moduleStatuses, setModuleStatuses] = useState<OplModuleStatus[]>([]);

  const loadModules = useCallback(async () => {
    setRunningAction('modules');
    try {
      const result = await ipcBridge.shell.runOplCommand.invoke({ args: ['modules'] });
      if (result.exitCode !== 0) {
        message.warning(result.stderr || t('settings.oplEnvironmentPage.messages.loadModulesFailed'));
        return;
      }
      setModuleStatuses(parseModules(result.stdout));
    } finally {
      setRunningAction(null);
    }
  }, [message, t]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const statusByModuleId = useMemo(() => {
    const map = new Map<string, OplModuleStatus>();
    for (const status of moduleStatuses) {
      map.set(status.module_id, status);
    }
    return map;
  }, [moduleStatuses]);

  const runOplCommand = useCallback(
    async (args: string[], actionId: string, successText: string) => {
      setRunningAction(actionId);
      try {
        const result = await ipcBridge.shell.runOplCommand.invoke({ args });
        if (result.exitCode === 0) {
          message.success(successText);
          await loadModules();
        } else {
          message.error(result.stderr || result.stdout || t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } finally {
        setRunningAction(null);
      }
    },
    [loadModules, message]
  );

  return (
    <div className='flex flex-col gap-16px'>
      {contextHolder}
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.oplEnvironmentPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.oplEnvironmentPage.description')}</Typography.Text>
      </div>

      <Card bordered className='rounded-xl'>
        <div className='flex flex-col gap-12px'>
          <Typography.Text className='font-600 text-t-primary'>
            {t('settings.oplEnvironmentPage.maintenanceTitle')}
          </Typography.Text>
          <Typography.Text className='text-t-secondary'>
            {t('settings.oplEnvironmentPage.maintenanceDescription')}
          </Typography.Text>
          <Space wrap>
            <Button
              type='primary'
              icon={<CheckOne theme='outline' />}
              loading={runningAction === 'doctor'}
              onClick={() =>
                runOplCommand(['doctor'], 'doctor', t('settings.oplEnvironmentPage.messages.doctorComplete'))
              }
            >
              {t('settings.oplEnvironmentPage.actions.doctor')}
            </Button>
            <Button
              icon={<UpdateRotation theme='outline' />}
              loading={runningAction === 'modules'}
              onClick={() => void loadModules()}
            >
              {t('settings.oplEnvironmentPage.actions.refresh')}
            </Button>
            <Button
              icon={<Repair theme='outline' />}
              loading={runningAction === 'repair'}
              onClick={() =>
                runOplCommand(['install'], 'repair', t('settings.oplEnvironmentPage.messages.repairComplete'))
              }
            >
              {t('settings.oplEnvironmentPage.actions.repair')}
            </Button>
            <Button onClick={() => navigate('/settings/webui')}>
              {t('settings.oplEnvironmentPage.actions.openRemote')}
            </Button>
          </Space>
        </div>
      </Card>

      <Grid.Row gutter={[12, 12]}>
        {OPL_ENVIRONMENT_ITEMS.map((item) => {
          const status = item.moduleId ? statusByModuleId.get(item.moduleId) : undefined;
          return (
            <Grid.Col key={item.id} xs={24} sm={12} md={12} lg={8}>
              <Card bordered className='rounded-xl h-full'>
                <div className='flex items-start gap-10px'>
                  {item.logo ? (
                    <img src={item.logo} alt='' width={28} height={28} className='shrink-0 rd-6px' />
                  ) : (
                    <div className='w-28px h-28px shrink-0 rd-6px bg-fill-2 flex items-center justify-center text-12px font-700'>
                      {item.name.slice(0, 2)}
                    </div>
                  )}
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-8px flex-wrap'>
                      <Typography.Text className='font-600 text-t-primary'>{item.name}</Typography.Text>
                      <Tag size='small' color='arcoblue'>
                        {t('settings.oplEnvironmentPage.managedTag')}
                      </Tag>
                    </div>
                    <Typography.Paragraph className='text-13px text-t-secondary mt-4px mb-0'>
                      {t(item.roleKey)}
                    </Typography.Paragraph>
                    <Typography.Paragraph className='text-12px text-t-tertiary mt-6px mb-0'>
                      {t('settings.oplEnvironmentPage.currentVersion', {
                        version: item.moduleId
                          ? formatModuleVersion(status, t)
                          : t('settings.oplEnvironmentPage.status.managedByApp'),
                      })}
                    </Typography.Paragraph>
                    <Typography.Paragraph className='text-12px text-t-tertiary mt-2px mb-10px'>
                      {t('settings.oplEnvironmentPage.latestVersion', { version: t(item.latestVersionKey) })}
                    </Typography.Paragraph>
                    <Button
                      size='mini'
                      disabled={!item.moduleId}
                      loading={runningAction === `update-${item.id}`}
                      onClick={() => {
                        if (!item.moduleId) return;
                        void runOplCommand(
                          ['module', 'update', '--module', item.moduleId],
                          `update-${item.id}`,
                          t('settings.oplEnvironmentPage.messages.updateComplete', { name: item.name })
                        );
                      }}
                    >
                      {t('settings.oplEnvironmentPage.actions.update')}
                    </Button>
                  </div>
                </div>
              </Card>
            </Grid.Col>
          );
        })}
      </Grid.Row>
    </div>
  );
};

const SystemSettings: React.FC = () => {
  const location = useLocation();
  const isAboutPage = location.pathname === '/settings/about';
  const isOplPage = location.pathname === '/settings/opl';

  return (
    <SettingsPageWrapper contentClassName={isAboutPage ? 'max-w-640px' : isOplPage ? 'max-w-720px' : undefined}>
      {isAboutPage ? <AboutModalContent /> : isOplPage ? <OplEnvironmentContent /> : <SystemModalContent />}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
