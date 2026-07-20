/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckOne, Puzzle, Refresh, Toolkit } from '@icon-park/react';
import type { DesktopAutoUpdateProjection } from '@/renderer/services/desktopAutoUpdateProjection';
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
  runMaintenanceHubCheck: (target: 'oplBase' | 'oplPackages') => void;
  runMakeOplUsable: () => void;
  runServiceCheck: () => void;
};

export type RuntimeSettingsViewModelInput = {
  appState: Record<string, unknown>;
  loadedAt?: string | null;
  managedUpdateMaintenance: ManagedUpdateMaintenanceSnapshot;
  managedUpdatePlane: ManagedUpdatePlane;
  desktopAutoUpdate?: DesktopAutoUpdateProjection;
  activeReadOperation: 'status' | 'check' | 'plan' | null;
  maintenanceHubCheckTarget: 'oplBase' | 'oplPackages' | null;
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
  desktopAutoUpdate,
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
    desktopAutoUpdate,
    loadedAt,
    t,
  });
  const {
    oplBaseComponent,
    oplAppComponent,
    oplPackagesComponent,
    runtimeAttentionCount,
    moduleInstalledCount,
    moduleManualMaintenanceCount,
    modules,
    packageStatusAvailable,
    packagesOperationalReady,
  } = environment;
  const updateReadDisabled = Boolean(activeReadOperation && activeReadOperation !== 'check');
  const oplPackagesHealthy =
    packagesOperationalReady && (!oplPackagesComponent || componentStatusTone(oplPackagesComponent) === 'green');
  const oplPackagesChecked = packageStatusAvailable || Boolean(oplPackagesComponent);
  const oplPackagesStatus = oplPackagesComponent
    ? formatStatus(
        oplPackagesComponent.state === 'unknown' && packageStatusAvailable ? 'current' : oplPackagesComponent.state,
        t
      )
    : packageStatusAvailable
      ? t('settings.oplEnvironmentPage.maintenanceHub.status.available')
      : formatStatus('unknown', t);
  const oplBaseRepairAvailable = oplBaseComponent?.repairAllowed === true;
  const desktopAppUpdate = desktopAutoUpdate?.supported === true;
  const maintenanceHubItems: RuntimeMaintenanceHubItem[] = [
    {
      key: 'appUpdates',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'),
      detail: desktopAppUpdate
        ? t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.description')
        : oplAppComponent
          ? componentUserSummary(oplAppComponent, t)
          : t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.description'),
      status: desktopAppUpdate ? desktopAutoUpdate.label : formatStatus(oplAppComponent?.state ?? 'unknown', t),
      tone: desktopAppUpdate ? desktopAutoUpdate.tone : oplAppComponent ? componentStatusTone(oplAppComponent) : 'gray',
      icon: <Refresh theme='outline' size='16' />,
      actionLabel: t('settings.checkForUpdates'),
      onAction: actions.openUpdateModal,
    },
    {
      key: 'runtimeEnvironment',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.title'),
      detail: oplBaseComponent
        ? componentUserSummary(oplBaseComponent, t)
        : t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.description'),
      status: formatStatus(oplBaseComponent?.state ?? 'unknown', t),
      tone: oplBaseComponent ? componentStatusTone(oplBaseComponent) : 'gray',
      icon: <Toolkit theme='outline' size='16' />,
      actionLabel: t(
        oplBaseRepairAvailable
          ? 'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment'
          : 'settings.oplEnvironmentPage.maintenanceHub.actions.checkRuntimeEnvironment'
      ),
      actionHelp: t(
        oplBaseRepairAvailable
          ? 'settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.actionHelp'
          : 'settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.checkActionHelp'
      ),
      actionLoading: oplBaseRepairAvailable ? makeUsableRunning : maintenanceHubCheckTarget === 'oplBase',
      actionDisabled: Boolean(activeReadOperation) || Boolean(maintenanceHubCheckTarget),
      onAction: oplBaseRepairAvailable ? actions.runMakeOplUsable : () => actions.runMaintenanceHubCheck('oplBase'),
    },
    {
      key: 'capabilitySurfaceSync',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.title'),
      detail: oplPackagesComponent
        ? [
            modules.length === 0
              ? t('settings.oplEnvironmentPage.noInstalledPackages')
              : t('settings.oplEnvironmentPage.modulesInstalledCount', {
                  installed: moduleInstalledCount,
                  total: modules.length,
                }),
            moduleManualMaintenanceCount > 0
              ? t('settings.oplEnvironmentPage.moduleMaintenance.manualMaintenanceSummary', {
                  count: moduleManualMaintenanceCount,
                })
              : null,
            componentUserSummary(oplPackagesComponent, t),
          ]
            .filter((value): value is string => Boolean(value))
            .join(' ')
        : [
            oplPackagesChecked
              ? modules.length === 0
                ? t('settings.oplEnvironmentPage.noInstalledPackages')
                : t('settings.oplEnvironmentPage.modulesInstalledCount', {
                    installed: moduleInstalledCount,
                    total: modules.length,
                  })
              : null,
            t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.description'),
          ]
            .filter((value): value is string => Boolean(value))
            .join(' '),
      status: oplPackagesStatus,
      tone: oplPackagesChecked ? (oplPackagesHealthy ? 'green' : 'orange') : 'gray',
      icon: <Puzzle theme='outline' size='16' />,
      actionLabel: t('settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks'),
      actionHelp: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.actionHelp'),
      actionLoading: maintenanceHubCheckTarget === 'oplPackages',
      actionDisabled: updateReadDisabled,
      onAction: () => actions.runMaintenanceHubCheck('oplPackages'),
    },
    {
      key: 'localServicesRepair',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.localServicesRepair.title'),
      detail: t('settings.oplEnvironmentPage.maintenanceHub.items.localServicesRepair.description'),
      status:
        runtimeAttentionCount === 0
          ? t('settings.oplEnvironmentPage.healthSummary.values.none')
          : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: runtimeAttentionCount }),
      tone: runtimeAttentionCount === 0 ? 'green' : 'orange',
      icon: <CheckOne theme='outline' size='16' />,
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
