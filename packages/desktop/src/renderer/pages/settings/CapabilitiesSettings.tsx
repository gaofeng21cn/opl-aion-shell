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

import { Button, Card, Collapse, Input, Message, Space, Tag, Tabs, Typography } from '@arco-design/web-react';
import { Experiment, FilePpt, FileWord, Robot, Tool } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
} from './capabilitiesProjection';

export type CapabilitiesTab = 'skills' | 'tools';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab => value === 'skills' || value === 'tools';
const DEFAULT_AGENT_REGISTRY_URL =
  'https://raw.githubusercontent.com/gaofeng21cn/opl-agent-registry/main/registry.json';

type PackageAction = {
  key: 'update' | 'repair' | 'rollback' | 'uninstall' | 'hide' | 'show';
  actionId: string;
};

const PACKAGE_ACTIONS: PackageAction[] = [
  { key: 'update', actionId: 'agent_package_update' },
  { key: 'repair', actionId: 'agent_package_repair' },
  { key: 'rollback', actionId: 'agent_package_rollback' },
  { key: 'uninstall', actionId: 'agent_package_uninstall' },
  { key: 'hide', actionId: 'agent_package_hide' },
  { key: 'show', actionId: 'agent_package_unhide' },
];

function capabilityStatusColor(status: CapabilityStatus): 'green' | 'orange' | 'red' | 'gray' {
  if (status === 'ready') return 'green';
  if (status === 'update') return 'orange';
  if (status === 'repair') return 'red';
  return 'gray';
}

function capabilityIcon(item: CapabilityPurposeViewModel): React.ReactNode {
  if (item.key === 'mas') return <Experiment theme='outline' />;
  if (item.key === 'mag') return <FileWord theme='outline' />;
  if (item.key === 'rca') return <FilePpt theme='outline' />;
  if (item.key === 'bookforge') return <FileWord theme='outline' />;
  return <Robot theme='outline' />;
}

function capabilityActionLabel(item: CapabilityPurposeViewModel, t: (key: string) => string): string {
  if (item.status === 'missing') return t('settings.capabilitiesPage.actions.installOrSync');
  if (item.status === 'update') return t('settings.capabilitiesPage.actions.updateOrSync');
  if (item.status === 'repair') return t('settings.capabilitiesPage.actions.repair');
  return t('settings.capabilitiesPage.actions.openDetails');
}

function packageActionRef(actionId: string): string {
  return `opl app action execute --action ${actionId} --json`;
}

function capabilityDecisionActionLabel(action: CapabilityDecisionAction, t: (key: string) => string): string {
  return t(`settings.capabilitiesPage.candidateReports.actions.${action}`);
}

