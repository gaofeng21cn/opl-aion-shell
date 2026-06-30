/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOplDefaultHomeAssistants } from '@/common/config/oplProductProfile';
import { oplRecord, oplString } from '@/renderer/hooks/system/useOplAppState';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdateComponent, ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';
import {
  formatStatus,
  isReadyStatus,
  moduleId,
  moduleRecords,
  moduleStatus,
  normalizeModule,
  oplPathString,
  type RuntimeModuleItem,
  type RuntimeStatusTone,
  type Translate,
} from '../sections/runtimeStateView';

const OPL_HOME_ASSISTANT_MODULE_IDS: Record<string, string> = {
  mas: 'medautoscience',
  mag: 'medautogrant',
  rca: 'redcube',
  bookforge: 'oplbookforge',
};

const OPL_EXPLICIT_MODULE_DEFAULTS = [{ id: 'oplmetaagent', label: 'OPL Meta Agent' }];
const MAKE_USABLE_COMPONENT_IDS = new Set(['runtime_substrate', 'capability_packages', 'companion_tools']);

const PROFILE_MODULE_DEFAULTS = getOplDefaultHomeAssistants()
  .map((assistant) => {
    const id = OPL_HOME_ASSISTANT_MODULE_IDS[assistant.id];
    return id ? { id, label: assistant.display_name } : null;
  })
  .filter((entry): entry is { id: string; label: string } => Boolean(entry));

const OPL_RUNTIME_MODULE_DEFAULTS = [...PROFILE_MODULE_DEFAULTS, ...OPL_EXPLICIT_MODULE_DEFAULTS];

export type EnvironmentHealthSummaryItem = {
  key: string;
  label: string;
  value: string;
  tone: RuntimeStatusTone;
};

export type EnvironmentReadinessCard = {
  key: string;
  title: string;
  value: string;
  detail: string;
  nextAction: string;
  tone: RuntimeStatusTone;
};

export type RuntimeEnvironmentProjection = {
  familyWorkspaceRoot: string | null;
  workspaceRoot: string | null;
  logsRoot: string | null;
  modulesSourceMode: string | null;
  modulesRoot: string | null;
  modules: RuntimeModuleItem[];
  moduleReady: number;
  appVersion: string;
  guiVersion: string;
  releaseChannel: string;
  releaseRepo: string | null;
  attentionCount: number;
  componentsNeedingMaintenance: number;
  healthSummaryItems: EnvironmentHealthSummaryItem[];
  runtimeCards: EnvironmentReadinessCard[];
  installationCarrierComponent?: ManagedUpdateComponent;
  runtimeSubstrateComponent?: ManagedUpdateComponent;
  capabilityPackagesComponent?: ManagedUpdateComponent;
  companionToolsComponent?: ManagedUpdateComponent;
  codexSurfaceComponent?: ManagedUpdateComponent;
};

export function localAppVersion(): string {
  return __OPL_RELEASE_VERSION__ || __APP_VERSION__;
}

export function formatReleaseChannel(
  channel: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  const normalized = channel?.trim() || 'stable';
  return t(`settings.runtimePage.releaseChannels.${normalized}`, { channel: normalized });
}

export function componentIsHealthy(component: ManagedUpdateComponent): boolean {
  return ['current', 'ready', 'ok', 'compatible', 'installed'].includes(component.state);
}

export function componentStatusTone(component: ManagedUpdateComponent): RuntimeStatusTone {
  return componentIsHealthy(component) &&
    !component.manualRequired &&
    !component.developerCheckout &&
    !component.dirtyCheckout
    ? 'green'
    : 'orange';
}

export function runtimeCardActionKey(key: string, status: string, t: Translate): string {
  if (key === 'workspace' && status !== 'ready')
    return t('settings.oplEnvironmentPage.summary.actions.chooseWorkspace');
  if (key === 'modules' && !isReadyStatus(status)) return t('settings.oplEnvironmentPage.summary.actions.checkModules');
  if (key === 'temporal' && !isReadyStatus(status))
    return t('settings.oplEnvironmentPage.summary.actions.repairRuntime');
  if (key === 'codex' && !isReadyStatus(status)) return t('settings.oplEnvironmentPage.summary.actions.runDoctor');
  return t('settings.oplEnvironmentPage.summary.actions.none');
}

export function componentUserSummary(component: ManagedUpdateComponent, t: Translate): string {
  if (component.id === 'workflow_profile') {
    return t('settings.oplEnvironmentPage.updates.userSummaries.workflowProfile');
  }
  if (component.id === 'codex_surface') {
    return t('settings.oplEnvironmentPage.updates.userSummaries.codexSurface');
  }
  if (component.dirtyCheckout) return t('settings.oplEnvironmentPage.updates.userSummaries.dirtyCheckout');
  if (component.developerCheckout) return t('settings.oplEnvironmentPage.updates.userSummaries.developerCheckout');
  if (component.hostExecutorRequired) return t('settings.oplEnvironmentPage.updates.userSummaries.hostExecutorRequired');
  if (component.manualRequired) return t('settings.oplEnvironmentPage.updates.userSummaries.manualRequired');
  if (component.needsRestart) return t('settings.oplEnvironmentPage.updates.userSummaries.needsRestart');
  if (component.safeToApply) return t('settings.oplEnvironmentPage.updates.userSummaries.canApply');
  if (component.repairAllowed) return t('settings.oplEnvironmentPage.updates.userSummaries.canRepair');
  if (component.needsReload) return t('settings.oplEnvironmentPage.updates.userSummaries.needsReload');
  if (componentIsHealthy(component)) return t('settings.oplEnvironmentPage.updates.userSummaries.current');
  return t('settings.oplEnvironmentPage.updates.userSummaries.checkDetails');
}

