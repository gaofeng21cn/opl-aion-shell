/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { oplRecord, oplString } from '@/renderer/hooks/system/useOplAppState';
import type { DesktopAutoUpdateProjection } from '@/renderer/services/desktopAutoUpdateProjection';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdateComponent, ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';
import {
  formatStatus,
  isReadyStatus,
  isUserUsableStatus,
  moduleHasLocalChanges,
  moduleId,
  moduleInstalled,
  moduleRecords,
  moduleStatus,
  normalizeModule,
  oplPathString,
  type RuntimeModuleItem,
  type RuntimeStatusTone,
  type Translate,
} from '../sections/runtimeStateView';

const MAKE_USABLE_COMPONENT_IDS = new Set(['opl_base', 'opl_packages']);
const HEALTHY_MANAGED_UPDATE_STATES = new Set(['current', 'ready', 'ok', 'compatible', 'installed']);
const TEMPORAL_NOT_CONFIGURED_STATES = new Set([
  'not_configured',
  'provider_code_landed_unconfigured',
  'temporal_runtime_not_configured',
]);
const TEMPORAL_UNKNOWN_COMPONENT_STATES = new Set(['', 'unknown', 'not_checked', 'not_reported']);

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
  moduleInstalledCount: number;
  moduleManualMaintenanceCount: number;
  packageStatusAvailable: boolean;
  packagesOperationalReady: boolean;
  appVersion: string;
  guiVersion: string;
  releaseChannel: string;
  releaseRepo: string | null;
  runtimeAttentionCount: number;
  attentionCount: number;
  componentsNeedingMaintenance: number;
  healthSummaryItems: EnvironmentHealthSummaryItem[];
  runtimeCards: EnvironmentReadinessCard[];
  oplBaseComponent?: ManagedUpdateComponent;
  oplAppComponent?: ManagedUpdateComponent;
  oplPackagesComponent?: ManagedUpdateComponent;
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
  return (
    HEALTHY_MANAGED_UPDATE_STATES.has(component.state) &&
    component.substatuses.every((substatus) => HEALTHY_MANAGED_UPDATE_STATES.has(substatus.state))
  );
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
  if (component.dirtyCheckout) return t('settings.oplEnvironmentPage.updates.userSummaries.dirtyCheckout');
  if (component.developerCheckout) return t('settings.oplEnvironmentPage.updates.userSummaries.developerCheckout');
  if (component.hostExecutorRequired)
    return t('settings.oplEnvironmentPage.updates.userSummaries.hostExecutorRequired');
  if (component.manualRequired) return t('settings.oplEnvironmentPage.updates.userSummaries.manualRequired');
  if (component.needsRestart) return t('settings.oplEnvironmentPage.updates.userSummaries.needsRestart');
  if (component.safeToApply) return t('settings.oplEnvironmentPage.updates.userSummaries.canApply');
  if (component.repairAllowed) return t('settings.oplEnvironmentPage.updates.userSummaries.canRepair');
  if (component.needsReload) return t('settings.oplEnvironmentPage.updates.userSummaries.needsReload');
  if (componentIsHealthy(component)) return t('settings.oplEnvironmentPage.updates.userSummaries.current');
  return t('settings.oplEnvironmentPage.updates.userSummaries.checkDetails');
}