function capabilityDetailRows(
  item: CapabilityPurposeViewModel,
  t: (key: string, options?: Record<string, string>) => string
) {
  return [
    {
      key: 'purpose',
      label: t('settings.capabilitiesPage.detailLabels.purpose'),
      value: item.description,
    },
    {
      key: 'codexVisibility',
      label: t('settings.capabilitiesPage.detailLabels.codexVisibility'),
      value: t(`settings.capabilitiesPage.codexVisibility.${item.codexVisibility}`),
    },
    {
      key: 'packageId',
      label: t('settings.capabilitiesPage.detailLabels.packageId'),
      value: item.packageId ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'codexVisibleEntry',
      label: t('settings.capabilitiesPage.detailLabels.codexVisibleEntry'),
      value: item.codexVisibleEntry ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'defaultHomeVisible',
      label: t('settings.capabilitiesPage.detailLabels.defaultHomeVisible'),
      value:
        item.defaultHomeVisible === null
          ? t('settings.capabilitiesPage.detailValues.notReported')
          : item.defaultHomeVisible
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
    },
    {
      key: 'userConfigurable',
      label: t('settings.capabilitiesPage.detailLabels.userConfigurable'),
      value:
        item.userConfigurable === null
          ? t('settings.capabilitiesPage.detailValues.notReported')
          : item.userConfigurable
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
    },
    {
      key: 'sourceKind',
      label: t('settings.capabilitiesPage.detailLabels.sourceKind'),
      value: item.sourceKind ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'packageLockRef',
      label: t('settings.capabilitiesPage.detailLabels.packageLockRef'),
      value: item.packageLockRef ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'actionReceiptRef',
      label: t('settings.capabilitiesPage.detailLabels.actionReceiptRef'),
      value: item.actionReceiptRef ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'rollbackRef',
      label: t('settings.capabilitiesPage.detailLabels.rollbackRef'),
      value: item.rollbackRef ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'physicalSurfaceStatus',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceStatus'),
      value: item.physicalSurface?.status ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'physicalSurfaceReloadRequired',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceReloadRequired'),
      value:
        item.physicalSurface?.reloadRequired === null || item.physicalSurface?.reloadRequired === undefined
          ? t('settings.capabilitiesPage.detailValues.notReported')
          : item.physicalSurface.reloadRequired
            ? t('settings.capabilitiesPage.detailValues.yes')
            : t('settings.capabilitiesPage.detailValues.no'),
    },
    {
      key: 'physicalSurfacePluginId',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfacePluginId'),
      value: item.physicalSurface?.pluginId ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'physicalSurfaceMarketplaceId',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplaceId'),
      value: item.physicalSurface?.marketplaceId ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'physicalSurfaceCachePath',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceCachePath'),
      value: item.physicalSurface?.codexPluginCachePath ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'physicalSurfaceMarketplacePath',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplacePath'),
      value: item.physicalSurface?.marketplacePath ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'physicalSurfaceConfigPath',
      label: t('settings.capabilitiesPage.detailLabels.physicalSurfaceConfigPath'),
      value: item.physicalSurface?.codexConfigPath ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'version',
      label: t('settings.capabilitiesPage.detailLabels.version'),
      value: item.version ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'source',
      label: t('settings.capabilitiesPage.detailLabels.source'),
      value: item.source ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'lastSync',
      label: t('settings.capabilitiesPage.detailLabels.lastSync'),
      value: item.lastSync ?? t('settings.capabilitiesPage.detailValues.notReported'),
    },
    {
      key: 'failureReason',
      label: t('settings.capabilitiesPage.detailLabels.failureReason'),
      value: item.failureReason ?? t('settings.capabilitiesPage.detailValues.none'),
    },
  ];
}