export function updateComponentUserAction(component: ManagedUpdateComponent, t: Translate): string {
  if (component.id === 'workflow_profile') {
    return t('settings.oplEnvironmentPage.updates.nextActions.semanticMerge');
  }
  if (component.id === 'installation_carrier' && (component.hostUpdateRoute || component.hostExecutorRequired)) {
    return t('settings.oplEnvironmentPage.updates.nextActions.hostRoute');
  }
  if (component.id === 'codex_surface') {
    return t('settings.oplEnvironmentPage.updates.nextActions.projectionOnly');
  }
  if (component.manualRequired || component.developerCheckout || component.dirtyCheckout) {
    return componentUserSummary(component, t);
  }
  if (component.repairAllowed) return t('settings.oplEnvironmentPage.updates.nextActions.repair');
  if (component.safeToApply) return t('settings.oplEnvironmentPage.updates.nextActions.apply');
  if (component.needsRestart) return t('settings.oplEnvironmentPage.updates.nextActions.restart');
  if (component.needsReload) return t('settings.oplEnvironmentPage.updates.nextActions.reload');
  if (componentIsHealthy(component)) return t('settings.oplEnvironmentPage.updates.nextActions.none');
  return t('settings.oplEnvironmentPage.updates.nextActions.review');
}

export function findRecommendedUpdateAction(components: ManagedUpdateComponent[]): {
  kind: 'repair' | 'apply' | 'check';
  component: ManagedUpdateComponent | null;
} {
  const repairable = components.find(
    (component) =>
      component.repairAllowed && !component.manualRequired && !component.developerCheckout && !component.dirtyCheckout
  );
  if (repairable) return { kind: 'repair', component: repairable };
  const applicable = components.find(
    (component) =>
      component.safeToApply && !component.manualRequired && !component.developerCheckout && !component.dirtyCheckout
  );
  if (applicable) return { kind: 'apply', component: applicable };
  return { kind: 'check', component: null };
}

export function chooseMakeUsableAction(component: ManagedUpdateComponent): 'repair' | 'apply' | null {
  if (!MAKE_USABLE_COMPONENT_IDS.has(component.id)) return null;
  if (component.manualRequired || component.developerCheckout || component.dirtyCheckout) return null;
  if (component.repairAllowed) return 'repair';
  if (component.safeToApply && !component.needsRestart) return 'apply';
  return null;
}

export function buildRuntimeModules(modulesPayload: Record<string, unknown>): RuntimeModuleItem[] {
  const declaredModules = moduleRecords(modulesPayload.items ?? modulesPayload.modules);
  const byId = new Map(
    declaredModules.map((item) => {
      const normalized = normalizeModule(item);
      return [moduleId(normalized), normalized];
    })
  );
  const orderedIds = new Set<string>();
  const orderedModules: RuntimeModuleItem[] = [];
  for (const profileModule of OPL_RUNTIME_MODULE_DEFAULTS) {
    orderedIds.add(profileModule.id);
    const declaredModule = byId.get(profileModule.id);
    orderedModules.push(
      normalizeModule({
        ...declaredModule,
        module_id: profileModule.id,
        label: oplString(declaredModule?.label) ?? profileModule.label,
      })
    );
  }
  for (const module of declaredModules.map(normalizeModule)) {
    const id = moduleId(module);
    if (!id || orderedIds.has(id)) continue;
    orderedIds.add(id);
    orderedModules.push(module);
  }
  return orderedModules;
}

