/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Message, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Repair, UpdateRotation } from '@icon-park/react';
import codexLogo from '@/renderer/assets/logos/tools/coding/codex.svg';
import hermesLogo from '@/renderer/assets/logos/brand/hermes.svg';
import onePersonLabLogo from '@/renderer/assets/logos/brand/app.png';
import masLogo from '@/renderer/assets/logos/opl-modules/mas.svg';
import mdsLogo from '@/renderer/assets/logos/opl-modules/mds.svg';
import magLogo from '@/renderer/assets/logos/opl-modules/mag.svg';
import rcaLogo from '@/renderer/assets/logos/opl-modules/rca.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import {
  dispatchOplBrandNameChanged,
  normalizeOplBrandName,
  OPL_DEFAULT_BRAND_NAME,
} from '@/renderer/hooks/system/useOplBrandName';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import OplAppearanceThemeSettings from './OplAppearanceThemeSettings';

type OplModuleStatus = {
  module_id: string;
  label: string;
  scope?: string;
  health_status?: string;
  install_origin?: string;
  installed?: boolean;
  available_actions?: string[];
  recommended_action?: string | null;
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

type CoreEngineStatus = {
  installed?: boolean;
  version?: string | null;
  parsed_version?: string | null;
  minimum_version?: string | null;
  version_status?: string | null;
  update_available?: boolean;
  update_summary?: string | null;
  default_model?: string | null;
  default_reasoning_effort?: string | null;
  provider_base_url?: string | null;
  health_status?: string | null;
  issues?: string[];
};

type CoreEngines = {
  codex?: CoreEngineStatus;
  hermes?: CoreEngineStatus;
};

type WorkspaceRootStatus = {
  selected_path?: string | null;
  health_status?: string | null;
};

type SystemInitializePayload = {
  system_initialize?: {
    core_engines?: CoreEngines;
    domain_modules?: {
      modules?: OplModuleStatus[];
    };
    workspace_root?: WorkspaceRootStatus;
    recommended_next_action?: {
      action_id?: string;
      label?: string;
    };
  };
};

type AppVersions = {
  oplVersion: string;
  guiVersion: string;
};

type EnvironmentItem = {
  id: string;
  moduleId?: string;
  engineId?: 'codex' | 'hermes';
  name: string;
  roleKey: string;
  latestVersionKey: string;
  logo?: string;
};

const OPL_ENVIRONMENT_ITEMS: EnvironmentItem[] = [
  {
    id: 'codex',
    engineId: 'codex',
    name: 'Codex CLI',
    roleKey: 'settings.oplEnvironmentPage.items.codex.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.codex.latest',
    logo: codexLogo,
  },
  {
    id: 'hermes',
    engineId: 'hermes',
    name: 'Hermes-Agent',
    roleKey: 'settings.oplEnvironmentPage.items.hermes.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.hermes.latest',
    logo: hermesLogo,
  },
  {
    id: 'mas',
    moduleId: 'medautoscience',
    name: 'Med AutoScience (MAS)',
    roleKey: 'settings.oplEnvironmentPage.items.mas.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: masLogo,
  },
  {
    id: 'mds',
    moduleId: 'meddeepscientist',
    name: 'Med DeepScientist (MDS)',
    roleKey: 'settings.oplEnvironmentPage.items.mds.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: mdsLogo,
  },
  {
    id: 'mag',
    moduleId: 'medautogrant',
    name: 'Med AutoGrant (MAG)',
    roleKey: 'settings.oplEnvironmentPage.items.mag.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: magLogo,
  },
  {
    id: 'rca',
    moduleId: 'redcube',
    name: 'RedCube AI (RCA)',
    roleKey: 'settings.oplEnvironmentPage.items.rca.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.module.latest',
    logo: rcaLogo,
  },
  {
    id: 'gui',
    name: 'One Person Lab App',
    roleKey: 'settings.oplEnvironmentPage.items.gui.role',
    latestVersionKey: 'settings.oplEnvironmentPage.items.gui.latest',
    logo: onePersonLabLogo,
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

function parseSystemInitialize(stdout: string): SystemInitializePayload['system_initialize'] | null {
  try {
    const payload = JSON.parse(stdout) as SystemInitializePayload;
    return payload.system_initialize ?? null;
  } catch {
    return null;
  }
}

function firstLine(value?: string | null): string | null {
  const line = value
    ?.split(/\r?\n/)
    .find((entry) => entry.trim().length > 0)
    ?.trim();
  return line || null;
}

function formatModuleVersion(status: OplModuleStatus | undefined, t: (key: string) => string): string {
  if (!status) return t('settings.oplEnvironmentPage.status.notDetected');
  if (!status.installed) return t('settings.oplEnvironmentPage.status.notInstalled');
  const sha = status.git?.short_sha ?? 'unknown';
  const branch = status.git?.branch ?? 'unknown';
  const dirty = status.git?.dirty ? ' dirty' : '';
  return `${branch}@${sha}${dirty}`;
}

function formatEngineVersion(engine: CoreEngineStatus | undefined, t: (key: string) => string): string {
  if (!engine) return t('settings.oplEnvironmentPage.status.notDetected');
  if (!engine.installed) return t('settings.oplEnvironmentPage.status.notInstalled');
  return firstLine(engine.version) ?? t('settings.oplEnvironmentPage.status.notDetected');
}

function formatEngineProfile(engine: CoreEngineStatus | undefined): string | null {
  if (!engine?.default_model && !engine?.default_reasoning_effort && !engine?.provider_base_url) return null;
  return [engine.default_model, engine.default_reasoning_effort, engine.provider_base_url].filter(Boolean).join(' · ');
}

function formatAppVersion(versions: AppVersions | null, t: (key: string) => string): string {
  if (!versions) return t('settings.oplEnvironmentPage.status.managedByApp');
  return `OPL ${versions.oplVersion} · GUI ${versions.guiVersion}`;
}

function resolveModuleAction(status: OplModuleStatus | undefined): 'install' | 'update' | null {
  if (!status) return null;
  if (status.recommended_action === 'install' || status.recommended_action === 'update') {
    return status.recommended_action;
  }
  return null;
}

export function resolveEngineAction(
  engine: CoreEngineStatus | undefined,
  engineId: EnvironmentItem['engineId']
): 'install' | 'update' | null {
  if (!engine) return null;
  if (!engine.installed) return 'install';
  if (engineId === 'codex') {
    return engine.version_status === 'outdated' || engine.version_status === 'unknown' ? 'update' : null;
  }
  if (engineId === 'hermes') {
    return engine.update_available ? 'update' : null;
  }
  return null;
}

function formatTargetVersion(
  item: EnvironmentItem,
  engine: CoreEngineStatus | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  if (item.engineId === 'hermes' && engine?.update_available && engine.update_summary) {
    return firstLine(engine.update_summary) ?? engine.update_summary;
  }
  return t(item.latestVersionKey, { minimumVersion: engine?.minimum_version ?? '' });
}

const OplEnvironmentContent: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [moduleStatuses, setModuleStatuses] = useState<OplModuleStatus[]>([]);
  const [coreEngines, setCoreEngines] = useState<CoreEngines>({});
  const [workspaceRoot, setWorkspaceRoot] = useState<WorkspaceRootStatus | undefined>();
  const [appVersions, setAppVersions] = useState<AppVersions | null>(null);
  const [brandName, setBrandName] = useState(OPL_DEFAULT_BRAND_NAME);

  const loadEnvironment = useCallback(
    async (showLoading = false) => {
      if (showLoading) setRunningAction('refresh');
      try {
        const [systemResult, versions] = await Promise.all([
          ipcBridge.shell.runOplCommand.invoke({ args: ['system', 'initialize'] }),
          ipcBridge.application.appVersions.invoke().catch((_error: unknown): null => null),
        ]);
        if (versions) {
          setAppVersions(versions);
        }
        if (systemResult.exitCode === 0) {
          const initialize = parseSystemInitialize(systemResult.stdout);
          setCoreEngines(initialize?.core_engines ?? {});
          setModuleStatuses(initialize?.domain_modules?.modules ?? []);
          setWorkspaceRoot(initialize?.workspace_root);
          return;
        }

        const modulesResult = await ipcBridge.shell.runOplCommand.invoke({ args: ['modules'] });
        if (modulesResult.exitCode === 0) {
          setModuleStatuses(parseModules(modulesResult.stdout));
        } else {
          message.warning(
            systemResult.stderr || modulesResult.stderr || t('settings.oplEnvironmentPage.messages.loadModulesFailed')
          );
        }
      } catch {
        message.warning(t('settings.oplEnvironmentPage.messages.loadModulesFailed'));
      } finally {
        if (showLoading) setRunningAction(null);
      }
    },
    [message, t]
  );

  useEffect(() => {
    void loadEnvironment(false);
  }, [loadEnvironment]);

  useEffect(() => {
    ConfigStorage.get('opl.brandName')
      .then((value) => setBrandName(normalizeOplBrandName(value)))
      .catch(() => setBrandName(OPL_DEFAULT_BRAND_NAME));
  }, []);

  const statusByModuleId = useMemo(() => {
    const map = new Map<string, OplModuleStatus>();
    for (const status of moduleStatuses) {
      map.set(status.module_id, status);
    }
    return map;
  }, [moduleStatuses]);

  const handleBrandNameBlur = useCallback(() => {
    const normalized = normalizeOplBrandName(brandName);
    setBrandName(normalized);
    ConfigStorage.set('opl.brandName', normalized)
      .then(() => {
        dispatchOplBrandNameChanged();
        message.success(t('settings.oplEnvironmentPage.messages.brandNameSaved'));
      })
      .catch(() => message.error(t('settings.oplEnvironmentPage.messages.brandNameSaveFailed')));
  }, [brandName, message, t]);

  const runOplCommand = useCallback(
    async (args: string[], actionId: string, successText: string) => {
      setRunningAction(actionId);
      try {
        const result = await ipcBridge.shell.runOplCommand.invoke({ args });
        if (result.exitCode === 0) {
          message.success(successText);
          await loadEnvironment();
        } else {
          message.error(result.stderr || result.stdout || t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } finally {
        setRunningAction(null);
      }
    },
    [loadEnvironment, message, t]
  );

  const handleChooseWorkspaceRoot = useCallback(async () => {
    const result = await ipcBridge.dialog.showOpen.invoke({
      properties: ['openDirectory', 'createDirectory'],
    });
    const selectedPath = result?.[0];
    if (!selectedPath) return;
    await runOplCommand(
      ['workspace', 'root', 'set', '--path', selectedPath],
      'workspace-root',
      t('settings.oplEnvironmentPage.messages.workspaceRootSaved')
    );
  }, [runOplCommand, t]);

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
            {t('settings.oplEnvironmentPage.brandTitle')}
          </Typography.Text>
          <Typography.Text className='text-t-secondary'>
            {t('settings.oplEnvironmentPage.brandDescription')}
          </Typography.Text>
          <Input
            value={brandName}
            placeholder={OPL_DEFAULT_BRAND_NAME}
            onChange={setBrandName}
            onBlur={handleBrandNameBlur}
            onPressEnter={handleBrandNameBlur}
          />
        </div>
      </Card>

      <Card bordered className='rounded-xl'>
        <div className='flex items-center justify-between gap-16px'>
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.workspaceRootTitle')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary truncate'>
              {workspaceRoot?.selected_path || t('settings.oplEnvironmentPage.workspaceRootMissing')}
            </Typography.Text>
            {workspaceRoot?.health_status && (
              <Tag size='small' color={workspaceRoot.health_status === 'ready' ? 'green' : 'orange'}>
                {workspaceRoot.health_status}
              </Tag>
            )}
          </div>
          <Button loading={runningAction === 'workspace-root'} onClick={() => void handleChooseWorkspaceRoot()}>
            {t('settings.oplEnvironmentPage.actions.chooseWorkspaceRoot')}
          </Button>
        </div>
      </Card>

      <Card bordered className='rounded-xl'>
        <div className='flex flex-col gap-12px'>
          <Typography.Text className='font-600 text-t-primary'>
            {t('settings.oplEnvironmentPage.appearanceTitle')}
          </Typography.Text>
          <Typography.Text className='text-t-secondary'>
            {t('settings.oplEnvironmentPage.appearanceDescription')}
          </Typography.Text>
          <OplAppearanceThemeSettings />
        </div>
      </Card>

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
              loading={runningAction === 'refresh'}
              onClick={() => void loadEnvironment(true)}
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

      <Card bordered className='rounded-xl overflow-hidden'>
        <div className='flex flex-col divide-y divide-border-1'>
          {OPL_ENVIRONMENT_ITEMS.map((item) => {
            const status = item.moduleId ? statusByModuleId.get(item.moduleId) : undefined;
            const engine = item.engineId ? coreEngines?.[item.engineId] : undefined;
            const currentVersion = item.moduleId
              ? formatModuleVersion(status, t)
              : item.engineId
                ? formatEngineVersion(engine, t)
                : formatAppVersion(appVersions, t);
            const targetVersion = formatTargetVersion(item, engine, t);
            const detail = item.engineId === 'codex' ? formatEngineProfile(engine) : null;
            const moduleAction = item.moduleId ? resolveModuleAction(status) : null;
            const engineAction = item.engineId ? resolveEngineAction(engine, item.engineId) : null;
            const actionArgs =
              item.moduleId && moduleAction
                ? ['module', moduleAction, '--module', item.moduleId]
                : item.engineId && engineAction
                  ? ['engine', engineAction, '--engine', item.engineId]
                  : null;
            const actionLabel =
              moduleAction === 'install' || engineAction === 'install'
                ? t('settings.oplEnvironmentPage.actions.install')
                : t('settings.oplEnvironmentPage.actions.update');
            const actionId = `update-${item.id}`;
            return (
              <div key={item.id} className='flex items-center justify-between gap-16px px-16px py-14px'>
                <div className='flex items-center gap-12px min-w-0'>
                  {item.logo ? (
                    <img src={item.logo} alt='' width={28} height={28} className='shrink-0 rd-7px' />
                  ) : (
                    <div className='w-28px h-28px shrink-0 rd-7px bg-fill-2 flex items-center justify-center text-11px font-700'>
                      {item.name.slice(0, 2)}
                    </div>
                  )}
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>{item.name}</Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary truncate'>
                      {t(item.roleKey)}
                    </Typography.Text>
                    {detail && (
                      <Typography.Text className='block text-12px text-t-tertiary truncate'>{detail}</Typography.Text>
                    )}
                  </div>
                </div>
                <div className='flex items-center gap-12px shrink-0'>
                  <div className='hidden sm:flex flex-col items-end gap-4px'>
                    <Typography.Text className='text-12px text-t-tertiary'>
                      {t('settings.oplEnvironmentPage.currentVersion', { version: currentVersion })}
                    </Typography.Text>
                    <Typography.Text className='text-12px text-t-tertiary'>
                      {t('settings.oplEnvironmentPage.latestVersion', { version: targetVersion })}
                    </Typography.Text>
                    {(status?.health_status || engine?.health_status) && (
                      <Tag
                        size='small'
                        color={(status?.health_status ?? engine?.health_status) === 'ready' ? 'green' : 'orange'}
                      >
                        {status?.health_status ?? engine?.health_status}
                      </Tag>
                    )}
                  </div>
                  {item.id === 'gui' ? (
                    <Button size='mini' onClick={() => navigate('/settings/about')}>
                      {t('settings.checkForUpdates')}
                    </Button>
                  ) : (
                    <Button
                      size='mini'
                      disabled={!actionArgs}
                      loading={runningAction === actionId}
                      onClick={() => {
                        if (!actionArgs) return;
                        void runOplCommand(
                          actionArgs,
                          actionId,
                          t('settings.oplEnvironmentPage.messages.updateComplete', { name: item.name })
                        );
                      }}
                    >
                      {actionLabel}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
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
