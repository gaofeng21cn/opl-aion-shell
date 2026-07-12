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
  Space,
  Switch,
  Tag,
  Tabs,
  Typography,
} from '@arco-design/web-react';
import { Close, Experiment, FilePpt, FileWord, Refresh, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SkillsHubSettings from './SkillsHubSettings';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { ipcBridge } from '@/common';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import {
  getOplHomeShortcutPreferences,
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
  type CapabilityRefGroupViewModel,
  type CapabilityRefViewModel,
} from './capabilitiesProjection';

export type CapabilitiesTab = 'skills' | 'tools';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab => value === 'skills' || value === 'tools';
const DEFAULT_AGENT_REGISTRY_URL =
  'https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/contracts/agent-package-registry.json';

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
  if (item.codexVisibility === 'visible') {
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
  if (item.key === 'mas') return <Experiment theme='outline' />;
  if (item.key === 'mag') return <FileWord theme='outline' />;
  if (item.key === 'rca') return <FilePpt theme='outline' />;
  if (item.key === 'obf') return <FileWord theme='outline' />;
  return <Robot theme='outline' />;
}

function capabilityActionLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string {
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

function capabilityReasonLabel(reason: string, t: (key: string, options?: Record<string, string>) => string): string {
  return t(`settings.capabilitiesPage.reasonCodes.${reason}`, { defaultValue: reason });
}

function capabilitySourceLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string | null {
  const raw = item.actualSource ?? item.sourceKind ?? item.source;
  if (!raw) return null;
  const token = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (
    [
      'envoverride',
      'gitcheckout',
      'developercheckout',
      'developermode',
      'developermodepackageoverride',
      'siblingworkspace',
    ].includes(token)
  ) {
    return t('settings.capabilitiesPage.sourceLabels.developer');
  }
  if (
    [
      'managedroot',
      'managed',
      'builtin',
      'packaged',
      'firstparty',
      'packagechannel',
      'developermodemanagedoverride',
    ].includes(token)
  ) {
    return t('settings.capabilitiesPage.sourceLabels.managed');
  }
  if (['manifesturl', 'registry', 'thirdparty', 'remote'].includes(token)) {
    return t('settings.capabilitiesPage.sourceLabels.registry');
  }
  if (['local', 'manual', 'filesystem'].includes(token)) return t('settings.capabilitiesPage.sourceLabels.local');
  return t('settings.capabilitiesPage.sourceLabels.other', { defaultValue: 'Other source' });
}

function isCapabilityDeveloperSource(item: CapabilityPurposeViewModel): boolean {
  const sourceTokens = [item.actualSource, item.sourceKind, item.source]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/[^a-z0-9]/gi, '').toLowerCase());
  return sourceTokens.some((token) =>
    ['envoverride', 'gitcheckout', 'developercheckout', 'developermode'].includes(token)
  );
}

