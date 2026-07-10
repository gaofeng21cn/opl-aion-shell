/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message, Modal, Space, Switch, Tag, Tabs, Typography } from '@arco-design/web-react';
import { Experiment, FilePpt, FileWord, Refresh, Robot } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SkillsHubSettings from './SkillsHubSettings';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import {
  getOplHomeShortcutPreferences,
  getOplHomeShortcutPreferencesFromAppState,
  getOplOrderedHomeAgentShortcuts,
  isOplHomeShortcutVisible,
  type OplHomeShortcutPreferences,
  moveOplHomeShortcut,
  setOplHomeShortcutHidden,
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
  formatCapabilityDisplayToken,
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

function capabilitySourceLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string | null {
  const raw = item.sourceKind ?? item.source;
  if (!raw) return null;
  const token = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (['envoverride', 'gitcheckout', 'developercheckout', 'developermode'].includes(token)) {
    return t('settings.capabilitiesPage.sourceLabels.developer');
  }
  if (['managedroot', 'managed', 'builtin', 'packaged', 'firstparty'].includes(token)) {
    return t('settings.capabilitiesPage.sourceLabels.managed');
  }
  if (['manifesturl', 'registry', 'thirdparty', 'remote'].includes(token)) {
    return t('settings.capabilitiesPage.sourceLabels.registry');
  }
  if (['local', 'manual', 'filesystem'].includes(token)) return t('settings.capabilitiesPage.sourceLabels.local');
  return raw;
}

function isCapabilityDeveloperSource(item: CapabilityPurposeViewModel): boolean {
  const sourceTokens = [item.sourceKind, item.source]
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
  const appStateQuery = useOplAppState('fast');
  const [manifestUrl, setManifestUrl] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState<string | null>(null);
  const [advancedAddOpen, setAdvancedAddOpen] = useState(false);
  const [advancedDetailsOpen, setAdvancedDetailsOpen] = useState(false);
  const [supportingSurfaceOpen, setSupportingSurfaceOpen] = useState(supportingSurfaceDefaultOpen);
  const [shortcutPreferences, setShortcutPreferences] = useState(getOplHomeShortcutPreferences);
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

  useEffect(() => {
    const appStatePreferences = getOplHomeShortcutPreferencesFromAppState(appStateQuery.appState);
    if (appStatePreferences) setShortcutPreferences(appStatePreferences);
  }, [appStateQuery.appState]);

  useEffect(() => {
    setAdvancedDetailsOpen(false);
  }, [selectedCapability?.key]);

  const executePackageAction = async (actionId: string, payloadRefsOnlyJson?: Record<string, unknown>) => {
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
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const executeLifecycleAction = (
    item: CapabilityPurposeViewModel,
    actionId: string,
    payloadRefsOnlyJson: Record<string, unknown> = {}
  ): Promise<void> => {
    if (!item.packageId) return Promise.resolve();
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

  const confirmUninstallPackage = (item: CapabilityPurposeViewModel) => {
    if (!item.packageId) return;
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
  ): Promise<void> => {
    const shortcutOrder = getOplOrderedHomeAgentShortcuts();
    const shortcut = shortcutOrder.find((entry) => entry.shortcut_id === shortcutId);
    if (!shortcut) return;
    const preferenceSortOrder = preferences.orderedShortcutIds.indexOf(shortcut.shortcut_id);
    await executePackageAction('agent_package_preferences_set', {
      package_id: shortcut.package_id,
      shortcut_id: shortcut.shortcut_id,
      visible: isOplHomeShortcutVisible(shortcut, preferences),
      sort_order:
        preferenceSortOrder >= 0
          ? preferenceSortOrder
          : shortcutOrder.findIndex((entry) => entry.shortcut_id === shortcut.shortcut_id),
    });
  };

  const updateShortcutHidden = (shortcutId: string, hidden: boolean) => {
    if (!shortcutId) return;
    const nextPreferences = setOplHomeShortcutHidden(shortcutId, hidden);
    setShortcutPreferences(nextPreferences);
    void executeShortcutPreferenceAction(shortcutId, nextPreferences);
  };

  const moveShortcut = (shortcutId: string, direction: -1 | 1) => {
    if (!shortcutId) return;
    const nextPreferences = moveOplHomeShortcut(shortcutId, direction);
    setShortcutPreferences(nextPreferences);
    void executeShortcutPreferenceAction(shortcutId, nextPreferences);
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
    return !item.packageLockRef;
  };

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='capabilities-settings-page'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.capabilitiesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.capabilitiesPage.description')}</Typography.Text>
        </div>
      </header>

      <section className='opl-settings-section' data-testid='agent-package-catalog'>
        <div className='opl-settings-section__header'>
          <div>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.capabilitiesPage.packageManager.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.capabilitiesPage.packageManager.description')}
            </Typography.Text>
          </div>
          <Typography.Text className='text-12px text-t-secondary'>
            {t('settings.capabilitiesPage.packageManager.packageCount', {
              count: purposeCapabilities.length,
              total: purposeCapabilities.length,
            })}
          </Typography.Text>
        </div>

        <div className='opl-settings-list'>
          {purposeCapabilities.map((item) => {
            const shortcut = item.packageId ? shortcutByPackageId.get(item.packageId) : null;
            const shortcutVisible = shortcut ? isOplHomeShortcutVisible(shortcut, shortcutPreferences) : false;
            const sourceLabel =
              capabilitySourceLabel(item, t) ?? t('settings.capabilitiesPage.detailValues.notReported');
            return (
              <div className='opl-settings-row' data-testid={`capability-purpose-${item.key}`} key={item.key}>
                <div className='opl-settings-row__main flex min-w-0 items-start gap-10px'>
                  <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                    {capabilityIcon(item)}
                  </span>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-baseline gap-x-8px gap-y-2px'>
                      <Typography.Text className='font-600 text-t-primary'>{item.title}</Typography.Text>
                      <Typography.Text className='text-12px text-t-tertiary'>
                        {formatCapabilityDisplayToken(item.packageId ?? item.key)}
                      </Typography.Text>
                    </div>
                    <Typography.Text className='block break-words text-13px text-t-secondary'>
                      {item.description}
                    </Typography.Text>
                  </div>
                </div>
                <div className='opl-settings-row__meta grid min-w-0 grid-cols-1 gap-10px sm:grid-cols-2 xl:grid-cols-[auto_minmax(120px,1fr)_minmax(140px,1fr)_auto_auto] xl:items-center'>
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
                    onClick={() => setSelectedCapabilityKey((current) => (current === item.key ? null : item.key))}
                    data-testid={`capability-open-details-${item.key}`}
                  >
                    {t('settings.capabilitiesPage.actions.openDetails')}
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

        {selectedCapability && (
          <div className='opl-settings-details' data-testid={`capability-details-${selectedCapability.key}`}>
            <div className='flex flex-col gap-12px'>
              <div className='flex flex-wrap items-start justify-between gap-10px'>
                <div className='min-w-0'>
                  <Typography.Text className='block break-words font-600 text-t-primary'>
                    {selectedCapability.title}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {formatCapabilityDisplayToken(selectedCapability.packageId ?? selectedCapability.key)}
                  </Typography.Text>
                </div>
                <Tag color={capabilityStatusColor(selectedCapability.availabilityStatus)}>
                  {capabilityStatusLabel(selectedCapability.availabilityStatus, t)}
                </Tag>
              </div>

              <div className='grid grid-cols-1 gap-4px text-12px'>
                <Typography.Text className='break-words text-t-secondary'>
                  {selectedCapability.description}
                </Typography.Text>
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

              {selectedHasPrimaryAction && (
                <Button
                  type='primary'
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
                    disabled={selectedShortcutIndex <= 0}
                    onClick={() => moveShortcut(selectedShortcutId, -1)}
                    data-testid={`agent-package-home-up-details-${selectedCapability.key}`}
                  >
                    {t('settings.capabilitiesPage.packageManager.moveUp')}
                  </Button>
                  <Button
                    size='mini'
                    disabled={selectedShortcutIndex < 0 || selectedShortcutIndex >= orderedShortcuts.length - 1}
                    onClick={() => moveShortcut(selectedShortcutId, 1)}
                    data-testid={`agent-package-home-down-details-${selectedCapability.key}`}
                  >
                    {t('settings.capabilitiesPage.packageManager.moveDown')}
                  </Button>
                </Space>
              )}

              {capabilityCandidateReportRows(selectedCapability.workflowCandidateRefs, selectedCapability.key, t)}

              <details data-testid={`agent-package-lifecycle-actions-${selectedCapability.key}`}>
                <summary className='cursor-pointer text-12px text-t-secondary'>
                  {t('settings.capabilitiesPage.packageManager.moreActions')}
                </summary>
                <Space wrap size={6} className='mt-8px'>
                  <Button
                    size='mini'
                    loading={busyAction === 'agent_package_update'}
                    disabled={packageLifecycleDisabled(selectedCapability, 'agent_package_update')}
                    onClick={() => void executeLifecycleAction(selectedCapability, 'agent_package_update')}
                    data-testid={`agent-package-update-${selectedCapability.key}`}
                  >
                    {t('settings.capabilitiesPage.packageManager.actions.update')}
                  </Button>
                  <Button
                    size='mini'
                    loading={busyAction === 'agent_package_repair'}
                    disabled={packageLifecycleDisabled(selectedCapability, 'agent_package_repair')}
                    onClick={() => void executeLifecycleAction(selectedCapability, 'agent_package_repair')}
                    data-testid={`agent-package-repair-${selectedCapability.key}`}
                  >
                    {t('settings.capabilitiesPage.packageManager.actions.repair')}
                  </Button>
                  <Button
                    size='mini'
                    loading={busyAction === 'agent_package_preferences_set'}
                    disabled={!selectedCapability.packageId}
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
                    disabled={!selectedCapability.packageId}
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
                    disabled={packageLifecycleDisabled(selectedCapability, 'agent_package_uninstall')}
                    onClick={() => confirmUninstallPackage(selectedCapability)}
                    data-testid={`agent-package-uninstall-${selectedCapability.key}`}
                  >
                    {t('settings.capabilitiesPage.packageManager.actions.uninstall')}
                  </Button>
                </Space>
              </details>

              <Button
                size='small'
                onClick={() => setAdvancedDetailsOpen((open) => !open)}
                data-testid={`capability-advanced-toggle-${selectedCapability.key}`}
              >
                {t('settings.advancedSettings')}
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
                          {capabilityRefGroups(selectedCapability.connectorReadinessGroups, selectedCapability.key, t)}
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
            </div>
          </div>
        )}

        <details className='opl-settings-details' data-testid='capability-management-entry'>
          <summary className='cursor-pointer text-12px font-500 text-t-secondary'>
            {t('settings.capabilitiesPage.packageManager.management', { defaultValue: 'Manage capabilities' })}
          </summary>
          <div className='mt-10px flex flex-col gap-10px'>
            <Space wrap size={8}>
              <Button
                size='small'
                icon={<Refresh theme='outline' />}
                loading={busyAction === 'refresh_registry'}
                onClick={() => executePackageAction('refresh_registry', { registry_url: DEFAULT_AGENT_REGISTRY_URL })}
                data-testid='agent-package-refresh-registry'
              >
                {t('settings.capabilitiesPage.packageManager.refreshRegistry')}
              </Button>
              <Button
                size='small'
                onClick={() => setAdvancedAddOpen((open) => !open)}
                data-testid='agent-package-add-capability'
              >
                {t('settings.capabilitiesPage.packageManager.addCapability')}
              </Button>
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
                  disabled={!manifestUrl.trim()}
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

      <section className='opl-settings-section'>
        <details
          className='opl-settings-details'
          open={supportingSurfaceOpen}
          onToggle={(event) => setSupportingSurfaceOpen(event.currentTarget.open)}
          data-testid='capability-supporting-surfaces'
        >
          <summary className='cursor-pointer'>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.capabilitiesPage.supporting.compactTitle', {
                defaultValue: 'Skills and external tools',
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
      </section>
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
