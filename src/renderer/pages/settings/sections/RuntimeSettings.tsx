/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Input, Message, Radio, Space, Tabs, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Repair, UpdateRotation } from '@icon-park/react';
import codexLogo from '@/renderer/assets/logos/tools/coding/codex.svg';
import hermesLogo from '@/renderer/assets/logos/brand/hermes.svg';
import onePersonLabLogo from '@/renderer/assets/logos/brand/app.png';
import masLogo from '@/renderer/assets/logos/opl-modules/mas.svg';
import mdsLogo from '@/renderer/assets/logos/opl-modules/mds.svg';
import magLogo from '@/renderer/assets/logos/opl-modules/mag.svg';
import rcaLogo from '@/renderer/assets/logos/opl-modules/rca.svg';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { mergeOplDefaultCodexContext, normalizeOplCodexSessionContext } from '@/common/config/oplSkills';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import SettingRow from './SettingRow';

type OplInteractionLayer = 'codex' | 'hermes';
type RuntimeSettingsTab = 'personalization' | 'environment';

type DefaultInstructionFileKey = 'codex' | 'hermes';

type DefaultInstructionFileState = {
  loading: boolean;
  content: string;
  error: boolean;
};

const DEFAULT_INSTRUCTION_FILES: Array<{ key: DefaultInstructionFileKey; titleKey: string; relativePath: string }> = [
  {
    key: 'codex',
    titleKey: 'settings.runtimePage.defaultInstructionFiles.codex',
    relativePath: '.codex/AGENTS.md',
  },
  {
    key: 'hermes',
    titleKey: 'settings.runtimePage.defaultInstructionFiles.hermes',
    relativePath: '.hermes/SOUL.md',
  },
];

function normalizeInteractionLayer(value: unknown): OplInteractionLayer {
  return value === 'hermes' ? 'hermes' : 'codex';
}

function isRuntimeSettingsTab(value: string | null): value is RuntimeSettingsTab {
  return value === 'personalization' || value === 'environment';
}

function joinHomePath(home: string, relativePath: string): string {
  return `${home.replace(/\/$/, '')}/${relativePath}`;
}

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
  binary_path?: string | null;
  binary_source?: string | null;
  candidates?: Array<{
    path?: string | null;
    selected?: boolean;
    version?: string | null;
    parsed_version?: string | null;
    version_status?: string | null;
  }>;
  default_model?: string | null;
  default_reasoning_effort?: string | null;
  provider_base_url?: string | null;
  health_status?: string | null;
  issues?: string[];
  diagnostics?: string[];
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

const CODEX_ISSUE_KEYS: Record<string, string> = {
  codex_cli_missing: 'settings.oplEnvironmentPage.diagnostics.issues.codexCliMissing',
  codex_cli_version_outdated: 'settings.oplEnvironmentPage.diagnostics.issues.codexCliVersionOutdated',
  codex_cli_version_unknown: 'settings.oplEnvironmentPage.diagnostics.issues.codexCliVersionUnknown',
  codex_cli_path_version_conflict: 'settings.oplEnvironmentPage.diagnostics.issues.codexCliPathVersionConflict',
  codex_cli_path_version_conflict_nonblocking:
    'settings.oplEnvironmentPage.diagnostics.issues.codexCliCompatiblePathDuplicate',
};

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

function formatSelectedBinary(engine: CoreEngineStatus | undefined): string | null {
  const selected = engine?.binary_path ?? engine?.candidates?.find((candidate) => candidate.selected)?.path;
  if (!selected) return null;
  return engine?.binary_source ? `${selected} (${engine.binary_source})` : selected;
}

function formatCodexDiagnostics(
  engine: CoreEngineStatus | undefined,
  t: (key: string, options?: Record<string, string>) => string
): string[] {
  if (!engine) return [];
  const diagnostics = [
    ...(engine.issues ?? []).map((issue) =>
      t(CODEX_ISSUE_KEYS[issue] ?? 'settings.oplEnvironmentPage.diagnostics.issues.unknown', { issue })
    ),
    ...(engine.diagnostics ?? []).map((diagnostic) =>
      t(CODEX_ISSUE_KEYS[diagnostic] ?? 'settings.oplEnvironmentPage.diagnostics.issues.unknown', {
        issue: diagnostic,
      })
    ),
    ...(engine.candidates ?? [])
      .filter((candidate) => !candidate.selected && candidate.path)
      .map((candidate) =>
        t('settings.oplEnvironmentPage.diagnostics.codexCandidate', {
          path: candidate.path ?? '',
          version:
            candidate.parsed_version ?? firstLine(candidate.version) ?? t('settings.oplEnvironmentPage.status.unknown'),
          status:
            formatHealthStatus(candidate.version_status ?? undefined, t) ||
            t('settings.oplEnvironmentPage.status.unknown'),
        })
      ),
  ];
  return diagnostics.filter((entry) => entry.trim().length > 0);
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
  return t(item.latestVersionKey, { minimumVersion: engine?.minimum_version ?? '' });
}