function capabilityUserDetailRows(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): CapabilityDetailRow[] {
  return [
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
  return [
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
    item.operationalReady !== null
      ? {
          key: 'operationalReady',
          label: t('settings.capabilitiesPage.detailLabels.operationalReady'),
          value: item.operationalReady
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    item.launchAllowed !== null
      ? {
          key: 'launchAllowed',
          label: t('settings.capabilitiesPage.detailLabels.launchAllowed'),
          value: item.launchAllowed
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
        }
      : null,
    item.launchAllowed === false && item.launchBlockedReason
      ? {
          key: 'launchBlockedReason',
          label: t('settings.capabilitiesPage.detailLabels.launchBlockedReason'),
          value: capabilityReasonLabel(item.launchBlockedReason, t),
        }
      : null,
    item.launchAllowed === false && item.allowedWhenBlocked.length > 0
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
      key: 'dependencyClosureGenerationId',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureGenerationId'),
      value: item.dependencyClosure?.generationId,
    },
    {
      key: 'dependencyClosureDigest',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureDigest'),
      value: item.dependencyClosure?.closureDigest,
    },
    {
      key: 'dependencyClosureLastKnownGoodGenerationId',
      label: t('settings.capabilitiesPage.detailLabels.dependencyClosureLastKnownGoodGenerationId'),
      value: item.dependencyClosure?.lastKnownGoodGenerationId,
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
    </div>
  );
};

type CapabilitiesSettingsContentProps = {
  activeTab: CapabilitiesTab;
  onTabChange: (tab: CapabilitiesTab) => void;
  supportingSurfaceDefaultOpen?: boolean;
};

export const CapabilitiesSettingsContent: React.FC<CapabilitiesSettingsContentProps> = ({
  activeTab,
  onTabChange,
  supportingSurfaceDefaultOpen = false,
}) => {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = Boolean(useLayoutContext()?.isMobile);
  const appStateQuery = useOplAppState('fast');
  const [manifestUrl, setManifestUrl] = useState('');
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
  const [supportingSurfaceOpen, setSupportingSurfaceOpen] = useState(supportingSurfaceDefaultOpen);
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
    () =>
      buildCapabilitiesViewModel(appStateQuery.appState, i18n.language, [
        {
          key: 'oma',
          title: t('settings.capabilitiesPage.purposes.automation.title'),
          description: t('settings.capabilitiesPage.purposes.automation.description'),
          tags: ['OMA', 'Skills', 'Tools'],
          moduleIds: ['oplmetaagent', 'opl-meta-agent', 'oma'],
          packageId: 'opl-meta-agent',
        },
      ]),
    [appStateQuery.appState, i18n.language, t]
  );
  const developerMode = oplRecord(appStateQuery.appState.developer_mode);
  const developerWorkspace = oplRecord(developerMode.developer_workspace);
  const developerIdentity = oplRecord(developerMode.github_identity);
  const developerAuthority = oplRecord(developerMode.repo_authority);
  const developerModeEnabled = (() => {
    const value = oplString(developerMode.enabled);
    return value === 'on' || value === 'off' ? value : 'auto';
  })();
  const developerSafeMaintenance = oplString(developerMode.mode) === 'developer_apply_safe';
  const developerWorkspacePath = oplString(developerWorkspace.selected_path);
  const developerIdentityLogin = oplString(developerIdentity.login);
  const developerIdentityStatus = oplString(developerIdentity.status);
  const developerAuthorityStatus = oplString(developerAuthority.status);
  const directWriteRepoCount = Number(developerAuthority.direct_write_repo_count ?? 0);
  const requiredRepoCount = Number(developerAuthority.required_repo_count ?? 0);
  const showDeveloperIdentity = developerIdentityStatus === 'ready' && Boolean(developerIdentityLogin);
  const showDeveloperAuthority =
    Boolean(developerAuthorityStatus) &&
    !['not_checked', 'skipped'].includes(developerAuthorityStatus) &&
    requiredRepoCount > 0;
  const selectedCapability = React.useMemo(
    () => purposeCapabilities.find((item) => item.key === selectedCapabilityKey) ?? null,
    [purposeCapabilities, selectedCapabilityKey]
  );
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

  const executePackageAction = async (actionId: string, payloadRefsOnlyJson?: Record<string, unknown>) => {
    if (packageActionTokenRef.current || shortcutActionTokensRef.current.size > 0) return;
    const actionToken = Symbol(actionId);
    packageActionTokenRef.current = actionToken;
    setBusyAction(actionId);
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
      if (packageActionTokenRef.current === actionToken) {
        packageActionTokenRef.current = null;
        setBusyAction(null);
      }
    }
  };

  const executeLifecycleAction = (
    item: CapabilityPurposeViewModel,
    actionId: string,
    payloadRefsOnlyJson: Record<string, unknown> = {}
  ): Promise<boolean> => {
    if (!item.packageId) return Promise.resolve(false);
    const packageSelection =
      actionId === 'agent_package_update'
        ? {
            package_id: item.packageId,
            ...(item.manifestUrl ? { manifest_url: item.manifestUrl } : {}),
            ...(!item.manifestUrl && item.registryUrl ? { registry_url: item.registryUrl } : {}),
          }
        : { package_id: item.packageId };
    return executePackageAction(actionId, { ...packageSelection, ...payloadRefsOnlyJson });
  };

  const updateDeveloperMode = (enabled: 'auto' | 'on' | 'off') =>
    executePackageAction('developer_supervisor', {
      developerSupervisorEnabled: enabled,
      developerSupervisorMode: developerSafeMaintenance ? 'developer_apply_safe' : 'external_observe',
    });

  const updateDeveloperMaintenance = (enabled: boolean) =>
    executePackageAction('developer_supervisor', {
      developerSupervisorMode: enabled ? 'developer_apply_safe' : 'external_observe',
    });

  const updatePackageSource = (item: CapabilityPurposeViewModel, source: 'auto' | 'managed' | 'developer') => {
    if (!item.moduleId) return Promise.resolve(false);
    return executePackageAction('developer_supervisor', {
      developerSupervisorModuleId: item.moduleId,
      developerSupervisorModuleSource: source,
    });
  };

  const confirmUninstallPackage = (item: CapabilityPurposeViewModel) => {
    if (!item.packageId || packageActionTokenRef.current || shortcutActionTokensRef.current.size > 0) return;
    Modal.confirm({
      title: t('settings.capabilitiesPage.packageManager.uninstallConfirmTitle'),
      content: t('settings.capabilitiesPage.packageManager.uninstallConfirmContent'),
      okButtonProps: { status: 'danger' },
      okText: t('settings.capabilitiesPage.packageManager.actions.uninstall'),
      cancelText: t('common.cancel'),
      onOk: () => executeLifecycleAction(item, 'agent_package_uninstall'),
    });
  };

  const executeShortcutPreferenceAction = async (
    shortcutId: string,
    preferences: OplHomeShortcutPreferences
  ): Promise<boolean> => {
    if (packageActionTokenRef.current || shortcutActionTokensRef.current.has(shortcutId)) return false;
    const shortcutOrder = getOplOrderedHomeAgentShortcuts();
    const shortcut = shortcutOrder.find((entry) => entry.shortcut_id === shortcutId);
    if (!shortcut) return false;
    const preferenceSortOrder = preferences.orderedShortcutIds.indexOf(shortcut.shortcut_id);
    const actionToken = Symbol(shortcutId);
    shortcutActionTokensRef.current.set(shortcutId, actionToken);
    setPendingShortcutIds((current) => new Set(current).add(shortcutId));
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'agent_package_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: shortcut.package_id,
          shortcut_id: shortcut.shortcut_id,
          visible: isOplHomeShortcutVisible(shortcut, preferences),
          sort_order:
            preferenceSortOrder >= 0
              ? preferenceSortOrder
              : shortcutOrder.findIndex((entry) => entry.shortcut_id === shortcut.shortcut_id),
        },
      });
      if (result.ok === false) throw new Error(result.error?.message || result.command);
      await appStateQuery.load('fast', { background: true });
      Message.success(t('settings.capabilitiesPage.packageManager.actionQueued'));
      return true;
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      return false;
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

  const updateShortcutHidden = (shortcutId: string, hidden: boolean) => {
    if (!shortcutId || packageActionTokenRef.current || shortcutActionTokensRef.current.has(shortcutId)) return;
    const previousPreferences = getOplHomeShortcutPreferences();
    const wasHidden = previousPreferences.hiddenShortcutIds.includes(shortcutId);
    const nextPreferences = setOplHomeShortcutHidden(shortcutId, hidden);
    void executeShortcutPreferenceAction(shortcutId, nextPreferences).then((succeeded) => {
      if (!succeeded) setOplHomeShortcutHidden(shortcutId, wasHidden);
    });
  };

  const moveShortcut = (shortcutId: string, direction: -1 | 1) => {
    if (!shortcutId || packageActionTokenRef.current || shortcutActionTokensRef.current.size > 0) return;
    const previousPreferences = getOplHomeShortcutPreferences();
    const nextPreferences = moveOplHomeShortcut(shortcutId, direction);
    void executeShortcutPreferenceAction(shortcutId, nextPreferences).then((succeeded) => {
      if (!succeeded) replaceOplHomeShortcutPreferences(previousPreferences);
    });
  };

  const runCapabilityPrimaryAction = (item: CapabilityPurposeViewModel) => {
    if (item.primaryAction === 'maintenance') {
      navigate('/settings/environment');
      return;
    }
    setAdvancedDetailsOpen(true);
  };

  const packageLifecycleDisabled = (item: CapabilityPurposeViewModel, actionId: string) => {
    if (!item.packageId || isCapabilityDeveloperSource(item)) return true;
    if (actionId === 'agent_package_update') return !item.manifestUrl && !item.registryUrl;
    if (actionId === 'repair_dependency_closure') {
      return !item.repairAction?.actionId || item.repairAction.enabled !== true;
    }
    if (actionId === 'agent_package_uninstall' && item.dependentGuard?.uninstallAllowed === false) return true;
    return !item.packageLockRef;
  };
  const hasCapabilityIssue = purposeCapabilities.some((item) => item.availabilityStatus !== 'ready');
  const conversationReadyCount = purposeCapabilities.filter((item) => item.codexVisibility === 'visible').length;
  const homeShortcutCount = purposeCapabilities.filter((item) => {
    const shortcut = item.packageId ? shortcutByPackageId.get(item.packageId) : null;
    return shortcut ? isOplHomeShortcutVisible(shortcut, shortcutPreferences) : false;
  }).length;

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

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='settings-page-capabilities'>
      <span data-testid='capabilities-settings-page' aria-hidden='true' />
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.capabilitiesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.capabilitiesPage.description')}</Typography.Text>
        </div>
        <div className='opl-settings-page-header__actions'>
          <Button type='primary' onClick={openAddCapability} data-testid='settings-capabilities-primary-action'>
            {t('settings.capabilitiesPage.packageManager.addCapability')}
          </Button>
        </div>
      </header>

      <div className='flex flex-col gap-14px' data-testid='settings-capabilities-primary'>
        <section
          className='opl-settings-section opl-settings-surface--configuration'
          id='source'
          data-testid='opl-developer-profile-control'
        >
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
              disabled={packageMutationBusy}
              onChange={(value) => void updateDeveloperMode(value as 'auto' | 'on' | 'off')}
              aria-label={t('settings.capabilitiesPage.developerSource.modeLabel')}
              data-testid='opl-developer-profile-mode'
            >
              <Radio value='off'>{t('settings.capabilitiesPage.developerSource.modes.managed')}</Radio>
              <Radio value='auto'>{t('settings.capabilitiesPage.developerSource.modes.auto')}</Radio>
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
                <Switch
                  size='small'
                  checked={developerSafeMaintenance}
                  loading={busyAction === 'developer_supervisor'}
                  disabled={packageMutationBusy}
                  onChange={(checked) => void updateDeveloperMaintenance(checked)}
                  data-testid='opl-developer-profile-maintenance'
                />
              </div>
            </div>
          </div>
          <div className='flex flex-wrap gap-x-18px gap-y-6px border-t border-solid border-[var(--border-base)] px-16px py-10px text-12px text-t-secondary'>
            <span>
              {t('settings.capabilitiesPage.developerSource.workspace')}:{' '}
              {developerWorkspacePath ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </span>
            {showDeveloperIdentity && (
              <span>
                {t('settings.capabilitiesPage.developerSource.identity')}: {developerIdentityLogin}
              </span>
            )}
            {showDeveloperAuthority && (
              <span>
                {t('settings.capabilitiesPage.developerSource.authority')}: {directWriteRepoCount} / {requiredRepoCount}
              </span>
            )}
          </div>
        </section>

        <section
          className='opl-settings-section opl-settings-surface--configuration'
          id='availability'
          data-testid='agent-package-catalog'
        >
          {hasCapabilityIssue && <span data-testid='settings-capabilities-exception' aria-hidden='true' />}
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
            <Typography.Text className='text-12px text-t-secondary'>
              {t('settings.capabilitiesPage.packageManager.packageCount', {
                count: purposeCapabilities.length,
                total: purposeCapabilities.length,
              })}
            </Typography.Text>
          </div>

          <div
            className='flex flex-wrap items-center gap-x-18px gap-y-6px border-t border-solid border-[var(--border-base)] px-16px py-10px text-12px text-t-secondary'
            data-testid='capability-summary-grid'
          >
            <span data-testid='capability-summary-catalog'>
              {t('settings.capabilitiesPage.packageManager.packageCount', {
                count: purposeCapabilities.length,
                total: purposeCapabilities.length,
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

          <div className='opl-settings-list'>
            {purposeCapabilities.map((item) => {
              const shortcut = item.packageId ? shortcutByPackageId.get(item.packageId) : null;
              const shortcutVisible = shortcut ? isOplHomeShortcutVisible(shortcut, shortcutPreferences) : false;
              const sourceLabel =
                capabilitySourceLabel(item, t) ?? t('settings.capabilitiesPage.detailValues.notReported');
              return (
                <div
                  className={`opl-settings-row opl-settings-capability-row ${selectedCapabilityKey === item.key ? 'bg-fill-1' : ''}`}
                  data-testid={`capability-purpose-${item.key}`}
                  data-selected={selectedCapabilityKey === item.key ? 'true' : 'false'}
                  aria-current={selectedCapabilityKey === item.key ? 'true' : undefined}
                  key={item.key}
                >
                  <div className='opl-settings-row__main flex min-w-0 items-start gap-10px'>
                    <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                      {capabilityIcon(item)}
                    </span>
                    <div className='min-w-0'>
                      <Typography.Text className='font-600 text-t-primary'>{item.title}</Typography.Text>
                      <Typography.Text className='block break-words text-13px text-t-secondary'>
                        {item.description}
                      </Typography.Text>
                    </div>
                  </div>
                  <div className='opl-settings-row__meta opl-settings-capability-meta min-w-0 gap-10px'>
                    <div className='min-w-0'>
                      <Typography.Text className='block text-11px text-t-tertiary'>
                        {t('settings.capabilitiesPage.packageManager.tableHeaders.status')}
                      </Typography.Text>
                      <Tag color={capabilityStatusColor(item.availabilityStatus)}>
                        {capabilityStatusLabel(item.availabilityStatus, t)}
                      </Tag>
                    </div>
                    <div className='min-w-0'>
                      <Typography.Text className='block text-11px text-t-tertiary'>
                        {t('settings.capabilitiesPage.packageManager.tableHeaders.source')}
                      </Typography.Text>
                      <Typography.Text className='block break-words text-12px text-t-secondary'>
                        {sourceLabel}
                      </Typography.Text>
                    </div>
                    <div className='min-w-0'>
                      <Typography.Text className='block text-11px text-t-tertiary'>
                        {t('settings.capabilitiesPage.visibility.conversation', {
                          defaultValue: 'Available in conversations',
                        })}
                      </Typography.Text>
                      <Typography.Text className='block break-words text-12px text-t-secondary'>
                        {capabilityConversationAvailabilityLabel(item, t)}
                      </Typography.Text>
                    </div>
                    <div className='min-w-0'>
                      <Typography.Text className='block text-11px text-t-tertiary'>
                        {t('settings.capabilitiesPage.visibility.home', { defaultValue: 'Show on Home' })}
                      </Typography.Text>
                      {shortcut ? (
                        <Switch
                          size='small'
                          checked={shortcutVisible}
                          loading={pendingShortcutIds.has(shortcut.shortcut_id)}
                          disabled={packageActionBusy || pendingShortcutIds.has(shortcut.shortcut_id)}
                          onChange={(checked) => updateShortcutHidden(shortcut.shortcut_id, !checked)}
                          data-testid={`agent-package-home-toggle-details-${item.key}`}
                        />
                      ) : (
                        <Typography.Text className='text-12px text-t-secondary'>
                          {t('settings.capabilitiesPage.packageManager.noHomeShortcut')}
                        </Typography.Text>
                      )}
                    </div>
                    <Button
                      size='small'
                      type={selectedCapabilityKey === item.key ? 'secondary' : 'default'}
                      aria-expanded={selectedCapabilityKey === item.key}
                      aria-controls={`capability-details-${item.key}`}
                      onClick={(event) => toggleCapabilityDetails(item.key, event.currentTarget as HTMLButtonElement)}
                      data-testid={`capability-open-details-${item.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.management')}
                    </Button>
                  </div>
                </div>
              );
            })}
            {purposeCapabilities.length === 0 && (
              <div className='opl-settings-empty' data-testid='agent-package-empty'>
                <Typography.Text className='text-t-secondary'>
                  {t('settings.capabilitiesPage.packageManager.empty')}
                </Typography.Text>
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
                      icon={<Close theme='outline' />}
                      aria-label={t('common.close', { defaultValue: 'Close' })}
                      title={t('common.close', { defaultValue: 'Close' })}
                      onClick={closeCapabilityDetails}
                      data-testid='capability-details-close'
                    />
                  </div>
                </div>

                <div className='flex flex-wrap items-start justify-between gap-10px'>
                  <Typography.Text className='break-words text-t-secondary'>
                    {selectedCapability.description}
                  </Typography.Text>
                </div>

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
                      disabled={packageMutationBusy}
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
                      onClick={() => moveShortcut(selectedShortcutId, -1)}
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
                      onClick={() => moveShortcut(selectedShortcutId, 1)}
                      data-testid={`agent-package-home-down-details-${selectedCapability.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.moveDown')}
                    </Button>
                  </Space>
                )}

                {capabilityCandidateReportRows(selectedCapability.workflowCandidateRefs, selectedCapability.key, t)}

                <div data-testid={`agent-package-lifecycle-actions-${selectedCapability.key}`}>
                  <Typography.Text className='block text-13px font-600 text-t-primary'>
                    {t('settings.capabilitiesPage.packageManager.management')}
                  </Typography.Text>
                  <Space wrap size={6} className='mt-8px'>
                    <Button
                      size='mini'
                      loading={busyAction === 'agent_package_update'}
                      disabled={
                        packageMutationBusy || packageLifecycleDisabled(selectedCapability, 'agent_package_update')
                      }
                      onClick={() => void executeLifecycleAction(selectedCapability, 'agent_package_update')}
                      data-testid={`agent-package-update-${selectedCapability.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.actions.update')}
                    </Button>
                    <Button
                      size='mini'
                      loading={busyAction === (selectedCapability.repairAction?.actionId ?? 'agent_package_repair')}
                      disabled={
                        packageMutationBusy ||
                        packageLifecycleDisabled(
                          selectedCapability,
                          selectedCapability.repairAction?.actionId ??
                            (selectedCapability.repairAction ? 'repair_dependency_closure' : 'agent_package_repair')
                        )
                      }
                      onClick={() =>
                        void executeLifecycleAction(
                          selectedCapability,
                          selectedCapability.repairAction?.actionId ??
                            (selectedCapability.repairAction ? 'repair_dependency_closure' : 'agent_package_repair')
                        )
                      }
                      data-testid={`agent-package-repair-${selectedCapability.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.actions.repair')}
                    </Button>
                    <Button
                      size='mini'
                      loading={busyAction === 'agent_package_preferences_set'}
                      disabled={
                        packageMutationBusy ||
                        !selectedCapability.packageLockRef ||
                        (selectedCapability.enabled !== false &&
                          selectedCapability.dependentGuard?.disableAllowed === false)
                      }
                      onClick={() =>
                        void executeLifecycleAction(selectedCapability, 'agent_package_preferences_set', {
                          exposure_action: selectedCapability.enabled === false ? 'enable' : 'disable',
                        })
                      }
                      data-testid={`agent-package-enabled-toggle-${selectedCapability.key}`}
                    >
                      {selectedCapability.enabled === false
                        ? t('settings.capabilitiesPage.packageManager.actions.enable')
                        : t('settings.capabilitiesPage.packageManager.actions.disable')}
                    </Button>
                    <Button
                      size='mini'
                      loading={busyAction === 'agent_package_preferences_set'}
                      disabled={packageMutationBusy || !selectedCapability.packageLockRef}
                      onClick={() =>
                        void executeLifecycleAction(selectedCapability, 'agent_package_preferences_set', {
                          exposure_action: selectedCapability.hidden === true ? 'unhide' : 'hide',
                        })
                      }
                      data-testid={`agent-package-hidden-toggle-${selectedCapability.key}`}
                    >
                      {selectedCapability.hidden === true
                        ? t('settings.capabilitiesPage.packageManager.actions.unhide')
                        : t('settings.capabilitiesPage.packageManager.actions.hide')}
                    </Button>
                    <Button
                      size='mini'
                      status='danger'
                      loading={busyAction === 'agent_package_uninstall'}
                      disabled={
                        packageMutationBusy || packageLifecycleDisabled(selectedCapability, 'agent_package_uninstall')
                      }
                      onClick={() => confirmUninstallPackage(selectedCapability)}
                      data-testid={`agent-package-uninstall-${selectedCapability.key}`}
                    >
                      {t('settings.capabilitiesPage.packageManager.actions.uninstall')}
                    </Button>
                  </Space>
                </div>

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
            data-testid='settings-capabilities-technical-details'
          >
            <span data-testid='capability-management-entry' aria-hidden='true' />
            <summary className='cursor-pointer text-12px font-500 text-t-secondary'>
              {t('settings.capabilitiesPage.packageManager.management', { defaultValue: 'Manage capabilities' })}
            </summary>
            <div className='mt-10px flex flex-col gap-10px'>
              <Space wrap size={8}>
                <Button
                  size='small'
                  icon={<Refresh theme='outline' />}
                  loading={busyAction === 'refresh_registry'}
                  disabled={packageMutationBusy}
                  onClick={() => executePackageAction('refresh_registry', { registry_url: DEFAULT_AGENT_REGISTRY_URL })}
                  data-testid='agent-package-refresh-registry'
                >
                  {t('settings.capabilitiesPage.packageManager.refreshRegistry')}
                </Button>
                <span data-testid='agent-package-add-capability' aria-hidden='true' />
              </Space>
              {advancedAddOpen && (
                <div
                  className='grid grid-cols-1 gap-8px rd-8px bg-fill-1 p-10px md:grid-cols-[minmax(0,1fr)_auto]'
                  data-testid='agent-package-advanced-add'
                >
                  <div className='md:col-span-2'>
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
                  <Button
                    size='small'
                    loading={busyAction === 'install_from_manifest_url'}
                    disabled={packageMutationBusy || !manifestUrl.trim()}
                    onClick={() =>
                      executePackageAction('install_from_manifest_url', { manifest_url: manifestUrl.trim() })
                    }
                    data-testid='agent-package-install-manifest'
                  >
                    {t('settings.capabilitiesPage.packageManager.installFromManifest')}
                  </Button>
                </div>
              )}
            </div>
          </details>
        </section>
      </div>

      <details
        className='opl-settings-details'
        id='capability-supporting-surfaces'
        open={supportingSurfaceOpen}
        onToggle={(event) => setSupportingSurfaceOpen(event.currentTarget.open)}
        data-testid='capability-supporting-surfaces'
      >
        <summary className='cursor-pointer'>
          <Typography.Text className='font-600 text-t-primary'>
            {t('settings.capabilitiesPage.supporting.compactTitle', {
              defaultValue: 'Skills and tools',
            })}
          </Typography.Text>
        </summary>
        {supportingSurfaceOpen && (
          <div className='mt-10px'>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.capabilitiesPage.supporting.description')}
            </Typography.Text>
            <Tabs
              activeTab={activeTab}
              onChange={(key) => {
                if (isCapabilitiesTab(key)) onTabChange(key);
              }}
              type='line'
              className='mt-12px flex min-h-0 flex-1 flex-col [&>.arco-tabs-content]:pt-0'
            >
              <Tabs.TabPane key='skills' title={t('settings.capabilitiesTab.skills', { defaultValue: 'Skills' })}>
                <SkillsHubSettings withWrapper={false} />
              </Tabs.TabPane>
              <Tabs.TabPane
                key='tools'
                title={t('settings.capabilitiesTab.tools', { defaultValue: 'External tools & voice' })}
              >
                <ToolsModalContent />
              </Tabs.TabPane>
            </Tabs>
          </div>
        )}
      </details>
    </div>
  );
};

const CapabilitiesSettings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CapabilitiesTab>(() => {
    const tabParam = searchParams.get('tab');
    return isCapabilitiesTab(tabParam) ? tabParam : 'skills';
  });

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'assistants' || searchParams.get('section') === 'custom-assistants') {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'skills');
      next.delete('section');
      setSearchParams(next, { replace: true });
      if (activeTab !== 'skills') setActiveTab('skills');
      return;
    }
    if (isCapabilitiesTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (key: CapabilitiesTab) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-none'>
      <CapabilitiesSettingsContent
        activeTab={activeTab}
        onTabChange={handleTabChange}
        supportingSurfaceDefaultOpen={isCapabilitiesTab(searchParams.get('tab'))}
      />
    </SettingsPageWrapper>
  );
};

export default CapabilitiesSettings;