const capabilityRefRows = (
  refs: CapabilityRefViewModel[],
  itemKey: string,
  t: (key: string) => string,
  testId: string
) => {
  if (refs.length === 0) {
    return (
      <Typography.Text className='block text-12px text-t-secondary'>
        {t('settings.capabilitiesPage.detailValues.notReported')}
      </Typography.Text>
    );
  }
  return (
    <div className='grid grid-cols-1 gap-8px' data-testid={testId}>
      {refs.map((ref) => (
        <div key={`${itemKey}-${ref.id}-${ref.ref}`} className='rd-8px bg-fill-1 p-8px text-12px'>
          <div className='flex flex-wrap items-center gap-6px mb-4px'>
            <Typography.Text className='font-600 text-t-primary break-words'>{ref.title}</Typography.Text>
            {ref.status && <Tag>{ref.status}</Tag>}
          </div>
          <div className='grid grid-cols-1 gap-4px'>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.id')}: {ref.id}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.ref')}: {ref.ref}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.owner')}:{' '}
              {ref.owner ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.nextAction')}:{' '}
              {ref.nextAction ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </Typography.Text>
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
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.candidateReports.purpose')}:{' '}
              {ref.purpose ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.owner')}:{' '}
              {ref.owner ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.nextAction')}:{' '}
              {ref.nextAction ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.refLabels.ref')}: {ref.ref}
            </Typography.Text>
            <Typography.Text className='text-t-secondary break-words'>
              {t('settings.capabilitiesPage.candidateReports.report')}:{' '}
              {ref.reportRef ?? t('settings.capabilitiesPage.detailValues.notReported')}
            </Typography.Text>
            <div className='flex flex-wrap items-center gap-6px'>
              <Typography.Text className='text-t-secondary'>
                {t('settings.capabilitiesPage.candidateReports.decision')}:{' '}
                {ref.decisionStatus ?? t('settings.capabilitiesPage.candidateReports.pendingDecision')}
              </Typography.Text>
              {ref.decisionActions.map((action) => (
                <Tag key={`${ref.id}-${action}`}>{capabilityDecisionActionLabel(action, t)}</Tag>
              ))}
            </div>
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
          <Typography.Text className='block text-12px font-600 text-t-primary mb-4px'>
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
  if (!action) {
    return (
      <Typography.Text className='block text-12px text-t-secondary'>
        {t('settings.capabilitiesPage.detailValues.notReported')}
      </Typography.Text>
    );
  }
  return (
    <div className='rd-8px bg-fill-1 p-8px text-12px' data-testid='capability-export-bundle-action'>
      <div className='flex flex-wrap items-center gap-6px mb-4px'>
        <Typography.Text className='font-600 text-t-primary'>
          {action.actionId ?? t('settings.capabilitiesPage.refLabels.action')}
        </Typography.Text>
        {action.status && <Tag>{action.status}</Tag>}
      </div>
      <div className='grid grid-cols-1 gap-4px'>
        <Typography.Text className='text-t-secondary break-words'>
          {t('settings.capabilitiesPage.refLabels.ref')}: {action.ref}
        </Typography.Text>
        <Typography.Text className='text-t-secondary break-words'>
          {t('settings.capabilitiesPage.refLabels.dryRun')}:{' '}
          {action.dryRunSummary ?? t('settings.capabilitiesPage.detailValues.notReported')}
        </Typography.Text>
        <Typography.Text className='text-t-secondary break-words'>
          {t('settings.capabilitiesPage.refLabels.receipt')}:{' '}
          {action.receiptSummary ?? t('settings.capabilitiesPage.detailValues.notReported')}
        </Typography.Text>
      </div>
    </div>
  );
};

type CapabilitiesSettingsContentProps = {
  activeTab: CapabilitiesTab;
  onTabChange: (tab: CapabilitiesTab) => void;
};

export const CapabilitiesSettingsContent: React.FC<CapabilitiesSettingsContentProps> = ({ activeTab, onTabChange }) => {
  const { i18n, t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [manifestUrl, setManifestUrl] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [shortcutPreferences, setShortcutPreferences] = useState(getOplHomeShortcutPreferences);
  const shortcutByPackageId = React.useMemo(
    () => new Map(getOplOrderedHomeAgentShortcuts().map((shortcut) => [shortcut.package_id, shortcut])),
    [shortcutPreferences]
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
        },
      ]),
    [appStateQuery.appState, i18n.language, t]
  );
  const hiddenShortcutIds = React.useMemo(
    () => new Set(shortcutPreferences.hiddenShortcutIds),
    [shortcutPreferences.hiddenShortcutIds]
  );

  useEffect(() => {
    const appStatePreferences = getOplHomeShortcutPreferencesFromAppState(appStateQuery.appState);
    if (appStatePreferences) setShortcutPreferences(appStatePreferences);
  }, [appStateQuery.appState]);

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
      visible: !preferences.hiddenShortcutIds.includes(shortcut.shortcut_id),
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

  return (
    <>
      <div className='flex flex-col gap-16px mb-18px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.capabilitiesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.capabilitiesPage.description')}</Typography.Text>
        </div>
        <Card bordered className='rd-8px' data-testid='agent-package-manager'>
          <div className='flex flex-col gap-10px'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.capabilitiesPage.packageManager.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.capabilitiesPage.packageManager.description')}
              </Typography.Text>
            </div>
            <div className='flex flex-wrap gap-8px'>
              <Button
                size='small'
                loading={busyAction === 'refresh_registry'}
                onClick={() => executePackageAction('refresh_registry', { registry_url: DEFAULT_AGENT_REGISTRY_URL })}
                data-testid='agent-package-refresh-registry'
              >
                {t('settings.capabilitiesPage.packageManager.refreshRegistry')}
              </Button>
              <Input
                size='small'
                className='max-w-360px min-w-220px'
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
                onClick={() => executePackageAction('install_from_manifest_url', { manifest_url: manifestUrl.trim() })}
                data-testid='agent-package-install-manifest'
              >
                {t('settings.capabilitiesPage.packageManager.installFromManifest')}
              </Button>
            </div>
          </div>
        </Card>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
          {purposeCapabilities.map((item, index) => (
            <Card key={item.key} bordered className='rd-8px' data-testid={`capability-purpose-${item.key}`}>
              <div className='flex items-start gap-12px'>
                <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  {capabilityIcon(item)}
                </span>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-8px mb-4px'>
                    <Typography.Text className='font-600 text-t-primary'>{item.title}</Typography.Text>
                    <Tag color={capabilityStatusColor(item.status)}>
                      {t(`settings.capabilitiesPage.status.${item.status}`)}
                    </Tag>
                  </div>
                  <Typography.Text className='block text-13px text-t-secondary mb-10px break-words'>
                    {item.description}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary mb-10px break-words'>
                    {t('settings.capabilitiesPage.codexVisibilitySummary', {
                      value: t(`settings.capabilitiesPage.codexVisibility.${item.codexVisibility}`),
                    })}
                  </Typography.Text>
                  <div className='flex flex-wrap gap-6px'>
                    {item.tags.map((tag) => (
                      <Tag key={`${item.key}-${tag}`} color='arcoblue'>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                  {item.packageId && (
                    <div
                      className='mt-10px flex flex-col gap-8px'
                      data-testid={`capability-package-actions-${item.key}`}
                    >
                      {shortcutByPackageId.has(item.packageId) && (
                        <Space wrap size={6}>
                          <Button
                            size='mini'
                            onClick={() =>
                              updateShortcutHidden(
                                shortcutByPackageId.get(item.packageId)?.shortcut_id ?? '',
                                !hiddenShortcutIds.has(shortcutByPackageId.get(item.packageId)?.shortcut_id ?? '')
                              )
                            }
                            data-testid={`agent-package-home-toggle-${item.key}`}
                          >
                            {hiddenShortcutIds.has(shortcutByPackageId.get(item.packageId)?.shortcut_id ?? '')
                              ? t('settings.capabilitiesPage.packageManager.showOnHome')
                              : t('settings.capabilitiesPage.packageManager.hideFromHome')}
                          </Button>
                          <Button
                            size='mini'
                            disabled={index === 0}
                            onClick={() => moveShortcut(shortcutByPackageId.get(item.packageId)?.shortcut_id ?? '', -1)}
                            data-testid={`agent-package-home-up-${item.key}`}
                          >
                            {t('settings.capabilitiesPage.packageManager.moveUp')}
                          </Button>
                          <Button
                            size='mini'
                            disabled={index === purposeCapabilities.length - 1}
                            onClick={() => moveShortcut(shortcutByPackageId.get(item.packageId)?.shortcut_id ?? '', 1)}
                            data-testid={`agent-package-home-down-${item.key}`}
                          >
                            {t('settings.capabilitiesPage.packageManager.moveDown')}
                          </Button>
                        </Space>
                      )}
                      <Space wrap size={6}>
                        {PACKAGE_ACTIONS.map((action) => (
                          <Button
                            key={`${item.key}-${action.key}`}
                            size='mini'
                            loading={busyAction === action.actionId}
                            onClick={() =>
                              executePackageAction(action.actionId, {
                                package_id: item.packageId,
                              })
                            }
                            title={packageActionRef(action.actionId)}
                            data-testid={`agent-package-action-${item.key}-${action.key}`}
                          >
                            {t(`settings.capabilitiesPage.packageManager.actions.${action.key}`)}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  )}
                  {capabilityCandidateReportRows(item.workflowCandidateRefs, item.key, t)}
                  <Collapse bordered={false} className='mt-8px'>
                    <Collapse.Item
                      header={t('settings.capabilitiesPage.detailsHeader')}
                      name={`capability-${item.key}-details`}
                    >
                      <div className='grid grid-cols-1 gap-6px text-12px'>
                        {capabilityDetailRows(item, t).map((row) => (
                          <div key={`${item.key}-${row.key}`} className='min-w-0'>
                            <Typography.Text className='text-t-secondary'>{row.label}: </Typography.Text>
                            <Typography.Text className='text-t-primary break-words'>{row.value}</Typography.Text>
                          </div>
                        ))}
                        <div className='min-w-0'>
                          <Typography.Text className='block text-t-secondary mb-4px'>
                            {t('settings.capabilitiesPage.detailLabels.connectorReadinessRefs')}
                          </Typography.Text>
                          {item.connectorReadinessGroups.length > 0 && (
                            <>
                              {capabilityRefGroups(item.connectorReadinessGroups, item.key, t)}
                              {capabilityRefRows(
                                ungroupedCapabilityRefs(item.connectorReadinessRefs, item.connectorReadinessGroups),
                                item.key,
                                t,
                                `capability-connector-refs-${item.key}`
                              )}
                            </>
                          )}
                          {item.connectorReadinessGroups.length === 0 &&
                            capabilityRefRows(
                              item.connectorReadinessRefs,
                              item.key,
                              t,
                              `capability-connector-refs-${item.key}`
                            )}
                        </div>
                        <div className='min-w-0'>
                          <Typography.Text className='block text-t-secondary mb-4px'>
                            {t('settings.capabilitiesPage.detailLabels.workflowRefs')}
                          </Typography.Text>
                          {capabilityRefRows(item.workflowRefs, item.key, t, `capability-workflow-refs-${item.key}`)}
                        </div>
                        <div className='min-w-0'>
                          <Typography.Text className='block text-t-secondary mb-4px'>
                            {t('settings.capabilitiesPage.detailLabels.resourceContextRefs')}
                          </Typography.Text>
                          {item.resourceContextGroups.length > 0 && (
                            <>
                              {capabilityRefGroups(
                                item.resourceContextGroups,
                                item.key,
                                t,
                                'settings.capabilitiesPage.resourceContextGroups'
                              )}
                              {capabilityRefRows(
                                ungroupedCapabilityRefs(item.resourceContextRefs, item.resourceContextGroups),
                                item.key,
                                t,
                                `capability-resource-context-refs-${item.key}`
                              )}
                            </>
                          )}
                          {item.resourceContextGroups.length === 0 &&
                            capabilityRefRows(
                              item.resourceContextRefs,
                              item.key,
                              t,
                              `capability-resource-context-refs-${item.key}`
                            )}
                        </div>
                        <div className='min-w-0'>
                          <Typography.Text className='block text-t-secondary mb-4px'>
                            {t('settings.capabilitiesPage.detailLabels.exportBundleAction')}
                          </Typography.Text>
                          {capabilityExportBundleAction(item.exportBundleAction, t)}
                        </div>
                      </div>
                    </Collapse.Item>
                  </Collapse>
                  <Button size='small' className='mt-10px' onClick={() => onTabChange('skills')}>
                    {capabilityActionLabel(item, t)}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
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
                <Typography.Text className='block text-12px text-t-secondary break-words mt-6px'>
                  {t('settings.capabilitiesPage.entries.externalTools.technical')}
                </Typography.Text>
                <Button size='small' className='mt-10px' onClick={() => onTabChange('tools')}>
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
                <Button size='small' className='mt-10px' onClick={() => onTabChange('skills')}>
                  {t('settings.capabilitiesTab.skills', { defaultValue: 'Skills' })}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Tabs
        activeTab={activeTab}
        onChange={(key) => {
          if (isCapabilitiesTab(key)) onTabChange(key);
        }}
        type='line'
        className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'
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
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <CapabilitiesSettingsContent activeTab={activeTab} onTabChange={handleTabChange} />
    </SettingsPageWrapper>
  );
};

export default CapabilitiesSettings;
