/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckOne, Repair, UpdateRotation } from '@icon-park/react';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';
import type { RuntimeMaintenanceHubItem } from '../sections/RuntimeSettingsPanels';
import {
  buildRuntimeEnvironmentProjection,
  componentStatusTone,
  componentUserSummary,
  formatReleaseChannel,
} from './environmentProjection';
import { formatStatus, type Translate } from '../sections/runtimeStateView';

export type RuntimeSettingsActions = {
  openUpdateModal: () => void;
  runMaintenanceHubCheck: (target: 'runtimeSubstrate' | 'capabilityPacks') => void;
  runMakeOplUsable: () => void;
  runServiceCheck: () => void;
};

export type RuntimeSettingsViewModelInput = {
  appState: Record<string, unknown>;
  loadedAt?: string | null;
  managedUpdateMaintenance: ManagedUpdateMaintenanceSnapshot;
  managedUpdatePlane: ManagedUpdatePlane;
  activeReadOperation: 'status' | 'check' | 'plan' | null;
  maintenanceHubCheckTarget: 'runtimeSubstrate' | 'capabilityPacks' | null;
  makeUsableRunning: boolean;
  actions: RuntimeSettingsActions;
  t: Translate;
};

export type RuntimeSettingsViewModel = ReturnType<typeof buildRuntimeSettingsViewModel>;

export function buildRuntimeSettingsViewModel({
  appState,
  loadedAt,
  managedUpdateMaintenance,
  managedUpdatePlane,
  activeReadOperation,
  maintenanceHubCheckTarget,
  makeUsableRunning,
  actions,
  t,
}: RuntimeSettingsViewModelInput) {
  const environment = buildRuntimeEnvironmentProjection({
    appState,
    managedUpdatePlane,
    managedUpdateMaintenance,
    loadedAt,
    t,
  });
  const {
    installationCarrierComponent,
    runtimeSubstrateComponent,
    capabilityPackagesComponent,
    codexSurfaceComponent,
    attentionCount,
    moduleInstalledCount,
    moduleManualMaintenanceCount,
    modules,
  } = environment;
  const updateReadDisabled = Boolean(activeReadOperation && activeReadOperation !== 'check');
  const capabilityPacksHealthy =
    moduleInstalledCount >= modules.length &&
    moduleManualMaintenanceCount === 0 &&
    (!capabilityPackagesComponent || componentStatusTone(capabilityPackagesComponent) === 'green') &&
    (!codexSurfaceComponent || componentStatusTone(codexSurfaceComponent) === 'green');
  const capabilityPacksChecked =
    modules.length > 0 || Boolean(capabilityPackagesComponent) || Boolean(codexSurfaceComponent);
  const maintenanceHubItems: RuntimeMaintenanceHubItem[] = [
    {
      key: 'appUpdates',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'),
      detail: installationCarrierComponent
        ? componentUserSummary(installationCarrierComponent, t)
        : t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.description'),
      status: formatStatus(installationCarrierComponent?.state ?? 'unknown', t),
      tone: installationCarrierComponent ? componentStatusTone(installationCarrierComponent) : 'gray',
      icon: <UpdateRotation theme='outline' />,
      actionLabel: t('settings.checkForUpdates'),
      onAction: actions.openUpdateModal,
    },
    {
      key: 'runtimeEnvironment',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.title'),
      detail: runtimeSubstrateComponent
        ? componentUserSummary(runtimeSubstrateComponent, t)
        : t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.description'),
      status: formatStatus(runtimeSubstrateComponent?.state ?? 'unknown', t),
      tone: runtimeSubstrateComponent ? componentStatusTone(runtimeSubstrateComponent) : 'gray',
      icon: <Repair theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment'),
      actionHelp: t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.actionHelp'),
      actionLoading: makeUsableRunning,
      actionDisabled: Boolean(activeReadOperation) || Boolean(maintenanceHubCheckTarget),
      onAction: actions.runMakeOplUsable,
    },
    {
      key: 'capabilitySurfaceSync',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.title'),
      detail:
        capabilityPackagesComponent || codexSurfaceComponent
          ? [
              moduleManualMaintenanceCount > 0
                ? t('settings.oplEnvironmentPage.moduleMaintenance.manualMaintenanceSummary', {
                    count: moduleManualMaintenanceCount,
                  })
                : null,
              capabilityPackagesComponent ? componentUserSummary(capabilityPackagesComponent, t) : null,
              codexSurfaceComponent ? componentUserSummary(codexSurfaceComponent, t) : null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(' ')
          : t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.description'),
      status: capabilityPacksChecked
        ? t('settings.oplEnvironmentPage.modulesInstalledCount', {
            installed: moduleInstalledCount,
            total: modules.length,
          })
        : formatStatus('unknown', t),
      tone: capabilityPacksChecked ? (capabilityPacksHealthy ? 'green' : 'orange') : 'gray',
      icon: <Repair theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks'),
      actionHelp: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.actionHelp'),
      actionLoading: maintenanceHubCheckTarget === 'capabilityPacks',
      actionDisabled: updateReadDisabled,
      onAction: () => actions.runMaintenanceHubCheck('capabilityPacks'),
    },
    {
      key: 'localServicesRepair',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.localServicesRepair.title'),
      detail: t('settings.oplEnvironmentPage.maintenanceHub.items.localServicesRepair.description'),
      status:
        attentionCount === 0
          ? t('settings.oplEnvironmentPage.healthSummary.values.none')
          : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: attentionCount }),
      tone: attentionCount === 0 ? 'green' : 'orange',
      icon: <CheckOne theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.maintenanceHub.actions.checkBackgroundServices'),
      onAction: actions.runServiceCheck,
    },
  ];

  return {
    environment,
    maintenanceHubItems,
    releaseChannelLabel: formatReleaseChannel(environment.releaseChannel, t),
  };
}
