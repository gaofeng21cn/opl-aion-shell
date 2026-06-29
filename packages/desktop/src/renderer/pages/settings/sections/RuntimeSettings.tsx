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
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
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
import {
  formatModuleAction,
  formatStatus,
  isReadyStatus,
  moduleDisplayLabel,
  moduleId,
  moduleManualHandlingLabel,
  moduleNeedsManualHandling,
  modulePath,
  modulePathSource,
  moduleRecords,
  moduleStatus,
  moduleVersionDetail,
  normalizeModule,
  oplPathString,
  type RuntimeModuleItem,
  type Translate,
} from './runtimeStateView';
import {
  RuntimeHealthSummary,
  RuntimeMaintenanceHub,
  RuntimeReadinessGrid,
  type RuntimeHealthSummaryItem,
  type RuntimeMaintenanceHubItem,
  type RuntimeMaintenanceHubPrimaryAction,
  type RuntimeReadinessCard,
} from './RuntimeSettingsPanels';

const OPL_HOME_ASSISTANT_MODULE_IDS: Record<string, string> = {
  mas: 'medautoscience',
  mag: 'medautogrant',
  rca: 'redcube',
  bookforge: 'oplbookforge',
};

const OPL_EXPLICIT_MODULE_DEFAULTS = [{ id: 'oplmetaagent', label: 'OPL Meta Agent' }];

const MODULE_MAINTENANCE_COMPONENT_IDS = new Set(['agent_package_channel', 'capability_exposure']);
const MAKE_USABLE_COMPONENT_IDS = new Set(['runtime_toolchain', 'agent_package_channel', 'capability_exposure']);

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

type PendingUpdateAction = {
  kind: 'apply' | 'repair' | 'rollback';
  component: ManagedUpdateComponent;
  source: 'managed-updates' | 'module-maintenance';
} | null;

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

function mutationKindLabel(kind: 'apply' | 'repair' | 'rollback' | 'auto_apply', t: Translate): string {
  if (kind === 'repair') return t('settings.oplEnvironmentPage.updates.actions.repair');
  if (kind === 'rollback') return t('settings.oplEnvironmentPage.updates.actions.rollback');
  if (kind === 'auto_apply') return t('settings.oplEnvironmentPage.updates.actions.autoApply');
  return t('settings.oplEnvironmentPage.updates.actions.applySelected');
}

function mutationWillChange(kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent, t: Translate): string {
  if (kind === 'repair') return t('settings.oplEnvironmentPage.updates.confirmation.willRepair');
  if (kind === 'rollback') {
    return component.rollbackRef
      ? t('settings.oplEnvironmentPage.updates.confirmation.willRollbackTo', { ref: component.rollbackRef })
      : t('settings.oplEnvironmentPage.updates.confirmation.willRollback');
  }
  return t('settings.oplEnvironmentPage.updates.confirmation.willApply');
}

function mutationWillNotChange(kind: 'apply' | 'repair' | 'rollback', t: Translate): string {
  if (kind === 'rollback') return t('settings.oplEnvironmentPage.updates.confirmation.willNotRollback');
  return t('settings.oplEnvironmentPage.updates.confirmation.willNotApplyUnsafe');
}

