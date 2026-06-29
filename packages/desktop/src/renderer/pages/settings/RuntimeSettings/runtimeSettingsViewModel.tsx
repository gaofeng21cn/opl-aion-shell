/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckOne, FolderSearch, Repair, UpdateRotation } from '@icon-park/react';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';
import type { RuntimeMaintenanceHubItem, RuntimeMaintenanceHubPrimaryAction } from '../sections/RuntimeSettingsPanels';
import {
  buildRuntimeEnvironmentProjection,
  componentStatusTone,
  componentUserSummary,
  formatReleaseChannel,
} from './environmentProjection';
import { formatStatus, type Translate } from '../sections/runtimeStateView';

export type RuntimeSettingsActions = {
  openStorageSettings: () => void;
  openUpdateModal: () => void;
  runMaintenanceHubCheck: (target: 'runtimeToolchain' | 'capabilityPacks') => void;
  runMakeOplUsable: () => void;
  runRepairSuggestions: () => void;
};

export type RuntimeSettingsViewModelInput = {
  appState: Record<string, unknown>;
  loadedAt?: string | null;
  managedUpdateMaintenance: ManagedUpdateMaintenanceSnapshot;
  managedUpdatePlane: ManagedUpdatePlane;
  activeReadOperation: 'status' | 'check' | 'plan' | null;
  maintenanceHubCheckTarget: 'runtimeToolchain' | 'capabilityPacks' | null;
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
    appBinaryComponent,
    runtimeToolchainComponent,
    agentPackageComponent,
    capabilityExposureComponent,
    attentionCount,
    moduleReady,
    modules,
  } = environment;
  const updateReadDisabled = Boolean(activeReadOperation && activeReadOperation !== 'check');
  const capabilityPacksHealthy =
    moduleReady >= modules.length &&
    (!agentPackageComponent || componentStatusTone(agentPackageComponent) === 'green') &&
    (!capabilityExposureComponent || componentStatusTone(capabilityExposureComponent) === 'green');
  const maintenanceHubItems: RuntimeMaintenanceHubItem[] = [
    {
      key: 'appUpdates',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'),
      detail: appBinaryComponent
        ? componentUserSummary(appBinaryComponent, t)
        : t('settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.description'),
      status: formatStatus(appBinaryComponent?.state ?? 'unknown', t),
      tone: appBinaryComponent ? componentStatusTone(appBinaryComponent) : 'orange',
      icon: <UpdateRotation theme='outline' />,
      actionLabel: t('settings.checkForUpdates'),
      onAction: actions.openUpdateModal,
    },
    {
      key: 'runtimeToolchain',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeToolchain.title'),
      detail: runtimeToolchainComponent
        ? componentUserSummary(runtimeToolchainComponent, t)
        : t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeToolchain.description'),
      status: formatStatus(runtimeToolchainComponent?.state ?? 'unknown', t),
      tone: runtimeToolchainComponent ? componentStatusTone(runtimeToolchainComponent) : 'orange',
      icon: <UpdateRotation theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.updates.actions.check'),
      actionHelp: t('settings.oplEnvironmentPage.maintenanceHub.items.runtimeToolchain.actionHelp'),
      actionLoading: maintenanceHubCheckTarget === 'runtimeToolchain',
      actionDisabled: updateReadDisabled,
      onAction: () => actions.runMaintenanceHubCheck('runtimeToolchain'),
    },
    {
      key: 'capabilityPacks',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilityPacks.title'),
      detail:
        agentPackageComponent || capabilityExposureComponent
          ? [
              agentPackageComponent ? componentUserSummary(agentPackageComponent, t) : null,
              capabilityExposureComponent ? componentUserSummary(capabilityExposureComponent, t) : null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(' ')
          : t('settings.oplEnvironmentPage.maintenanceHub.items.capabilityPacks.description'),
      status: t('settings.oplEnvironmentPage.moduleMaintenance.moduleCount', {
        ready: moduleReady,
        total: modules.length,
      }),
      tone: capabilityPacksHealthy ? 'green' : 'orange',
      icon: <Repair theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.moduleMaintenance.actions.check'),
      actionHelp: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilityPacks.actionHelp'),
      actionLoading: maintenanceHubCheckTarget === 'capabilityPacks',
      actionDisabled: updateReadDisabled,
      onAction: () => actions.runMaintenanceHubCheck('capabilityPacks'),
    },
    {
      key: 'storageCleanup',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.storageCleanup.title'),
      detail: t('settings.oplEnvironmentPage.maintenanceHub.items.storageCleanup.description'),
      status: t('settings.oplEnvironmentPage.maintenanceHub.status.available'),
      tone: 'green',
      icon: <FolderSearch theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.storageData.openStorage'),
      onAction: actions.openStorageSettings,
    },
    {
      key: 'repairSuggestions',
      title: t('settings.oplEnvironmentPage.maintenanceHub.items.repairSuggestions.title'),
      detail: t('settings.oplEnvironmentPage.maintenanceHub.items.repairSuggestions.description'),
      status:
        attentionCount === 0
          ? t('settings.oplEnvironmentPage.healthSummary.values.none')
          : t('settings.oplEnvironmentPage.healthSummary.values.count', { count: attentionCount }),
      tone: attentionCount === 0 ? 'green' : 'orange',
      icon: <CheckOne theme='outline' />,
      actionLabel: t('settings.oplEnvironmentPage.actions.repair'),
      onAction: actions.runRepairSuggestions,
    },
  ];
  const maintenanceHubPrimaryAction: RuntimeMaintenanceHubPrimaryAction = {
    label: t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.label'),
    help: t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.help'),
    loading: makeUsableRunning,
    disabled: Boolean(activeReadOperation) || Boolean(maintenanceHubCheckTarget),
    onAction: actions.runMakeOplUsable,
  };

  return {
    environment,
    maintenanceHubItems,
    maintenanceHubPrimaryAction,
    releaseChannelLabel: formatReleaseChannel(environment.releaseChannel, t),
  };
}