export function updateComponentUserAction(component: ManagedUpdateComponent, t: Translate): string {
  if (component.id === 'opl_app' && (component.hostUpdateRoute || component.hostExecutorRequired)) {
    return t('settings.oplEnvironmentPage.updates.nextActions.hostRoute');
  }
  if (component.manualRequired || component.developerCheckout || component.dirtyCheckout) {
    return t('settings.oplEnvironmentPage.updates.nextActions.review');
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
  const orderedIds = new Set<string>();
  const orderedModules: RuntimeModuleItem[] = [];
  for (const declaredModule of declaredModules) {
    const id = moduleId(declaredModule);
    if (!id || orderedIds.has(id)) continue;
    orderedIds.add(id);
    const module = normalizeModule(declaredModule);
    orderedModules.push({
      ...module,
      module_id: oplString(declaredModule.module_id) ?? oplString(declaredModule.id) ?? module.module_id,
    });
  }
  return orderedModules;
}

export function buildRuntimePackages(appState: Record<string, unknown>): {
  modules: RuntimeModuleItem[];
  installedCount: number;
  statusAvailable: boolean;
} {
  const agentPackages = oplRecord(appState.agent_packages);
  const statusIndex = oplRecord(agentPackages.status_index);
  const statusAvailable = oplString(statusIndex.status) === 'available' || 'packages' in statusIndex;
  const directory = oplRecord(agentPackages.directory);
  const directoryEntriesAvailable = 'entries' in directory;
  const statusPackages = moduleRecords(statusIndex.packages);
  if (!directoryEntriesAvailable) {
    return {
      modules: [],
      installedCount: 0,
      statusAvailable: false,
    };
  }

  const directoryEntries = moduleRecords(directory.entries);
  const statusById = new Map(
    statusPackages.map((status) => [oplString(status.package_id) ?? moduleId(status), status])
  );
  const runtimeSourceCarriers = oplRecord(appState.runtime_source_carriers);
  const carriersById = new Map(
    moduleRecords(runtimeSourceCarriers.items).map((carrier) => [
      oplString(carrier.package_id) ?? moduleId(carrier),
      carrier,
    ])
  );
  const modules = directoryEntries.map((directoryEntry) => {
    const packageId = oplString(directoryEntry.package_id) ?? moduleId(directoryEntry);
    const status = statusById.get(packageId) ?? {};
    const carrier = carriersById.get(packageId) ?? {};
    const installed = directoryEntry.installed === true;
    const operationalReady = status.operational_ready === true;
    return normalizeModule({
      ...carrier,
      ...directoryEntry,
      ...status,
      module_id: packageId,
      display_name: oplString(carrier.label) ?? oplString(directoryEntry.display_name) ?? packageId,
      installed,
      status: installed
        ? operationalReady
          ? 'ready'
          : (oplString(status.status) ?? 'attention_needed')
        : 'notInstalled',
      source: oplString(carrier.source_origin) ?? oplString(directoryEntry.source),
      path: oplString(carrier.source_path) ?? oplString(directoryEntry.path),
      checkout_dirty: oplRecord(carrier.git).dirty === true,
    });
  });
  return {
    modules,
    installedCount: modules.filter((module) => module.installed === true).length,
    statusAvailable,
  };
}

export function buildRuntimeEnvironmentProjection({
  appState,
  managedUpdatePlane,
  managedUpdateMaintenance,
  desktopAutoUpdate,
  loadedAt,
  t,
}: {
  appState: Record<string, unknown>;
  managedUpdatePlane: ManagedUpdatePlane;
  managedUpdateMaintenance: ManagedUpdateMaintenanceSnapshot;
  desktopAutoUpdate?: DesktopAutoUpdateProjection;
  loadedAt?: string | null;
  t: Translate;
}): RuntimeEnvironmentProjection {
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const temporalDetails = oplRecord(temporal.details);
  const temporalWorkerReadiness = oplRecord(temporalDetails.worker_readiness);
  const temporalScheduler = oplRecord(temporalDetails.scheduler);
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const statusSummary = oplRecord(settingsControlCenter.status_summary);
  const codexModelPolicy = oplRecord(appSettingsReadModel.codex_model_policy);
  const workspaceServices = oplRecord(appSettingsReadModel.workspace_services);
  const projectedWorkspaceRoot = oplRecord(workspaceServices.workspace_root);
  const projectedFamilyWorkspaceRoot = oplRecord(workspaceServices.family_workspace_root);
  const localEnvironment = oplRecord(appSettingsReadModel.local_environment);
  const paths = oplRecord(appState.paths);
  const runtimeSourceCarriers = oplRecord(appState.runtime_source_carriers);
  const modulesSourcePayload = oplRecord(runtimeSourceCarriers.source);
  const release = oplRecord(appState.release);
  const familyWorkspaceRoot = oplPathString(projectedFamilyWorkspaceRoot) ?? oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplPathString(projectedWorkspaceRoot) ??
    oplString(paths.workspace_root_path) ??
    oplPathString(paths.workspace_root) ??
    familyWorkspaceRoot;
  const logsRoot =
    oplString(localEnvironment.logs_dir) ??
    oplString(paths.logs_dir) ??
    oplString(paths.logs_root) ??
    oplString(paths.log_dir);
  const modulesSourceMode = oplString(modulesSourcePayload.mode);
  const modulesRoot =
    oplString(modulesSourcePayload.runtime_sources_root) ??
    oplString(paths.runtime_sources_root) ??
    familyWorkspaceRoot;
  const packageProjection = buildRuntimePackages(appState);
  const modules = packageProjection.modules;
  const moduleInstalledCount = packageProjection.installedCount;
  const componentById = new Map(managedUpdatePlane.components.map((component) => [component.id, component]));
  const moduleManualMaintenanceCount =
    managedUpdatePlane.packageManualRequiredTargetCount ??
    modules.filter(moduleInstalled).filter(moduleHasLocalChanges).length;
  const packagesOperationalReady =
    packageProjection.statusAvailable &&
    modules.filter(moduleInstalled).every((module) => isUserUsableStatus(moduleStatus(module))) &&
    moduleManualMaintenanceCount === 0;
  const moduleValue =
    modules.length === 0
      ? t('settings.oplEnvironmentPage.noInstalledPackages')
      : t('settings.oplEnvironmentPage.modulesInstalledCount', {
          installed: moduleInstalledCount,
          total: modules.length,
        });
  const codexStatus =
    oplString(codexModelPolicy.access_status) ??
    oplString(statusSummary.model_access) ??
    oplString(codex.status) ??
    (oplString(statusSummary.codex_version) || oplString(codex.version) ? 'ready' : 'unknown');
  const temporalServiceReady =
    typeof temporalWorkerReadiness.service_ready === 'boolean' ? temporalWorkerReadiness.service_ready : null;
  const temporalWorkerReadyValue =
    typeof temporalWorkerReadiness.worker_ready === 'boolean' ? temporalWorkerReadiness.worker_ready : null;
  const temporalSchedulerReadyValue = typeof temporalScheduler.ready === 'boolean' ? temporalScheduler.ready : null;
  const temporalServerReady = temporalServiceReady === true;
  const temporalWorkerReady = temporalWorkerReadyValue === true;
  const temporalSchedulerReady = temporalSchedulerReadyValue === true;
  const temporalComponentsReady = temporalServerReady && temporalWorkerReady && temporalSchedulerReady;
  const temporalProviderStatuses = [
    oplString(temporal.health_status),
    oplString(temporal.status),
    oplString(localEnvironment.temporal_provider),
  ].filter((status): status is string => Boolean(status));
  const normalizedAddressSource = oplString(temporalDetails.address_source)?.toLowerCase() ?? '';
  const normalizedWorkerStatus =
    (
      oplString(temporalWorkerReadiness.lifecycle_status) ??
      oplString(temporalWorkerReadiness.readiness_status) ??
      oplString(temporal.worker_status)
    )?.toLowerCase() ?? '';
  const normalizedSchedulerStatus =
    (
      oplString(temporalScheduler.status) ??
      oplString(temporalScheduler.health_status) ??
      oplString(temporalDetails.scheduler_status)
    )?.toLowerCase() ?? '';
  const providerReportsNotConfigured = temporalProviderStatuses.some((status) =>
    TEMPORAL_NOT_CONFIGURED_STATES.has(status.toLowerCase())
  );
  const hasExplicitReadyComponent = temporalServerReady || temporalWorkerReady || temporalSchedulerReady;
  const hasSpecificComponentFailure =
    (temporalServiceReady === false && !TEMPORAL_NOT_CONFIGURED_STATES.has(normalizedAddressSource)) ||
    (temporalWorkerReadyValue === false &&
      !TEMPORAL_NOT_CONFIGURED_STATES.has(normalizedWorkerStatus) &&
      !TEMPORAL_UNKNOWN_COMPONENT_STATES.has(normalizedWorkerStatus)) ||
    (temporalSchedulerReadyValue === false &&
      !TEMPORAL_NOT_CONFIGURED_STATES.has(normalizedSchedulerStatus) &&
      !TEMPORAL_UNKNOWN_COMPONENT_STATES.has(normalizedSchedulerStatus));
  const temporalStatus = temporalComponentsReady
    ? 'ready'
    : providerReportsNotConfigured && !hasExplicitReadyComponent && !hasSpecificComponentFailure
      ? 'not_configured'
      : 'attention_required';
  const workspaceStatus = workspaceRoot ? 'ready' : 'unknown';
  const releaseChannel =
    oplString(localEnvironment.release_channel) ??
    oplString(statusSummary.release_channel) ??
    oplString(release.channel) ??
    oplString(release.release_channel) ??
    'stable';
  const releaseRepo = oplString(release.repo) ?? oplString(release.release_repo);
  const runtimeAttentionCount = [
    workspaceStatus !== 'ready',
    !isReadyStatus(codexStatus),
    !isReadyStatus(temporalStatus),
    !packagesOperationalReady,
  ].filter(Boolean).length;
  const oplAppComponent = componentById.get('opl_app');
  const managedAppNeedsAttention = Boolean(
    oplAppComponent &&
    (!componentIsHealthy(oplAppComponent) || oplAppComponent.needsReload || oplAppComponent.needsRestart)
  );
  const appUpdateNeedsAttention = desktopAutoUpdate?.supported
    ? desktopAutoUpdate.needsAttention
    : managedAppNeedsAttention;
  const attentionCount = runtimeAttentionCount + (appUpdateNeedsAttention ? 1 : 0);
  const managedComponentsNeedingMaintenance = managedUpdatePlane.components.filter(
    (component) =>
      (!desktopAutoUpdate?.supported || component.id !== 'opl_app') &&
      (!componentIsHealthy(component) || component.needsReload || component.needsRestart)
  ).length;
  const componentsNeedingMaintenance =
    managedComponentsNeedingMaintenance + (desktopAutoUpdate?.supported && appUpdateNeedsAttention ? 1 : 0);
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
      nextAction: runtimeCardActionKey('modules', packagesOperationalReady ? 'ready' : 'attention_required', t),
      tone: packagesOperationalReady ? 'green' : 'orange',
    },
  ];
  return {
    familyWorkspaceRoot,
    workspaceRoot,
    logsRoot,
    modulesSourceMode,
    modulesRoot,
    modules,
    moduleInstalledCount,
    moduleManualMaintenanceCount,
    packageStatusAvailable: packageProjection.statusAvailable,
    packagesOperationalReady,
    appVersion: localAppVersion(),
    guiVersion: __SHELL_VERSION__,
    releaseChannel,
    releaseRepo,
    runtimeAttentionCount,
    attentionCount,
    componentsNeedingMaintenance,
    healthSummaryItems,
    runtimeCards,
    oplBaseComponent: componentById.get('opl_base'),
    oplAppComponent,
    oplPackagesComponent: componentById.get('opl_packages'),
  };
}