function rollbackOrReceiptText(component: ManagedUpdateComponent, t: Translate): string {
  if (component.rollbackRef) {
    return t('settings.oplEnvironmentPage.updates.confirmation.rollbackRef', { ref: component.rollbackRef });
  }
  if (component.repairReceiptId ?? component.receiptRef) {
    return t('settings.oplEnvironmentPage.updates.confirmation.receiptRef', {
      ref: component.repairReceiptId ?? component.receiptRef ?? '',
    });
  }
  return t('settings.oplEnvironmentPage.updates.confirmation.noReceiptYet');
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

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

function chooseMakeUsableAction(component: ManagedUpdateComponent): 'repair' | 'apply' | null {
  if (!MAKE_USABLE_COMPONENT_IDS.has(component.id)) return null;
  if (component.manualRequired || component.developerCheckout || component.dirtyCheckout) return null;
  if (component.repairAllowed) return 'repair';
  if (component.safeToApply && !component.needsRestart) return 'apply';
  return null;
}

function AgentModuleMaintenancePanel({
  modules,
  plane,
  maintenance,
  onCheck,
  pendingAction,
  onRequestAction,
  onCancelAction,
  onConfirmAction,
  t,
}: {
  modules: RuntimeModuleItem[];
  plane: ManagedUpdatePlane;
  maintenance: ManagedUpdateMaintenanceSnapshot;
  onCheck: () => void;
  pendingAction: PendingUpdateAction;
  onRequestAction: (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
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

        {pendingAction && pendingAction.source === 'module-maintenance' && (
          <Alert
            type={pendingAction.kind === 'apply' ? 'warning' : 'info'}
            data-testid='opl-module-maintenance-confirmation'
            title={t('settings.updateConfirm')}
            content={
              <div className='flex flex-col gap-8px'>
                <span className='break-words'>
                  {mutationKindLabel(pendingAction.kind, t)} · {pendingAction.component.label}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.confirmation.willChange', {
                    detail: mutationWillChange(pendingAction.kind, pendingAction.component, t),
                  })}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.confirmation.willNotChange', {
                    detail: mutationWillNotChange(pendingAction.kind, t),
                  })}
                </span>
                <span className='break-words'>
                  {rollbackOrReceiptText(pendingAction.component, t)}
                </span>
                <Space wrap size='small'>
                  <Button size='small' onClick={onCancelAction}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size='small'
                    type='primary'
                    status={pendingAction.kind === 'rollback' ? 'danger' : undefined}
                    loading={busyAction === `${pendingAction.kind}:${pendingAction.component.id}`}
                    onClick={onConfirmAction}
                  >
                    {pendingAction.kind === 'repair'
                      ? t('settings.oplEnvironmentPage.moduleMaintenance.actions.repair')
                      : pendingAction.kind === 'rollback'
                        ? t('settings.oplEnvironmentPage.moduleMaintenance.actions.rollback')
                        : t('settings.oplEnvironmentPage.moduleMaintenance.actions.apply')}
                  </Button>
                </Space>
              </div>
            }
          />
        )}

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
                          onClick={() => onRequestAction('apply', component)}
                        >
                          {t('settings.oplEnvironmentPage.moduleMaintenance.actions.apply')}
                        </Button>
                      )}
                      {!manualHandling && component.repairAllowed && (
                        <Button
                          data-testid={`opl-module-maintenance-repair-${component.id}`}
                          size='small'
                          loading={busyAction === `repair:${component.id}`}
                          onClick={() => onRequestAction('repair', component)}
                        >
                          {t('settings.oplEnvironmentPage.moduleMaintenance.actions.repair')}
                        </Button>
                      )}
                      {!manualHandling && component.rollbackAllowed && (
                        <Button
                          data-testid={`opl-module-maintenance-rollback-${component.id}`}
                          size='small'
                          loading={busyAction === `rollback:${component.id}`}
                          onClick={() => onRequestAction('rollback', component)}
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

function PostUpdateNotice({
  maintenance,
  plane,
  t,
}: {
  maintenance: ManagedUpdateMaintenanceSnapshot;
  plane: ManagedUpdatePlane;
  t: Translate;
}) {
  const action = maintenance.lastAction;
  if (!action) return null;

  const component = plane.components.find((entry) => entry.id === action.componentId);
  const componentLabel = component
    ? t(`settings.oplEnvironmentPage.updates.components.${component.id}`, { defaultValue: component.label })
    : action.componentId;
  const reloadGuidance = action.reloadGuidance ?? maintenance.reloadGuidance ?? component?.reloadGuidance;
  const receiptRef = action.receiptRef ?? component?.receiptRef ?? component?.repairReceiptId;
  const statusKey =
    action.status === 'failed'
      ? 'settings.oplEnvironmentPage.updates.postAction.failed'
      : action.status === 'skipped'
        ? 'settings.oplEnvironmentPage.updates.postAction.skipped'
        : 'settings.oplEnvironmentPage.updates.postAction.completed';

  return (
    <Alert
      type={action.status === 'failed' ? 'error' : 'info'}
      data-testid='opl-managed-update-post-action-notice'
      title={t('settings.oplEnvironmentPage.updates.postAction.title')}
      content={
        <div className='flex flex-col gap-6px'>
          <span className='break-words'>
            {t(statusKey, {
              action: mutationKindLabel(action.kind, t),
              component: componentLabel,
            })}
          </span>
          {receiptRef && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.receiptRef', { ref: receiptRef })}
            </span>
          )}
          {maintenance.nextRunAt && (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.nextCheck', { value: maintenance.nextRunAt })}
            </span>
          )}
          {reloadGuidance ? (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.reloadGuidance', { guidance: reloadGuidance })}
            </span>
          ) : (
            <span className='break-words'>
              {t('settings.oplEnvironmentPage.updates.postAction.noReloadGuidance')}
            </span>
          )}
        </div>
      }
    />
  );
}

function ManagedUpdatesPanel({
  plane,
  maintenance,
  activeReadOperation,
  pendingAction,
  onRefresh,
  onCheck,
  onPlan,
  onRequestAction,
  onCancelAction,
  onConfirmAction,
  t,
}: {
  plane: ManagedUpdatePlane;
  maintenance: ManagedUpdateMaintenanceSnapshot;
  activeReadOperation: 'status' | 'check' | 'plan' | null;
  pendingAction: PendingUpdateAction;
  onRefresh: () => void;
  onCheck: () => void;
  onPlan: () => void;
  onRequestAction: (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
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
      onRequestAction('repair', recommendedAction.component);
      return;
    }
    if (recommendedAction.kind === 'apply' && recommendedAction.component) {
      onRequestAction('apply', recommendedAction.component);
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

        <PostUpdateNotice maintenance={maintenance} plane={plane} t={t} />

        {plane.summary && <Alert type='info' content={plane.summary} />}
        {plane.reloadGuidance && <Alert type='info' content={plane.reloadGuidance} />}

        {pendingAction && pendingAction.source === 'managed-updates' && (
          <Alert
            type={pendingAction.kind === 'apply' ? 'warning' : 'info'}
            data-testid='opl-managed-update-confirmation'
            title={t('settings.updateConfirm')}
            content={
              <div className='flex flex-col gap-8px'>
                <span className='break-words'>
                  {mutationKindLabel(pendingAction.kind, t)} · {pendingAction.component.label}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.confirmation.willChange', {
                    detail: mutationWillChange(pendingAction.kind, pendingAction.component, t),
                  })}
                </span>
                <span className='break-words'>
                  {t('settings.oplEnvironmentPage.updates.confirmation.willNotChange', {
                    detail: mutationWillNotChange(pendingAction.kind, t),
                  })}
                </span>
                <span className='break-words'>
                  {rollbackOrReceiptText(pendingAction.component, t)}
                </span>
                <Space wrap size='small'>
                  <Button size='small' onClick={onCancelAction}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size='small'
                    type='primary'
                    status={pendingAction.kind === 'rollback' ? 'danger' : undefined}
                    loading={busyAction === `${pendingAction.kind}:${pendingAction.component.id}`}
                    onClick={onConfirmAction}
                  >
                    {pendingAction.kind === 'repair'
                      ? t('settings.oplEnvironmentPage.updates.actions.repair')
                      : pendingAction.kind === 'rollback'
                        ? t('settings.oplEnvironmentPage.updates.actions.rollback')
                        : t('settings.oplEnvironmentPage.updates.actions.applySelected')}
                  </Button>
                </Space>
              </div>
            }
          />
        )}

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
                      onClick={() => onRequestAction('apply', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.applySelected')}
                    </Button>
                  )}
                  {component.repairAllowed && (
                    <Button
                      data-testid={`opl-managed-update-repair-${component.id}`}
                      size='small'
                      loading={busyAction === `repair:${component.id}`}
                      onClick={() => onRequestAction('repair', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.repair')}
                    </Button>
                  )}
                  {component.rollbackAllowed && (
                    <Button
                      data-testid={`opl-managed-update-rollback-${component.id}`}
                      size='small'
                      loading={busyAction === `rollback:${component.id}`}
                      onClick={() => onRequestAction('rollback', component)}
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

const RuntimeSettings: React.FC<RuntimeSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const [activeReadOperation, setActiveReadOperation] = React.useState<'status' | 'check' | 'plan' | null>(null);
  const [maintenanceHubCheckTarget, setMaintenanceHubCheckTarget] = React.useState<
    'runtimeToolchain' | 'capabilityPacks' | null
  >(null);
  const [makeUsableRunning, setMakeUsableRunning] = React.useState(false);
  const [pendingUpdateAction, setPendingUpdateAction] = React.useState<PendingUpdateAction>(null);
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
  const healthSummaryItems = useMemo<RuntimeHealthSummaryItem[]>(
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
  const runtimeCards = useMemo<RuntimeReadinessCard[]>(
    () => [
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
        nextAction: runtimeCardActionKey('modules', moduleReady >= modules.length ? 'ready' : 'attention_required', t),
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

  const runMakeOplUsable = useCallback(async () => {
    if (makeUsableRunning) return;
    setMakeUsableRunning(true);
    try {
      const translate = tRef.current;
      const repairResult = await ipcBridge.oplRuntime.runInstallPrep.invoke();
      if (!bridgeResultSucceeded(repairResult)) {
        messageRef.current.error(
          repairResult?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }

      const checkResult = await executeManagedUpdateRead('check', { trigger: 'settings_make_opl_usable' });
      if (!bridgeResultSucceeded(checkResult)) {
        messageRef.current.error(
          checkResult?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }

      const checkedPlane = readManagedUpdatePlane(checkResult.parsed, appState);
      for (const component of checkedPlane.components) {
        const action = chooseMakeUsableAction(component);
        if (!action) continue;
        const mutationResult = await executeManagedUpdateMutation(action, {
          componentId: component.id,
          receiptId: component.repairReceiptId,
        });
        if (!bridgeResultSucceeded(mutationResult)) {
          messageRef.current.error(
            mutationResult?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
          );
          return;
        }
      }

      await appStateQuery.load('fast', { showRefreshing: true });
      messageRef.current.success(translate('settings.oplEnvironmentPage.maintenanceHub.makeUsable.complete'));
    } catch {
      messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setMakeUsableRunning(false);
    }
  }, [appState, appStateQuery.load, makeUsableRunning]);

  const requestManagedUpdateAction = useCallback(
    (
      kind: 'apply' | 'repair' | 'rollback',
      component: ManagedUpdateComponent,
      source: 'managed-updates' | 'module-maintenance'
    ) => {
      setPendingUpdateAction({ kind, component, source });
    },
    []
  );

  const cancelManagedUpdateAction = useCallback(() => {
    setPendingUpdateAction(null);
  }, []);

  const confirmManagedUpdateAction = useCallback(() => {
    if (!pendingUpdateAction) return;
    const action = pendingUpdateAction;
    setPendingUpdateAction(null);
    void runManagedUpdateMutation(action.kind, action.component);
  }, [pendingUpdateAction, runManagedUpdateMutation]);

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
  const maintenanceHubItems = useMemo<RuntimeMaintenanceHubItem[]>(
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
  const maintenanceHubPrimaryAction = useMemo<RuntimeMaintenanceHubPrimaryAction>(
    () => ({
      label: t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.label'),
      help: t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.help'),
      loading: makeUsableRunning,
      disabled: Boolean(activeReadOperation) || Boolean(maintenanceHubCheckTarget),
      onAction: () => void runMakeOplUsable(),
    }),
    [activeReadOperation, maintenanceHubCheckTarget, makeUsableRunning, runMakeOplUsable, t]
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

        <RuntimeHealthSummary items={healthSummaryItems} />

        <RuntimeMaintenanceHub items={maintenanceHubItems} primaryAction={maintenanceHubPrimaryAction} t={t} />

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
          pendingAction={pendingUpdateAction}
          onRequestAction={(kind, component) => requestManagedUpdateAction(kind, component, 'module-maintenance')}
          onCancelAction={cancelManagedUpdateAction}
          onConfirmAction={confirmManagedUpdateAction}
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
          pendingAction={pendingUpdateAction}
          onRefresh={() => void runManagedUpdateRead('status')}
          onCheck={() => void runManagedUpdateRead('check')}
          onPlan={() => void runManagedUpdateRead('plan')}
          onRequestAction={(kind, component) => requestManagedUpdateAction(kind, component, 'managed-updates')}
          onCancelAction={cancelManagedUpdateAction}
          onConfirmAction={confirmManagedUpdateAction}
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
