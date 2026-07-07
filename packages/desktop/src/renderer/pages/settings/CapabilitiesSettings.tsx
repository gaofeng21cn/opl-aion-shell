/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CapabilitiesSettings — Combined page for Skills Hub and MCP/Tools.
 *
 * This page merges the previously separate "Skills Hub" (skill packs) and
 * "Tools" (MCP servers + speech-to-text) pages into a single "Capabilities"
 * entry, accessible via /settings/capabilities.
 *
 * Old routes (/settings/skills-hub and /settings/tools) are redirected here
 * with a ?tab= query parameter to select the appropriate tab.
 */

import { Button, Card, Input, Message, Select, Space, Switch, Tag, Tabs, Typography } from '@arco-design/web-react';
import { Experiment, FilePpt, FileWord, Refresh, Robot, Search, Tool } from '@icon-park/react';
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
  type CapabilityCandidateReportViewModel,
  type CapabilityDecisionAction,
  type CapabilityPurposeViewModel,
  type CapabilityRefGroupViewModel,
  type CapabilityRefViewModel,
  type CapabilityStatus,
  formatCapabilityDisplayToken,
} from './capabilitiesProjection';

export type CapabilitiesTab = 'skills' | 'tools';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab => value === 'skills' || value === 'tools';
const DEFAULT_AGENT_REGISTRY_URL =
  'https://raw.githubusercontent.com/gaofeng21cn/opl-agent-registry/main/registry.json';

function capabilityStatusColor(status: CapabilityStatus): 'green' | 'orange' | 'red' | 'gray' | 'arcoblue' {
  if (status === 'ready') return 'green';
  if (status === 'source') return 'arcoblue';
  if (status === 'sync') return 'orange';
  if (status === 'update') return 'orange';
  if (status === 'attention') return 'gray';
  if (status === 'repair') return 'red';
  return 'gray';
}

function capabilityStatusLabel(
  status: CapabilityStatus,
  t: (key: string, options?: Record<string, string>) => string
): string {
  return t(`settings.capabilitiesPage.status.${status}`);
}