export function buildRuntimeEnvironmentProjection({
  appState,
  managedUpdatePlane,
  managedUpdateMaintenance,
  loadedAt,
  t,
}: {
  appState: Record<string, unknown>;
  managedUpdatePlane: ManagedUpdatePlane;
  managedUpdateMaintenance: ManagedUpdateMaintenanceSnapshot;
  loadedAt?: string | null;
  t: Translate;
}): RuntimeEnvironmentProjection {
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const paths = oplRecord(appState.paths);
  const modulesPayload = oplRecord(appState.modules);
  const modulesSourcePayload = oplRecord(modulesPayload.source);
  const release = oplRecord(appState.release);
  const familyWorkspaceRoot = oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ?? oplPathString(paths.workspace_root) ?? familyWorkspaceRoot;
  const logsRoot = oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir);
  const modulesSourceMode = oplString(modulesSourcePayload.mode) ?? oplString(modulesPayload.source);
  const modulesRoot =
    oplString(modulesSourcePayload.modules_root) ?? oplString(modulesPayload.modules_root) ?? familyWorkspaceRoot;
  const modules = buildRuntimeModules(modulesPayload);
  const moduleReady = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const moduleValue = t('settings.oplEnvironmentPage.modulesReadyCount', {
    ready: moduleReady,
    total: modules.length,
  });
  const codexStatus = oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : 'unknown');
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status) ?? 'unknown';
  const workspaceStatus = workspaceRoot ? 'ready' : 'unknown';
  const releaseChannel = oplString(release.channel) ?? oplString(release.release_channel) ?? 'stable';
  const releaseRepo = oplString(release.repo) ?? oplString(release.release_repo);
  const attentionCount = [
    workspaceStatus !== 'ready',
    !isReadyStatus(codexStatus),
    !isReadyStatus(temporalStatus),
    moduleReady < modules.length,
  ].filter(Boolean).length;
  const componentsNeedingMaintenance = managedUpdatePlane.components.filter(
    (component) => !componentIsHealthy(component) || component.needsReload || component.needsRestart
  ).length;
  const lastCheckValue =
    managedUpdateMaintenance.lastRunAt ?? loadedAt ?? t('settings.oplEnvironmentPage.status.unknown');
  const healthSummaryItems: EnvironmentHealthSummaryItem[] = [
    {
      key: 'usable',
      label: t('settings.oplEnvironmentPage.healthSummary.usable'),
      value:
        attentionCount === 0
          ? t('settings.oplEnvironmentPage.healthSummary.values.canUse')
          : t('settings.oplEnvironmentPage.healthSummary.values.canUseWithAttention'),
      tone: attentionCount === 0 ? 'green' : 'orange',
    },
    {
      key: 'attention',
      label: t('settings.oplEnvironmentPage.healthSummary.attention'),
      value:
        attentionCount === 0
          ? t('settings.oplEnvironmentPage.healthSummary.values.none')
          : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: attentionCount }),
      tone: attentionCount === 0 ? 'green' : 'orange',
    },
    {
      key: 'maintenance',
      label: t('settings.oplEnvironmentPage.healthSummary.maintenance'),
      value:
        componentsNeedingMaintenance === 0
          ? t('settings.oplEnvironmentPage.healthSummary.values.none')
          : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: componentsNeedingMaintenance }),
      tone: componentsNeedingMaintenance === 0 ? 'green' : 'orange',
    },
    {
      key: 'lastCheck',
      label: t('settings.oplEnvironmentPage.healthSummary.lastCheck'),
      value: lastCheckValue,
      tone: 'green',
    },
  ];
  const runtimeCards: EnvironmentReadinessCard[] = [
    {
      key: 'codex',
      title: t('settings.oplEnvironmentPage.localAssistantTitle'),
      value: formatStatus(codexStatus, t),
      detail: t('settings.oplEnvironmentPage.summary.impacts.codex'),
      nextAction: runtimeCardActionKey('codex', codexStatus, t),
      tone: codexStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'temporal',
      title: t('settings.oplEnvironmentPage.localServiceTitle'),
      value: formatStatus(temporalStatus, t),
      detail: t('settings.oplEnvironmentPage.summary.impacts.temporal'),
      nextAction: runtimeCardActionKey('temporal', temporalStatus, t),
      tone: temporalStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'workspace',
      title: t('settings.oplEnvironmentPage.workspaceRootTitle'),
      value: formatStatus(workspaceStatus, t),
      detail: t('settings.oplEnvironmentPage.summary.impacts.workspace'),
      nextAction: runtimeCardActionKey('workspace', workspaceStatus, t),
      tone: workspaceStatus === 'ready' ? 'green' : 'orange',
    },
    {
      key: 'modules',
      title: t('settings.oplEnvironmentPage.modulesTitle'),
      value: moduleValue,
      detail: t('settings.oplEnvironmentPage.summary.impacts.modules'),
      nextAction: runtimeCardActionKey('modules', moduleReady >= modules.length ? 'ready' : 'attention_required', t),
      tone: moduleReady >= modules.length ? 'green' : 'orange',
    },
  ];
  const componentById = new Map(managedUpdatePlane.components.map((component) => [component.id, component]));

  return {
    familyWorkspaceRoot,
    workspaceRoot,
    logsRoot,
    modulesSourceMode,
    modulesRoot,
    modules,
    moduleReady,
    appVersion: localAppVersion(),
    guiVersion: __SHELL_VERSION__,
    releaseChannel,
    releaseRepo,
    attentionCount,
    componentsNeedingMaintenance,
    healthSummaryItems,
    runtimeCards,
    installationCarrierComponent: componentById.get('installation_carrier'),
    runtimeSubstrateComponent: componentById.get('runtime_substrate'),
    capabilityPackagesComponent: componentById.get('capability_packages'),
    companionToolsComponent: componentById.get('companion_tools'),
    codexSurfaceComponent: componentById.get('codex_surface'),
  };
}
