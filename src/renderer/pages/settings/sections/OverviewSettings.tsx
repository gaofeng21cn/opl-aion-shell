import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Message, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Earth, Lightning, Toolkit, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type OverviewStatus = {
  codexStatus?: string;
  workspaceRoot?: string | null;
  workspaceStatus?: string;
  moduleTotal: number;
  moduleAttention: number;
  webuiRunning?: boolean;
};

type SystemInitializePayload = {
  system_initialize?: {
    core_engines?: {
      codex?: {
        installed?: boolean;
        health_status?: string;
        version_status?: string;
      };
    };
    domain_modules?: {
      modules?: Array<{
        installed?: boolean;
        health_status?: string;
      }>;
    };
    workspace_root?: {
      selected_path?: string | null;
      health_status?: string;
    };
  };
};

function parseOverviewStatus(
  stdout: string
): Pick<OverviewStatus, 'codexStatus' | 'workspaceRoot' | 'workspaceStatus' | 'moduleTotal' | 'moduleAttention'> {
  try {
    const payload = JSON.parse(stdout) as SystemInitializePayload;
    const initialize = payload.system_initialize;
    const modules = initialize?.domain_modules?.modules ?? [];
    return {
      codexStatus:
        initialize?.core_engines?.codex?.health_status ??
        initialize?.core_engines?.codex?.version_status ??
        (initialize?.core_engines?.codex?.installed ? 'ready' : 'missing'),
      workspaceRoot: initialize?.workspace_root?.selected_path,
      workspaceStatus: initialize?.workspace_root?.health_status,
      moduleTotal: modules.length,
      moduleAttention: modules.filter((module) => !module.installed || module.health_status !== 'ready').length,
    };
  } catch {
    return {
      moduleTotal: 0,
      moduleAttention: 0,
    };
  }
}