function formatHealthStatus(status: string | undefined, t: (key: string, options?: Record<string, string>) => string) {
  if (!status) return '';
  return t(`settings.oplEnvironmentPage.status.${status}`, { status });
}

const RuntimeInstructionSettings: React.FC = () => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const [interactionLayer, setInteractionLayer] = useState<OplInteractionLayer>('codex');
  const [codexSessionContext, setCodexSessionContext] = useState(mergeOplDefaultCodexContext());
  const [loadingContext, setLoadingContext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [homePath, setHomePath] = useState('');
  const [instructionFiles, setInstructionFiles] = useState<
    Record<DefaultInstructionFileKey, DefaultInstructionFileState>
  >({
    codex: { loading: false, content: '', error: false },
    hermes: { loading: false, content: '', error: false },
  });

  useEffect(() => {
    ConfigStorage.get('opl.interactionLayer')
      .then((value) => setInteractionLayer(normalizeInteractionLayer(value)))
      .catch(() => setInteractionLayer('codex'));
    ipcBridge.application.getPath
      .invoke({ name: 'home' })
      .then(setHomePath)
      .catch(() => setHomePath(''));
  }, []);

  const loadCodexSessionContext = useCallback(
    async (showError = false) => {
      setLoadingContext(true);
      try {
        const context = await ConfigStorage.get('opl.codexSessionContext');
        const sessionContext = normalizeOplCodexSessionContext(context);
        if (sessionContext) {
          setCodexSessionContext(sessionContext);
          return;
        }

        const addendum = await ConfigStorage.get('opl.codexSessionAddendum');
        setCodexSessionContext(
          typeof addendum === 'string' && addendum.trim().length > 0
            ? mergeOplDefaultCodexContext(undefined, { codexSessionAddendum: addendum })
            : mergeOplDefaultCodexContext()
        );
      } catch {
        setCodexSessionContext(mergeOplDefaultCodexContext());
        if (showError) {
          message.warning(t('settings.runtimePage.messages.sessionContextLoadFailed'));
        }
      } finally {
        setLoadingContext(false);
      }
    },
    [message, t]
  );

  useEffect(() => {
    void loadCodexSessionContext(false);
  }, [loadCodexSessionContext]);

  const loadDefaultInstructionFiles = useCallback(
    async (showError = false) => {
      if (!homePath) return;
      setInstructionFiles((prev) => ({
        codex: { ...prev.codex, loading: true, error: false },
        hermes: { ...prev.hermes, loading: true, error: false },
      }));

      const nextEntries = await Promise.all(
        DEFAULT_INSTRUCTION_FILES.map(async (file) => {
          try {
            const content = await ipcBridge.fs.readFile.invoke({ path: joinHomePath(homePath, file.relativePath) });
            return [file.key, { loading: false, content: content || '', error: false }] as const;
          } catch {
            return [file.key, { loading: false, content: '', error: true }] as const;
          }
        })
      );

      setInstructionFiles((prev) => ({ ...prev, ...Object.fromEntries(nextEntries) }));
      if (showError && nextEntries.some(([, state]) => state.error)) {
        message.warning(t('settings.runtimePage.messages.defaultInstructionFilesLoadFailed'));
      }
    },
    [homePath, message, t]
  );

  useEffect(() => {
    void loadDefaultInstructionFiles(false);
  }, [loadDefaultInstructionFiles]);

  const saveInteractionLayer = useCallback(
    async (nextLayer: OplInteractionLayer) => {
      setInteractionLayer(nextLayer);
      await Promise.all([
        ConfigStorage.set('opl.interactionLayer', nextLayer),
        ConfigStorage.set('guid.lastSelectedAgent', nextLayer),
      ]);
      message.success(t('settings.runtimePage.messages.interactionLayerSaved'));
    },
    [message, t]
  );

  const saveCodexSessionContext = useCallback(async () => {
    setSaving(true);
    try {
      await ConfigStorage.set('opl.codexSessionContext', codexSessionContext.trim());
      message.success(t('settings.runtimePage.messages.sessionContextSaved'));
      await loadCodexSessionContext(false);
    } catch {
      message.error(t('settings.runtimePage.messages.sessionContextSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [codexSessionContext, loadCodexSessionContext, message, t]);

  const restoreDefaultCodexSessionContext = useCallback(() => {
    setCodexSessionContext(mergeOplDefaultCodexContext());
  }, []);

  return (
    <div className='rounded-10px border border-solid border-border-1 bg-bg-1 divide-y divide-border-1 overflow-hidden'>
      {contextHolder}
      <SettingRow
        title={t('settings.runtimePage.interactionTitle')}
        description={t('settings.runtimePage.interactionDescription')}
      >
        <Radio.Group
          type='button'
          size='small'
          mode='outline'
          value={interactionLayer}
          options={[
            { label: t('settings.runtimePage.interactionCodex'), value: 'codex' },
            { label: t('settings.runtimePage.interactionHermes'), value: 'hermes' },
          ]}
          onChange={(value) => void saveInteractionLayer(normalizeInteractionLayer(value))}
        />
      </SettingRow>

      <SettingRow
        alignTop
        title={t('settings.runtimePage.sessionContextTitle')}
        description={t('settings.runtimePage.sessionContextDescription')}
      >
        <div className='flex flex-col gap-12px' data-testid='runtime-session-context-settings'>
          <div>
            <Typography.Text className='block text-12px font-500 text-t-secondary mb-6px'>
              {t('settings.runtimePage.defaultCodexContextTitle')}
            </Typography.Text>
            <div
              data-testid='opl-codex-default-context-reference'
              className='max-h-220px min-h-120px overflow-auto rounded-8px border border-solid border-border-1 bg-fill-1 px-12px py-10px text-12px leading-18px text-t-secondary whitespace-pre-wrap break-words select-text'
            >
              {mergeOplDefaultCodexContext()}
            </div>
          </div>
          <div>
            <Typography.Text className='block text-12px font-500 text-t-secondary mb-6px'>
              {t('settings.runtimePage.sessionContextInputTitle')}
            </Typography.Text>
            <Input.TextArea
              data-testid='opl-codex-session-context-input'
              value={codexSessionContext}
              rows={14}
              placeholder={t('settings.runtimePage.sessionContextPlaceholder')}
              onChange={setCodexSessionContext}
            />
          </div>
          <Space wrap>
            <Button
              size='small'
              icon={<UpdateRotation theme='outline' />}
              loading={loadingContext}
              onClick={() => void loadCodexSessionContext(true)}
            >
              {t('settings.runtimePage.actions.reloadSessionContext')}
            </Button>
            <Button size='small' type='primary' loading={saving} onClick={() => void saveCodexSessionContext()}>
              {t('settings.runtimePage.actions.saveSessionContext')}
            </Button>
            <Button size='small' onClick={restoreDefaultCodexSessionContext}>
              {t('settings.runtimePage.actions.restoreDefaultSessionContext')}
            </Button>
          </Space>
          <Collapse bordered={false} className='bg-transparent'>
            <Collapse.Item header={t('settings.runtimePage.defaultInstructionFilesTitle')} name='default-files'>
              <div className='flex flex-col gap-12px' data-testid='default-instruction-files-reference'>
                <div className='flex justify-end'>
                  <Button
                    size='mini'
                    icon={<UpdateRotation theme='outline' />}
                    onClick={() => void loadDefaultInstructionFiles(true)}
                  >
                    {t('settings.runtimePage.actions.reloadDefaultInstructionFiles')}
                  </Button>
                </div>
                {DEFAULT_INSTRUCTION_FILES.map((file) => {
                  const state = instructionFiles[file.key];
                  return (
                    <div key={file.key}>
                      <Typography.Text className='block text-12px font-500 text-t-secondary mb-6px'>
                        {t(file.titleKey)}
                      </Typography.Text>
                      <div
                        data-testid={`${file.key}-default-instruction-file`}
                        className='max-h-180px min-h-80px overflow-auto rounded-8px border border-solid border-border-1 bg-fill-1 px-12px py-10px text-12px leading-18px text-t-secondary whitespace-pre-wrap break-words select-text'
                      >
                        {state.loading
                          ? t('settings.runtimePage.defaultInstructionFilesLoading')
                          : state.error
                            ? t('settings.runtimePage.defaultInstructionFilesLoadFailed')
                            : state.content || t('settings.runtimePage.defaultInstructionFilesEmpty')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Collapse.Item>
          </Collapse>
        </div>
      </SettingRow>
    </div>
  );
};

const OplEnvironmentContent: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [moduleStatuses, setModuleStatuses] = useState<OplModuleStatus[]>([]);
  const [coreEngines, setCoreEngines] = useState<CoreEngines>({});
  const [workspaceRoot, setWorkspaceRoot] = useState<WorkspaceRootStatus | undefined>();
  const [appVersions, setAppVersions] = useState<AppVersions | null>(null);

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

  const handleOneClickUpdate = useCallback(async () => {
    setRunningAction('one-click-update');
    try {
      const result = await ipcBridge.shell.runOplCommand.invoke({ args: ['system', 'update'] });
      if (result.exitCode !== 0) {
        message.error(result.stderr || result.stdout || t('settings.oplEnvironmentPage.messages.commandFailed'));
        return;
      }

      await loadEnvironment();
      const updateResult = await ipcBridge.autoUpdate.check.invoke({ includePrerelease: false });
      if (!updateResult?.success || !updateResult.data?.updateInfo) {
        message.success(t('settings.oplEnvironmentPage.messages.systemUpdateComplete'));
        return;
      }

      const downloadResult = await ipcBridge.autoUpdate.download.invoke();
      if (!downloadResult?.success) {
        message.error(downloadResult?.msg || t('settings.oplEnvironmentPage.messages.appUpdateDownloadFailed'));
        return;
      }

      window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { status: 'downloaded' } }));
      message.success(t('settings.oplEnvironmentPage.messages.appUpdateDownloaded'));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : t('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setRunningAction(null);
    }
  }, [loadEnvironment, message, t]);

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
    <div
      className='flex flex-col gap-16px'
      data-testid='opl-settings-environment'
      aria-label='opl-settings-environment'
    >
      {contextHolder}
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.oplEnvironmentPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.oplEnvironmentPage.description')}</Typography.Text>
      </div>

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
                {formatHealthStatus(workspaceRoot.health_status, t)}
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
            <Button
              icon={<UpdateRotation theme='outline' />}
              loading={runningAction === 'one-click-update'}
              onClick={() => void handleOneClickUpdate()}
            >
              {t('settings.oplEnvironmentPage.actions.oneClickUpdate')}
            </Button>
            <Button onClick={() => navigate('/settings/access')}>
              {t('settings.oplEnvironmentPage.actions.openRemote')}
            </Button>
          </Space>
        </div>
      </Card>

      <Card bordered className='rounded-xl overflow-hidden' id='modules'>
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
            const selectedBinary = item.engineId === 'codex' ? formatSelectedBinary(engine) : null;
            const codexDiagnostics = item.engineId === 'codex' ? formatCodexDiagnostics(engine, t) : [];
            const hermesUpdateSummary =
              item.engineId === 'hermes' && engine?.update_summary ? firstLine(engine.update_summary) : null;
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
                    {selectedBinary && (
                      <Typography.Text className='block text-12px text-t-tertiary truncate'>
                        {t('settings.oplEnvironmentPage.selectedBinary', { path: selectedBinary })}
                      </Typography.Text>
                    )}
                    {codexDiagnostics.map((diagnostic) => (
                      <Typography.Text key={diagnostic} className='block text-12px text-t-tertiary truncate'>
                        {t('settings.oplEnvironmentPage.diagnostics.label', { detail: diagnostic })}
                      </Typography.Text>
                    ))}
                    {hermesUpdateSummary && (
                      <Typography.Text className='block text-12px text-t-tertiary truncate'>
                        {t('settings.oplEnvironmentPage.updateSummary', { summary: hermesUpdateSummary })}
                      </Typography.Text>
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
                        {formatHealthStatus(status?.health_status ?? engine?.health_status, t)}
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

const RuntimeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<RuntimeSettingsTab>(() => {
    return isRuntimeSettingsTab(tabParam) ? tabParam : 'personalization';
  });

  useEffect(() => {
    if (isRuntimeSettingsTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [activeTab, tabParam]);

  const handleTabChange = useCallback(
    (key: string) => {
      if (!isRuntimeSettingsTab(key)) return;
      setActiveTab(key);
      const next = new URLSearchParams(searchParams);
      if (key === 'personalization') {
        next.delete('tab');
      } else {
        next.set('tab', key);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return (
    <SettingsPageWrapper contentClassName='max-w-920px'>
      <div className='flex flex-col gap-16px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.runtimePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.runtimePage.description')}</Typography.Text>
        </div>
        <Tabs activeTab={activeTab} onChange={handleTabChange} type='line' className='settings-runtime-tabs'>
          <Tabs.TabPane key='personalization' title={t('settings.runtimePage.tabs.personalization')} />
          <Tabs.TabPane key='environment' title={t('settings.runtimePage.tabs.environment')} />
        </Tabs>
        {activeTab === 'personalization' ? <RuntimeInstructionSettings /> : <OplEnvironmentContent />}
      </div>
    </SettingsPageWrapper>
  );
};

export default RuntimeSettings;