function capabilityCodexVisibilityLabel(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): string {
  return t(`settings.capabilitiesPage.codexVisibility.${item.codexVisibility}`);
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

function capabilityUserDetailRows(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
): CapabilityDetailRow[] {
  const source = capabilitySourceLabel(item, t);
  return [
    hasTextValue(item.version)
      ? {
          key: 'version',
          label: t('settings.capabilitiesPage.detailLabels.version'),
          value: item.version,
        }
      : null,
    source
      ? {
          key: 'source',
          label: t('settings.capabilitiesPage.detailLabels.source'),
          value: source,
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
      value: item.sourceKind,
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
      key: 'version',
      label: t('settings.capabilitiesPage.detailLabels.version'),
      value: item.version,
    },
    {
      key: 'source',
      label: t('settings.capabilitiesPage.detailLabels.source'),
      value: item.source,
    },
    {
      key: 'lastSync',
      label: t('settings.capabilitiesPage.detailLabels.lastSync'),
      value: item.lastSync,
    },
    {
      key: 'failureReason',
      label: t('settings.capabilitiesPage.detailLabels.failureReason'),
      value: item.failureReason,
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
          <div className='flex flex-wrap items-center gap-6px mb-4px'>
            <Typography.Text className='font-600 text-t-primary break-words'>{ref.title}</Typography.Text>
            {ref.status && <Tag>{ref.status}</Tag>}
          </div>
          <div className='grid grid-cols-1 gap-4px'>
            {options.showTechnicalRef && (
              <>
                <Typography.Text className='text-t-secondary break-words'>
                  {t('settings.capabilitiesPage.refLabels.id')}: {ref.id}
                </Typography.Text>
                <Typography.Text className='text-t-secondary break-words'>
                  {t('settings.capabilitiesPage.refLabels.ref')}: {ref.ref}
                </Typography.Text>
              </>
            )}
            {ref.owner && (
              <Typography.Text className='text-t-secondary break-words'>
                {t('settings.capabilitiesPage.refLabels.owner')}: {ref.owner}
              </Typography.Text>
            )}
            {ref.nextAction && (
              <Typography.Text className='text-t-secondary break-words'>
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
    <div className='mt-10px grid grid-cols-1 gap-8px' data-testid={`capability-candidate-reports-${itemKey}`}>
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
          <div className='flex flex-wrap items-center gap-6px mb-4px'>
            <Typography.Text className='font-600 text-t-primary break-words'>{ref.title}</Typography.Text>
            {ref.status && <Tag>{ref.status}</Tag>}
          </div>
          <div className='grid grid-cols-1 gap-4px'>
            {ref.purpose && (
              <Typography.Text className='text-t-secondary break-words'>
                {t('settings.capabilitiesPage.candidateReports.purpose')}: {ref.purpose}
              </Typography.Text>
            )}
            {ref.owner && (
              <Typography.Text className='text-t-secondary break-words'>
                {t('settings.capabilitiesPage.refLabels.owner')}: {ref.owner}
              </Typography.Text>
            )}
            {ref.nextAction && (
              <Typography.Text className='text-t-secondary break-words'>
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
  labelPrefix = 'settings.capabilitiesPage.connectorGroups',
  options: { showTechnicalRef?: boolean } = {}
) => {
  if (groups.length === 0) return null;
  return (
    <div className='grid grid-cols-1 gap-8px'>
      {groups.map((group) => (
        <div key={`${itemKey}-${group.key}`} data-testid={`capability-connector-group-${itemKey}-${group.key}`}>
          <Typography.Text className='block text-12px font-600 text-t-primary mb-4px'>
            {t(`${labelPrefix}.${group.key}`)}
          </Typography.Text>
          {capabilityRefRows(
            group.refs,
            `${itemKey}-${group.key}`,
            t,
            `capability-connector-refs-${itemKey}-${group.key}`,
            options
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
      <div className='flex flex-wrap items-center gap-6px mb-4px'>
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
  const [packageQuery, setPackageQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CapabilityStatus | 'all'>('all');
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
  const filteredCapabilities = React.useMemo(() => {
    const query = packageQuery.trim().toLowerCase();
    return purposeCapabilities.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        item.title,
        item.description,
        item.packageId,
        item.codexVisibleEntry,
        item.source,
        item.sourceKind,
        ...item.tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [packageQuery, purposeCapabilities, statusFilter]);
  const selectedCapability = React.useMemo(
    () => filteredCapabilities.find((item) => item.key === selectedCapabilityKey) ?? filteredCapabilities[0] ?? null,
    [filteredCapabilities, selectedCapabilityKey]
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

  useEffect(() => {
    const appStatePreferences = getOplHomeShortcutPreferencesFromAppState(appStateQuery.appState);
    if (appStatePreferences) setShortcutPreferences(appStatePreferences);
  }, [appStateQuery.appState]);

  useEffect(() => {
    if (!selectedCapability && selectedCapabilityKey) setSelectedCapabilityKey(null);
    if (!selectedCapabilityKey && filteredCapabilities[0]) setSelectedCapabilityKey(filteredCapabilities[0].key);
  }, [filteredCapabilities, selectedCapability, selectedCapabilityKey]);

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

  const executeShortcutPreferenceAction = async (
    shortcutId: string,
    preferences: OplHomeShortcutPreferences
  ): Promise<void> => {
    const shortcutOrder = getOplOrderedHomeAgentShortcuts();
    const shortcut = shortcutOrder.find((entry) => entry.shortcut_id === shortcutId);
    if (!shortcut) return;
    const preferenceSortOrder = preferences.orderedShortcutIds.indexOf(shortcut.shortcut_id);
    await executePackageAction('agent_package_home_shortcut_preferences_set', {
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

  const openSupportingSurface = (tab: CapabilitiesTab) => {
    setSupportingSurfaceOpen(true);
    onTabChange(tab);
  };

  const runCapabilityPrimaryAction = (item: CapabilityPurposeViewModel) => {
    if (item.primaryAction === 'maintenance') {
      navigate('/settings/environment');
      return;
    }
    setSelectedCapabilityKey(item.key);
    if (item.primaryAction === 'configure') setAdvancedDetailsOpen(true);
  };

  return (
    <>
      <div className='flex flex-col gap-16px mb-18px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.capabilitiesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.capabilitiesPage.description')}</Typography.Text>
        </div>
        <Card bordered className='rd-8px' data-testid='agent-package-catalog'>
          <div className='flex flex-col gap-12px'>
            <div className='flex flex-col gap-10px lg:flex-row lg:items-end lg:justify-between'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.capabilitiesPage.packageManager.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.capabilitiesPage.packageManager.description')}
                </Typography.Text>
              </div>
              <div className='flex flex-wrap items-center gap-8px' data-testid='capability-directory-controls'>
                <Input
                  size='small'
                  className='max-w-300px min-w-220px'
                  value={packageQuery}
                  onChange={setPackageQuery}
                  allowClear
                  prefix={<Search theme='outline' />}
                  placeholder={t('settings.capabilitiesPage.packageManager.searchPlaceholder')}
                  data-testid='agent-package-search'
                />
                <Select
                  size='small'
                  className='w-160px'
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as CapabilityStatus | 'all')}
                  data-testid='agent-package-status-filter'
                >
                  <Select.Option value='all'>{t('settings.capabilitiesPage.packageManager.allStatuses')}</Select.Option>
                  {(['ready', 'update', 'sync', 'source', 'attention', 'repair', 'missing'] as CapabilityStatus[]).map(
                    (status) => (
                      <Select.Option key={status} value={status}>
                        {capabilityStatusLabel(status, t)}
                      </Select.Option>
                    )
                  )}
                </Select>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.capabilitiesPage.packageManager.packageCount', {
                    count: filteredCapabilities.length,
                    total: purposeCapabilities.length,
                  })}
                </Typography.Text>
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
                  type='primary'
                  onClick={() => setAdvancedAddOpen((open) => !open)}
                  data-testid='agent-package-add-capability'
                >
                  {t('settings.capabilitiesPage.packageManager.addCapability')}
                </Button>
              </div>
            </div>
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
                  type='primary'
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
          <div className='flex flex-col gap-12px xl:flex-row'>
            <div className='min-w-0 flex-1'>
              <div className='w-full border border-solid border-[var(--color-border-2)] rd-8px overflow-hidden'>
                <div
                  className='grid items-center gap-8px border-0 border-b border-solid border-[var(--color-border-2)] bg-fill-1 px-10px py-8px text-12px text-t-secondary'
                  style={{
                    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(56px, 0.55fr) minmax(112px, 0.75fr)',
                  }}
                >
                  <span>{t('settings.capabilitiesPage.packageManager.tableHeaders.package')}</span>
                  <span>{t('settings.capabilitiesPage.packageManager.tableHeaders.purpose')}</span>
                  <span>{t('settings.capabilitiesPage.packageManager.tableHeaders.status')}</span>
                </div>
                <div className='grid grid-cols-1 gap-0'>
                  {filteredCapabilities.map((item) => {
                    const isSelected = selectedCapability?.key === item.key;
                    return (
                      <div
                        key={item.key}
                        className={`grid cursor-pointer items-center gap-8px border-0 border-b border-solid border-[var(--color-border-2)] px-8px py-8px last:border-b-0 ${
                          isSelected ? 'bg-[rgb(var(--primary-1))]' : 'bg-[var(--color-bg-1)]'
                        }`}
                        style={{
                          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(56px, 0.55fr) minmax(112px, 0.75fr)',
                        }}
                        data-testid={`capability-purpose-${item.key}`}
                        onClick={() => setSelectedCapabilityKey(item.key)}
                      >
                        <div className='flex min-w-0 items-center gap-8px'>
                          <span className='flex h-24px w-24px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                            {capabilityIcon(item)}
                          </span>
                          <div className='min-w-0 flex-1'>
                            <Typography.Text className='block truncate font-600 text-t-primary'>
                              {item.title}
                            </Typography.Text>
                            <Typography.Text className='block truncate text-12px text-t-secondary'>
                              {formatCapabilityDisplayToken(item.packageId ?? item.key)}
                            </Typography.Text>
                          </div>
                        </div>
                        <div className='min-w-0'>
                          <Typography.Text className='block truncate text-t-primary'>
                            {item.description}
                          </Typography.Text>
                        </div>
                        <div className='min-w-0'>
                          <Tag color={capabilityStatusColor(item.status)}>{capabilityStatusLabel(item.status, t)}</Tag>
                          <Typography.Text className='mt-4px block truncate text-12px text-t-secondary'>
                            {capabilityCodexVisibilityLabel(item, t)}
                          </Typography.Text>
                        </div>
                      </div>
                    );
                  })}
                  {filteredCapabilities.length === 0 && (
                    <div className='p-18px text-center' data-testid='agent-package-empty'>
                      <Typography.Text className='text-t-secondary'>
                        {t('settings.capabilitiesPage.packageManager.empty')}
                      </Typography.Text>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {selectedCapability && (
              <aside
                className='w-full shrink-0 xl:w-380px rd-8px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-1)] p-12px'
                data-testid={`capability-details-${selectedCapability.key}`}
              >
                <div className='flex items-start justify-between gap-10px mb-10px'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary break-words'>
                      {selectedCapability.title}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {formatCapabilityDisplayToken(selectedCapability.packageId ?? selectedCapability.key)}
                    </Typography.Text>
                  </div>
                  <Tag color={capabilityStatusColor(selectedCapability.status)}>
                    {capabilityStatusLabel(selectedCapability.status, t)}
                  </Tag>
                </div>
                <div className='grid grid-cols-1 gap-10px'>
                  <Button
                    type='primary'
                    onClick={() => runCapabilityPrimaryAction(selectedCapability)}
                    data-testid={`capability-primary-action-${selectedCapability.key}`}
                  >
                    {capabilityActionLabel(selectedCapability, t)}
                  </Button>
                  <div className='grid grid-cols-1 gap-4px text-12px'>
                    <Typography.Text className='text-t-secondary break-words'>
                      {selectedCapability.description}
                    </Typography.Text>
                    <Typography.Text className='text-t-secondary break-words'>
                      {t('settings.capabilitiesPage.detailLabels.codexVisibility')}:{' '}
                      {capabilityCodexVisibilityLabel(selectedCapability, t)}
                    </Typography.Text>
                    <Typography.Text className='text-t-secondary break-words'>
                      {t('settings.capabilitiesPage.packageManager.tableHeaders.home')}: {selectedHomeLabel}
                    </Typography.Text>
                    {selectedUserDetailRows.map((row) => (
                      <Typography.Text
                        key={`${selectedCapability.key}-${row.key}`}
                        className='text-t-secondary break-words'
                      >
                        {row.label}: {row.value}
                      </Typography.Text>
                    ))}
                  </div>
                  {selectedShortcut && (
                    <Space wrap size={6}>
                      <Switch
                        size='small'
                        checked={isOplHomeShortcutVisible(selectedShortcut, shortcutPreferences)}
                        onChange={(checked) => updateShortcutHidden(selectedShortcutId, !checked)}
                        data-testid={`agent-package-home-toggle-details-${selectedCapability.key}`}
                      />
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
                  {selectedHasSupportingContext && (
                    <div
                      className='grid grid-cols-1 gap-10px'
                      data-testid={`capability-support-context-${selectedCapability.key}`}
                    >
                      {selectedCapability.connectorReadinessRefs.length > 0 && (
                        <div className='min-w-0'>
                          <Typography.Text className='block text-t-secondary mb-4px'>
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
                          <Typography.Text className='block text-t-secondary mb-4px'>
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
                          <Typography.Text className='block text-t-secondary mb-4px'>
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
                          <Typography.Text className='block text-t-secondary mb-4px'>
                            {t('settings.capabilitiesPage.detailLabels.exportBundleAction')}
                          </Typography.Text>
                          {capabilityExportBundleAction(selectedCapability.exportBundleAction, t)}
                        </div>
                      )}
                    </div>
                  )}
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
                      <div className='grid grid-cols-1 gap-6px text-12px'>
                        {selectedDiagnosticRows.map((row) => (
                          <div key={`${selectedCapability.key}-${row.key}`} className='min-w-0'>
                            <Typography.Text className='text-t-secondary'>{row.label}: </Typography.Text>
                            <Typography.Text className='text-t-primary break-words'>{row.value}</Typography.Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        </Card>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
          <Card bordered className='rd-8px' data-testid='capability-entry-external-tools'>
            <div className='flex items-start gap-12px'>
              <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                <Tool theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.capabilitiesPage.entries.externalTools.title')}
                </Typography.Text>
                <Typography.Text className='block text-13px text-t-secondary break-words'>
                  {t('settings.capabilitiesPage.entries.externalTools.description')}
                </Typography.Text>
                <Button size='small' className='mt-10px' onClick={() => openSupportingSurface('tools')}>
                  {t('settings.capabilitiesTab.tools', { defaultValue: 'External tools & voice' })}
                </Button>
              </div>
            </div>
          </Card>
          <Card bordered className='rd-8px' data-testid='capability-entry-custom-assistants'>
            <div className='flex items-start gap-12px'>
              <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                <Robot theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.capabilitiesPage.entries.customAssistants.title')}
                </Typography.Text>
                <Typography.Text className='block text-13px text-t-secondary break-words'>
                  {t('settings.capabilitiesPage.entries.customAssistants.description')}
                </Typography.Text>
                <Button size='small' className='mt-10px' onClick={() => openSupportingSurface('skills')}>
                  {t('settings.capabilitiesTab.skills', { defaultValue: 'Skills' })}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Card bordered className='rd-8px' data-testid='capability-supporting-surfaces'>
        <div className='flex flex-wrap items-center justify-between gap-10px'>
          <div>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.capabilitiesPage.supporting.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.capabilitiesPage.supporting.description')}
            </Typography.Text>
          </div>
          <Space wrap size={8}>
            <Button size='small' onClick={() => openSupportingSurface('skills')} data-testid='open-skills-support'>
              {t('settings.capabilitiesTab.skills', { defaultValue: 'Skills' })}
            </Button>
            <Button size='small' onClick={() => openSupportingSurface('tools')} data-testid='open-tools-support'>
              {t('settings.capabilitiesTab.tools', { defaultValue: 'External tools & voice' })}
            </Button>
          </Space>
        </div>
        {supportingSurfaceOpen && (
          <Tabs
            activeTab={activeTab}
            onChange={(key) => {
              if (isCapabilitiesTab(key)) onTabChange(key);
            }}
            type='line'
            className='mt-12px flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'
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
        )}
      </Card>
    </>
  );
};

const CapabilitiesSettings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Initialize from URL synchronously to avoid a flash of the default tab.
  const [activeTab, setActiveTab] = useState<CapabilitiesTab>(() => {
    const tabParam = searchParams.get('tab');
    return isCapabilitiesTab(tabParam) ? tabParam : 'skills';
  });

  // Re-sync if the URL changes externally (e.g. browser back/forward).
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (isCapabilitiesTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (key: CapabilitiesTab) => {
    setActiveTab(key);
    // Preserve any other query params the embedded content may rely on.
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
