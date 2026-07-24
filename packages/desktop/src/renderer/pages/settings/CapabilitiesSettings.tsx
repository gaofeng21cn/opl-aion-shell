/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Button,
  Drawer,
  Input,
  Message,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  Tabs,
  Typography,
} from '@arco-design/web-react';
import { Close, Down, Experiment, FilePpt, FileWord, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SkillsHubSettings from './SkillsHubSettings';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import VoiceInputSection from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import OplRefreshIconButton from '@/renderer/components/opl/OplRefreshIconButton';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { canonicalizeOplProfessionalAgentId, getOplProfessionalAgentPackages } from '@/common/config/oplProductProfile';
import { oplProjectedRequirementAlternatives } from '@/common/types/opl/appState';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import {
  getAppState,
  oplRecord,
  oplRecordList,
  oplString,
  useOplAppState,
} from '@/renderer/hooks/system/useOplAppState';
import {
  getOplHomeShortcutPreferences,
  getOplHomeShortcutPreferenceReadback,
  getOplHomeShortcutPreferencesFromAppState,
  getOplOrderedHomeAgentShortcuts,
  isOplHomeShortcutVisible,
  type OplHomeShortcutPreferences,
  moveOplHomeShortcut,
  replaceOplHomeShortcutPreferences,
  setOplHomeShortcutHidden,
  useOplHomeShortcutPreferences,
} from '@/renderer/pages/guid/utils/oplHomeShortcutPreferences';
import {
  buildCapabilitiesViewModel,
  type CapabilityActionRefViewModel,
  type CapabilityAvailabilityStatus,
  type CapabilityCandidateReportViewModel,
  type CapabilityDecisionAction,
  type CapabilityPurposeViewModel,
  type CapabilityPackageActionViewModel,
  type CapabilityRefGroupViewModel,
  type CapabilityRefViewModel,
} from './capabilitiesProjection';
import { useManagedUpdateMaintenance } from '@/renderer/services/managedUpdateMaintenance';
import {
  readManagedUpdatePlane,
  readOplFlowManagedCapabilityCatalog,
} from '@/renderer/services/managedUpdateProjection';
import { localizedCapabilitySummary } from '@/renderer/utils/ui/capabilitySummary';

export type CapabilitiesTab = 'opl_flow_managed' | 'manual_and_third_party';

type ManifestTrustTier = 'third_party_unverified' | 'third_party_verified';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab =>
  value === 'opl_flow_managed' || value === 'manual_and_third_party';

const normalizeCapabilitiesTab = (value: string | null): CapabilitiesTab | null => {
  if (value === 'opl-flow-managed') return 'opl_flow_managed';
  if (value === 'third-party' || value === 'skills' || value === 'tools' || value === 'assistants') {
    return 'manual_and_third_party';
  }
  return isCapabilitiesTab(value) ? value : null;
};

function capabilityStatusColor(status: CapabilityAvailabilityStatus): 'orange' | 'red' | 'gray' {
  if (status === 'sync' || status === 'update' || status === 'attention' || status === 'missing') return 'orange';
  if (status === 'repair') return 'red';
  return 'gray';
}

function capabilityStatusLabel(
  status: CapabilityAvailabilityStatus,
  t: (key: string, options?: Record<string, string>) => string
): string {
  return t(`settings.capabilitiesPage.status.${status}`);
}

function capabilityConversationAvailabilityLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string {
  if (item.codexVisibility === 'visible' || item.codexVisibility === 'verificationPending') {
    return t('settings.capabilitiesPage.visibility.conversationAvailable', { defaultValue: 'Available' });
  }
  if (item.codexVisibility === 'needsSync') {
    return t('settings.capabilitiesPage.visibility.conversationNeedsSync', { defaultValue: 'Sync needed' });
  }
  if (item.codexVisibility === 'notVisible') {
    return t('settings.capabilitiesPage.visibility.conversationUnavailable', { defaultValue: 'Not available' });
  }
  return t('settings.capabilitiesPage.visibility.conversationUnverified', { defaultValue: 'Not verified' });
}

function capabilityIcon(item: CapabilityPurposeViewModel): React.ReactNode {
  if (item.key === 'mas') return <Experiment theme='outline' size='16' fill='currentColor' />;
  if (item.key === 'mag') return <FileWord theme='outline' size='16' fill='currentColor' />;
  if (item.key === 'rca') return <FilePpt theme='outline' size='16' fill='currentColor' />;
  if (item.key === 'obf') return <FileWord theme='outline' size='16' fill='currentColor' />;
  return <Robot theme='outline' size='16' fill='currentColor' />;
}

function capabilityActionLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string {
  if (item.availabilityStatus === 'verification') {
    return t('settings.capabilitiesPage.actions.reviewLocalCheck');
  }
  if (item.primaryAction === 'maintenance') {
    return t('settings.localServicesPage.actions.openMaintenance', { defaultValue: 'Open Maintenance' });
  }
  if (item.primaryAction === 'configure') return t('settings.capabilitiesPage.actions.installOrSync');
  return t('settings.capabilitiesPage.actions.openDetails');
}

function capabilityDecisionActionLabel(action: CapabilityDecisionAction, t: (key: string) => string): string {
  return t(`settings.capabilitiesPage.candidateReports.actions.${action}`);
}

type CapabilityDetailRow = {
  key: string;
  label: string;
  value: string;
};

const hasTextValue = (value: string | null | undefined): value is string => Boolean(value && value.trim());

function configurationItem(appState: Record<string, unknown>, configurationId: string): Record<string, unknown> {
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const configurationCatalog = oplRecord(settingsControlCenter.configuration_catalog);
  return (
    oplRecordList(configurationCatalog.items).find((item) => oplString(item.configuration_id) === configurationId) ?? {}
  );
}

function packageIdFromInstallResult(result: IOplRuntimeCommandResult | null | undefined): string | null {
  const parsed = oplRecord(result?.parsed);
  const execution = oplRecord(parsed.app_action_execution);
  const actionResult = oplRecord(execution.result);
  const install = oplRecord(actionResult.opl_agent_package_install);
  return oplString(oplRecord(install.package_lock).package_id) ?? oplString(install.package_id);
}

function installedPackageReadback(
  appState: Record<string, unknown>,
  packageId: string
): { displayName: string; status: string } | null {
  const agentPackages = oplRecord(appState.agent_packages);
  const directory = oplRecord(agentPackages.directory);
  const entry = oplRecordList(directory.entries).find((candidate) => oplString(candidate.package_id) === packageId);
  if (!entry || entry.installed !== true) return null;
  const status =
    oplString(oplRecord(entry.readiness).status) ?? oplString(entry.install_state) ?? oplString(entry.status);
  if (!status) return null;
  return {
    displayName: oplString(entry.display_name) ?? packageId,
    status,
  };
}

function capabilityReadbackStatus(status: string): CapabilityAvailabilityStatus {
  const normalized = status.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (
    [
      'ready',
      'compatible',
      'ok',
      'installed',
      'current',
      'verificationdeferred',
      'activationrequired',
      'pendingactivation',
    ].includes(normalized)
  ) {
    return 'ready';
  }
  if (['updateavailable', 'staged'].includes(normalized)) return 'update';
  if (['needssync', 'stale', 'syncrequired'].includes(normalized)) return 'sync';
  if (['missing', 'notinstalled', 'notconfigured'].includes(normalized)) return 'missing';
  if (['failed', 'failedwithrepair', 'blocked', 'blocking', 'repairrequired', 'degraded'].includes(normalized)) {
    return 'repair';
  }
  return 'attention';
}

function capabilityReasonLabel(reason: string, t: (key: string, options?: Record<string, string>) => string): string {
  return t(`settings.capabilitiesPage.reasonCodes.${reason}`, {
    defaultValue: t('settings.capabilitiesPage.reasonCodes.other'),
  });
}

function capabilitySourceLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string | null {
  const tokens = [
    item.sourceExplanation.kind,
    item.sourceExplanation.source,
    item.actualSource,
    item.sourceKind,
    item.source,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/[^a-z0-9]/gi, '').toLowerCase());
  if (tokens.length === 0) return null;
  if (
    tokens.some((token) =>
      [
        'envoverride',
        'gitcheckout',
        'developercheckout',
        'developermode',
        'developermodepackageoverride',
        'siblingworkspace',
        'developercheckoutoverride',
      ].includes(token)
    )
  ) {
    return t('settings.capabilitiesPage.sourceLabels.developer');
  }
  if (
    tokens.some((token) =>
      [
        'managedroot',
        'managed',
        'builtin',
        'packaged',
        'firstparty',
        'packagechannel',
        'developermodemanagedoverride',
        'firstpartyreleasecatalog',
      ].includes(token)
    )
  ) {
    return t('settings.capabilitiesPage.sourceLabels.managed');
  }
  if (
    tokens.some((token) =>
      ['agentpackageregistrycache', 'manifesturl', 'registry', 'thirdparty', 'remote'].includes(token)
    )
  ) {
    return t('settings.capabilitiesPage.sourceLabels.registry');
  }
  if (tokens.some((token) => ['local', 'manual', 'filesystem', 'localmanifestfile'].includes(token))) {
    return t('settings.capabilitiesPage.sourceLabels.local');
  }
  return t('settings.capabilitiesPage.sourceLabels.other', { defaultValue: 'Other source' });
}

function capabilitySourceCategory(item: CapabilityPurposeViewModel): string {
  const tokens = [
    item.sourceExplanation.kind,
    item.sourceExplanation.source,
    item.sourceKind,
    item.actualSource,
    item.source,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/[^a-z0-9]/gi, '').toLowerCase());
  if (
    tokens.some((token) =>
      ['gitcheckout', 'developercheckout', 'developercheckoutoverride', 'developermode', 'siblingworkspace'].includes(
        token
      )
    )
  ) {
    return 'developer';
  }
  if (
    tokens.some((token) =>
      ['managed', 'managedroot', 'builtin', 'packaged', 'firstparty', 'firstpartyreleasecatalog'].includes(token)
    )
  ) {
    return 'managed';
  }
  if (
    tokens.some((token) =>
      ['agentpackageregistrycache', 'registry', 'manifesturl', 'remote', 'thirdparty'].includes(token)
    )
  )
    return 'registry';
  if (tokens.some((token) => ['local', 'filesystem', 'localmanifestfile'].includes(token))) return 'local';
  return 'other';
}

function capabilityCatalogStatus(item: CapabilityPurposeViewModel): CapabilityAvailabilityStatus {
  return item.availabilityStatus;
}

function capabilityCatalogStatusLabel(
  status: CapabilityAvailabilityStatus,
  t: (key: string, options?: Record<string, string>) => string
): string {
  return capabilityStatusLabel(status, t);
}

const DOMAIN_STAGE_DEFERRED_REASONS = new Set([
  'live_verification_deferred',
  'verification_deferred',
  'scope_materialization_missing',
  'package_activation_required',
  'use_boundary_reconciliation_ready',
]);

function capabilityDefersReadinessToDomainStage(item: CapabilityPurposeViewModel): boolean {
  const reason = item.readiness.reason ?? item.launchBlockedReason;
  return (
    item.availabilityStatus === 'ready' &&
    (item.readiness.verificationDeferred === true || DOMAIN_STAGE_DEFERRED_REASONS.has(reason ?? ''))
  );
}

type CapabilityCatalogGroupKey = 'frequent' | 'needsAttention' | 'other';

type CapabilityCatalogEntry = {
  item: CapabilityPurposeViewModel;
  dependents: CapabilityPurposeViewModel[];
};

type CapabilityCatalogGroup = {
  key: CapabilityCatalogGroupKey;
  entries: CapabilityCatalogEntry[];
};

function capabilityPackageRoleLabel(
  role: string | null,
  t: (key: string, options?: Record<string, string>) => string
): string {
  const labelKey =
    role === 'standard_agent'
      ? 'standardAgent'
      : role === 'workflow_profile'
        ? 'workflowProfile'
        : role === 'framework_capability_package'
          ? 'supportingCapability'
          : 'other';
  return t(`settings.capabilitiesPage.packageManager.roleLabels.${labelKey}`);
}

