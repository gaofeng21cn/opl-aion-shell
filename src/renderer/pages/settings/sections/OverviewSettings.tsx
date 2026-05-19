import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  moduleKnown: boolean;
  moduleTotal: number;
  moduleAttention: number;
  moduleInstalled: number;
  webuiRunning?: boolean;
};

const MODULE_ACTIONS_REQUIRING_ATTENTION = new Set(['install', 'update', 'reinstall', 'remove']);
const readOverviewStatusTimeoutMs = (): number => {
  const globalOverride = (globalThis as typeof globalThis & { __OPL_OVERVIEW_STATUS_TIMEOUT_MS__?: number | string })
    .__OPL_OVERVIEW_STATUS_TIMEOUT_MS__;
  const parsed = Number(globalOverride ?? import.meta.env?.VITE_OPL_OVERVIEW_STATUS_TIMEOUT_MS ?? 6_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6_000;
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
      summary?: {
        total?: number;
        healthy?: number;
        installed?: number;
      };
      modules?: Array<{
        installed?: boolean;
        health_status?: string;
        available_actions?: string[];
        recommended_action?: string | null;
      }>;
    };
    workspace_root?: {
      selected_path?: string | null;
      health_status?: string;
    };
  };
};

type DomainModuleStatus = NonNullable<
  NonNullable<NonNullable<SystemInitializePayload['system_initialize']>['domain_modules']>['modules']
>[number];

function hasExecutableModuleAction(module: DomainModuleStatus) {
  const actions = [module.recommended_action, ...(module.available_actions ?? [])].filter(Boolean);
  return actions.some((action) => MODULE_ACTIONS_REQUIRING_ATTENTION.has(String(action)));
}

function getModuleSummaryNumber(summary: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = summary?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function parseOverviewStatus(
  stdout: string
): Pick<
  OverviewStatus,
  | 'codexStatus'
  | 'workspaceRoot'
  | 'workspaceStatus'
  | 'moduleKnown'
  | 'moduleTotal'
  | 'moduleInstalled'
  | 'moduleAttention'
> {
  try {
    const payload = JSON.parse(stdout) as SystemInitializePayload;
    const initialize = payload.system_initialize;
    const moduleSummary = initialize?.domain_modules?.summary;
    const modules = initialize?.domain_modules?.modules ?? [];
    const moduleTotal = getModuleSummaryNumber(moduleSummary, 'total', 'total_modules_count') ?? modules.length;
    const moduleInstalled =
      getModuleSummaryNumber(moduleSummary, 'installed', 'installed_modules_count') ??
      modules.filter((module) => module.installed).length;
    return {
      codexStatus:
        initialize?.core_engines?.codex?.health_status ??
        initialize?.core_engines?.codex?.version_status ??
        (initialize?.core_engines?.codex?.installed ? 'ready' : 'missing'),
      workspaceRoot: initialize?.workspace_root?.selected_path,
      workspaceStatus: initialize?.workspace_root?.health_status,
      moduleKnown: Boolean(initialize?.domain_modules),
      moduleTotal,
      moduleInstalled,
      moduleAttention: modules.filter(hasExecutableModuleAction).length,
    };
  } catch {
    return {
      moduleKnown: false,
      moduleTotal: 0,
      moduleInstalled: 0,
      moduleAttention: 0,
    };
  }
}

const OverviewSettings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OverviewStatus>({
    moduleKnown: false,
    moduleTotal: 0,
    moduleInstalled: 0,
    moduleAttention: 0,
  });

  const emptyStatus = useCallback(
    (webuiRunning?: boolean): OverviewStatus => ({
      moduleKnown: false,
      moduleTotal: 0,
      moduleInstalled: 0,
      moduleAttention: 0,
      webuiRunning,
    }),
    []
  );

  const withOverviewTimeout = useCallback(
    <T,>(promise: Promise<T>, timeoutMessage: string): Promise<T> =>
      new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, readOverviewStatusTimeoutMs());
        promise.then(
          (value) => {
            window.clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            window.clearTimeout(timer);
            reject(error);
          }
        );
      }),
    []
  );

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  const loadOverview = useCallback(
    async (showError = false) => {
      setLoading(true);
      try {
        const [systemResult, webuiResult] = await Promise.all([
          withOverviewTimeout(
            ipcBridge.shell.runOplCommand.invoke({ args: ['system', 'initialize'] }),
            'OPL status refresh timed out.'
          ),
          ipcBridge.webui.getStatus.invoke().catch((_error: unknown): null => null),
        ]);
        const parsed = systemResult.exitCode === 0 ? parseOverviewStatus(systemResult.stdout) : {};
        setStatus({
          moduleKnown: false,
          moduleTotal: 0,
          moduleInstalled: 0,
          moduleAttention: 0,
          ...parsed,
          webuiRunning: webuiResult?.success ? Boolean(webuiResult.data?.running) : undefined,
        });
        if (showError && systemResult.exitCode !== 0) {
          messageRef.current.warning(systemResult.stderr || t('settings.overviewPage.messages.statusLoadFailed'));
        }
      } catch {
        setStatus(emptyStatus());
        if (showError) {
          messageRef.current.warning(t('settings.overviewPage.messages.statusLoadFailed'));
        }
      } finally {
        setLoading(false);
      }
    },
    [emptyStatus, t, withOverviewTimeout]
  );

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const moduleStatusLabel = useMemo(() => {
    if (!status.moduleKnown || status.moduleTotal === 0) return t('settings.overviewPage.modulesUnknown');
    if (status.moduleAttention > 0) {
      return t('settings.overviewPage.modulesNeedAttention', {
        count: status.moduleAttention,
        total: status.moduleTotal,
      });
    }
    return t('settings.overviewPage.modulesReady', { total: status.moduleTotal });
  }, [status.moduleAttention, status.moduleKnown, status.moduleTotal, t]);

  const cards = [
    {
      key: 'codex',
      title: t('settings.overviewPage.codexTitle'),
      value: status.codexStatus
        ? t(`settings.oplEnvironmentPage.status.${status.codexStatus}`, { status: status.codexStatus })
        : t('settings.oplEnvironmentPage.status.unknown'),
      icon: <Toolkit theme='outline' />,
      action: t('settings.overviewPage.actions.openOplAgent'),
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
      action: t('settings.overviewPage.actions.openOplAgent'),
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
      action: t('settings.overviewPage.actions.openFoundryAgents'),
      route: '/settings/runtime?tab=environment#modules',
      tone:
        status.moduleKnown && status.moduleAttention === 0 && status.moduleInstalled >= status.moduleTotal
          ? 'green'
          : 'orange',
      tag:
        status.moduleKnown && status.moduleAttention === 0 && status.moduleInstalled >= status.moduleTotal
          ? t('settings.oplEnvironmentPage.status.ready')
          : status.moduleKnown
            ? t('settings.oplEnvironmentPage.status.attention_needed')
            : t('settings.oplEnvironmentPage.status.unknown'),
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
                {t('settings.overviewPage.actions.openOplAgent')}
              </Button>
              <Button onClick={() => navigate('/settings/runtime?tab=environment#modules')}>
                {t('settings.overviewPage.actions.openFoundryAgents')}
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