const OverviewSettings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, contextHolder] = Message.useMessage();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OverviewStatus>({ moduleTotal: 0, moduleAttention: 0 });

  const loadOverview = useCallback(
    async (showError = false) => {
      setLoading(true);
      try {
        const [systemResult, webuiResult] = await Promise.all([
          ipcBridge.shell.runOplCommand.invoke({ args: ['system', 'initialize'] }),
          ipcBridge.webui.getStatus.invoke().catch((_error: unknown): null => null),
        ]);
        const parsed = systemResult.exitCode === 0 ? parseOverviewStatus(systemResult.stdout) : {};
        setStatus({
          moduleTotal: 0,
          moduleAttention: 0,
          ...parsed,
          webuiRunning: webuiResult?.success ? Boolean(webuiResult.data?.running) : undefined,
        });
        if (showError && systemResult.exitCode !== 0) {
          message.warning(systemResult.stderr || t('settings.overviewPage.messages.statusLoadFailed'));
        }
      } catch {
        if (showError) {
          message.warning(t('settings.overviewPage.messages.statusLoadFailed'));
        }
      } finally {
        setLoading(false);
      }
    },
    [message, t]
  );

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const moduleStatusLabel = useMemo(() => {
    if (status.moduleTotal === 0) return t('settings.overviewPage.modulesUnknown');
    if (status.moduleAttention > 0) {
      return t('settings.overviewPage.modulesNeedAttention', {
        count: status.moduleAttention,
        total: status.moduleTotal,
      });
    }
    return t('settings.overviewPage.modulesReady', { total: status.moduleTotal });
  }, [status.moduleAttention, status.moduleTotal, t]);

  const cards = [
    {
      key: 'codex',
      title: t('settings.overviewPage.codexTitle'),
      value: status.codexStatus
        ? t(`settings.oplEnvironmentPage.status.${status.codexStatus}`, { status: status.codexStatus })
        : t('settings.oplEnvironmentPage.status.unknown'),
      icon: <Toolkit theme='outline' />,
      action: t('settings.overviewPage.actions.openRuntime'),
      route: '/settings/runtime',
      tone: status.codexStatus === 'ready' || status.codexStatus === 'compatible' ? 'green' : 'orange',
      tag: status.codexStatus
        ? t(`settings.oplEnvironmentPage.status.${status.codexStatus}`, { status: status.codexStatus })
        : t('settings.oplEnvironmentPage.status.unknown'),
    },
    {
      key: 'workspace',
      title: t('settings.overviewPage.workspaceTitle'),
      value: status.workspaceRoot || t('settings.oplEnvironmentPage.workspaceRootMissing'),
      icon: <CheckOne theme='outline' />,
      action: t('settings.overviewPage.actions.openRuntime'),
      route: '/settings/runtime',
      tone: status.workspaceStatus === 'ready' ? 'green' : 'orange',
      tag: status.workspaceStatus
        ? t(`settings.oplEnvironmentPage.status.${status.workspaceStatus}`, { status: status.workspaceStatus })
        : t('settings.oplEnvironmentPage.status.unknown'),
    },
    {
      key: 'modules',
      title: t('settings.overviewPage.modulesTitle'),
      value: moduleStatusLabel,
      icon: <Lightning theme='outline' />,
      action: t('settings.overviewPage.actions.openCapabilities'),
      route: '/settings/capabilities',
      tone: status.moduleAttention === 0 && status.moduleTotal > 0 ? 'green' : 'orange',
      tag:
        status.moduleAttention === 0 && status.moduleTotal > 0
          ? t('settings.oplEnvironmentPage.status.ready')
          : t('settings.oplEnvironmentPage.status.attention_needed'),
    },
    {
      key: 'webui',
      title: t('settings.overviewPage.webuiTitle'),
      value:
        status.webuiRunning === undefined
          ? t('settings.oplEnvironmentPage.status.unknown')
          : status.webuiRunning
            ? t('settings.webui.running', { defaultValue: 'Running' })
            : t('settings.webui.stopped', { defaultValue: 'Stopped' }),
      icon: <Earth theme='outline' />,
      action: t('settings.overviewPage.actions.openAccess'),
      route: '/settings/access',
      tone: status.webuiRunning ? 'green' : 'gray',
      tag:
        status.webuiRunning === undefined
          ? t('settings.oplEnvironmentPage.status.unknown')
          : status.webuiRunning
            ? t('settings.webui.running', { defaultValue: 'Running' })
            : t('settings.webui.stopped', { defaultValue: 'Stopped' }),
    },
  ];

  return (
    <SettingsPageWrapper contentClassName='max-w-1080px'>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-end md:justify-between'>
          <div>
            <Typography.Title heading={4} className='mb-6px'>
              {t('settings.overviewPage.title')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary'>{t('settings.overviewPage.description')}</Typography.Text>
          </div>
          <Button icon={<UpdateRotation theme='outline' />} loading={loading} onClick={() => void loadOverview(true)}>
            {t('settings.overviewPage.actions.refresh')}
          </Button>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
          {cards.map((card) => (
            <Card key={card.key} bordered className='rounded-xl'>
              <div className='flex items-start justify-between gap-14px'>
                <div className='min-w-0'>
                  <div className='flex items-center gap-8px mb-8px'>
                    <span className='w-28px h-28px flex items-center justify-center rounded-8px bg-fill-2 text-t-secondary'>
                      {card.icon}
                    </span>
                    <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
                  </div>
                  <Typography.Text className='block text-13px text-t-secondary break-words'>
                    {card.value}
                  </Typography.Text>
                  <Tag size='small' color={card.tone} className='mt-10px'>
                    {card.tag}
                  </Tag>
                </div>
                <Button size='small' onClick={() => navigate(card.route)}>
                  {card.action}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card bordered className='rounded-xl'>
          <div className='flex flex-col gap-12px'>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.overviewPage.maintenanceTitle')}
            </Typography.Text>
            <Typography.Text className='text-t-secondary'>
              {t('settings.overviewPage.maintenanceDescription')}
            </Typography.Text>
            <Space wrap>
              <Button type='primary' onClick={() => navigate('/settings/runtime')}>
                {t('settings.overviewPage.actions.openRuntime')}
              </Button>
              <Button onClick={() => navigate('/settings/access')}>
                {t('settings.overviewPage.actions.openAccess')}
              </Button>
              <Button onClick={() => navigate('/settings/system')}>
                {t('settings.overviewPage.actions.openSystem')}
              </Button>
            </Space>
          </div>
        </Card>
      </div>
    </SettingsPageWrapper>
  );
};

export default OverviewSettings;