function capabilityLocalizedSummary(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string {
  return localizedCapabilitySummary([item.packageId, item.key, item.title], item.title, t);
}

function capabilityCatalogGroupKey(
  entry: CapabilityCatalogEntry,
  professionalAgentOrder: ReadonlyMap<string, number>,
  allCapabilities: CapabilityPurposeViewModel[]
): CapabilityCatalogGroupKey {
  const parentIds = new Set(capabilityPackageIdentityValues(entry.item.packageId));
  const allDependents = parentIds.size
    ? allCapabilities.filter((candidate) =>
        candidate.dependentGuard?.requiredByPackageIds.some((requiredPackageId) =>
          capabilityPackageIdentityValues(requiredPackageId).some((id) => parentIds.has(id))
        )
      )
    : [];
  if (
    [entry.item, ...entry.dependents, ...allDependents].some((item) =>
      ['update', 'sync', 'attention', 'repair', 'missing'].includes(item.availabilityStatus)
    )
  ) {
    return 'needsAttention';
  }
  if (capabilityPackageIdentityValues(entry.item.packageId).some((id) => professionalAgentOrder.has(id))) {
    return 'frequent';
  }
  return 'other';
}

function capabilityRoleGroupKey(item: CapabilityPurposeViewModel): 'agents' | 'workflows' | 'supporting' {
  if (item.packageRole === 'standard_agent') return 'agents';
  if (item.packageRole === 'workflow_profile') return 'workflows';
  return 'supporting';
}

function capabilityPackageIdentityValues(packageId: string | null): string[] {
  if (!packageId) return [];
  return [...new Set([packageId, canonicalizeOplProfessionalAgentId(packageId)])];
}

function capabilityRowAction(item: CapabilityPurposeViewModel): CapabilityPackageActionViewModel | null {
  const action = item.recommendedAction;
  if (!action) return null;
  return ['install_from_manifest_url', 'agent_package_update', 'agent_package_repair', 'refresh_registry'].includes(
    action.actionId
  )
    ? action
    : null;
}

function capabilityProjectedActionTestId(actionId: string): string {
  if (actionId === 'agent_package_activate') return 'activate';
  if (actionId === 'install_from_manifest_url') return 'install';
  if (actionId === 'agent_package_update') return 'update';
  if (actionId === 'agent_package_repair') return 'repair';
  if (actionId === 'refresh_registry') return 'refresh';
  return 'run';
}

function capabilityProjectedActionLabel(
  actionId: string,
  t: (key: string, options?: Record<string, string>) => string
): string {
  const key =
    actionId === 'refresh_registry'
      ? 'refresh'
      : actionId === 'agent_package_activate'
        ? 'activate'
        : actionId === 'install_from_manifest_url'
          ? 'install'
          : actionId === 'agent_package_update'
            ? 'update'
            : actionId === 'agent_package_repair'
              ? 'repair'
              : actionId === 'agent_package_uninstall'
                ? 'uninstall'
                : 'run';
  return t(`settings.capabilitiesPage.packageManager.actions.${key}`);
}

function capabilityUserDetailRows(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): CapabilityDetailRow[] {
  return [
    hasTextValue(item.publisher)
      ? {
          key: 'publisher',
          label: t('settings.capabilitiesPage.detailLabels.publisher'),
          value: item.publisher,
        }
      : null,
    hasTextValue(item.packageRole)
      ? {
          key: 'packageRole',
          label: t('settings.capabilitiesPage.detailLabels.packageRole'),
          value: capabilityPackageRoleLabel(item.packageRole, t),
        }
      : null,
    hasTextValue(item.trustTier)
      ? {
          key: 'trustTier',
          label: t('settings.capabilitiesPage.detailLabels.trustTier'),
          value: item.trustTier,
        }
      : null,
    hasTextValue(item.installedVersion)
      ? {
          key: 'installedVersion',
          label: t('settings.capabilitiesPage.detailLabels.installedVersion'),
          value: item.installedVersion,
        }
      : null,
    hasTextValue(item.selectedVersion)
      ? {
          key: 'selectedVersion',
          label: t('settings.capabilitiesPage.detailLabels.selectedVersion'),
          value: item.selectedVersion,
        }
      : null,
    hasTextValue(item.stableVersion)
      ? {
          key: 'stableVersion',
          label: t('settings.capabilitiesPage.detailLabels.stableVersion'),
          value: item.stableVersion,
        }
      : null,
    hasTextValue(item.sourceExplanation.summary)
      ? {
          key: 'sourceSummary',
          label: t('settings.capabilitiesPage.detailLabels.sourceSummary'),
          value: item.sourceExplanation.summary,
        }
      : null,
    hasTextValue(item.installability.status)
      ? {
          key: 'installability',
          label: t('settings.capabilitiesPage.detailLabels.installability'),
          value: item.installability.status,
        }
      : null,
    {
      key: 'readiness',
      label: t('settings.capabilitiesPage.detailLabels.readiness'),
      value: capabilityCatalogStatusLabel(item.availabilityStatus, t),
    },
    hasTextValue(item.version)
      ? {
          key: 'version',
          label: t('settings.capabilitiesPage.detailLabels.version'),
          value: item.version,
        }
      : null,
    hasTextValue(item.lastSync)
      ? {
          key: 'lastSync',
          label: t('settings.capabilitiesPage.detailLabels.lastSync'),
          value: item.lastSync,
        }
      : null,
    hasTextValue(item.failureReason)
      ? {
          key: 'failureReason',
          label: t('settings.capabilitiesPage.detailLabels.failureReason'),
          value: item.failureReason,
        }
      : null,
  ].filter((row): row is CapabilityDetailRow => Boolean(row));
}

function capabilityReadinessDetailRows(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): CapabilityDetailRow[] {
  const readiness = item.dependencyReadiness;
  const dependencyFailures = readiness?.checks.flatMap((check) => check.failureReasons) ?? [];
  const readinessReason = item.readiness.reason ?? item.launchBlockedReason;
  const domainStageDeferred = capabilityDefersReadinessToDomainStage(item);
  const isNextStepReason = [
    'package_not_installed',
    'package_activation_required',
    'scope_materialization_missing',
  ].includes(readinessReason ?? '');
  return [
    !domainStageDeferred && item.readiness.verificationDeferred === true && readinessReason
      ? {
          key: 'verificationPending',
          label: t('settings.capabilitiesPage.detailLabels.verificationPending'),
          value: capabilityReasonLabel(readinessReason, t),
        }
      : null,
    readiness?.status
      ? {
          key: 'dependencyReadiness',
          label: t('settings.capabilitiesPage.detailLabels.dependencyReadiness'),
          value: t(`settings.capabilitiesPage.dependencyReadiness.${readiness.status}`),
        }
      : null,
    readiness && readiness.requiredCount !== null && readiness.readyCount !== null
      ? {
          key: 'dependencyReadinessCount',
          label: t('settings.capabilitiesPage.detailLabels.dependencyReadinessCount'),
          value: t('settings.capabilitiesPage.detailValues.readinessCount', {
            ready: String(readiness.readyCount),
            required: String(readiness.requiredCount),
          }),
        }
      : null,
    !domainStageDeferred && item.operationalReady !== null
      ? {
          key: 'operationalReady',
          label: t('settings.capabilitiesPage.detailLabels.operationalReady'),
          value: item.operationalReady
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    !domainStageDeferred && item.launchAllowed !== null
      ? {
          key: 'launchAllowed',
          label: t('settings.capabilitiesPage.detailLabels.launchAllowed'),
          value: item.launchAllowed
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    !domainStageDeferred &&
    item.readiness.verificationDeferred !== true &&
    item.launchAllowed === false &&
    readinessReason
      ? {
          key: 'launchBlockedReason',
          label: t(
            isNextStepReason
              ? 'settings.capabilitiesPage.detailLabels.nextStep'
              : 'settings.capabilitiesPage.detailLabels.launchBlockedReason'
          ),
          value: capabilityReasonLabel(readinessReason, t),
        }
      : null,
    !domainStageDeferred && item.launchAllowed === false && item.allowedWhenBlocked.length > 0
      ? {
          key: 'allowedWhenBlocked',
          label: t('settings.capabilitiesPage.detailLabels.allowedWhenBlocked'),
          value: item.allowedWhenBlocked.join(', '),
        }
      : null,
    dependencyFailures.length > 0
      ? {
          key: 'dependencyFailures',
          label: t('settings.capabilitiesPage.detailLabels.dependencyFailures'),
          value: dependencyFailures.map((reason) => capabilityReasonLabel(reason, t)).join(', '),
        }
      : null,
    item.dependentGuard && item.dependentGuard.requiredByPackageIds.length > 0
      ? {
          key: 'requiredByPackages',
          label: t('settings.capabilitiesPage.detailLabels.requiredByPackages'),
          value: item.dependentGuard.requiredByPackageIds.join(', '),
        }
      : null,
    item.dependentGuard?.disableAllowed === false && item.dependentGuard.disableReasonCode
      ? {
          key: 'disableDisabledReason',
          label: t('settings.capabilitiesPage.detailLabels.disableDisabledReason'),
          value: capabilityReasonLabel(item.dependentGuard.disableReasonCode, t),
        }
      : null,
    item.dependentGuard?.uninstallAllowed === false && item.dependentGuard.uninstallReasonCode
      ? {
          key: 'uninstallDisabledReason',
          label: t('settings.capabilitiesPage.detailLabels.uninstallDisabledReason'),
          value: capabilityReasonLabel(item.dependentGuard.uninstallReasonCode, t),
        }
      : null,
  ].filter((row): row is CapabilityDetailRow => Boolean(row));
}

function capabilityDiagnosticRows(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): CapabilityDetailRow[] {
  const sourceKind = capabilitySourceLabel(item, t);
  return [
    {
      key: 'packageId',
      label: t('settings.capabilitiesPage.detailLabels.packageId'),
      value: item.packageId,
    },
    {
      key: 'codexVisibleEntry',
      label: t('settings.capabilitiesPage.detailLabels.codexVisibleEntry'),
      value: item.codexVisibleEntry,
    },
    item.defaultHomeVisible !== null
      ? {
          key: 'defaultHomeVisible',
          label: t('settings.capabilitiesPage.detailLabels.defaultHomeVisible'),
          value: item.defaultHomeVisible
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    item.userConfigurable !== null
      ? {
          key: 'userConfigurable',
          label: t('settings.capabilitiesPage.detailLabels.userConfigurable'),
          value: item.userConfigurable
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    {
      key: 'sourceKind',
      label: t('settings.capabilitiesPage.detailLabels.sourceKind'),
      value: sourceKind,
    },
    {
      key: 'packageLockRef',
      label: t('settings.capabilitiesPage.detailLabels.packageLockRef'),
      value: item.packageLockRef,
    },
    {
      key: 'actionReceiptRef',
      label: t('settings.capabilitiesPage.detailLabels.actionReceiptRef'),
      value: item.actionReceiptRef,
    },
    {
      key: 'rollbackRef',
      label: t('settings.capabilitiesPage.detailLabels.rollbackRef'),
      value: item.rollbackRef,
    },
    {
      key: 'installActionRef',
      label: t('settings.capabilitiesPage.detailLabels.installActionRef'),
      value: item.installAction?.actionRef,
    },
    {
      key: 'activationActionRef',
      label: t('settings.capabilitiesPage.detailLabels.activationActionRef'),
      value: item.activationAction?.commandRef,
    },
    {
      key: 'repairCommandRef',
      label: t('settings.capabilitiesPage.detailLabels.repairCommandRef'),
      value: item.repairAction?.commandRef,
    },
    {
      key: 'dependencyClosureTransactionId',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureTransactionId'),
      value: item.dependencyClosure?.transactionId,
    },
    {
      key: 'dependencyClosureDigest',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureDigest'),
      value: item.dependencyClosure?.closureDigest,
    },
    {
      key: 'dependencyClosureLastKnownGoodTransactionId',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureLastKnownGoodTransactionId'),
      value: item.dependencyClosure?.lastKnownGoodTransactionId,
    },
    {
      key: 'dependencyClosureLastKnownGoodDigest',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureLastKnownGoodDigest'),
      value: item.dependencyClosure?.lastKnownGoodClosureDigest,
    },
    {
      key: 'manifestUrl',
      label: t('settings.capabilitiesPage.detailLabels.manifestUrl', { defaultValue: 'Manifest URL' }),
      value: item.manifestUrl,
    },
    {
      key: 'registryUrl',
      label: t('settings.capabilitiesPage.detailLabels.registryUrl', { defaultValue: 'Registry URL' }),
      value: item.registryUrl,
    },
    {
      key: 'physicalSurfaceStatus',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceStatus'),
      value: item.physicalSurface?.status,
    },
    item.physicalSurface?.reloadRequired !== null && item.physicalSurface?.reloadRequired !== undefined
      ? {
          key: 'physicalSurfaceReloadRequired',
          label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceReloadRequired'),
          value: item.physicalSurface.reloadRequired
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    {
      key: 'physicalSurfacePluginId',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfacePluginId'),
      value: item.physicalSurface?.pluginId,
    },
    {
      key: 'physicalSurfaceMarketplaceId',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplaceId'),
      value: item.physicalSurface?.marketplaceId,
    },
    {
      key: 'physicalSurfaceCachePath',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceCachePath'),
      value: item.physicalSurface?.codexPluginCachePath,
    },
    {
      key: 'physicalSurfaceMarketplacePath',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplacePath'),
      value: item.physicalSurface?.marketplacePath,
    },
    {
      key: 'physicalSurfaceConfigPath',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceConfigPath'),
      value: item.physicalSurface?.codexConfigPath,
    },
    {
      key: 'physicalSurfaceRequiredSkillIds',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceRequiredSkillIds'),
      value: item.physicalSurface?.materializedRequiredSkillIds.join(', '),
    },
    {
      key: 'physicalSurfaceRequiredSkillPaths',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceRequiredSkillPaths'),
      value: item.physicalSurface?.materializedRequiredSkillPaths.join(', '),
    },
  ].filter((row): row is CapabilityDetailRow => Boolean(row && hasTextValue(row.value)));
}

const capabilityRefRows = (
  refs: CapabilityRefViewModel[],
  itemKey: string,
  t: (key: string) => string,
  testId: string,
  options: { showTechnicalRef?: boolean } = {}
) => {
  if (refs.length === 0) return null;
  return (
    <div className='grid grid-cols-1 gap-8px' data-testid={testId}>
      {refs.map((ref) => (
        <div key={`${itemKey}-${ref.id}-${ref.ref}`} className='rd-8px bg-fill-1 p-8px text-12px'>
          <div className='mb-4px flex flex-wrap items-center gap-6px'>
            <Typography.Text className='break-words font-600 text-t-primary'>{ref.title}</Typography.Text>
            {ref.status && <Tag>{ref.status}</Tag>}
          </div>
          <div className='grid grid-cols-1 gap-4px'>
            {options.showTechnicalRef && (
              <>
                <Typography.Text className='break-words text-t-secondary'>
                  {t('settings.capabilitiesPage.refLabels.id')}: {ref.id}
                </Typography.Text>
                <Typography.Text className='break-words text-t-secondary'>
                  {t('settings.capabilitiesPage.refLabels.ref')}: {ref.ref}
                </Typography.Text>
              </>
            )}
            {ref.owner && (
              <Typography.Text className='break-words text-t-secondary'>
                {t('settings.capabilitiesPage.refLabels.owner')}: {ref.owner}
              </Typography.Text>
            )}
            {ref.nextAction && (
              <Typography.Text className='break-words text-t-secondary'>
                {t('settings.capabilitiesPage.refLabels.nextAction')}: {ref.nextAction}
              </Typography.Text>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const capabilityCandidateReportRows = (
  refs: CapabilityCandidateReportViewModel[],
  itemKey: string,
  t: (key: string) => string
) => {
  if (refs.length === 0) return null;
  return (
    <div className='grid grid-cols-1 gap-8px' data-testid={`capability-candidate-reports-${itemKey}`}>
      <div>
        <Typography.Text className='block text-12px font-600 text-t-primary'>
          {t('settings.capabilitiesPage.candidateReports.title')}
        </Typography.Text>
        <Typography.Text className='block text-12px text-t-secondary'>
          {t('settings.capabilitiesPage.candidateReports.description')}
        </Typography.Text>
      </div>
      {refs.map((ref) => (
        <div
          key={`${itemKey}-${ref.id}-${ref.ref}`}
          className='rd-8px bg-fill-1 p-8px text-12px'
          data-testid={`capability-candidate-report-${itemKey}-${ref.id}`}
        >
          <div className='mb-4px flex flex-wrap items-center gap-6px'>
            <Typography.Text className='break-words font-600 text-t-primary'>{ref.title}</Typography.Text>
            {ref.status && <Tag>{ref.status}</Tag>}
          </div>
          <div className='grid grid-cols-1 gap-4px'>
            {ref.purpose && (
              <Typography.Text className='break-words text-t-secondary'>
                {t('settings.capabilitiesPage.candidateReports.purpose')}: {ref.purpose}
              </Typography.Text>
            )}
            {ref.owner && (
              <Typography.Text className='break-words text-t-secondary'>
                {t('settings.capabilitiesPage.refLabels.owner')}: {ref.owner}
              </Typography.Text>
            )}
            {ref.nextAction && (
              <Typography.Text className='break-words text-t-secondary'>
                {t('settings.capabilitiesPage.refLabels.nextAction')}: {ref.nextAction}
              </Typography.Text>
            )}
            {(ref.decisionStatus || ref.decisionActions.length > 0) && (
              <div className='flex flex-wrap items-center gap-6px'>
                {ref.decisionStatus && (
                  <Typography.Text className='text-t-secondary'>
                    {t('settings.capabilitiesPage.candidateReports.decision')}: {ref.decisionStatus}
                  </Typography.Text>
                )}
                {ref.decisionActions.map((action) => (
                  <Tag key={`${ref.id}-${action}`}>{capabilityDecisionActionLabel(action, t)}</Tag>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const capabilityRefGroups = (
  groups: CapabilityRefGroupViewModel[],
  itemKey: string,
  t: (key: string) => string,
  labelPrefix = 'settings.capabilitiesPage.connectorGroups'
) => {
  if (groups.length === 0) return null;
  return (
    <div className='grid grid-cols-1 gap-8px'>
      {groups.map((group) => (
        <div key={`${itemKey}-${group.key}`} data-testid={`capability-connector-group-${itemKey}-${group.key}`}>
          <Typography.Text className='mb-4px block text-12px font-600 text-t-primary'>
            {t(`${labelPrefix}.${group.key}`)}
          </Typography.Text>
          {capabilityRefRows(
            group.refs,
            `${itemKey}-${group.key}`,
            t,
            `capability-connector-refs-${itemKey}-${group.key}`
          )}
        </div>
      ))}
    </div>
  );
};

const ungroupedCapabilityRefs = (
  refs: CapabilityRefViewModel[],
  groups: CapabilityRefGroupViewModel[]
): CapabilityRefViewModel[] => {
  const groupedRefs = new Set(groups.flatMap((group) => group.refs));
  return refs.filter((ref) => !groupedRefs.has(ref));
};

const capabilityExportBundleAction = (action: CapabilityActionRefViewModel | null, t: (key: string) => string) => {
  if (!action) return null;
  return (
    <div className='rd-8px bg-fill-1 p-8px text-12px' data-testid='capability-export-bundle-action'>
      <div className='flex flex-wrap items-center gap-6px'>
        <Typography.Text className='font-600 text-t-primary'>
          {action.actionId ?? t('settings.capabilitiesPage.refLabels.action')}
        </Typography.Text>
        {action.status && <Tag>{action.status}</Tag>}
      </div>
      {action.receiptSummary && (
        <Typography.Text className='block break-words text-t-secondary'>
          {t('settings.capabilitiesPage.refLabels.receipt')}: {action.receiptSummary}
        </Typography.Text>
      )}
    </div>
  );
};

export const AgentPackagesSettingsContent: React.FC = () => {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = Boolean(useLayoutContext()?.isMobile);
  const appStateQuery = useOplAppState('fast');
  const [manifestUrl, setManifestUrl] = useState('');
  const [manifestTrustTier, setManifestTrustTier] = useState<ManifestTrustTier | ''>('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const packageActionTokenRef = useRef<symbol | null>(null);
  const [pendingShortcutIds, setPendingShortcutIds] = useState<Set<string>>(() => new Set());
  const shortcutActionTokensRef = useRef<Map<string, symbol>>(new Map());
  const capabilityDetailsPanelRef = useRef<HTMLElement | null>(null);
  const capabilityDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState<string | null>(null);
  const [advancedAddOpen, setAdvancedAddOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [advancedDetailsOpen, setAdvancedDetailsOpen] = useState(false);
  const [developerAdvancedOpen, setDeveloperAdvancedOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const shortcutPreferences = useOplHomeShortcutPreferences();
  const orderedShortcuts = React.useMemo(() => getOplOrderedHomeAgentShortcuts(), [shortcutPreferences]);
  const shortcutByPackageId = React.useMemo(
    () => new Map(orderedShortcuts.map((shortcut) => [shortcut.package_id, shortcut])),
    [orderedShortcuts]
  );
  const shortcutIndexById = React.useMemo(
    () => new Map(orderedShortcuts.map((shortcut, index) => [shortcut.shortcut_id, index])),
    [orderedShortcuts]
  );
  const purposeCapabilities = React.useMemo(
    () => buildCapabilitiesViewModel(appStateQuery.appState, i18n.language),
    [appStateQuery.appState, i18n.language]
  );
  const projectedAppActions = oplRecordList(appStateQuery.appState.actions);
  const manifestInstallAction =
    projectedAppActions.find((action) => oplString(action.action_id) === 'install_from_manifest_url') ?? {};
  const manifestInstallActionId = oplString(manifestInstallAction.action_id);
  const manifestInstallPayloadFields = Array.isArray(manifestInstallAction.payload_fields)
    ? manifestInstallAction.payload_fields.filter((field): field is string => typeof field === 'string')
    : [];
  const manifestInstallActionAvailable = Boolean(
    manifestInstallActionId &&
    manifestInstallAction.dry_run_supported === true &&
    typeof manifestInstallAction.confirmation_required === 'boolean' &&
    manifestInstallPayloadFields.includes('manifest_url') &&
    manifestInstallPayloadFields.includes('trust_tier')
  );
  const manifestInstallConfirmationRequired = manifestInstallAction.confirmation_required === true;
  const agentPackages = oplRecord(appStateQuery.appState.agent_packages);
  const directory = oplRecord(agentPackages.directory);
  const directoryStatus = oplString(directory.status);
  const directoryStatusReadError = (() => {
    const value = directory.status_read_error;
    if (typeof value === 'string') return oplString(value);
    const record = oplRecord(value);
    return oplString(record.message) ?? oplString(record.code) ?? oplString(record.reason);
  })();
  const directoryError = directoryStatusReadError ?? (directoryStatus === 'failed' ? directoryStatus : null);
  const catalogReadError = appStateQuery.error ?? directoryError ?? null;
  const catalogError = purposeCapabilities.length === 0 ? catalogReadError : null;
  const catalogStaleReason = purposeCapabilities.length > 0 ? catalogReadError : null;
  const catalogLoading = appStateQuery.loading && purposeCapabilities.length === 0;
  const catalogRefreshing = appStateQuery.refreshing;
  const catalogEmpty = !catalogLoading && !catalogError && purposeCapabilities.length === 0;
  const professionalAgentOrder = React.useMemo(() => {
    const order = new Map<string, number>();
    getOplProfessionalAgentPackages().forEach((agentPackage, index) => {
      capabilityPackageIdentityValues(agentPackage.package_id).forEach((id) => order.set(id, index));
    });
    return order;
  }, []);
  const roleOptions = React.useMemo(() => {
    const roles = [
      ...new Set(
        purposeCapabilities.map((item) => item.packageRole).filter((value): value is string => Boolean(value))
      ),
    ];
    const preferredOrder = ['standard_agent', 'workflow_profile', 'framework_capability_package'];
    return roles.toSorted((left, right) => {
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (
          (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
        );
      }
      return left.localeCompare(right);
    });
  }, [purposeCapabilities]);
  const statusOptions = React.useMemo(
    () => [...new Set(purposeCapabilities.map(capabilityCatalogStatus))].sort(),
    [purposeCapabilities]
  );
  const sourceOptions = React.useMemo(
    () => [...new Set(purposeCapabilities.map(capabilitySourceCategory))].sort(),
    [purposeCapabilities]
  );
  const visibleCapabilities = React.useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return purposeCapabilities.filter((item) => {
      if (roleFilter !== 'all' && item.packageRole !== roleFilter) return false;
      if (statusFilter !== 'all' && capabilityCatalogStatus(item) !== statusFilter) return false;
      if (sourceFilter !== 'all' && capabilitySourceCategory(item) !== sourceFilter) return false;
      if (!query) return true;
      return [
        item.title,
        capabilityLocalizedSummary(item, t),
        item.description,
        item.packageId,
        item.packageRole,
        capabilityPackageRoleLabel(item.packageRole, t),
        item.publisher,
        item.sourceExplanation.summary,
        item.sourceExplanation.source,
        item.trustTier,
        ...item.tags,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [catalogSearch, purposeCapabilities, roleFilter, sourceFilter, statusFilter, t]);
  const catalogGroups = React.useMemo<CapabilityCatalogGroup[]>(() => {
    const compareByTitle = (left: CapabilityPurposeViewModel, right: CapabilityPurposeViewModel) =>
      left.title.localeCompare(right.title, i18n.language);
    const compareAgents = (left: CapabilityPurposeViewModel, right: CapabilityPurposeViewModel) => {
      const rank = (item: CapabilityPurposeViewModel) => {
        const ranks = capabilityPackageIdentityValues(item.packageId)
          .map((id) => professionalAgentOrder.get(id))
          .filter((value): value is number => value !== undefined);
        return ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
      };
      return rank(left) - rank(right) || compareByTitle(left, right);
    };

    const agents = visibleCapabilities
      .filter((item) => capabilityRoleGroupKey(item) === 'agents')
      .toSorted(compareAgents);
    const workflows = visibleCapabilities
      .filter((item) => capabilityRoleGroupKey(item) === 'workflows')
      .toSorted(compareByTitle);
    const supporting = visibleCapabilities
      .filter((item) => capabilityRoleGroupKey(item) === 'supporting')
      .toSorted(compareByTitle);
    const visibleAgentsById = new Map<string, CapabilityPurposeViewModel>();
    agents.forEach((agent) => {
      capabilityPackageIdentityValues(agent.packageId).forEach((id) => visibleAgentsById.set(id, agent));
    });
    const dependentsByAgentKey = new Map<string, CapabilityPurposeViewModel[]>();
    const ungroupedSupporting: CapabilityPurposeViewModel[] = [];
    supporting.forEach((item) => {
      const parentMatches = new Map<string, CapabilityPurposeViewModel>();
      item.dependentGuard?.requiredByPackageIds.forEach((requiredPackageId) => {
        capabilityPackageIdentityValues(requiredPackageId).forEach((id) => {
          const parent = visibleAgentsById.get(id);
          if (parent) parentMatches.set(parent.key, parent);
        });
      });
      if (parentMatches.size !== 1) {
        ungroupedSupporting.push(item);
        return;
      }
      const [parent] = parentMatches.values();
      const current = dependentsByAgentKey.get(parent.key) ?? [];
      dependentsByAgentKey.set(parent.key, [...current, item].toSorted(compareByTitle));
    });

    const entries = [
      ...agents.map((item) => ({ item, dependents: dependentsByAgentKey.get(item.key) ?? [] })),
      ...workflows.map<CapabilityCatalogEntry>((item) => ({ item, dependents: [] })),
      ...ungroupedSupporting.map<CapabilityCatalogEntry>((item) => ({ item, dependents: [] })),
    ];
    return (['frequent', 'needsAttention', 'other'] as const)
      .map((key) => ({
        key,
        entries: entries.filter(
          (entry) => capabilityCatalogGroupKey(entry, professionalAgentOrder, purposeCapabilities) === key
        ),
      }))
      .filter((group) => group.entries.length > 0);
  }, [i18n.language, professionalAgentOrder, purposeCapabilities, visibleCapabilities]);
  const hasActiveCatalogFilters =
    Boolean(catalogSearch.trim()) || roleFilter !== 'all' || statusFilter !== 'all' || sourceFilter !== 'all';
  const catalogFilterEmpty = purposeCapabilities.length > 0 && visibleCapabilities.length === 0;
  const developerSupervisorConfiguration = configurationItem(appStateQuery.appState, 'developer_supervisor');
  const developerSupervisorActionId = oplString(developerSupervisorConfiguration.action_id);
  const developerSupervisorVerifyActionId = oplString(developerSupervisorConfiguration.verify_action_id);
  const developerSupervisorVerifyRef = oplString(developerSupervisorConfiguration.verify_ref);
  const developerSupervisorPayloadFields = Array.isArray(developerSupervisorConfiguration.payload_fields)
    ? developerSupervisorConfiguration.payload_fields.filter((field): field is string => typeof field === 'string')
    : [];
  const developerSupervisorActionAvailable = Boolean(
    developerSupervisorActionId &&
    typeof developerSupervisorConfiguration.confirmation_required === 'boolean' &&
    [
      'developerSupervisorEnabled',
      'developerSupervisorMode',
      'developerSupervisorModuleId',
      'developerSupervisorModuleSource',
    ].every((field) => developerSupervisorPayloadFields.includes(field)) &&
    (developerSupervisorVerifyActionId || developerSupervisorVerifyRef)
  );
  const developerSupervisorConfirmationRequired = developerSupervisorConfiguration.confirmation_required === true;
  const developerMode = oplRecord(appStateQuery.appState.developer_mode);
  const developerWorkspace = oplRecord(developerMode.developer_workspace);
  const developerIdentity = oplRecord(developerMode.github_identity);
  const developerAuthority = oplRecord(developerMode.repo_authority);
  const developerMaintenanceProtection = oplRecord(developerMode.repository_maintenance_protection);
  const developerDirtyProtection = oplRecord(developerMaintenanceProtection.dirty_worktree);
  const developerBranchProtection = oplRecord(developerMaintenanceProtection.branch);
  const developerModeEnabled = (() => {
    const value = oplString(developerMode.enabled);
    return value === 'on' || value === 'off' ? value : 'auto';
  })();
  const developerModeMode = oplString(developerMode.mode) ?? 'developer_apply_safe';
  const developerSafeMaintenance = developerModeMode === 'developer_apply_safe';
  const developerMaintenanceChoice =
    developerModeEnabled === 'off' || developerModeMode === 'external_observe' ? 'off' : 'auto';
  const developerEffectiveState = oplString(developerMode.effective_state) ?? 'inspection_pending';
  const developerConfigSource = oplString(developerMode.config_source) ?? 'default';
  const developerInactiveReason = oplString(developerMode.inactive_reason);
  const developerWorkspacePath = oplString(developerWorkspace.selected_path);
  const developerIdentityLogin = oplString(developerIdentity.login);
  const developerIdentityStatus = oplString(developerIdentity.status);
  const developerAuthorityStatus = oplString(developerAuthority.status);
  const directWriteRepoCount = Number(developerAuthority.direct_write_repo_count ?? 0);
  const prRouteRepoCount = Number(developerAuthority.pr_route_repo_count ?? 0);
  const requiredRepoCount = Number(developerAuthority.required_repo_count ?? 0);
  const developerInspectionPending = developerEffectiveState === 'inspection_pending';
  const developerMaintenanceEffectiveLabel = (() => {
    if (developerModeEnabled === 'off' || developerEffectiveState === 'disabled') return 'off';
    if (developerEffectiveState.startsWith('active_')) {
      return developerConfigSource === 'user_config' || developerModeEnabled === 'on' ? 'manual' : 'automatic';
    }
    return 'inactive';
  })();
  const developerModeLabel = t(
    `settings.capabilitiesPage.developerSource.modes.${
      developerModeEnabled === 'off' ? 'managed' : developerModeEnabled === 'on' ? 'developer' : 'auto'
    }`
  );
  const developerEffectiveStateLabel = t(
    `settings.capabilitiesPage.developerSource.effectiveStates.${developerMaintenanceEffectiveLabel}`
  );
  const showDeveloperIdentity = developerIdentityStatus === 'ready' && Boolean(developerIdentityLogin);
  const showDeveloperAuthority =
    Boolean(developerAuthorityStatus) &&
    !['not_checked', 'skipped'].includes(developerAuthorityStatus) &&
    requiredRepoCount > 0;
  const selectedCapability = React.useMemo(
    () => purposeCapabilities.find((item) => item.key === selectedCapabilityKey) ?? null,
    [purposeCapabilities, selectedCapabilityKey]
  );
  const selectedUpdateAction = selectedCapability?.availableActions.agent_package_update ?? null;
  const selectedRepairAction = selectedCapability?.availableActions.agent_package_repair ?? null;
  const selectedPreferenceAction = selectedCapability?.availableActions.agent_package_preferences_set ?? null;
  const selectedSourceLabel = selectedCapability
    ? (capabilitySourceLabel(selectedCapability, t) ?? t('settings.capabilitiesPage.detailValues.notReported'))
    : '';
  const selectedUninstallAction = selectedCapability?.availableActions.agent_package_uninstall ?? null;
  const selectedShortcut = selectedCapability?.packageId ? shortcutByPackageId.get(selectedCapability.packageId) : null;
  const selectedShortcutId = selectedShortcut?.shortcut_id ?? '';
  const selectedShortcutIndex = selectedShortcutId ? (shortcutIndexById.get(selectedShortcutId) ?? -1) : -1;
  const selectedHomeLabel = !selectedShortcut
    ? t('settings.capabilitiesPage.packageManager.noHomeShortcut')
    : !isOplHomeShortcutVisible(selectedShortcut, shortcutPreferences)
      ? t('settings.capabilitiesPage.packageManager.homeHidden')
      : t('settings.capabilitiesPage.packageManager.homeVisibleWithOrder', {
          order: String(selectedShortcutIndex + 1),
        });
  const selectedUserDetailRows = selectedCapability ? capabilityUserDetailRows(selectedCapability, t) : [];
  const selectedReadinessDetailRows = selectedCapability ? capabilityReadinessDetailRows(selectedCapability, t) : [];
  const selectedDiagnosticRows = selectedCapability ? capabilityDiagnosticRows(selectedCapability, t) : [];
  const selectedUngroupedConnectorRefs = selectedCapability
    ? ungroupedCapabilityRefs(selectedCapability.connectorReadinessRefs, selectedCapability.connectorReadinessGroups)
    : [];
  const selectedUngroupedResourceRefs = selectedCapability
    ? ungroupedCapabilityRefs(selectedCapability.resourceContextRefs, selectedCapability.resourceContextGroups)
    : [];
  const selectedHasSupportingContext = Boolean(
    selectedCapability &&
    (selectedCapability.connectorReadinessRefs.length > 0 ||
      selectedCapability.workflowRefs.length > 0 ||
      selectedCapability.resourceContextRefs.length > 0 ||
      selectedCapability.exportBundleAction)
  );
  const selectedHasPrimaryAction = Boolean(
    selectedCapability && ['update', 'sync', 'repair', 'missing'].includes(selectedCapability.availabilityStatus)
  );
  const packageActionBusy = busyAction !== null;
  const shortcutPreferenceBusy = pendingShortcutIds.size > 0;
  const packageMutationBusy = packageActionBusy || shortcutPreferenceBusy;

  useEffect(() => {
    const appStatePreferences = getOplHomeShortcutPreferencesFromAppState(appStateQuery.appState);
    if (appStatePreferences) replaceOplHomeShortcutPreferences(appStatePreferences);
  }, [appStateQuery.appState]);

  useEffect(() => {
    setAdvancedDetailsOpen(false);
  }, [selectedCapability?.key]);

  const beginPackageAction = (actionId: string): symbol | null => {
    if (packageActionTokenRef.current || shortcutActionTokensRef.current.size > 0) return null;
    const actionToken = Symbol(actionId);
    packageActionTokenRef.current = actionToken;
    setBusyAction(actionId);
    return actionToken;
  };

  const finishPackageAction = (actionToken: symbol) => {
    if (packageActionTokenRef.current !== actionToken) return;
    packageActionTokenRef.current = null;
    setBusyAction(null);
  };

  const executePackageAction = async (actionId: string, payloadRefsOnlyJson?: Record<string, unknown>) => {
    const actionToken = beginPackageAction(actionId);
    if (!actionToken) return false;
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId,
        dryRun: false,
        payloadRefsOnlyJson,
      });
      if (result.ok === false) {
        throw new Error(result.error?.message || result.command);
      }
      await appStateQuery.load('fast', { showRefreshing: true });
      Message.success(t('settings.capabilitiesPage.packageManager.actionQueued'));
      return true;
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      finishPackageAction(actionToken);
    }
  };

  const restoreOfficialProfile = () => {
    if (packageMutationBusy) return;
    Modal.confirm({
      title: t('settings.agentsPage.restoreOfficialProfileConfirmTitle'),
      content: t('settings.agentsPage.restoreOfficialProfileConfirmContent'),
      okText: t('settings.agentsPage.restoreOfficialProfile'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const actionToken = beginPackageAction('restore_official_profile');
        if (!actionToken) return;
        try {
          const result = await ipcBridge.oplRuntime.applyOfficialProfile.invoke({ intent: 'explicit_restore' });
          if (result.ok === false) throw new Error(result.error?.message || result.command);
          await appStateQuery.load('fast', { showRefreshing: true, forceFresh: true });
          Message.success(t('settings.agentsPage.restoreOfficialProfileComplete'));
        } catch (error) {
          Message.error(error instanceof Error ? error.message : String(error));
        } finally {
          finishPackageAction(actionToken);
        }
      },
    });
  };

  const projectedActionPayload = (
    action: CapabilityPackageActionViewModel,
    explicitInput: Record<string, unknown> = {}
  ): Record<string, unknown> => ({ ...action.payloadRefsOnlyJson, ...explicitInput });

  const projectedActionMissingFields = (
    action: CapabilityPackageActionViewModel,
    payload: Record<string, unknown>
  ): string[] => {
    const hasValue = (field: string) =>
      payload[field] !== undefined && payload[field] !== null && payload[field] !== '';
    return action.requiredPayloadFields.filter((requirement) => {
      const alternatives = oplProjectedRequirementAlternatives(requirement);
      return alternatives.length === 0 || !alternatives.some(hasValue);
    });
  };

  const projectedActionExecutable = (
    action: CapabilityPackageActionViewModel,
    options: { explicitInput?: Record<string, unknown> } = {}
  ): boolean => {
    const payload = projectedActionPayload(action, options.explicitInput);
    return projectedActionMissingFields(action, payload).length === 0;
  };

  const executeProjectedAction = (
    action: CapabilityPackageActionViewModel,
    options: {
      explicitInput?: Record<string, unknown>;
      danger?: boolean;
    } = {}
  ) => {
    if (!projectedActionExecutable(action, options)) return;
    const payload = projectedActionPayload(action, options.explicitInput);
    const execute = () => executePackageAction(action.actionId, payload);
    if (!action.confirmationRequired) {
      void execute();
      return;
    }
    Modal.confirm({
      title: t('settings.capabilitiesPage.packageManager.projectedActionConfirmTitle', {
        action: capabilityProjectedActionLabel(action.actionId, t),
      }),
      content: t('settings.capabilitiesPage.packageManager.projectedActionConfirmContent'),
      okButtonProps: options.danger ? { status: 'danger' } : undefined,
      okText: capabilityProjectedActionLabel(action.actionId, t),
      cancelText: t('common.cancel'),
      onOk: execute,
    });
  };

  const developerSupervisorReadbackMatches = (
    freshAppState: Record<string, unknown>,
    payload: Record<string, unknown>
  ): boolean => {
    const freshConfiguration = configurationItem(freshAppState, 'developer_supervisor');
    if (oplString(freshConfiguration.action_id) !== developerSupervisorActionId) return false;
    const freshCurrentValue = oplRecord(freshConfiguration.current_value);
    const freshDeveloperMode = oplRecord(freshAppState.developer_mode);
    const expectedEnabled = oplString(payload.developerSupervisorEnabled);
    const expectedMode = oplString(payload.developerSupervisorMode);
    const expectedModuleId = oplString(payload.developerSupervisorModuleId);
    const expectedModuleSource = oplString(payload.developerSupervisorModuleSource);
    if (expectedEnabled && oplString(freshDeveloperMode.enabled) !== expectedEnabled) return false;
    if (
      expectedMode &&
      (oplString(freshDeveloperMode.mode) !== expectedMode || oplString(freshCurrentValue.mode) !== expectedMode)
    ) {
      return false;
    }
    if (expectedModuleId && expectedModuleSource) {
      const freshCapability = buildCapabilitiesViewModel(freshAppState, i18n.language).find(
        (item) => item.moduleId === expectedModuleId
      );
      if (freshCapability?.sourcePreference !== expectedModuleSource) return false;
    }
    return Boolean(expectedEnabled || expectedMode || (expectedModuleId && expectedModuleSource));
  };

  const executeDeveloperSupervisorMutation = async (payloadRefsOnlyJson: Record<string, unknown>) => {
    if (!developerSupervisorActionId) return false;
    const actionToken = beginPackageAction(developerSupervisorActionId);
    if (!actionToken) return false;
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: developerSupervisorActionId,
        dryRun: false,
        payloadRefsOnlyJson,
      });
      if (result.ok === false) throw new Error(result.error?.message || result.command);

      if (developerSupervisorVerifyActionId) {
        const verifyResult = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: developerSupervisorVerifyActionId,
          dryRun: false,
        });
        if (verifyResult.ok === false) throw new Error(verifyResult.error?.message || verifyResult.command);
      }

      const freshPayload = await appStateQuery.load('fast', { showRefreshing: true, forceFresh: true });
      if (!developerSupervisorReadbackMatches(getAppState(freshPayload), payloadRefsOnlyJson)) {
        Message.error(t('settings.capabilitiesPage.developerSource.changeNotVerified'));
        return false;
      }
      Message.success(t('settings.capabilitiesPage.developerSource.changeVerified'));
      return true;
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      finishPackageAction(actionToken);
    }
  };

  const requestDeveloperSupervisorMutation = (payloadRefsOnlyJson: Record<string, unknown>) => {
    if (!developerSupervisorActionAvailable) return;
    const execute = () => executeDeveloperSupervisorMutation(payloadRefsOnlyJson);
    if (!developerSupervisorConfirmationRequired) {
      void execute();
      return;
    }
    Modal.confirm({
      title: t('settings.capabilitiesPage.developerSource.changeConfirmTitle'),
      content: t('settings.capabilitiesPage.developerSource.changeConfirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: execute,
    });
  };

  const updateDeveloperMode = (enabled: 'auto' | 'on' | 'off') =>
    requestDeveloperSupervisorMutation({
      developerSupervisorEnabled: enabled,
      developerSupervisorMode: developerSafeMaintenance ? 'developer_apply_safe' : 'external_observe',
    });

  const updateDeveloperMaintenance = (enabled: 'auto' | 'off') =>
    requestDeveloperSupervisorMutation({
      developerSupervisorEnabled: enabled,
      developerSupervisorMode: enabled === 'auto' ? 'developer_apply_safe' : 'external_observe',
    });

  const updatePackageSource = (item: CapabilityPurposeViewModel, source: 'auto' | 'managed' | 'developer') => {
    if (!item.moduleId) return;
    requestDeveloperSupervisorMutation({
      developerSupervisorModuleId: item.moduleId,
      developerSupervisorModuleSource: source,
    });
  };

  const executeManifestInstall = async (payloadRefsOnlyJson: Record<string, unknown>, packageId: string) => {
    if (!manifestInstallActionId) return false;
    const actionToken = beginPackageAction(manifestInstallActionId);
    if (!actionToken) return false;
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: manifestInstallActionId,
        dryRun: false,
        payloadRefsOnlyJson,
      });
      if (result.ok === false) throw new Error(result.error?.message || result.command);

      const freshPayload = await appStateQuery.load('fast', { showRefreshing: true, forceFresh: true });
      const readback = installedPackageReadback(getAppState(freshPayload), packageId);
      if (!readback) {
        Message.error(t('settings.capabilitiesPage.packageManager.installNotVerified'));
        return false;
      }
      Message.success(
        t('settings.capabilitiesPage.packageManager.installVerified', {
          name: readback.displayName,
          status: capabilityCatalogStatusLabel(capabilityReadbackStatus(readback.status), t),
        })
      );
      setManifestUrl('');
      setManifestTrustTier('');
      return true;
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      finishPackageAction(actionToken);
    }
  };

  const previewManifestInstall = async () => {
    if (!manifestInstallActionAvailable || !manifestInstallActionId || !manifestTrustTier) return;
    const payloadRefsOnlyJson = {
      manifest_url: manifestUrl.trim(),
      trust_tier: manifestTrustTier,
    };
    const actionToken = beginPackageAction(manifestInstallActionId);
    if (!actionToken) return;
    let packageId: string | null = null;
    try {
      const previewResult = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: manifestInstallActionId,
        dryRun: true,
        payloadRefsOnlyJson,
      });
      if (previewResult.ok === false) throw new Error(previewResult.error?.message || previewResult.command);
      packageId = packageIdFromInstallResult(previewResult);
      if (!packageId) throw new Error(t('settings.capabilitiesPage.packageManager.installPreviewInvalid'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      return;
    } finally {
      finishPackageAction(actionToken);
    }

    const execute = () => executeManifestInstall(payloadRefsOnlyJson, packageId as string);
    if (!manifestInstallConfirmationRequired) {
      void execute();
      return;
    }
    Modal.confirm({
      title: t('settings.capabilitiesPage.packageManager.installConfirmTitle', { packageId }),
      content: t('settings.capabilitiesPage.packageManager.installConfirmContent'),
      okText: t('settings.capabilitiesPage.packageManager.installFromManifest'),
      cancelText: t('common.cancel'),
      onOk: execute,
    });
  };

  const executeShortcutPreferenceAction = async (
    item: CapabilityPurposeViewModel,
    shortcutId: string,
    preferences: OplHomeShortcutPreferences
  ): Promise<{ verified: boolean; authoritativePreferences: OplHomeShortcutPreferences | null }> => {
    if (packageActionTokenRef.current || shortcutActionTokensRef.current.has(shortcutId)) {
      return { verified: false, authoritativePreferences: null };
    }
    const shortcutOrder = getOplOrderedHomeAgentShortcuts();
    const shortcut = shortcutOrder.find((entry) => entry.shortcut_id === shortcutId);
    const action = item.availableActions.agent_package_preferences_set;
    if (!shortcut || !action) return { verified: false, authoritativePreferences: null };
    const preferenceSortOrder = preferences.orderedShortcutIds.indexOf(shortcut.shortcut_id);
    const payload = projectedActionPayload(action, {
      shortcut_id: shortcut.shortcut_id,
      visible: isOplHomeShortcutVisible(shortcut, preferences),
      sort_order:
        preferenceSortOrder >= 0
          ? preferenceSortOrder
          : shortcutOrder.findIndex((entry) => entry.shortcut_id === shortcut.shortcut_id),
    });
    if (projectedActionMissingFields(action, payload).length > 0) {
      return { verified: false, authoritativePreferences: null };
    }
    const actionToken = Symbol(shortcutId);
    shortcutActionTokensRef.current.set(shortcutId, actionToken);
    setPendingShortcutIds((current) => new Set(current).add(shortcutId));
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: action.actionId,
        dryRun: false,
        payloadRefsOnlyJson: payload,
      });
      if (result.ok === false) throw new Error(result.error?.message || result.command);
      const freshPayload = await appStateQuery.load('fast', { background: true, forceFresh: true });
      const freshAppState = getAppState(freshPayload);
      const authoritativePreferences = getOplHomeShortcutPreferencesFromAppState(freshAppState);
      if (authoritativePreferences) replaceOplHomeShortcutPreferences(authoritativePreferences);
      const readback = getOplHomeShortcutPreferenceReadback(freshAppState, shortcutId);
      if (!readback || readback.visible !== payload.visible || readback.sortOrder !== payload.sort_order) {
        return { verified: false, authoritativePreferences };
      }
      Message.success(t('settings.capabilitiesPage.packageManager.actionQueued'));
      return { verified: true, authoritativePreferences };
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      return { verified: false, authoritativePreferences: null };
    } finally {
      if (shortcutActionTokensRef.current.get(shortcutId) === actionToken) {
        shortcutActionTokensRef.current.delete(shortcutId);
        setPendingShortcutIds((current) => {
          const next = new Set(current);
          next.delete(shortcutId);
          return next;
        });
      }
    }
  };

  const updateShortcutHidden = (item: CapabilityPurposeViewModel, shortcutId: string, hidden: boolean) => {
    if (!shortcutId || packageActionTokenRef.current || shortcutActionTokensRef.current.has(shortcutId)) return;
    const previousPreferences = getOplHomeShortcutPreferences();
    const wasHidden = previousPreferences.hiddenShortcutIds.includes(shortcutId);
    const nextPreferences = setOplHomeShortcutHidden(shortcutId, hidden);
    void executeShortcutPreferenceAction(item, shortcutId, nextPreferences).then((result) => {
      if (!result.verified && !result.authoritativePreferences) setOplHomeShortcutHidden(shortcutId, wasHidden);
    });
  };

  const moveShortcut = (item: CapabilityPurposeViewModel, shortcutId: string, direction: -1 | 1) => {
    if (!shortcutId || packageActionTokenRef.current || shortcutActionTokensRef.current.size > 0) return;
    const previousPreferences = getOplHomeShortcutPreferences();
    const nextPreferences = moveOplHomeShortcut(shortcutId, direction);
    void executeShortcutPreferenceAction(item, shortcutId, nextPreferences).then((result) => {
      if (!result.verified && !result.authoritativePreferences) {
        replaceOplHomeShortcutPreferences(previousPreferences);
      }
    });
  };

  const runCapabilityPrimaryAction = (item: CapabilityPurposeViewModel) => {
    if (item.primaryAction === 'maintenance') {
      navigate('/settings/environment?section=updates');
      return;
    }
    setAdvancedDetailsOpen(true);
  };

  const hasCapabilityIssue =
    Boolean(catalogError || catalogStaleReason) ||
    purposeCapabilities.some((item) =>
      ['update', 'sync', 'attention', 'repair', 'missing'].includes(item.availabilityStatus)
    );
  const conversationReadyCount = purposeCapabilities.filter((item) =>
    ['visible', 'verificationPending'].includes(item.codexVisibility)
  ).length;
  const catalogAgentCount = purposeCapabilities.filter((item) => capabilityRoleGroupKey(item) === 'agents').length;
  const catalogWorkflowCount = purposeCapabilities.filter(
    (item) => capabilityRoleGroupKey(item) === 'workflows'
  ).length;
  const catalogSupportingCount = purposeCapabilities.filter(
    (item) => capabilityRoleGroupKey(item) === 'supporting'
  ).length;
  const homeShortcutCount = purposeCapabilities.filter((item) => {
    const shortcut = item.packageId ? shortcutByPackageId.get(item.packageId) : null;
    return shortcut ? isOplHomeShortcutVisible(shortcut, shortcutPreferences) : false;
  }).length;
  const resetCatalogFilters = () => {
    setCatalogSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setSourceFilter('all');
  };

  const openAddCapability = () => {
    setManagementOpen(true);
    setAdvancedAddOpen(true);
    requestAnimationFrame(() => {
      document.getElementById('capability-management')?.scrollIntoView({ block: 'start' });
    });
  };

  const restoreCapabilityDetailsTriggerFocus = () => {
    requestAnimationFrame(() => capabilityDetailsTriggerRef.current?.focus());
  };

  const closeCapabilityDetails = () => setSelectedCapabilityKey(null);

  const toggleCapabilityDetails = (itemKey: string, trigger: HTMLButtonElement) => {
    capabilityDetailsTriggerRef.current = trigger;
    if (selectedCapabilityKey === itemKey) {
      closeCapabilityDetails();
      return;
    }
    setSelectedCapabilityKey(itemKey);
    if (!isMobile) {
      requestAnimationFrame(() => capabilityDetailsPanelRef.current?.focus());
    }
  };

  const renderCapabilityRow = (item: CapabilityPurposeViewModel, parent: CapabilityPurposeViewModel | null = null) => {
    const shortcut = item.packageId ? shortcutByPackageId.get(item.packageId) : null;
    const shortcutVisible = shortcut ? isOplHomeShortcutVisible(shortcut, shortcutPreferences) : false;
    const rowAction = capabilityRowAction(item);
    const rowActionPayload = rowAction ? projectedActionPayload(rowAction) : null;
    const rowActionDisabled = Boolean(
      packageMutationBusy ||
      (rowAction && rowActionPayload && projectedActionMissingFields(rowAction, rowActionPayload).length > 0)
    );
    return (
      <div
        className={`opl-settings-row opl-settings-capability-row ${
          parent ? 'opl-settings-capability-row--dependent' : ''
        } ${selectedCapabilityKey === item.key ? 'bg-fill-1' : ''}`}
        data-testid={`capability-purpose-${item.key}`}
        data-selected={selectedCapabilityKey === item.key ? 'true' : 'false'}
        data-parent-capability={parent?.key}
        aria-current={selectedCapabilityKey === item.key ? 'true' : undefined}
        key={item.key}
      >
        <div className='opl-settings-row__main flex min-w-0 items-start gap-10px'>
          <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
            {capabilityIcon(item)}
          </span>
          <div className='opl-settings-capability-copy min-w-0'>
            {parent && (
              <Typography.Text className='block text-11px text-t-tertiary'>
                {t('settings.capabilitiesPage.packageManager.supportingFor', { parent: parent.title })}
              </Typography.Text>
            )}
            <Typography.Text className='font-600 text-t-primary'>{item.title}</Typography.Text>
            <Typography.Text
              className='opl-settings-capability-description block text-13px text-t-secondary'
              data-testid={`capability-description-${item.key}`}
            >
              {capabilityLocalizedSummary(item, t)}
            </Typography.Text>
            <div className='opl-settings-capability-facts mt-5px text-12px text-t-secondary'>
              <span className='opl-settings-capability-fact' data-testid={`capability-conversation-${item.key}`}>
                <span className='opl-settings-capability-fact__label'>
                  {t('settings.capabilitiesPage.visibility.conversation', {
                    defaultValue: 'Available in conversations',
                  })}
                </span>
                <span>{capabilityConversationAvailabilityLabel(item, t)}</span>
              </span>
            </div>
          </div>
        </div>
        <div
          className='opl-settings-row__meta opl-settings-capability-meta min-w-0'
          data-testid={`capability-controls-${item.key}`}
        >
          <div className='opl-settings-capability-state'>
            <span
              className='opl-settings-capability-status'
              aria-label={`${t('settings.capabilitiesPage.packageManager.tableHeaders.status')}: ${capabilityStatusLabel(
                item.availabilityStatus,
                t
              )}`}
            >
              <Tag color={capabilityStatusColor(item.availabilityStatus)}>
                {capabilityStatusLabel(item.availabilityStatus, t)}
              </Tag>
            </span>
            <span className='opl-settings-capability-home'>
              <Typography.Text className='text-11px text-t-tertiary'>
                {t('settings.capabilitiesPage.visibility.home', { defaultValue: 'Show on Home' })}
              </Typography.Text>
              {shortcut ? (
                <Switch
                  size='small'
                  checked={shortcutVisible}
                  loading={pendingShortcutIds.has(shortcut.shortcut_id)}
                  disabled={
                    packageActionBusy ||
                    pendingShortcutIds.has(shortcut.shortcut_id) ||
                    !item.availableActions.agent_package_preferences_set
                  }
                  onChange={(checked) => updateShortcutHidden(item, shortcut.shortcut_id, !checked)}
                  data-testid={`agent-package-home-toggle-details-${item.key}`}
                />
              ) : (
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.capabilitiesPage.packageManager.noHomeShortcut')}
                </Typography.Text>
              )}
            </span>
          </div>
          <div className='opl-settings-capability-actions'>
            {rowAction && (
              <Button
                size='small'
                type='primary'
                loading={busyAction === rowAction.actionId}
                disabled={rowActionDisabled}
                onClick={() => executeProjectedAction(rowAction)}
                data-testid={`agent-package-${capabilityProjectedActionTestId(rowAction.actionId)}-${item.key}`}
              >
                {capabilityProjectedActionLabel(rowAction.actionId, t)}
              </Button>
            )}
            <Button
              size='small'
              type={selectedCapabilityKey === item.key ? 'secondary' : 'default'}
              aria-expanded={selectedCapabilityKey === item.key}
              aria-controls={`capability-details-${item.key}`}
              onClick={(event) => toggleCapabilityDetails(item.key, event.currentTarget as HTMLButtonElement)}
              data-testid={`capability-open-details-${item.key}`}
            >
              {item.availabilityStatus === 'verification'
                ? t('settings.capabilitiesPage.actions.reviewLocalCheck')
                : t('settings.uiOptimization.capabilities.actions.viewDetails')}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='settings-page-agents'>
      <span data-testid='agent-packages-settings-page' aria-hidden='true' />
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.agentsPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.agentsPage.description')}</Typography.Text>
        </div>
      </header>

      <div className='flex flex-col gap-14px' data-testid='settings-agents-primary'>
        <section
          className='opl-settings-section opl-settings-surface--configuration'
          id='catalog'
          data-testid='agent-package-catalog'
        >
          {hasCapabilityIssue && <span data-testid='settings-agents-exception' aria-hidden='true' />}
          <span id='package-role' aria-hidden='true' />
          <span id='availability' aria-hidden='true' />
          <span id='home-visibility' aria-hidden='true' />
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.capabilitiesPage.packageManager.catalogTitle')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.capabilitiesPage.packageManager.catalogDescription')}
              </Typography.Text>
            </div>
            <div className='flex flex-wrap items-center gap-8px'>
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.capabilitiesPage.packageManager.packageCount', {
                  count: visibleCapabilities.length,
                  total: purposeCapabilities.length,
                })}
              </Typography.Text>
              <span data-testid='settings-agents-registry-refresh'>
                <OplRefreshIconButton
                  size='small'
                  label={t('settings.capabilitiesPage.packageManager.refreshRegistry')}
                  loading={busyAction === 'refresh_registry' || catalogRefreshing}
                  disabled={packageMutationBusy}
                  onClick={() => executePackageAction('refresh_registry')}
                  data-testid='agent-package-refresh-registry'
                />
              </span>
              <Button
                size='small'
                onClick={restoreOfficialProfile}
                loading={busyAction === 'restore_official_profile'}
                disabled={packageMutationBusy}
                data-testid='settings-agents-restore-official-profile'
              >
                {t('settings.agentsPage.restoreOfficialProfile')}
              </Button>
              <Button
                type='primary'
                size='small'
                onClick={openAddCapability}
                data-testid='settings-agents-primary-action'
              >
                {t('settings.agentsPage.addAgent')}
              </Button>
            </div>
          </div>

          <div
            className='grid min-w-0 grid-cols-1 gap-8px py-12px sm:grid-cols-2'
            data-testid='settings-agents-catalog-filters'
          >
            <Input
              className='sm:col-span-2'
              allowClear
              value={catalogSearch}
              onChange={setCatalogSearch}
              placeholder={t('settings.capabilitiesPage.packageManager.searchPlaceholder')}
              aria-label={t('settings.capabilitiesPage.packageManager.searchLabel')}
              data-testid='settings-agents-catalog-search'
            />
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              aria-label={t('settings.capabilitiesPage.packageManager.roleFilter')}
              data-testid='settings-agents-role-filter'
            >
              <Select.Option value='all'>{t('settings.capabilitiesPage.packageManager.allRoles')}</Select.Option>
              {roleOptions.map((role) => (
                <Select.Option key={role} value={role}>
                  {capabilityPackageRoleLabel(role, t)}
                </Select.Option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              aria-label={t('settings.capabilitiesPage.packageManager.statusFilter')}
              data-testid='settings-agents-status-filter'
            >
              <Select.Option value='all'>{t('settings.capabilitiesPage.packageManager.allStatuses')}</Select.Option>
              {statusOptions.map((status) => (
                <Select.Option key={status} value={status}>
                  {capabilityCatalogStatusLabel(status, t)}
                </Select.Option>
              ))}
            </Select>
            <Select
              value={sourceFilter}
              onChange={setSourceFilter}
              aria-label={t('settings.capabilitiesPage.packageManager.sourceFilter')}
              data-testid='settings-agents-source-filter'
            >
              <Select.Option value='all'>{t('settings.capabilitiesPage.packageManager.allSources')}</Select.Option>
              {sourceOptions.map((source) => (
                <Select.Option key={source} value={source}>
                  {t(`settings.capabilitiesPage.sourceLabels.${source}`)}
                </Select.Option>
              ))}
            </Select>
            <Button
              disabled={!hasActiveCatalogFilters}
              onClick={resetCatalogFilters}
              data-testid='settings-agents-reset-filters'
            >
              {t('settings.capabilitiesPage.packageManager.resetFilters')}
            </Button>
          </div>

          {(catalogLoading || catalogRefreshing) && (
            <div
              className='py-10px text-12px text-t-secondary'
              data-state={catalogLoading ? 'loading' : 'refreshing'}
              data-testid='settings-agents-loading'
            >
              {t(
                catalogLoading
                  ? 'settings.capabilitiesPage.packageManager.loading'
                  : 'settings.capabilitiesPage.packageManager.refreshing'
              )}
            </div>
          )}
          {catalogStaleReason && (
            <div className='py-10px text-12px text-t-secondary' data-testid='settings-agents-stale'>
              {t('settings.capabilitiesPage.packageManager.staleWithReason', { reason: catalogStaleReason })}
            </div>
          )}
          {catalogError && (
            <div
              className='flex flex-wrap items-center justify-between gap-8px py-10px text-12px text-[rgb(var(--red-6))]'
              data-testid='settings-agents-error'
            >
              <span>{t('settings.capabilitiesPage.packageManager.failed', { reason: catalogError })}</span>
              <Button
                size='mini'
                onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
                data-testid='settings-agents-retry'
              >
                {t('settings.retry')}
              </Button>
            </div>
          )}
          <div
            className='flex flex-wrap items-center gap-x-18px gap-y-6px py-10px text-12px text-t-secondary'
            data-testid='capability-summary-grid'
          >
            <span data-testid='capability-summary-catalog'>
              {t('settings.capabilitiesPage.packageManager.packageCount', {
                count: visibleCapabilities.length,
                total: purposeCapabilities.length,
              })}
            </span>
            <span data-testid='capability-summary-composition'>
              {t('settings.capabilitiesPage.packageManager.composition', {
                agents: String(catalogAgentCount),
                workflows: String(catalogWorkflowCount),
                supporting: String(catalogSupportingCount),
              })}
            </span>
            <span data-testid='capability-summary-conversation'>
              {t('settings.capabilitiesPage.visibility.conversation')}: {conversationReadyCount} /{' '}
              {purposeCapabilities.length}
            </span>
            <span data-testid='capability-summary-home'>
              {t('settings.capabilitiesPage.visibility.home')}: {homeShortcutCount} / {purposeCapabilities.length}
            </span>
            <span
              className={`opl-settings-status ${
                hasCapabilityIssue ? 'opl-settings-status--attention' : 'opl-settings-status--ready'
              }`}
            >
              {t(`settings.capabilitiesPage.status.${hasCapabilityIssue ? 'attention' : 'ready'}`)}
            </span>
          </div>

          <div className='opl-settings-agent-groups' data-testid='settings-agents-catalog-groups'>
            {catalogGroups.map((group) => {
              const titleId = `settings-agents-group-${group.key}-title`;
              return (
                <div
                  className='opl-settings-agent-group'
                  role='group'
                  aria-labelledby={titleId}
                  data-testid={`settings-agents-group-${group.key}`}
                  key={group.key}
                >
                  <div className='opl-settings-agent-group__header'>
                    <Typography.Text id={titleId} className='font-600 text-t-primary'>
                      {t(`settings.uiOptimization.capabilities.groups.${group.key}`)}
                    </Typography.Text>
                    <Typography.Text className='text-12px text-t-tertiary'>{group.entries.length}</Typography.Text>
                  </div>
                  <div className='opl-settings-list opl-settings-agent-group__rows'>
                    {group.entries.map((entry) => (
                      <React.Fragment key={entry.item.key}>
                        {renderCapabilityRow(entry.item)}
                        {entry.dependents.map((dependent) => renderCapabilityRow(dependent, entry.item))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
            {catalogEmpty && (
              <div className='opl-settings-empty' data-testid='settings-agents-empty'>
                <span data-testid='agent-package-empty'>
                  <Typography.Text className='text-t-secondary'>
                    {t('settings.capabilitiesPage.packageManager.empty')}
                  </Typography.Text>
                </span>
              </div>
            )}
            {catalogFilterEmpty && (
              <div className='opl-settings-empty' data-testid='settings-agents-filter-empty'>
                <Typography.Text className='text-t-secondary'>
                  {t('settings.capabilitiesPage.packageManager.noFilterResults')}
                </Typography.Text>
                <Button size='small' className='mt-8px' onClick={resetCatalogFilters}>
                  {t('settings.capabilitiesPage.packageManager.resetFilters')}
                </Button>
              </div>
            )}
          </div>

          <Drawer
            title={null}
            footer={null}
            visible={Boolean(selectedCapability)}
            placement='right'
            width={isMobile ? 'calc(100vw - 16px)' : 440}
            zIndex={1300}
            mask={isMobile}
            maskClosable={isMobile}
            closable={false}
            escToExit
            focusLock={isMobile}
            autoFocus={false}
            unmountOnExit
            getPopupContainer={() => document.body}
            onCancel={closeCapabilityDetails}
            afterOpen={() => capabilityDetailsPanelRef.current?.focus()}
            afterClose={restoreCapabilityDetailsTriggerFocus}
            bodyStyle={{ background: 'var(--color-bg-1)' }}
          >
            {selectedCapability && (
              <aside
                ref={capabilityDetailsPanelRef}
                id={`capability-details-${selectedCapability.key}`}
                role={isMobile ? 'dialog' : undefined}
                aria-modal={isMobile ? 'true' : undefined}
                aria-labelledby='capability-details-heading capability-details-name'
                tabIndex={-1}
                className='opl-settings-surface--diagnostic flex flex-col gap-12px outline-none'
                data-testid={`capability-details-${selectedCapability.key}`}
              >
                <div className='flex items-start justify-between gap-10px'>
                  <div className='min-w-0'>
                    <Typography.Text
                      id='capability-details-heading'
                      className='block text-12px font-500 text-t-secondary'
                    >
                      {t('settings.capabilitiesPage.detailsHeader')}
                    </Typography.Text>
                    <Typography.Text id='capability-details-name' className='block break-words font-600 text-t-primary'>
                      {selectedCapability.title}
                    </Typography.Text>
                  </div>
                  <div className='flex shrink-0 items-center gap-8px'>
                    <Tag color={capabilityStatusColor(selectedCapability.availabilityStatus)}>
                      {capabilityStatusLabel(selectedCapability.availabilityStatus, t)}
                    </Tag>
                    <Button
                      type='text'
                      size='mini'
                      icon={<Close theme='outline' size='16' fill='currentColor' />}
                      aria-label={t('common.close', { defaultValue: 'Close' })}
                      title={t('common.close', { defaultValue: 'Close' })}
                      onClick={closeCapabilityDetails}
                      data-testid='capability-details-close'
                    />
                  </div>
                </div>

                <div className='flex flex-col gap-4px'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.uiOptimization.capabilities.details.purpose')}
                  </Typography.Text>
                  <Typography.Text className='break-words text-t-primary'>
                    {capabilityLocalizedSummary(selectedCapability, t)}
                  </Typography.Text>
                </div>

                <details
                  className='opl-settings-details'
                  data-testid={`capability-product-details-${selectedCapability.key}`}
                >
                  <summary>{t('settings.uiOptimization.capabilities.details.title')}</summary>
                  <div className='mt-10px grid grid-cols-1 gap-8px text-12px'>
                    <div>
                      <Typography.Text className='text-t-secondary'>
                        {t('settings.uiOptimization.capabilities.details.triggerRules')}:{' '}
                      </Typography.Text>
                      <Typography.Text className='break-words text-t-primary'>
                        {selectedCapability.description}
                      </Typography.Text>
                    </div>
                    <div>
                      <Typography.Text className='text-t-secondary'>
                        {t('settings.uiOptimization.capabilities.details.source')}:{' '}
                      </Typography.Text>
                      <Typography.Text className='break-words text-t-primary'>{selectedSourceLabel}</Typography.Text>
                    </div>
                    <div>
                      <Typography.Text className='text-t-secondary'>
                        {t('settings.uiOptimization.capabilities.details.version')}:{' '}
                      </Typography.Text>
                      <Typography.Text className='break-words text-t-primary'>
                        {selectedCapability.version ?? t('settings.capabilitiesPage.detailValues.notReported')}
                      </Typography.Text>
                    </div>
                  </div>
                </details>

                <div className='grid grid-cols-1 gap-4px text-12px'>
                  <Typography.Text className='break-words text-t-secondary'>
                    {t('settings.capabilitiesPage.visibility.conversation', {
                      defaultValue: 'Available in conversations',
                    })}
                    : {capabilityConversationAvailabilityLabel(selectedCapability, t)}
                  </Typography.Text>
                  <Typography.Text className='break-words text-t-secondary'>
                    {t('settings.capabilitiesPage.visibility.home', { defaultValue: 'Show on Home' })}:{' '}
                    {selectedHomeLabel}
                  </Typography.Text>
                </div>

                {selectedReadinessDetailRows.length > 0 && (
                  <div
                    className='grid grid-cols-1 gap-4px text-12px'
                    data-testid={`capability-readiness-${selectedCapability.key}`}
                  >
                    {selectedReadinessDetailRows.map((row) => (
                      <div key={`${selectedCapability.key}-${row.key}`} className='min-w-0'>
                        <Typography.Text className='text-t-secondary'>{row.label}: </Typography.Text>
                        <Typography.Text className='break-words text-t-primary'>{row.value}</Typography.Text>
                      </div>
                    ))}
                  </div>
                )}

                {selectedCapability.moduleId && (
                  <div
                    className='opl-settings-section opl-settings-surface--configuration flex flex-col gap-10px'
                    data-testid={`capability-source-control-${selectedCapability.key}`}
                  >
                    <div>
                      <Typography.Text className='block text-13px font-600 text-t-primary'>
                        {t('settings.capabilitiesPage.developerSource.packageTitle')}
                      </Typography.Text>
                      <Typography.Text className='block text-12px text-t-secondary'>
                        {t('settings.capabilitiesPage.developerSource.packageDescription')}
                      </Typography.Text>
                    </div>
                    <Radio.Group
                      type='button'
                      value={selectedCapability.sourcePreference}
                      disabled={packageMutationBusy || !developerSupervisorActionAvailable}
                      onChange={(value) =>
                        void updatePackageSource(selectedCapability, value as 'auto' | 'managed' | 'developer')
                      }
                      aria-label={t('settings.capabilitiesPage.developerSource.packageTitle')}
                      data-testid={`capability-source-preference-${selectedCapability.key}`}
                    >
                      <Radio value='auto'>{t('settings.capabilitiesPage.developerSource.packageModes.auto')}</Radio>
                      <Radio value='managed'>
                        {t('settings.capabilitiesPage.developerSource.packageModes.managed')}
                      </Radio>
                      <Radio value='developer'>
                        {t('settings.capabilitiesPage.developerSource.packageModes.developer')}
                      </Radio>
                    </Radio.Group>
                    <div className='grid grid-cols-1 gap-4px text-12px'>
                      <Typography.Text className='break-words text-t-secondary'>
                        {t('settings.capabilitiesPage.developerSource.actualSource')}:{' '}
                        {capabilitySourceLabel(selectedCapability, t) ??
                          t('settings.capabilitiesPage.detailValues.notReported')}
                      </Typography.Text>
                      {selectedCapability.checkoutPath && (
                        <Typography.Text className='break-all text-t-secondary'>
                          {t('settings.capabilitiesPage.developerSource.activePath')}: {selectedCapability.checkoutPath}
                        </Typography.Text>
                      )}
                      {selectedCapability.managedCheckoutPath && (
                        <Typography.Text className='break-all text-t-secondary'>
                          {t('settings.capabilitiesPage.developerSource.managedPath')}:{' '}
                          {selectedCapability.managedCheckoutPath}
                        </Typography.Text>
                      )}
                      {selectedCapability.developerCheckoutPath && (
                        <Typography.Text className='break-all text-t-secondary'>
                          {t('settings.capabilitiesPage.developerSource.developerPath')}:{' '}
                          {selectedCapability.developerCheckoutPath}
                        </Typography.Text>
                      )}
                      {selectedCapability.sourceFallbackReason && (
                        <Typography.Text className='text-[rgb(var(--orange-6))]'>
                          {t(
                            `settings.capabilitiesPage.developerSource.fallbackReasons.${selectedCapability.sourceFallbackReason}`,
                            { defaultValue: t('settings.capabilitiesPage.developerSource.fallback') }
                          )}
                        </Typography.Text>
                      )}
                    </div>
                  </div>
                )}

                {selectedHasPrimaryAction && (
                  <Button
                    type='secondary'
                    onClick={() => runCapabilityPrimaryAction(selectedCapability)}
                    data-testid={`capability-primary-action-${selectedCapability.key}`}
                  >
                    {capabilityActionLabel(selectedCapability, t)}
                  </Button>
                )}

                {selectedShortcut && (
                  <Space wrap size={6}>
                    <Button
                      size='mini'
                      disabled={packageMutationBusy || selectedShortcutIndex <= 0}
                      onClick={() => moveShortcut(selectedCapability, selectedShortcutId, -1)}
                      data-testid={`agent-package-home-up-details-${selectedCapability.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.moveUp')}
                    </Button>
                    <Button
                      size='mini'
                      disabled={
                        packageMutationBusy ||
                        selectedShortcutIndex < 0 ||
                        selectedShortcutIndex >= orderedShortcuts.length - 1
                      }
                      onClick={() => moveShortcut(selectedCapability, selectedShortcutId, 1)}
                      data-testid={`agent-package-home-down-details-${selectedCapability.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.moveDown')}
                    </Button>
                  </Space>
                )}

                {capabilityCandidateReportRows(selectedCapability.workflowCandidateRefs, selectedCapability.key, t)}

                {(selectedUpdateAction ||
                  selectedRepairAction ||
                  selectedPreferenceAction ||
                  selectedUninstallAction) && (
                  <div data-testid={`agent-package-lifecycle-actions-${selectedCapability.key}`}>
                    <Typography.Text className='block text-13px font-600 text-t-primary'>
                      {t('settings.capabilitiesPage.packageManager.management')}
                    </Typography.Text>
                    <Space wrap size={6} className='mt-8px'>
                      {selectedUpdateAction && (
                        <Button
                          size='mini'
                          loading={busyAction === selectedUpdateAction.actionId}
                          disabled={packageMutationBusy || !projectedActionExecutable(selectedUpdateAction)}
                          onClick={() => executeProjectedAction(selectedUpdateAction)}
                          data-testid={`agent-package-update-${selectedCapability.key}`}
                        >
                          {t('settings.capabilitiesPage.packageManager.actions.update')}
                        </Button>
                      )}
                      {selectedRepairAction && (
                        <Button
                          size='mini'
                          loading={busyAction === selectedRepairAction.actionId}
                          disabled={packageMutationBusy || !projectedActionExecutable(selectedRepairAction)}
                          onClick={() => executeProjectedAction(selectedRepairAction)}
                          data-testid={`agent-package-repair-${selectedCapability.key}`}
                        >
                          {t('settings.capabilitiesPage.packageManager.actions.repair')}
                        </Button>
                      )}
                      {selectedPreferenceAction && selectedCapability.enabled !== null && (
                        <Button
                          size='mini'
                          loading={busyAction === selectedPreferenceAction.actionId}
                          disabled={
                            packageMutationBusy ||
                            !projectedActionExecutable(selectedPreferenceAction, {
                              explicitInput: {
                                exposure_action: selectedCapability.enabled === false ? 'enable' : 'disable',
                              },
                            }) ||
                            (selectedCapability.enabled !== false &&
                              selectedCapability.dependentGuard?.disableAllowed !== true)
                          }
                          onClick={() =>
                            executeProjectedAction(selectedPreferenceAction, {
                              explicitInput: {
                                exposure_action: selectedCapability.enabled === false ? 'enable' : 'disable',
                              },
                            })
                          }
                          data-testid={`agent-package-enabled-toggle-${selectedCapability.key}`}
                        >
                          {selectedCapability.enabled === false
                            ? t('settings.capabilitiesPage.packageManager.actions.enable')
                            : t('settings.capabilitiesPage.packageManager.actions.disable')}
                        </Button>
                      )}
                      {selectedPreferenceAction && selectedCapability.enabled === true && (
                        <Button
                          size='mini'
                          loading={busyAction === selectedPreferenceAction.actionId}
                          disabled={
                            packageMutationBusy ||
                            !projectedActionExecutable(selectedPreferenceAction, {
                              explicitInput: {
                                exposure_action: selectedCapability.hidden === true ? 'unhide' : 'hide',
                              },
                            })
                          }
                          onClick={() =>
                            executeProjectedAction(selectedPreferenceAction, {
                              explicitInput: {
                                exposure_action: selectedCapability.hidden === true ? 'unhide' : 'hide',
                              },
                            })
                          }
                          data-testid={`agent-package-hidden-toggle-${selectedCapability.key}`}
                        >
                          {selectedCapability.hidden === true
                            ? t('settings.capabilitiesPage.packageManager.actions.show')
                            : t('settings.capabilitiesPage.packageManager.actions.hide')}
                        </Button>
                      )}
                      {selectedUninstallAction && (
                        <Button
                          size='mini'
                          status='danger'
                          loading={busyAction === selectedUninstallAction.actionId}
                          disabled={
                            packageMutationBusy ||
                            !projectedActionExecutable(selectedUninstallAction) ||
                            selectedCapability.dependentGuard?.uninstallAllowed !== true
                          }
                          onClick={() => executeProjectedAction(selectedUninstallAction, { danger: true })}
                          data-testid={`agent-package-uninstall-${selectedCapability.key}`}
                        >
                          {t('settings.capabilitiesPage.packageManager.actions.uninstall')}
                        </Button>
                      )}
                    </Space>
                  </div>
                )}

                <Button
                  size='small'
                  onClick={() => setAdvancedDetailsOpen((open) => !open)}
                  data-testid={`capability-advanced-toggle-${selectedCapability.key}`}
                >
                  {t('common.technical_details', { defaultValue: 'Technical Details' })}
                </Button>

                {advancedDetailsOpen && (
                  <div
                    className='grid grid-cols-1 gap-10px'
                    data-testid={`capability-advanced-${selectedCapability.key}`}
                  >
                    {selectedUserDetailRows.length > 0 && (
                      <div className='grid grid-cols-1 gap-6px text-12px'>
                        {selectedUserDetailRows.map((row) => (
                          <div key={`${selectedCapability.key}-${row.key}`} className='min-w-0'>
                            <Typography.Text className='text-t-secondary'>{row.label}: </Typography.Text>
                            <Typography.Text className='break-words text-t-primary'>{row.value}</Typography.Text>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedHasSupportingContext && (
                      <div
                        className='grid grid-cols-1 gap-10px'
                        data-testid={`capability-support-context-${selectedCapability.key}`}
                      >
                        {selectedCapability.connectorReadinessRefs.length > 0 && (
                          <div className='min-w-0'>
                            <Typography.Text className='mb-4px block text-t-secondary'>
                              {t('settings.capabilitiesPage.detailLabels.connectorReadinessRefs')}
                            </Typography.Text>
                            {capabilityRefGroups(
                              selectedCapability.connectorReadinessGroups,
                              selectedCapability.key,
                              t
                            )}
                            {capabilityRefRows(
                              selectedUngroupedConnectorRefs,
                              selectedCapability.key,
                              t,
                              `capability-connector-refs-${selectedCapability.key}`
                            )}
                          </div>
                        )}
                        {selectedCapability.workflowRefs.length > 0 && (
                          <div className='min-w-0'>
                            <Typography.Text className='mb-4px block text-t-secondary'>
                              {t('settings.capabilitiesPage.detailLabels.workflowRefs')}
                            </Typography.Text>
                            {capabilityRefRows(
                              selectedCapability.workflowRefs,
                              selectedCapability.key,
                              t,
                              `capability-workflow-refs-${selectedCapability.key}`
                            )}
                          </div>
                        )}
                        {selectedCapability.resourceContextRefs.length > 0 && (
                          <div className='min-w-0'>
                            <Typography.Text className='mb-4px block text-t-secondary'>
                              {t('settings.capabilitiesPage.detailLabels.resourceContextRefs')}
                            </Typography.Text>
                            {capabilityRefGroups(
                              selectedCapability.resourceContextGroups,
                              selectedCapability.key,
                              t,
                              'settings.capabilitiesPage.resourceContextGroups'
                            )}
                            {capabilityRefRows(
                              selectedUngroupedResourceRefs,
                              selectedCapability.key,
                              t,
                              `capability-resource-context-refs-${selectedCapability.key}`
                            )}
                          </div>
                        )}
                        {selectedCapability.exportBundleAction && (
                          <div className='min-w-0'>
                            <Typography.Text className='mb-4px block text-t-secondary'>
                              {t('settings.capabilitiesPage.detailLabels.exportBundleAction')}
                            </Typography.Text>
                            {capabilityExportBundleAction(selectedCapability.exportBundleAction, t)}
                          </div>
                        )}
                      </div>
                    )}
                    <div className='grid grid-cols-1 gap-6px text-12px'>
                      {selectedDiagnosticRows.map((row) => (
                        <div key={`${selectedCapability.key}-${row.key}`} className='min-w-0'>
                          <Typography.Text className='text-t-secondary'>{row.label}: </Typography.Text>
                          <Typography.Text className='break-words text-t-primary'>{row.value}</Typography.Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </Drawer>

          <details
            className='opl-settings-details'
            id='capability-management'
            open={managementOpen}
            onToggle={(event) => setManagementOpen(event.currentTarget.open)}
            data-testid='settings-agents-technical-details'
          >
            <span data-testid='settings-capabilities-technical-details' aria-hidden='true' />
            <span data-testid='capability-management-entry' aria-hidden='true' />
            <summary className='cursor-pointer text-12px font-500 text-t-secondary'>
              {t('settings.capabilitiesPage.packageManager.management', { defaultValue: 'Manage capabilities' })}
            </summary>
            <div className='mt-10px flex flex-col gap-10px'>
              <span data-testid='agent-package-add-capability' aria-hidden='true' />
              {advancedAddOpen && (
                <div
                  className='opl-settings-flat-subgroup grid grid-cols-1 gap-8px py-10px md:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)_auto]'
                  data-testid='agent-package-advanced-add'
                >
                  <div className='md:col-span-3'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {t('settings.capabilitiesPage.packageManager.advancedAddTitle')}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.capabilitiesPage.packageManager.advancedAddDescription')}
                    </Typography.Text>
                  </div>
                  <Input
                    size='small'
                    value={manifestUrl}
                    onChange={setManifestUrl}
                    placeholder={t('settings.capabilitiesPage.packageManager.manifestUrlPlaceholder')}
                    data-testid='agent-package-manifest-url'
                  />
                  <Select
                    size='small'
                    allowClear
                    value={manifestTrustTier || undefined}
                    onChange={(value) => setManifestTrustTier(value as ManifestTrustTier)}
                    onClear={() => setManifestTrustTier('')}
                    placeholder={t('settings.capabilitiesPage.packageManager.trustTierPlaceholder')}
                    aria-label={t('settings.capabilitiesPage.packageManager.trustTierLabel')}
                    data-testid='agent-package-trust-tier'
                  >
                    <Select.Option value='third_party_unverified'>
                      {t('settings.capabilitiesPage.packageManager.trustTiers.thirdPartyUnverified')}
                    </Select.Option>
                    <Select.Option value='third_party_verified'>
                      {t('settings.capabilitiesPage.packageManager.trustTiers.thirdPartyVerified')}
                    </Select.Option>
                  </Select>
                  <Button
                    size='small'
                    loading={busyAction === manifestInstallActionId}
                    disabled={
                      packageMutationBusy ||
                      !manifestInstallActionAvailable ||
                      !manifestUrl.trim() ||
                      !manifestTrustTier
                    }
                    onClick={() => void previewManifestInstall()}
                    data-testid='agent-package-install-manifest'
                  >
                    {t('settings.capabilitiesPage.packageManager.installFromManifest')}
                  </Button>
                  {manifestUrl.trim() && !manifestTrustTier && (
                    <Typography.Text
                      className='text-12px text-[rgb(var(--red-6))] md:col-start-2'
                      data-testid='agent-package-trust-tier-required'
                    >
                      {t('settings.capabilitiesPage.packageManager.trustTierRequired')}
                    </Typography.Text>
                  )}
                </div>
              )}
            </div>
          </details>
        </section>

        <section
          className='opl-settings-section opl-settings-agent-advanced'
          id='source'
          data-testid='opl-developer-profile-control'
        >
          <button
            type='button'
            className='opl-settings-agent-disclosure'
            aria-expanded={developerAdvancedOpen}
            aria-controls='opl-developer-profile-details'
            onClick={() => setDeveloperAdvancedOpen((open) => !open)}
            data-testid='opl-developer-profile-disclosure'
          >
            <span className='min-w-0 text-left'>
              <span className='block font-600 text-t-primary'>
                {t('settings.capabilitiesPage.developerSource.advancedTitle')}
              </span>
              <span className='block text-12px text-t-secondary'>
                {t('settings.capabilitiesPage.developerSource.advancedSummary', {
                  mode: developerModeLabel,
                  state: developerEffectiveStateLabel,
                })}
              </span>
            </span>
            <Down
              theme='outline'
              size='14'
              fill='currentColor'
              className='opl-settings-agent-disclosure__icon'
              aria-hidden='true'
            />
          </button>
          {developerAdvancedOpen && (
            <div className='opl-settings-agent-advanced__content' id='opl-developer-profile-details'>
              <div className='opl-settings-section__header'>
                <div>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {t('settings.capabilitiesPage.developerSource.title')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {t('settings.capabilitiesPage.developerSource.description')}
                  </Typography.Text>
                </div>
                <Radio.Group
                  type='button'
                  value={developerModeEnabled}
                  disabled={packageMutationBusy || !developerSupervisorActionAvailable}
                  onChange={(value) => void updateDeveloperMode(value as 'auto' | 'on' | 'off')}
                  aria-label={t('settings.capabilitiesPage.developerSource.modeLabel')}
                  data-testid='opl-developer-profile-mode'
                >
                  <Radio value='auto'>{t('settings.capabilitiesPage.developerSource.modes.auto')}</Radio>
                  <Radio value='off'>{t('settings.capabilitiesPage.developerSource.modes.managed')}</Radio>
                  <Radio value='on'>{t('settings.capabilitiesPage.developerSource.modes.developer')}</Radio>
                </Radio.Group>
              </div>
              <div className='opl-settings-list'>
                <div className='opl-settings-row'>
                  <div className='opl-settings-row__main'>
                    <Typography.Text className='block font-500 text-t-primary'>
                      {t('settings.capabilitiesPage.developerSource.safeMaintenance')}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.capabilitiesPage.developerSource.safeMaintenanceDescription')}
                    </Typography.Text>
                  </div>
                  <div className='opl-settings-row__meta'>
                    <div className='flex flex-col items-end gap-6px'>
                      <Tag data-testid='opl-developer-profile-effective-state'>{developerEffectiveStateLabel}</Tag>
                      <Radio.Group
                        type='button'
                        size='small'
                        value={developerMaintenanceChoice}
                        disabled={packageMutationBusy || !developerSupervisorActionAvailable}
                        onChange={(value) => void updateDeveloperMaintenance(value as 'auto' | 'off')}
                        aria-label={t('settings.capabilitiesPage.developerSource.maintenanceModeLabel')}
                        data-testid='opl-developer-profile-maintenance'
                      >
                        <Radio value='auto'>
                          {t('settings.capabilitiesPage.developerSource.maintenanceModes.auto')}
                        </Radio>
                        <Radio value='off'>{t('settings.capabilitiesPage.developerSource.maintenanceModes.off')}</Radio>
                      </Radio.Group>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className='opl-settings-agent-summary grid min-w-0 gap-x-18px gap-y-8px py-10px text-12px text-t-secondary sm:grid-cols-2'
                data-testid='settings-agents-developer-summary'
              >
                <span className='min-w-0'>
                  {t('settings.capabilitiesPage.developerSource.workspace')}:{' '}
                  {developerWorkspacePath ?? t('settings.capabilitiesPage.detailValues.notReported')}
                </span>
                <span className='min-w-0'>
                  {t('settings.capabilitiesPage.developerSource.configurationSource')}:{' '}
                  {t(`settings.capabilitiesPage.developerSource.configurationSources.${developerConfigSource}`, {
                    defaultValue: t('settings.capabilitiesPage.developerSource.configurationSources.other'),
                  })}
                </span>
                {developerInspectionPending && (
                  <span data-testid='opl-developer-profile-inspection-pending'>
                    {t('settings.capabilitiesPage.developerSource.inspectionPending')}
                  </span>
                )}
                {!developerInspectionPending && showDeveloperIdentity && (
                  <span>
                    {t('settings.capabilitiesPage.developerSource.identity')}: {developerIdentityLogin}
                  </span>
                )}
                {!developerInspectionPending && showDeveloperAuthority && (
                  <span>
                    {t('settings.capabilitiesPage.developerSource.authority')}:{' '}
                    {t('settings.capabilitiesPage.developerSource.authoritySummary', {
                      direct: String(directWriteRepoCount),
                      pullRequest: String(prRouteRepoCount),
                      total: String(requiredRepoCount),
                    })}
                  </span>
                )}
                {developerMaintenanceProtection.status === 'ready' && (
                  <span data-testid='opl-developer-profile-protection'>
                    {t('settings.capabilitiesPage.developerSource.protection')}:{' '}
                    {t('settings.capabilitiesPage.developerSource.protectionSummary', {
                      dirty:
                        developerDirtyProtection.requires_isolated_worktree === true
                          ? t('settings.capabilitiesPage.developerSource.protectionValues.isolatedWorktree')
                          : t('settings.capabilitiesPage.developerSource.protectionValues.notReported'),
                      branch:
                        developerBranchProtection.direct_push_to_protected_branch === false
                          ? t('settings.capabilitiesPage.developerSource.protectionValues.topicBranch')
                          : t('settings.capabilitiesPage.developerSource.protectionValues.notReported'),
                    })}
                  </span>
                )}
                {!developerInspectionPending && developerInactiveReason && (
                  <span data-testid='opl-developer-profile-inactive-reason'>
                    {t('settings.capabilitiesPage.developerSource.inactiveReason')}:{' '}
                    {t(`settings.capabilitiesPage.developerSource.inactiveReasons.${developerInactiveReason}`, {
                      defaultValue: t('settings.capabilitiesPage.developerSource.inactiveReasons.other'),
                    })}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export const AgentPackagesSettings: React.FC = () => (
  <SettingsPageWrapper>
    <AgentPackagesSettingsContent />
  </SettingsPageWrapper>
);

type CapabilitiesSettingsContentProps = {
  activeTab: CapabilitiesTab;
  onTabChange: (tab: CapabilitiesTab) => void;
};

export const CapabilitiesSettingsContent: React.FC<CapabilitiesSettingsContentProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const managedUpdateMaintenance = useManagedUpdateMaintenance();
  const [flowSyncing, setFlowSyncing] = useState(false);
  const managedUpdatePlane = React.useMemo(
    () => readManagedUpdatePlane(managedUpdateMaintenance.result?.parsed, appStateQuery.appState),
    [appStateQuery.appState, managedUpdateMaintenance.result]
  );
  const baseDependencyCatalog = managedUpdatePlane.components.find(
    (component) => component.id === 'opl_base'
  )?.dependencyCatalog;
  const flowManagedCatalog = React.useMemo(
    () => readOplFlowManagedCapabilityCatalog(baseDependencyCatalog),
    [baseDependencyCatalog]
  );

  const syncFlowCapabilities = async () => {
    if (flowSyncing) return;
    setFlowSyncing(true);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'settings_sync_capabilities',
        dryRun: false,
      });
      if (result.ok === false) throw new Error(result.error?.message || result.command);
      await appStateQuery.load('fast', { showRefreshing: true });
      Message.success(t('settings.capabilitiesPage.groups.oplFlowManaged.syncComplete'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setFlowSyncing(false);
    }
  };

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='settings-page-capabilities'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.capabilitiesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.capabilitiesPage.description')}</Typography.Text>
        </div>
      </header>
      <div data-testid='settings-capabilities-primary'>
        <Tabs
          activeTab={activeTab}
          onChange={(key) => {
            if (isCapabilitiesTab(key)) onTabChange(key);
          }}
          type='line'
        >
          <Tabs.TabPane
            key='opl_flow_managed'
            title={t('settings.capabilitiesTab.oplFlowManaged', { defaultValue: 'Recommended by OPL Flow' })}
          >
            <div id='opl-flow-managed' data-testid='settings-capabilities-opl-flow-managed'>
              <div data-testid='settings-capabilities-technical-details'>
                <SkillsHubSettings
                  withWrapper={false}
                  displayGroup='flow'
                  flowManagedSkillIds={flowManagedCatalog.skillIds}
                  flowManagedSkillDependencies={flowManagedCatalog.skillDependencies}
                  flowManagedCliDependencies={flowManagedCatalog.cliDependencies}
                  flowSyncing={flowSyncing}
                  onSyncFlow={() => void syncFlowCapabilities()}
                />
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane
            key='manual_and_third_party'
            title={t('settings.capabilitiesTab.manualAndThirdParty', { defaultValue: 'Manually added' })}
          >
            <div
              id='third-party'
              className='opl-settings-flat-capabilities'
              data-testid='settings-capabilities-third-party'
            >
              <section
                className='opl-settings-flat-section opl-settings-flat-section--first'
                data-testid='settings-capabilities-manual-skills'
              >
                <SkillsHubSettings
                  withWrapper={false}
                  displayGroup='manual'
                  flowManagedSkillIds={flowManagedCatalog.skillIds}
                />
              </section>
              <section className='opl-settings-flat-section' data-testid='settings-capabilities-manual-tools'>
                <ToolsModalContent />
              </section>
              <section className='opl-settings-flat-section' data-testid='settings-capabilities-voice-input'>
                <VoiceInputSection />
              </section>
            </div>
          </Tabs.TabPane>
        </Tabs>
      </div>
    </div>
  );
};

const CapabilitiesSettings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CapabilitiesTab>(() => {
    return (
      normalizeCapabilitiesTab(searchParams.get('tab')) ??
      normalizeCapabilitiesTab(searchParams.get('section')) ??
      'opl_flow_managed'
    );
  });

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (
      tabParam === 'skills' ||
      tabParam === 'tools' ||
      tabParam === 'assistants' ||
      searchParams.get('section') === 'custom-assistants'
    ) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'manual_and_third_party');
      next.delete('section');
      setSearchParams(next, { replace: true });
      if (activeTab !== 'manual_and_third_party') setActiveTab('manual_and_third_party');
      return;
    }
    const routeTab = normalizeCapabilitiesTab(tabParam) ?? normalizeCapabilitiesTab(searchParams.get('section'));
    if (routeTab && routeTab !== activeTab) {
      setActiveTab(routeTab);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (key: CapabilitiesTab) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <SettingsPageWrapper>
      <CapabilitiesSettingsContent activeTab={activeTab} onTabChange={handleTabChange} />
    </SettingsPageWrapper>
  );
};

export default CapabilitiesSettings;
