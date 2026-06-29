/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, Button, Card, Collapse, Message, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CheckOne, FolderSearch, Repair, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplCodexSessionContext, getOplDefaultHomeAssistants } from '@/common/config/oplProductProfile';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import {
  executeManagedUpdateMutation,
  executeManagedUpdateRead,
  useManagedUpdateMaintenance,
  type ManagedUpdateMaintenanceSnapshot,
} from '@/renderer/services/managedUpdateMaintenance';
import {
  readManagedUpdatePlane,
  type ManagedUpdateComponent,
  type ManagedUpdatePlane,
} from '@/renderer/services/managedUpdateProjection';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type RuntimeModuleItem = Record<string, unknown>;
type Translate = (key: string, options?: Record<string, string | number>) => string;

const OPL_MODULE_DISPLAY_LABELS: Record<string, string> = {
  mag: 'MAG',
  mas: 'MAS',
  medautoscience: 'MAS',
  medautogrant: 'MAG',
  oma: 'OMA',
  oplflow: 'OPL Flow',
  redcube: 'RCA',
  rca: 'RCA',
  oplmetaagent: 'OMA',
  oplbookforge: 'OBF',
};

const OPL_HOME_ASSISTANT_MODULE_IDS: Record<string, string> = {
  mas: 'medautoscience',
  mag: 'medautogrant',
  rca: 'redcube',
  bookforge: 'oplbookforge',
};

const OPL_EXPLICIT_MODULE_DEFAULTS = [{ id: 'oplmetaagent', label: 'OPL Meta Agent' }];

const MODULE_MAINTENANCE_COMPONENT_IDS = new Set(['agent_package_channel', 'capability_exposure']);
const DEVELOPER_MODULE_SOURCES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

const PROFILE_MODULE_DEFAULTS = getOplDefaultHomeAssistants()
  .map((assistant) => {
    const id = OPL_HOME_ASSISTANT_MODULE_IDS[assistant.id];
    return id ? { id, label: assistant.display_name } : null;
  })
  .filter((entry): entry is { id: string; label: string } => Boolean(entry));

const OPL_RUNTIME_MODULE_DEFAULTS = [...PROFILE_MODULE_DEFAULTS, ...OPL_EXPLICIT_MODULE_DEFAULTS];

type RuntimeSettingsProps = {
  withWrapper?: boolean;
};

type RuntimeCard = {
  key: string;
  title: string;
  value: string;
  status: string;
  detail: string;
  tone: 'green' | 'orange';
};

type HealthSummaryItem = {
  key: string;
  label: string;
  value: string;
  tone: 'green' | 'orange';
};

type MaintenanceHubItem = {
  key: string;
  title: string;
  detail: string;
  status: string;
  tone: 'green' | 'orange';
  icon: React.ReactNode;
  actionLabel: string;
  actionHelp?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction: () => void;
};

function normalizeStatus(status: string | undefined | null): string | null {
  if (!status) return null;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

function normalizeModuleId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function formatStatus(status: string | undefined | null, t: (key: string, options?: Record<string, string>) => string) {
  const normalized = normalizeStatus(status);
  if (!normalized) return t('settings.oplEnvironmentPage.status.unknown');
  return t(`settings.oplEnvironmentPage.status.${normalized}`, { status: normalized });
}

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

function formatReleaseChannel(
  channel: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  const normalized = channel?.trim() || 'stable';
  return t(`settings.runtimePage.releaseChannels.${normalized}`, { channel: normalized });
}

function localAppVersion(): string {
  return __OPL_RELEASE_VERSION__ || __APP_VERSION__;
}

function moduleId(module: RuntimeModuleItem): string {
  const id =
    oplString(module.module_id) ??
    oplString(module.id) ??
    oplString(module.name)
      ?.replace(/[^a-z0-9]/gi, '')
      .toLowerCase() ??
    '';
  return normalizeModuleId(id);
}

function moduleDisplayLabel(module: RuntimeModuleItem): string {
  const id = moduleId(module);
  return OPL_MODULE_DISPLAY_LABELS[id] ?? oplString(module.display_name) ?? oplString(module.label) ?? id;
}

function normalizeModule(module: RuntimeModuleItem): RuntimeModuleItem {
  const id = moduleId(module);
  return {
    ...module,
    module_id: id,
    label: moduleDisplayLabel(module),
  };
}

function moduleRecords(value: unknown): RuntimeModuleItem[] {
  if (Array.isArray(value)) return oplRecordList(value);
  const record = oplRecord(value);
  return Object.entries(record).map(([id, module]) => Object.assign({}, oplRecord(module), { module_id: id }));
}

function moduleStatus(module: RuntimeModuleItem): string {
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

function moduleSource(module: RuntimeModuleItem): string | null {
  const sourcePolicy = oplRecord(module.source_policy);
  return (
    oplString(module.source) ??
    oplString(module.install_origin) ??
    oplString(module.checkout_source) ??
    oplString(sourcePolicy.source) ??
    oplString(sourcePolicy.mode)
  );
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function moduleNeedsManualHandling(module: RuntimeModuleItem): boolean {
  const status = moduleStatus(module);
  const source = moduleSource(module);
  const git = oplRecord(module.git);
  return (
    status === 'dirty' ||
    status === 'manual_required' ||
    status === 'skipped_manual_required' ||
    Boolean(source && DEVELOPER_MODULE_SOURCES.has(source)) ||
    isTruthyFlag(module.manual_required) ||
    isTruthyFlag(module.checkout_dirty) ||
    isTruthyFlag(module.working_tree_dirty) ||
    isTruthyFlag(git.dirty)
  );
}

function isReadyStatus(status: string): boolean {
  return status === 'ready' || status === 'compatible' || status === 'ok' || status === 'installed';
}

function componentIsHealthy(component: ManagedUpdateComponent): boolean {
  return ['current', 'ready', 'ok', 'compatible', 'installed'].includes(component.state);
}

function componentStatusTone(component: ManagedUpdateComponent): 'green' | 'orange' {
  return componentIsHealthy(component) &&
    !component.manualRequired &&
    !component.developerCheckout &&
    !component.dirtyCheckout
    ? 'green'
    : 'orange';
}

function runtimeCardActionKey(key: string, status: string, t: Translate): string {
  if (key === 'workspace' && status !== 'ready')
    return t('settings.oplEnvironmentPage.summary.actions.chooseWorkspace');
  if (key === 'modules' && !isReadyStatus(status)) return t('settings.oplEnvironmentPage.summary.actions.checkModules');
  if (key === 'temporal' && !isReadyStatus(status))
    return t('settings.oplEnvironmentPage.summary.actions.repairRuntime');
  if (key === 'codex' && !isReadyStatus(status)) return t('settings.oplEnvironmentPage.summary.actions.runDoctor');
  return t('settings.oplEnvironmentPage.summary.actions.none');
}

function componentUserSummary(component: ManagedUpdateComponent, t: Translate): string {
  if (component.dirtyCheckout) return t('settings.oplEnvironmentPage.updates.userSummaries.dirtyCheckout');
  if (component.developerCheckout) return t('settings.oplEnvironmentPage.updates.userSummaries.developerCheckout');
  if (component.manualRequired) return t('settings.oplEnvironmentPage.updates.userSummaries.manualRequired');
  if (component.needsRestart) return t('settings.oplEnvironmentPage.updates.userSummaries.needsRestart');
  if (component.safeToApply) return t('settings.oplEnvironmentPage.updates.userSummaries.canApply');
  if (component.repairAllowed) return t('settings.oplEnvironmentPage.updates.userSummaries.canRepair');
  if (component.needsReload) return t('settings.oplEnvironmentPage.updates.userSummaries.needsReload');
  if (componentIsHealthy(component)) return t('settings.oplEnvironmentPage.updates.userSummaries.current');
  return t('settings.oplEnvironmentPage.updates.userSummaries.checkDetails');
}

function updateReadActionHelp(operation: 'status' | 'check' | 'plan', t: Translate): string {
  return t(`settings.oplEnvironmentPage.updates.actionHelp.${operation}`);
}

function updateComponentUserAction(component: ManagedUpdateComponent, t: Translate): string {
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

function findRecommendedUpdateAction(components: ManagedUpdateComponent[]): {
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

function modulePath(module: RuntimeModuleItem): string {
  return (
    oplString(module.path) ??
    oplString(module.checkout_path) ??
    oplString(module.managed_checkout_path) ??
    oplString(module.repo_url) ??
    ''
  );
}

function moduleVersionDetail(module: RuntimeModuleItem, t: (key: string, options?: Record<string, string>) => string) {
  const parts = [
    oplString(module.version),
    oplString(module.source),
    oplString(module.install_origin),
    oplString(oplRecord(module.git).short_sha),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(' · ');
  return moduleId(module) || t('settings.oplEnvironmentPage.status.unknown');
}

function modulePathSource(
  module: RuntimeModuleItem,
  familyWorkspaceRoot: string | null,
  modulesSource: string | null,
  t: (key: string, options?: Record<string, string>) => string
) {
  const source = oplString(module.source) ?? oplString(module.install_origin) ?? modulesSource ?? 'unknown';
  const modulePathValue = modulePath(module);
  if (familyWorkspaceRoot && modulePathValue.startsWith(familyWorkspaceRoot)) {
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot', {
      root: familyWorkspaceRoot,
    });
  }
  if (source === 'sibling_workspace')
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.siblingWorkspace');
  if (source === 'env_override') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.envOverride');
  if (source === 'managed_root') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.managedRoot');
  if (source === 'missing') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.missing');
  if (source === 'invalid_checkout') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.invalidCheckout');
  return t('settings.oplEnvironmentPage.moduleVersion.pathSources.unknown');
}

function formatModuleAction(action: string, t: (key: string, options?: Record<string, string>) => string) {
  return t(`settings.oplEnvironmentPage.moduleActions.${action}`, { action });
}

function moduleManualHandlingLabel(
  module: RuntimeModuleItem,
  t: (key: string, options?: Record<string, string | number>) => string
) {
  const status = moduleStatus(module);
  const source = moduleSource(module);
  const git = oplRecord(module.git);
  if (
    status === 'dirty' ||
    isTruthyFlag(module.checkout_dirty) ||
    isTruthyFlag(module.working_tree_dirty) ||
    isTruthyFlag(git.dirty)
  ) {
    return t('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.dirtyCheckout');
  }
  if (source && DEVELOPER_MODULE_SOURCES.has(source)) {
    return t('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.developerCheckout');
  }
  return t('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.manualRequired');
}

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

function AgentModuleMaintenancePanel({
  modules,
  plane,
  maintenance,
  onCheck,
  onApply,
  onRepair,
  onRollback,
  t,
}: {
  modules: RuntimeModuleItem[];
  plane: ManagedUpdatePlane;
  maintenance: ManagedUpdateMaintenanceSnapshot;
  onCheck: () => void;
  onApply: (component: ManagedUpdateComponent) => void;
  onRepair: (component: ManagedUpdateComponent) => void;
  onRollback: (component: ManagedUpdateComponent) => void;
  t: Translate;
}) {
  const checking = maintenance.running && maintenance.operation === 'check' && !maintenance.busyAction;
  const busyAction = maintenance.busyAction;
  const moduleMaintenanceComponents = plane.components.filter((component) =>
    MODULE_MAINTENANCE_COMPONENT_IDS.has(component.id)
  );
  const readyModules = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const manualModules = modules.filter(moduleNeedsManualHandling);

  return (
    <Card bordered className='rd-8px' data-testid='opl-module-maintenance'>
      <div className='flex flex-col gap-14px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.moduleMaintenance.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.moduleMaintenance.description')}
            </Typography.Text>
            <Space wrap size='mini' className='mt-8px'>
              <Tag color={readyModules === modules.length ? 'green' : 'orange'}>
                {t('settings.oplEnvironmentPage.moduleMaintenance.moduleCount', {
                  ready: readyModules,
                  total: modules.length,
                })}
              </Tag>
              {manualModules.length > 0 && (
                <Tag color='orange'>{t('settings.oplEnvironmentPage.moduleMaintenance.status.manualRequired')}</Tag>
              )}
            </Space>
          </div>
          <Button
            data-testid='opl-module-maintenance-check'
            icon={<UpdateRotation theme='outline' />}
            loading={checking}
            onClick={onCheck}
          >
            {t('settings.oplEnvironmentPage.moduleMaintenance.actions.check')}
          </Button>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-12px'>
          <div className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.moduleMaintenance.modulesTitle')}
            </Typography.Text>
            <div className='mt-10px flex flex-col divide-y divide-border-1'>
              {modules.map((module, index) => {
                const id = moduleId(module) || `module-${index + 1}`;
                const status = moduleStatus(module);
                const needsManualHandling = moduleNeedsManualHandling(module);
                return (
                  <div key={`module-maintenance-${id}`} className='py-10px min-w-0'>
                    <div className='flex items-center justify-between gap-10px'>
                      <Typography.Text className='font-600 text-t-primary break-words'>
                        {moduleDisplayLabel(module)}
                      </Typography.Text>
                      <Tag color={isReadyStatus(status) && !needsManualHandling ? 'green' : 'orange'}>
                        {formatStatus(status, t)}
                      </Tag>
                    </div>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {moduleVersionDetail(module, t)}
                    </Typography.Text>
                    {needsManualHandling && (
                      <Typography.Text className='block text-12px text-t-secondary break-words'>
                        {moduleManualHandlingLabel(module, t)}
                      </Typography.Text>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.moduleMaintenance.actionsTitle')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.moduleMaintenance.actionsDescription')}
            </Typography.Text>
            <div className='mt-10px flex flex-col gap-10px'>
              {moduleMaintenanceComponents.map((component) => {
                const manualHandling =
                  component.manualRequired || component.developerCheckout || component.dirtyCheckout;
                return (
                  <div
                    key={`module-maintenance-component-${component.id}`}
                    className='border border-solid border-border-1 rd-8px bg-fill-2 p-10px min-w-0'
                    data-testid={`opl-module-maintenance-component-${component.id}`}
                  >
                    <div className='flex items-center justify-between gap-10px'>
                      <Typography.Text className='font-600 text-t-primary break-words'>
                        {t(`settings.oplEnvironmentPage.moduleMaintenance.components.${component.id}`, {
                          defaultValue: component.label,
                        })}
                      </Typography.Text>
                      <Tag color={componentStatusTone(component)}>{formatStatus(component.state, t)}</Tag>
                    </div>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {t(`settings.oplEnvironmentPage.moduleMaintenance.componentDescriptions.${component.id}`, {
                        defaultValue: component.label,
                      })}
                    </Typography.Text>
                    {component.manualGuidance && (
                      <Typography.Text className='block text-12px text-t-secondary break-words'>
                        {component.manualGuidance}
                      </Typography.Text>
                    )}
                    {manualHandling && (
                      <Typography.Text className='block text-12px text-t-secondary break-words'>
                        {componentUserSummary(component, t)}
                      </Typography.Text>
                    )}
                    <Space wrap size='small' className='mt-8px'>
                      {!manualHandling && component.safeToApply && (
                        <Button
                          data-testid={`opl-module-maintenance-apply-${component.id}`}
                          size='small'
                          type='primary'
                          loading={busyAction === `apply:${component.id}`}
                          onClick={() => onApply(component)}
                        >
                          {t('settings.oplEnvironmentPage.moduleMaintenance.actions.apply')}
                        </Button>
                      )}
                      {!manualHandling && component.repairAllowed && (
                        <Button
                          data-testid={`opl-module-maintenance-repair-${component.id}`}
                          size='small'
                          loading={busyAction === `repair:${component.id}`}
                          onClick={() => onRepair(component)}
                        >
                          {t('settings.oplEnvironmentPage.moduleMaintenance.actions.repair')}
                        </Button>
                      )}
                      {!manualHandling && component.rollbackAllowed && (
                        <Button
                          data-testid={`opl-module-maintenance-rollback-${component.id}`}
                          size='small'
                          loading={busyAction === `rollback:${component.id}`}
                          onClick={() => onRollback(component)}
                        >
                          {t('settings.oplEnvironmentPage.moduleMaintenance.actions.rollback')}
                        </Button>
                      )}
                    </Space>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ManagedUpdatesPanel({
  plane,
  maintenance,
  activeReadOperation,
  onRefresh,
  onCheck,
  onPlan,
  onApply,
  onRepair,
  onRollback,
  t,
}: {
  plane: ManagedUpdatePlane;
  maintenance: ManagedUpdateMaintenanceSnapshot;
  activeReadOperation: 'status' | 'check' | 'plan' | null;
  onRefresh: () => void;
  onCheck: () => void;
  onPlan: () => void;
  onApply: (component: ManagedUpdateComponent) => void;
  onRepair: (component: ManagedUpdateComponent) => void;
  onRollback: (component: ManagedUpdateComponent) => void;
  t: Translate;
}) {
  const refreshLoading = activeReadOperation === 'status';
  const checkLoading = activeReadOperation === 'check';
  const planLoading = activeReadOperation === 'plan';
  const busyAction = maintenance.busyAction;
  const recommendedAction = findRecommendedUpdateAction(plane.components);
  const recommendedActionLoading =
    recommendedAction.kind === 'check'
      ? checkLoading
      : Boolean(
          recommendedAction.component && busyAction === `${recommendedAction.kind}:${recommendedAction.component.id}`
        );
  const recommendedActionDisabled =
    recommendedAction.kind === 'check'
      ? Boolean(activeReadOperation && activeReadOperation !== 'check')
      : Boolean(activeReadOperation);
  const runRecommendedAction = () => {
    if (recommendedAction.kind === 'repair' && recommendedAction.component) {
      onRepair(recommendedAction.component);
      return;
    }
    if (recommendedAction.kind === 'apply' && recommendedAction.component) {
      onApply(recommendedAction.component);
      return;
    }
    onCheck();
  };
  const showDiagnostics =
    Boolean(plane.lockStatus) ||
    Boolean(plane.operationMode) ||
    maintenance.executionStatus !== 'idle' ||
    Boolean(maintenance.lastAction) ||
    Boolean(maintenance.lastSkipReason) ||
    Boolean(maintenance.reloadGuidance);

  return (
    <Card bordered className='rd-8px' data-testid='opl-managed-updates'>
      <div className='flex flex-col gap-14px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.updates.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.updates.description')}
            </Typography.Text>
            <Space wrap size='mini' className='mt-8px'>
              {plane.updateChannel && (
                <Tag>{t('settings.oplEnvironmentPage.updates.channel', { channel: plane.updateChannel })}</Tag>
              )}
              <Tag>
                {t('settings.oplEnvironmentPage.updates.background.lastFailure', {
                  value: maintenance.lastFailure ?? t('settings.oplEnvironmentPage.updates.background.noFailure'),
                })}
              </Tag>
            </Space>
          </div>
          <Space wrap>
            <Button
              type='primary'
              data-testid='opl-managed-update-recommended-action'
              loading={recommendedActionLoading}
              disabled={recommendedActionDisabled}
              onClick={runRecommendedAction}
            >
              {recommendedAction.kind === 'repair'
                ? t('settings.oplEnvironmentPage.updates.actions.recommendedRepair')
                : recommendedAction.kind === 'apply'
                  ? t('settings.oplEnvironmentPage.updates.actions.recommendedApply')
                  : t('settings.oplEnvironmentPage.updates.actions.recommendedCheck')}
            </Button>
            <Tooltip content={updateReadActionHelp('status', t)}>
              <Button
                data-testid='opl-managed-update-refresh'
                icon={<UpdateRotation theme='outline' />}
                loading={refreshLoading}
                disabled={Boolean(activeReadOperation && activeReadOperation !== 'status')}
                onClick={onRefresh}
              >
                {t('settings.oplEnvironmentPage.updates.actions.refreshStatus')}
              </Button>
            </Tooltip>
          </Space>
        </div>

        {plane.summary && <Alert type='info' content={plane.summary} />}
        {plane.reloadGuidance && <Alert type='info' content={plane.reloadGuidance} />}

        <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
          {plane.components.map((component) => (
            <div
              key={component.id}
              className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'
              data-testid={`opl-managed-update-${component.id}`}
            >
              <div className='flex flex-col gap-10px'>
                <div className='flex items-center justify-between gap-12px'>
                  <Typography.Text className='font-600 text-t-primary break-words'>
                    {t(`settings.oplEnvironmentPage.updates.components.${component.id}`, {
                      defaultValue: component.label,
                    })}
                  </Typography.Text>
                  <Tag color={componentStatusTone(component)}>{formatStatus(component.state, t)}</Tag>
                </div>
                <Typography.Text className='text-12px text-t-secondary break-words'>
                  {componentUserSummary(component, t)}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary break-words'>
                  {t('settings.oplEnvironmentPage.updates.nextStep', {
                    action: updateComponentUserAction(component, t),
                  })}
                </Typography.Text>

                <Space wrap size='small'>
                  {component.safeToApply && (
                    <Button
                      data-testid={`opl-managed-update-apply-${component.id}`}
                      size='small'
                      type='primary'
                      loading={busyAction === `apply:${component.id}`}
                      onClick={() => onApply(component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.applySelected')}
                    </Button>
                  )}
                  {component.repairAllowed && (
                    <Button
                      data-testid={`opl-managed-update-repair-${component.id}`}
                      size='small'
                      loading={busyAction === `repair:${component.id}`}
                      onClick={() => onRepair(component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.repair')}
                    </Button>
                  )}
                  {component.rollbackAllowed && (
                    <Button
                      data-testid={`opl-managed-update-rollback-${component.id}`}
                      size='small'
                      loading={busyAction === `rollback:${component.id}`}
                      onClick={() => onRollback(component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.rollback')}
                    </Button>
                  )}
                </Space>
                {(component.conditions.length > 0 ||
                  component.receiptRef ||
                  component.repairAction ||
                  component.rollbackRef ||
                  component.reloadGuidance ||
                  component.manualGuidance) && (
                  <Collapse className='mt-2px' bordered={false}>
                    <Collapse.Item
                      header={t('settings.oplEnvironmentPage.updates.diagnostics.componentDetails')}
                      name={`component-${component.id}`}
                    >
                      <div className='flex flex-col gap-6px text-12px text-t-secondary break-words'>
                        {component.conditions.map((condition) => (
                          <div key={condition.id}>
                            <Tag size='small'>{condition.status}</Tag>
                            <span className='ml-6px font-500 text-t-primary'>{condition.type}</span>
                            {condition.reason && <span className='ml-6px'>{condition.reason}</span>}
                            {condition.message && <span className='ml-6px'>{condition.message}</span>}
                          </div>
                        ))}
                        {component.receiptRef && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.receiptRef', { ref: component.receiptRef })}
                          </span>
                        )}
                        {component.repairAction && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.repairAction', { action: component.repairAction })}
                          </span>
                        )}
                        {component.rollbackRef && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.rollbackRef', { ref: component.rollbackRef })}
                          </span>
                        )}
                        {component.needsRestart && <span>{t('settings.oplEnvironmentPage.updates.needsRestart')}</span>}
                        {component.needsReload && <span>{t('settings.oplEnvironmentPage.updates.needsReload')}</span>}
                        {component.reloadGuidance && <span>{component.reloadGuidance}</span>}
                        {component.manualGuidance && <span>{component.manualGuidance}</span>}
                      </div>
                    </Collapse.Item>
                  </Collapse>
                )}
              </div>
            </div>
          ))}
        </div>
        <Collapse bordered={false}>
          <Collapse.Item
            header={t('settings.oplEnvironmentPage.updates.advancedActions')}
            name='managed-update-advanced-actions'
          >
            <Space wrap>
              <Tooltip content={updateReadActionHelp('check', t)}>
                <Button
                  data-testid='opl-managed-update-check'
                  loading={checkLoading}
                  disabled={Boolean(activeReadOperation && activeReadOperation !== 'check')}
                  onClick={onCheck}
                >
                  {t('settings.oplEnvironmentPage.updates.actions.check')}
                </Button>
              </Tooltip>
              <Tooltip content={updateReadActionHelp('plan', t)}>
                <Button
                  data-testid='opl-managed-update-plan'
                  loading={planLoading}
                  disabled={Boolean(activeReadOperation && activeReadOperation !== 'plan')}
                  onClick={onPlan}
                >
                  {t('settings.oplEnvironmentPage.updates.actions.plan')}
                </Button>
              </Tooltip>
            </Space>
          </Collapse.Item>
        </Collapse>
        {showDiagnostics && (
          <Collapse bordered={false}>
            <Collapse.Item
              header={t('settings.oplEnvironmentPage.updates.diagnostics.title')}
              name='managed-update-diagnostics'
            >
              <div
                className='grid grid-cols-1 md:grid-cols-3 gap-8px text-12px text-t-secondary'
                data-testid='opl-managed-update-background-status'
              >
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.background.lastRunAt', {
                    value: maintenance.lastRunAt ?? t('settings.oplEnvironmentPage.status.unknown'),
                  })}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.background.nextRunAt', {
                    value: maintenance.nextRunAt ?? t('settings.oplEnvironmentPage.status.unknown'),
                  })}
                </span>
                {plane.lockStatus && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.lockStatus', { status: plane.lockStatus })}
                  </span>
                )}
                {plane.operationMode && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.operationMode', { mode: plane.operationMode })}
                  </span>
                )}
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.background.lastFailure', {
                    value: maintenance.lastFailure ?? t('settings.oplEnvironmentPage.updates.background.noFailure'),
                  })}
                </span>
                {maintenance.executionStatus !== 'idle' && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.executionStatus', {
                      status: maintenance.executionStatus,
                    })}
                  </span>
                )}
                {maintenance.lastAction && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.background.lastAction', {
                      action: maintenance.lastAction.kind,
                      componentId: maintenance.lastAction.componentId,
                      status: maintenance.lastAction.status,
                    })}
                  </span>
                )}
                {maintenance.lastSkipReason && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.background.lastSkipReason', {
                      reason: maintenance.lastSkipReason,
                    })}
                  </span>
                )}
                {maintenance.reloadGuidance && (
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.updates.background.reloadGuidance', {
                      guidance: maintenance.reloadGuidance,
                    })}
                  </span>
                )}
              </div>
            </Collapse.Item>
          </Collapse>
        )}
      </div>
    </Card>
  );
}

function RuntimeReadinessGrid({ cards, t }: { cards: RuntimeCard[]; t: Translate }) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-4 gap-14px'>
      {cards.map((card) => (
        <Card key={`runtime-card-${card.key}`} bordered className='rd-8px'>
          <div className='flex flex-col gap-8px min-w-0'>
            <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
            <Tag color={card.tone}>{card.value}</Tag>
            <Typography.Text className='text-12px text-t-secondary break-words'>
              {t(`settings.oplEnvironmentPage.summary.impacts.${card.key}`, { defaultValue: card.detail })}
            </Typography.Text>
            <Typography.Text className='text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.summary.nextAction', {
                action: runtimeCardActionKey(card.key, card.status, t),
              })}
            </Typography.Text>
          </div>
        </Card>
      ))}
    </div>
  );
}

function HealthSummary({ items }: { items: HealthSummaryItem[] }) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-4 gap-12px' data-testid='opl-runtime-health-summary'>
      {items.map((item) => (
        <Card key={`runtime-health-${item.key}`} bordered className='rd-8px'>
          <div className='flex flex-col gap-6px min-w-0'>
            <Typography.Text className='text-12px text-t-secondary'>{item.label}</Typography.Text>
            <Tag color={item.tone}>{item.value}</Tag>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MaintenanceHub({ items, t }: { items: MaintenanceHubItem[]; t: Translate }) {
  return (
    <Card bordered className='rd-8px' data-testid='opl-maintenance-hub'>
      <div className='flex flex-col gap-14px'>
        <div>
          <Typography.Text className='block font-600 text-t-primary'>
            {t('settings.oplEnvironmentPage.maintenanceHub.title')}
          </Typography.Text>
          <Typography.Text className='block text-12px text-t-secondary break-words'>
            {t('settings.oplEnvironmentPage.maintenanceHub.description')}
          </Typography.Text>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12px'>
          {items.map((item) => (
            <div
              key={`maintenance-hub-${item.key}`}
              className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'
              data-testid={`opl-maintenance-hub-${item.key}`}
            >
              <div className='flex flex-col gap-10px min-w-0'>
                <div className='flex items-start gap-10px'>
                  <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                    {item.icon}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <Typography.Text className='block font-600 text-t-primary break-words'>
                      {item.title}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {item.detail}
                    </Typography.Text>
                  </div>
                  <Tag color={item.tone}>{item.status}</Tag>
                </div>
                <Button
                  size='small'
                  title={item.actionHelp}
                  loading={item.actionLoading}
                  disabled={item.actionDisabled}
                  onClick={item.onAction}
                >
                  {item.actionLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const RuntimeSettings: React.FC<RuntimeSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const [activeReadOperation, setActiveReadOperation] = React.useState<'status' | 'check' | 'plan' | null>(null);
  const [maintenanceHubCheckTarget, setMaintenanceHubCheckTarget] = React.useState<
    'runtimeToolchain' | 'capabilityPacks' | null
  >(null);
  const appStateQuery = useOplAppState('fast');
  const managedUpdateMaintenance = useManagedUpdateMaintenance();

  React.useEffect(() => {
    messageRef.current = message;
    tRef.current = t;
  }, [message, t]);

  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const paths = oplRecord(appState.paths);
  const modulesPayload = oplRecord(appState.modules);
  const modulesSourcePayload = oplRecord(modulesPayload.source);
  const release = oplRecord(appState.release);
  const managedUpdatePlane = useMemo(
    () => readManagedUpdatePlane(managedUpdateMaintenance.result?.parsed, appState),
    [appState, managedUpdateMaintenance.result]
  );
  const familyWorkspaceRoot = oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ?? oplPathString(paths.workspace_root) ?? familyWorkspaceRoot;
  const logsRoot = oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir);
  const modulesSourceMode = oplString(modulesSourcePayload.mode) ?? oplString(modulesPayload.source);
  const modulesRoot =
    oplString(modulesSourcePayload.modules_root) ?? oplString(modulesPayload.modules_root) ?? familyWorkspaceRoot;

  const modules = useMemo(() => {
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
  }, [modulesPayload.items, modulesPayload.modules]);

  const moduleReady = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const moduleValue = t('settings.oplEnvironmentPage.modulesReadyCount', {
    ready: moduleReady,
    total: modules.length,
  });
  const codexStatus = oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : 'unknown');
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status) ?? 'unknown';
  const workspaceStatus = workspaceRoot ? 'ready' : 'unknown';
  const appVersion = localAppVersion();
  const guiVersion = __SHELL_VERSION__;
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
    managedUpdateMaintenance.lastRunAt ?? appStateQuery.loadedAt ?? t('settings.oplEnvironmentPage.status.unknown');
  const healthSummaryItems = useMemo<HealthSummaryItem[]>(
    () => [
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
    ],
    [attentionCount, componentsNeedingMaintenance, lastCheckValue, t]
  );
  const runtimeCards = useMemo<RuntimeCard[]>(
    () => [
      {
        key: 'codex',
        title: t('settings.oplEnvironmentPage.localAssistantTitle'),
        value: formatStatus(codexStatus, t),
        status: codexStatus,
        detail: t('settings.oplEnvironmentPage.summary.impacts.codex'),
        tone: codexStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'temporal',
        title: t('settings.oplEnvironmentPage.localServiceTitle'),
        value: formatStatus(temporalStatus, t),
        status: temporalStatus,
        detail: t('settings.oplEnvironmentPage.summary.impacts.temporal'),
        tone: temporalStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'workspace',
        title: t('settings.oplEnvironmentPage.workspaceRootTitle'),
        value: formatStatus(workspaceStatus, t),
        status: workspaceStatus,
        detail: t('settings.oplEnvironmentPage.summary.impacts.workspace'),
        tone: workspaceStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'modules',
        title: t('settings.oplEnvironmentPage.modulesTitle'),
        value: moduleValue,
        status: moduleReady >= modules.length ? 'ready' : 'attention_required',
        detail: t('settings.oplEnvironmentPage.summary.impacts.modules'),
        tone: moduleReady >= modules.length ? 'green' : 'orange',
      },
    ],
    [codexStatus, moduleReady, moduleValue, modules.length, t, temporalStatus, workspaceStatus]
  );

  const refreshRuntime = useCallback(() => {
    void appStateQuery.load('fast', { showRefreshing: true }).then((payload) => {
      if (payload) messageRef.current.success(t('common.refreshSuccess'));
      else messageRef.current.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
    });
  }, [appStateQuery.load, t]);

  const runManagedUpdateRead = useCallback(async (operation: 'status' | 'check' | 'plan', manual = true) => {
    if (manual) setActiveReadOperation(operation);
    try {
      const translate = tRef.current;
      const result = await executeManagedUpdateRead(operation, {
        trigger:
          operation === 'check'
            ? 'manual_check_updates'
            : operation === 'plan'
              ? 'manual_plan'
              : 'manual_refresh_status',
      });
      if (!bridgeResultSucceeded(result)) {
        messageRef.current.error(
          result?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }
      if (operation !== 'status') {
        messageRef.current.success(translate('settings.oplEnvironmentPage.updates.messages.readComplete'));
      }
    } catch {
      messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      if (manual) setActiveReadOperation(null);
    }
  }, []);

  const runMaintenanceHubCheck = useCallback(
    async (target: 'runtimeToolchain' | 'capabilityPacks') => {
      setMaintenanceHubCheckTarget(target);
      try {
        await runManagedUpdateRead('check');
      } finally {
        setMaintenanceHubCheckTarget(null);
      }
    },
    [runManagedUpdateRead]
  );

  const runManagedUpdateMutation = useCallback(
    async (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => {
      try {
        const translate = tRef.current;
        const result = await executeManagedUpdateMutation(kind, {
          componentId: component.id,
          receiptId: component.repairReceiptId,
        });
        if (!bridgeResultSucceeded(result)) {
          messageRef.current.error(
            result?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
          );
          return;
        }
        messageRef.current.success(translate('settings.oplEnvironmentPage.updates.messages.actionComplete'));
        await appStateQuery.load('fast', { showRefreshing: true });
      } catch {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    },
    [appStateQuery.load]
  );

  React.useEffect(() => {
    if (!managedUpdateMaintenance.result && !managedUpdateMaintenance.running) {
      void runManagedUpdateRead('status', false);
    }
  }, [managedUpdateMaintenance.result, managedUpdateMaintenance.running, runManagedUpdateRead]);

  const runOplCommand = useCallback(
    async (_args: string[], actionId: string, successText: string) => {
      try {
        const result =
          actionId === 'doctor'
            ? await ipcBridge.oplRuntime.getInitialize.invoke()
            : await ipcBridge.oplRuntime.runInstallPrep.invoke();
        if (bridgeResultSucceeded(result)) {
          message.success(successText);
          await appStateQuery.load('fast', { showRefreshing: true });
        } else {
          message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } catch {
        message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    },
    [appStateQuery.load, message, t]
  );

  const openLogDir = useCallback(() => {
    if (!logsRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: logsRoot, tool: 'explorer' });
  }, [logsRoot]);

  const openUpdateModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'settings-runtime' } }));
  }, []);

  const openStorageSettings = useCallback(() => {
    window.location.hash = '#/settings/storage';
  }, []);

  const codexSessionContext = useMemo(() => getOplCodexSessionContext(), []);
  const componentById = useMemo(
    () => new Map(managedUpdatePlane.components.map((component) => [component.id, component])),
    [managedUpdatePlane.components]
  );
  const appBinaryComponent = componentById.get('app_binary');
  const runtimeToolchainComponent = componentById.get('runtime_toolchain');
  const agentPackageComponent = componentById.get('agent_package_channel');
  const capabilityExposureComponent = componentById.get('capability_exposure');
  const updateReadDisabled = Boolean(activeReadOperation && activeReadOperation !== 'check');
  const maintenanceHubItems = useMemo<MaintenanceHubItem[]>(
    () => [
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
        onAction: openUpdateModal,
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
        onAction: () => void runMaintenanceHubCheck('runtimeToolchain'),
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
        tone:
          moduleReady >= modules.length &&
          (!agentPackageComponent || componentStatusTone(agentPackageComponent) === 'green') &&
          (!capabilityExposureComponent || componentStatusTone(capabilityExposureComponent) === 'green')
            ? 'green'
            : 'orange',
        icon: <Repair theme='outline' />,
        actionLabel: t('settings.oplEnvironmentPage.moduleMaintenance.actions.check'),
        actionHelp: t('settings.oplEnvironmentPage.maintenanceHub.items.capabilityPacks.actionHelp'),
        actionLoading: maintenanceHubCheckTarget === 'capabilityPacks',
        actionDisabled: updateReadDisabled,
        onAction: () => void runMaintenanceHubCheck('capabilityPacks'),
      },
      {
        key: 'storageCleanup',
        title: t('settings.oplEnvironmentPage.maintenanceHub.items.storageCleanup.title'),
        detail: t('settings.oplEnvironmentPage.maintenanceHub.items.storageCleanup.description'),
        status: t('settings.oplEnvironmentPage.maintenanceHub.status.available'),
        tone: 'green',
        icon: <FolderSearch theme='outline' />,
        actionLabel: t('settings.oplEnvironmentPage.storageData.openStorage'),
        onAction: openStorageSettings,
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
        onAction: () =>
          void runOplCommand(['install'], 'repair', t('settings.oplEnvironmentPage.messages.repairComplete')),
      },
    ],
    [
      activeReadOperation,
      agentPackageComponent,
      appBinaryComponent,
      attentionCount,
      capabilityExposureComponent,
      maintenanceHubCheckTarget,
      moduleReady,
      modules.length,
      openStorageSettings,
      openUpdateModal,
      runMaintenanceHubCheck,
      runOplCommand,
      runtimeToolchainComponent,
      t,
      updateReadDisabled,
    ]
  );

  const content = (
    <>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.runtimePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.runtimePage.description')}</Typography.Text>
        </div>

        <HealthSummary items={healthSummaryItems} />

        <MaintenanceHub items={maintenanceHubItems} t={t} />

        <Typography.Text className='font-600 text-t-primary'>
          {t('settings.oplEnvironmentPage.sections.required')}
        </Typography.Text>
        <RuntimeReadinessGrid cards={runtimeCards} t={t} />

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.oplEnvironmentPage.recommendedActions.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {t('settings.oplEnvironmentPage.recommendedActions.description')}
              </Typography.Text>
            </div>
            <Space wrap>
              <Button
                key='runtime-action-doctor'
                type='primary'
                icon={<CheckOne theme='outline' />}
                onClick={() =>
                  void runOplCommand(['doctor'], 'doctor', t('settings.oplEnvironmentPage.messages.doctorComplete'))
                }
              >
                {t('settings.oplEnvironmentPage.actions.doctor')}
              </Button>
              <Button
                key='runtime-action-refresh'
                icon={<UpdateRotation theme='outline' />}
                loading={appStateQuery.refreshing}
                onClick={refreshRuntime}
              >
                {t('settings.oplEnvironmentPage.actions.refresh')}
              </Button>
              <Button
                key='runtime-action-repair'
                icon={<Repair theme='outline' />}
                onClick={() =>
                  void runOplCommand(['install'], 'repair', t('settings.oplEnvironmentPage.messages.repairComplete'))
                }
              >
                {t('settings.oplEnvironmentPage.actions.repair')}
              </Button>
            </Space>
          </div>
        </Card>

        <Typography.Text className='font-600 text-t-primary'>
          {t('settings.oplEnvironmentPage.sections.workspace')}
        </Typography.Text>
        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.oplEnvironmentPage.workspace.rootTitle')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {workspaceRoot
                  ? t('settings.oplEnvironmentPage.workspace.currentRoot', { path: workspaceRoot })
                  : t('settings.oplEnvironmentPage.workspace.noRoot')}
              </Typography.Text>
            </div>
            <Button
              key='runtime-action-workspace'
              icon={<FolderSearch theme='outline' />}
              loading={appStateQuery.refreshing}
              onClick={refreshRuntime}
            >
              {t('settings.oplEnvironmentPage.actions.refreshWorkspace')}
            </Button>
          </div>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('common.version')}</Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {t('settings.runtimePage.versionDetail', {
                  oplVersion: appVersion,
                  guiVersion,
                  channel: formatReleaseChannel(releaseChannel, t),
                })}
              </Typography.Text>
              {releaseRepo && (
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {releaseRepo}
                </Typography.Text>
              )}
            </div>
            <Button icon={<UpdateRotation theme='outline' />} onClick={openUpdateModal}>
              {t('settings.checkForUpdates')}
            </Button>
          </div>
        </Card>

        <Typography.Text className='font-600 text-t-primary'>
          {t('settings.oplEnvironmentPage.sections.agentPackages')}
        </Typography.Text>
        <AgentModuleMaintenancePanel
          modules={modules}
          plane={managedUpdatePlane}
          maintenance={managedUpdateMaintenance}
          onCheck={() => void runManagedUpdateRead('check')}
          onApply={(component) => void runManagedUpdateMutation('apply', component)}
          onRepair={(component) => void runManagedUpdateMutation('repair', component)}
          onRollback={(component) => void runManagedUpdateMutation('rollback', component)}
          t={t}
        />

        <Typography.Text className='font-600 text-t-primary'>
          {t('settings.oplEnvironmentPage.sections.storage')}
        </Typography.Text>
        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.oplEnvironmentPage.storageData.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {t('settings.oplEnvironmentPage.storageData.description')}
              </Typography.Text>
            </div>
            <Button key='runtime-action-storage' icon={<FolderSearch theme='outline' />} onClick={openStorageSettings}>
              {t('settings.oplEnvironmentPage.storageData.openStorage')}
            </Button>
          </div>
        </Card>

        <Typography.Text className='font-600 text-t-primary'>
          {t('settings.oplEnvironmentPage.sections.maintenance')}
        </Typography.Text>
        <ManagedUpdatesPanel
          plane={managedUpdatePlane}
          maintenance={managedUpdateMaintenance}
          activeReadOperation={activeReadOperation}
          onRefresh={() => void runManagedUpdateRead('status')}
          onCheck={() => void runManagedUpdateRead('check')}
          onPlan={() => void runManagedUpdateRead('plan')}
          onApply={(component) => void runManagedUpdateMutation('apply', component)}
          onRepair={(component) => void runManagedUpdateMutation('repair', component)}
          onRollback={(component) => void runManagedUpdateMutation('rollback', component)}
          t={t}
        />

        <Card bordered className='rd-8px'>
          <Collapse bordered={false}>
            <Collapse.Item header={t('settings.oplEnvironmentPage.diagnostics.title')} name='environment-diagnostics'>
              <div className='flex flex-col gap-16px'>
                <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between' id='workspace'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>{t('settings.workDir')}</Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-all'>
                      {workspaceRoot || t('settings.dirNotConfigured')}
                    </Typography.Text>
                  </div>
                </div>

                <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>{t('settings.logDir')}</Typography.Text>
                    <Tooltip content={logsRoot || ''}>
                      <Typography.Text className='block text-12px text-t-secondary break-all'>
                        {logsRoot || t('settings.dirNotConfigured')}
                      </Typography.Text>
                    </Tooltip>
                  </div>
                  <Button icon={<FolderSearch theme='outline' />} disabled={!logsRoot} onClick={openLogDir}>
                    {t('common.open', { defaultValue: 'Open' })}
                  </Button>
                </div>

                <div className='min-w-0' id='modules'>
                  <Typography.Text className='block font-600 text-t-primary mb-8px'>
                    {t('settings.oplEnvironmentPage.diagnostics.modulesTitle')}
                  </Typography.Text>
                  <Alert type='info' content={t('settings.oplEnvironmentPage.moduleVersion.scopeDescription')} />
                  {modulesRoot ? (
                    <Typography.Text className='block text-12px text-t-secondary break-all px-0 pt-12px'>
                      {t('settings.oplEnvironmentPage.moduleVersion.modulesRoot', { path: modulesRoot })}
                    </Typography.Text>
                  ) : null}
                  <div className='flex flex-col divide-y divide-border-1'>
                    {modules.map((module, moduleIndex) => {
                      const status = moduleStatus(module);
                      const pathValue = modulePath(module);
                      const id = moduleId(module) || `module-${moduleIndex + 1}`;
                      return (
                        <div
                          key={`runtime-module-${id}`}
                          className='flex items-center justify-between gap-12px py-12px'
                        >
                          <div className='min-w-0'>
                            <Typography.Text className='block font-600 text-t-primary'>
                              {moduleDisplayLabel(module)}
                            </Typography.Text>
                            <Typography.Text className='block text-12px text-t-secondary'>
                              {moduleVersionDetail(module, t)}
                            </Typography.Text>
                            {pathValue ? (
                              <Tooltip content={pathValue}>
                                <Typography.Text className='block text-12px text-t-secondary break-all'>
                                  {t('settings.oplEnvironmentPage.moduleVersion.checkoutPath', { path: pathValue })}
                                </Typography.Text>
                              </Tooltip>
                            ) : null}
                            <Typography.Text className='block text-12px text-t-secondary'>
                              {t('settings.oplEnvironmentPage.moduleVersion.pathSource', {
                                source: modulePathSource(module, familyWorkspaceRoot, modulesSourceMode, t),
                              })}
                            </Typography.Text>
                            {oplString(module.repo_url) ? (
                              <Typography.Text className='block text-12px text-t-secondary break-all'>
                                {t('settings.oplEnvironmentPage.moduleVersion.repoUrl', {
                                  url: oplString(module.repo_url) ?? '',
                                })}
                              </Typography.Text>
                            ) : null}
                          </div>
                          <Space wrap size='mini'>
                            {oplString(module.recommended_action) && (
                              <Tag key={`${id}-action`} color='orange'>
                                {formatModuleAction(oplString(module.recommended_action) ?? '', t)}
                              </Tag>
                            )}
                            <Tag key={`${id}-status`} color={isReadyStatus(status) ? 'green' : 'orange'}>
                              {formatStatus(status, t)}
                            </Tag>
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Collapse.Item>
            <Collapse.Item header={t('settings.oplEnvironmentPage.codexContext.title')} name='codex-context'>
              <div className='flex flex-col gap-8px'>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.oplEnvironmentPage.codexContext.description')}
                </Typography.Text>
                <pre className='m-0 p-12px rd-8px bg-fill-2 text-12px text-t-primary whitespace-pre-wrap break-words max-h-280px overflow-auto'>
                  {codexSessionContext}
                </pre>
              </div>
            </Collapse.Item>
          </Collapse>
        </Card>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper contentClassName='max-w-1080px'>{content}</SettingsPageWrapper> : content;
};

export default RuntimeSettings;
