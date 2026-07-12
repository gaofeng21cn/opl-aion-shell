/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, Button, Collapse, Message, Modal, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Copy, FolderSearch, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplCodexSessionContext, getOplSettingsControlPlaneActionContract } from '@/common/config/oplProductProfile';
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
import { copyText } from '@/renderer/utils/ui/clipboard';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  formatModuleAction,
  formatStatus,
  isReadyStatus,
  isTruthyFlag,
  moduleDisplayLabel,
  moduleId,
  moduleManualHandlingLabel,
  moduleNeedsManualHandling,
  modulePath,
  modulePathSource,
  moduleSource,
  moduleStatus,
  moduleVersionDetail,
  type RuntimeModuleItem,
  type Translate,
} from './runtimeStateView';
import {
  componentStatusTone,
  componentUserSummary,
  findRecommendedUpdateAction,
  updateComponentUserAction,
} from '../RuntimeSettings/environmentProjection';
import { buildRuntimeSettingsViewModel } from '../RuntimeSettings/runtimeSettingsViewModel';
import { RuntimeHealthSummary, RuntimeReadinessGrid } from './RuntimeSettingsPanels';

const MODULE_MAINTENANCE_COMPONENT_IDS = new Set(['capability_packages', 'codex_surface']);
const DEVELOPER_SOURCE_MODES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

type RuntimeSettingsProps = {
  withWrapper?: boolean;
};

type PendingUpdateAction = {
  kind: 'apply' | 'repair' | 'rollback';
  component: ManagedUpdateComponent;
  source: 'managed-updates' | 'module-maintenance';
} | null;

type SettingsAppActionId = 'doctor' | 'repair';

const SETTINGS_ACTION_CONTRACT = getOplSettingsControlPlaneActionContract();

function runSettingsControlPlaneAction(actionId: SettingsAppActionId): Promise<IOplRuntimeCommandResult> {
  return ipcBridge.oplRuntime.executeAction.invoke({
    actionId: SETTINGS_ACTION_CONTRACT.recommended_action_ids[actionId],
    dryRun: false,
  });
}

function componentDisplayLabel(component: ManagedUpdateComponent | undefined, t: Translate): string {
  if (!component) return t('settings.oplEnvironmentPage.updates.components.unknown');
  return t(`settings.oplEnvironmentPage.updates.components.${component.id}`, {
    defaultValue: component.label || t('settings.oplEnvironmentPage.updates.components.unknown'),
  });
}

function updateReadActionHelp(operation: 'status' | 'check' | 'plan', t: Translate): string {
  return t(`settings.oplEnvironmentPage.updates.actionHelp.${operation}`);
}

function mutationKindLabel(kind: 'apply' | 'repair' | 'rollback' | 'auto_apply', t: Translate): string {
  if (kind === 'repair') return t('settings.oplEnvironmentPage.updates.actions.repair');
  if (kind === 'rollback') return t('settings.oplEnvironmentPage.updates.actions.rollback');
  if (kind === 'auto_apply') return t('settings.oplEnvironmentPage.updates.actions.autoApply');
  return t('settings.oplEnvironmentPage.updates.actions.applyUpdate');
}

function mutationWillChange(
  kind: 'apply' | 'repair' | 'rollback',
  component: ManagedUpdateComponent,
  t: Translate
): string {
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

function componentApplyAllowed(component: ManagedUpdateComponent): boolean {
  return (component.id === 'runtime_substrate' || component.id === 'capability_packages') && component.safeToApply;
}

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

function HostRouteDetail({ component, t }: { component: ManagedUpdateComponent; t: Translate }) {
  if (component.id !== 'installation_carrier') return null;
  const routeLines = [
    component.hostUpdateRoute
      ? t('settings.oplEnvironmentPage.updates.hostUpdateRoute', { route: component.hostUpdateRoute })
      : null,
    component.hostUpdateRouteExamples.length > 0
      ? t('settings.oplEnvironmentPage.updates.hostUpdateRouteExamples', {
          value: component.hostUpdateRouteExamples.join(', '),
        })
      : null,
    component.manualGuidance
      ? t('settings.oplEnvironmentPage.updates.manualGuidance', { guidance: component.manualGuidance })
      : null,
    component.dataVolumePreservation
      ? t('settings.oplEnvironmentPage.updates.dataVolumePreservation', {
          value: component.dataVolumePreservation,
        })
      : null,
    component.preservedMounts.length > 0
      ? t('settings.oplEnvironmentPage.updates.preservedMounts', {
          value: component.preservedMounts.join(', '),
        })
      : null,
    component.requiredPreservationEvidence.length > 0
      ? t('settings.oplEnvironmentPage.updates.requiredPreservationEvidence', {
          value: component.requiredPreservationEvidence.join(', '),
        })
      : null,
  ].filter((line): line is string => Boolean(line));
  if (routeLines.length === 0) return null;
  const copyValue = [
    component.hostUpdateRoute,
    component.hostUpdateRouteExamples.join('\n'),
    component.manualGuidance,
    component.dataVolumePreservation,
    component.preservedMounts.join(', '),
    component.requiredPreservationEvidence.join(', '),
  ]
    .filter(Boolean)
    .join('\n');
  const handleCopy = () => {
    void copyText(copyValue)
      .then(() => Message.success(t('common.copySuccess')))
      .catch(() => Message.error(t('common.copyFailed')));
  };
  return (
    <div className='opl-settings-technical-subgroup' data-testid={`opl-managed-update-host-route-${component.id}`}>
      <div className='flex items-center justify-between gap-8px'>
        <Typography.Text className='font-600 text-t-primary break-words'>
          {t('settings.oplEnvironmentPage.updates.hostManualRouteTitle')}
        </Typography.Text>
        <Tooltip content={t('common.copy')}>
          <Button
            size='mini'
            type='text'
            icon={<Copy theme='outline' size='14' />}
            onClick={handleCopy}
            data-testid={`opl-managed-update-copy-host-route-${component.id}`}
          />
        </Tooltip>
      </div>
      <div className='mt-6px flex flex-col gap-4px text-12px text-t-secondary break-words'>
        {routeLines.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </div>
    </div>
  );
}

function AgentModuleMaintenancePanel({
  modules,
  plane,
  maintenance,
  maintenanceOperationBusy,
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
  maintenanceOperationBusy: boolean;
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
    <div className='opl-settings-technical-group' data-testid='opl-module-maintenance'>
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
              <Tag color={readyModules === modules.length ? 'gray' : 'orange'}>
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
            disabled={maintenanceOperationBusy}
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
                <span className='break-words'>{rollbackOrReceiptText(pendingAction.component, t)}</span>
                <Space wrap size='small'>
                  <Button size='small' onClick={onCancelAction}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size='small'
                    type='primary'
                    status={pendingAction.kind === 'rollback' ? 'danger' : undefined}
                    loading={busyAction === `${pendingAction.kind}:${pendingAction.component.id}`}
                    disabled={maintenanceOperationBusy}
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
          <div className='opl-settings-technical-subgroup'>
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
                      <Tag color={isReadyStatus(status) && !needsManualHandling ? 'gray' : 'orange'}>
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

          <div className='opl-settings-technical-subgroup'>
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
                    className='opl-settings-technical-row'
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
                      {!manualHandling && componentApplyAllowed(component) && (
                        <Button
                          data-testid={`opl-module-maintenance-apply-${component.id}`}
                          size='small'
                          type='primary'
                          loading={busyAction === `apply:${component.id}`}
                          disabled={maintenanceOperationBusy}
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
                          disabled={maintenanceOperationBusy}
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
                          disabled={maintenanceOperationBusy}
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
    </div>
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
  const componentLabel = componentDisplayLabel(component, t);
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
            <span className='break-words'>{t('settings.oplEnvironmentPage.updates.postAction.noReloadGuidance')}</span>
          )}
        </div>
      }
    />
  );
}

function ManagedUpdatesPanel({
  plane,
  maintenance,
  maintenanceOperationBusy,
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
  maintenanceOperationBusy: boolean;
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
    maintenanceOperationBusy ||
    (recommendedAction.kind === 'check'
      ? Boolean(activeReadOperation && activeReadOperation !== 'check')
      : Boolean(activeReadOperation));
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
    <div className='opl-settings-technical-group' data-testid='opl-managed-updates'>
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
                disabled={maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'status')}
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
                  {mutationKindLabel(pendingAction.kind, t)} · {componentDisplayLabel(pendingAction.component, t)}
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
                <span className='break-words'>{rollbackOrReceiptText(pendingAction.component, t)}</span>
                <Space wrap size='small'>
                  <Button size='small' onClick={onCancelAction}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size='small'
                    type='primary'
                    status={pendingAction.kind === 'rollback' ? 'danger' : undefined}
                    loading={busyAction === `${pendingAction.kind}:${pendingAction.component.id}`}
                    disabled={maintenanceOperationBusy}
                    onClick={onConfirmAction}
                  >
                    {pendingAction.kind === 'repair'
                      ? t('settings.oplEnvironmentPage.updates.actions.repair')
                      : pendingAction.kind === 'rollback'
                        ? t('settings.oplEnvironmentPage.updates.actions.rollback')
                        : t('settings.oplEnvironmentPage.updates.actions.applyUpdate')}
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
              className='opl-settings-technical-subgroup'
              data-testid={`opl-managed-update-${component.id}`}
            >
              <div className='flex flex-col gap-10px'>
                <div className='flex items-center justify-between gap-12px'>
                  <Typography.Text className='font-600 text-t-primary break-words'>
                    {componentDisplayLabel(component, t)}
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
                  {component.id === 'workflow_profile' && (
                    <Button
                      data-testid='opl-managed-update-semantic-merge-workflow_profile'
                      size='small'
                      loading={planLoading}
                      disabled={
                        maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'plan')
                      }
                      onClick={onPlan}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.semanticMerge')}
                    </Button>
                  )}
                  {componentApplyAllowed(component) && (
                    <Button
                      data-testid={`opl-managed-update-apply-${component.id}`}
                      size='small'
                      type='primary'
                      loading={busyAction === `apply:${component.id}`}
                      disabled={maintenanceOperationBusy}
                      onClick={() => onRequestAction('apply', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.applyUpdate')}
                    </Button>
                  )}
                  {component.repairAllowed && (
                    <Button
                      data-testid={`opl-managed-update-repair-${component.id}`}
                      size='small'
                      loading={busyAction === `repair:${component.id}`}
                      disabled={maintenanceOperationBusy}
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
                      disabled={maintenanceOperationBusy}
                      onClick={() => onRequestAction('rollback', component)}
                    >
                      {t('settings.oplEnvironmentPage.updates.actions.rollback')}
                    </Button>
                  )}
                </Space>
                <HostRouteDetail component={component} t={t} />
                {(component.conditions.length > 0 ||
                  component.receiptRef ||
                  component.repairAction ||
                  component.rollbackRef ||
                  component.reloadGuidance ||
                  component.manualGuidance ||
                  component.hostUpdateRoute ||
                  component.dataVolumePreservation ||
                  component.preservedMounts.length > 0 ||
                  component.requiredPreservationEvidence.length > 0) && (
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
                        {component.hostUpdateRoute && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.hostUpdateRoute', {
                              route: component.hostUpdateRoute,
                            })}
                          </span>
                        )}
                        {component.dataVolumePreservation && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.dataVolumePreservation', {
                              value: component.dataVolumePreservation,
                            })}
                          </span>
                        )}
                        {component.preservedMounts.length > 0 && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.preservedMounts', {
                              value: component.preservedMounts.join(', '),
                            })}
                          </span>
                        )}
                        {component.requiredPreservationEvidence.length > 0 && (
                          <span>
                            {t('settings.oplEnvironmentPage.updates.requiredPreservationEvidence', {
                              value: component.requiredPreservationEvidence.join(', '),
                            })}
                          </span>
                        )}
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
                  disabled={maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'check')}
                  onClick={onCheck}
                >
                  {t('settings.oplEnvironmentPage.updates.actions.check')}
                </Button>
              </Tooltip>
              <Tooltip content={updateReadActionHelp('plan', t)}>
                <Button
                  data-testid='opl-managed-update-plan'
                  loading={planLoading}
                  disabled={maintenanceOperationBusy || Boolean(activeReadOperation && activeReadOperation !== 'plan')}
                  onClick={onPlan}
                >
                  {t('settings.oplEnvironmentPage.updates.actions.previewChanges')}
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
    </div>
  );
}

const RuntimeSettings: React.FC<RuntimeSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const [activeReadOperation, setActiveReadOperation] = React.useState<'status' | 'check' | 'plan' | null>(null);
  const [maintenanceHubCheckTarget, setMaintenanceHubCheckTarget] = React.useState<
    'runtimeSubstrate' | 'capabilityPacks' | null
  >(null);
  const [makeUsableRunning, setMakeUsableRunning] = React.useState(false);
  const [makeUsableConfirmationOpen, setMakeUsableConfirmationOpen] = React.useState(false);
  const [capabilitySyncConfirmationOpen, setCapabilitySyncConfirmationOpen] = React.useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = React.useState(false);
  const [pendingUpdateAction, setPendingUpdateAction] = React.useState<PendingUpdateAction>(null);
  const [maintenanceOperationRunning, setMaintenanceOperationRunning] = React.useState(false);
  const maintenanceOperationLockRef = useRef(false);
  const appStateQuery = useOplAppState('fast');
  const managedUpdateMaintenance = useManagedUpdateMaintenance();
  const managedUpdateRunningRef = useRef(managedUpdateMaintenance.running);
  managedUpdateRunningRef.current = managedUpdateMaintenance.running;

  const beginMaintenanceOperation = useCallback(() => {
    if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return false;
    maintenanceOperationLockRef.current = true;
    setMaintenanceOperationRunning(true);
    return true;
  }, []);

  const finishMaintenanceOperation = useCallback(() => {
    maintenanceOperationLockRef.current = false;
    setMaintenanceOperationRunning(false);
  }, []);

  React.useEffect(() => {
    messageRef.current = message;
    tRef.current = t;
  }, [message, t]);

  const appState = appStateQuery.appState;
  const managedUpdatePlane = useMemo(
    () => readManagedUpdatePlane(managedUpdateMaintenance.result?.parsed, appState),
    [appState, managedUpdateMaintenance.result]
  );

  const runManagedUpdateRead = useCallback(
    async (operation: 'status' | 'check' | 'plan', manual = true) => {
      if (!beginMaintenanceOperation()) return;
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
        finishMaintenanceOperation();
      }
    },
    [beginMaintenanceOperation, finishMaintenanceOperation]
  );

  const runMaintenanceHubCheck = useCallback(
    async (target: 'runtimeSubstrate' | 'capabilityPacks') => {
      if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
      if (target === 'capabilityPacks') {
        setCapabilitySyncConfirmationOpen(true);
        return;
      }
      setMaintenanceHubCheckTarget(target);
      try {
        await runManagedUpdateRead('check');
      } finally {
        setMaintenanceHubCheckTarget(null);
      }
    },
    [runManagedUpdateRead]
  );

  const confirmCapabilitySync = useCallback(async () => {
    if (!beginMaintenanceOperation()) return;
    setCapabilitySyncConfirmationOpen(false);
    setMaintenanceHubCheckTarget('capabilityPacks');
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'settings_sync_capabilities',
        dryRun: false,
      });
      if (!bridgeResultSucceeded(result)) {
        messageRef.current.error(
          result?.error?.message || tRef.current('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }
      await appStateQuery.load('fast', { showRefreshing: true });
      messageRef.current.success(tRef.current('settings.oplEnvironmentPage.updates.messages.actionComplete'));
    } finally {
      setMaintenanceHubCheckTarget(null);
      finishMaintenanceOperation();
    }
  }, [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation]);

  const runManagedUpdateMutation = useCallback(
    async (kind: 'apply' | 'repair' | 'rollback', component: ManagedUpdateComponent) => {
      if (!beginMaintenanceOperation()) return;
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
      } finally {
        finishMaintenanceOperation();
      }
    },
    [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation]
  );

  const runMakeOplUsable = useCallback(async () => {
    if (!beginMaintenanceOperation()) return;
    setMakeUsableConfirmationOpen(false);
    setMakeUsableRunning(true);
    try {
      const translate = tRef.current;
      const repairResult = await runSettingsControlPlaneAction('repair');
      if (!bridgeResultSucceeded(repairResult)) {
        messageRef.current.error(
          repairResult?.error?.message || translate('settings.oplEnvironmentPage.messages.commandFailed')
        );
        return;
      }

      await appStateQuery.load('fast', { showRefreshing: true });
      messageRef.current.success(translate('settings.oplEnvironmentPage.maintenanceHub.makeUsable.complete'));
    } catch {
      messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setMakeUsableRunning(false);
      finishMaintenanceOperation();
    }
  }, [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation]);

  const requestMakeOplUsable = useCallback(() => {
    if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
    setMakeUsableConfirmationOpen(true);
  }, []);

  const cancelMakeOplUsable = useCallback(() => {
    setMakeUsableConfirmationOpen(false);
  }, []);

  const requestManagedUpdateAction = useCallback(
    (
      kind: 'apply' | 'repair' | 'rollback',
      component: ManagedUpdateComponent,
      source: 'managed-updates' | 'module-maintenance'
    ) => {
      if (maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
      setPendingUpdateAction({ kind, component, source });
    },
    []
  );

  const cancelManagedUpdateAction = useCallback(() => {
    setPendingUpdateAction(null);
  }, []);

  const confirmManagedUpdateAction = useCallback(() => {
    if (!pendingUpdateAction || maintenanceOperationLockRef.current || managedUpdateRunningRef.current) return;
    const action = pendingUpdateAction;
    setPendingUpdateAction(null);
    void runManagedUpdateMutation(action.kind, action.component);
  }, [pendingUpdateAction, runManagedUpdateMutation]);

  React.useEffect(() => {
    if (!managedUpdateMaintenance.result && !managedUpdateMaintenance.running) {
      void runManagedUpdateRead('status', false);
    }
  }, [managedUpdateMaintenance.result, managedUpdateMaintenance.running, runManagedUpdateRead]);

  const runSettingsAppAction = useCallback(
    async (actionId: SettingsAppActionId, successText: string) => {
      if (!beginMaintenanceOperation()) return;
      try {
        const result = await runSettingsControlPlaneAction(actionId);
        if (bridgeResultSucceeded(result)) {
          message.success(successText);
          await appStateQuery.load('fast', { showRefreshing: true });
        } else {
          message.error(result?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } catch {
        message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
      } finally {
        finishMaintenanceOperation();
      }
    },
    [appStateQuery.load, beginMaintenanceOperation, finishMaintenanceOperation, message, t]
  );

  const openUpdateModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'settings-runtime' } }));
  }, []);

  const viewModel = useMemo(
    () =>
      buildRuntimeSettingsViewModel({
        appState,
        managedUpdatePlane,
        managedUpdateMaintenance,
        loadedAt: appStateQuery.loadedAt,
        activeReadOperation,
        maintenanceHubCheckTarget,
        makeUsableRunning,
        actions: {
          openUpdateModal,
          runMaintenanceHubCheck,
          runMakeOplUsable: requestMakeOplUsable,
          runServiceCheck: () =>
            void runSettingsAppAction('doctor', t('settings.oplEnvironmentPage.messages.doctorComplete')),
        },
        t,
      }),
    [
      activeReadOperation,
      appState,
      appStateQuery.loadedAt,
      maintenanceHubCheckTarget,
      makeUsableRunning,
      managedUpdateMaintenance,
      managedUpdatePlane,
      openUpdateModal,
      requestMakeOplUsable,
      runMaintenanceHubCheck,
      runSettingsAppAction,
      t,
    ]
  );
  const {
    environment: {
      familyWorkspaceRoot,
      workspaceRoot,
      logsRoot,
      modulesSourceMode,
      modulesRoot,
      modules,
      healthSummaryItems,
      runtimeCards,
    },
    maintenanceHubItems,
  } = viewModel;
  const developerSourceActive =
    Boolean(modulesSourceMode && DEVELOPER_SOURCE_MODES.has(modulesSourceMode)) ||
    modules.some((module) => {
      const source = moduleSource(module);
      return Boolean(source && DEVELOPER_SOURCE_MODES.has(source));
    });
  const dirtyCheckoutActive = modules.some((module) => {
    const git = oplRecord(module.git);
    return (
      moduleStatus(module) === 'dirty' ||
      isTruthyFlag(module.checkout_dirty) ||
      isTruthyFlag(module.working_tree_dirty) ||
      isTruthyFlag(git.dirty)
    );
  });
  const maintenanceNeedsAction =
    healthSummaryItems.some((item) => item.tone === 'orange') ||
    maintenanceHubItems.some((item) => item.tone === 'orange');
  const maintenanceOperationBusy = maintenanceOperationRunning || managedUpdateMaintenance.running;

  const openLogDir = useCallback(() => {
    if (!logsRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: logsRoot, tool: 'explorer' });
  }, [logsRoot]);

  const codexSessionContext = useMemo(() => getOplCodexSessionContext(), []);

  const content = (
    <>
      {contextHolder}
      <div className='opl-settings-page' data-testid='settings-page-maintenance'>
        <header className='opl-settings-page-header'>
          <div className='opl-settings-page-header__copy'>
            <Typography.Title heading={4}>{t('settings.runtimePage.title')}</Typography.Title>
            <Typography.Text>{t('settings.runtimePage.description')}</Typography.Text>
          </div>
        </header>

        <section className='opl-settings-section opl-settings-surface--status' id='health'>
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.oplEnvironmentPage.healthSummary.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.oplEnvironmentPage.healthSummary.description')}
              </Typography.Text>
            </div>
          </div>
          <RuntimeHealthSummary items={healthSummaryItems} />
        </section>

        <div className='flex flex-col gap-14px' data-testid='settings-maintenance-primary'>
          <div className='flex flex-col gap-12px' data-testid='opl-maintenance-hub'>
            {maintenanceNeedsAction && <span data-testid='settings-maintenance-exception' aria-hidden='true' />}
            <div className='flex flex-wrap items-start justify-between gap-12px'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.maintenanceHub.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.oplEnvironmentPage.maintenanceHub.description')}
                </Typography.Text>
              </div>
              {managedUpdateMaintenance.lastRunAt && (
                <Typography.Text className='text-12px text-t-tertiary'>
                  {t('settings.oplEnvironmentPage.maintenanceHub.lastChecked', {
                    value: managedUpdateMaintenance.lastRunAt,
                  })}
                </Typography.Text>
              )}
            </div>
            <div className='grid grid-cols-1 gap-12px md:grid-cols-2' data-testid='maintenance-domain-grid'>
              {maintenanceHubItems.map((item) => {
                const anchors: Record<string, string> = {
                  appUpdates: 'updates',
                  runtimeEnvironment: 'runtime-environment',
                  capabilitySurfaceSync: 'packages',
                  localServicesRepair: 'services',
                };
                return (
                  <section
                    key={`maintenance-hub-${item.key}`}
                    className='opl-settings-section opl-settings-surface--action flex'
                    id={anchors[item.key]}
                    data-testid={`opl-maintenance-hub-${item.key}`}
                  >
                    <div className='flex min-w-0 flex-1 flex-col gap-14px p-16px'>
                      <div>
                        <Typography.Text className='block font-600 text-t-primary'>{item.title}</Typography.Text>
                        <Typography.Text className='mt-4px block text-12px text-t-secondary'>
                          {item.detail}
                        </Typography.Text>
                      </div>
                      <div className='mt-auto flex flex-wrap items-center justify-between gap-10px'>
                        <span className='opl-settings-action-result'>
                          {t('settings.oplEnvironmentPage.maintenanceHub.results.title')}: {item.status}
                        </span>
                        <Button
                          icon={item.icon}
                          title={item.actionHelp}
                          loading={item.actionLoading}
                          disabled={maintenanceOperationBusy || item.actionDisabled}
                          onClick={item.onAction}
                          data-testid={`opl-maintenance-action-${item.key}`}
                        >
                          {item.actionLabel}
                        </Button>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          {makeUsableConfirmationOpen && (
            <Alert
              type='warning'
              title={t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmTitle')}
              data-testid='opl-maintenance-hub-make-usable-confirmation'
              content={
                <div className='flex flex-col gap-8px'>
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmWillChange')}
                  </span>
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmWillNotChange')}
                  </span>
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmRecovery')}
                  </span>
                  <Space wrap size='small'>
                    <Button size='small' onClick={cancelMakeOplUsable}>
                      {t('common.cancel')}
                    </Button>
                    <span data-testid='settings-maintenance-primary-action'>
                      <Button
                        size='small'
                        type='primary'
                        loading={makeUsableRunning}
                        disabled={maintenanceOperationBusy}
                        onClick={() => void runMakeOplUsable()}
                        data-testid='opl-maintenance-hub-make-usable-confirm'
                      >
                        {t('settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmAction')}
                      </Button>
                    </span>
                  </Space>
                </div>
              }
            />
          )}
          {capabilitySyncConfirmationOpen && (
            <Alert
              type='warning'
              title={t('settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks')}
              data-testid='opl-capability-sync-confirmation'
              content={
                <div className='flex flex-col gap-8px'>
                  <span className='break-words'>
                    {t('settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.actionHelp')}
                  </span>
                  <Space wrap size='small'>
                    <Button size='small' onClick={() => setCapabilitySyncConfirmationOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      size='small'
                      type='primary'
                      onClick={() => void confirmCapabilitySync()}
                      data-testid='opl-capability-sync-confirm'
                    >
                      {t('settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks')}
                    </Button>
                  </Space>
                </div>
              }
            />
          )}
        </div>

        <div className='flex justify-end'>
          <Button data-testid='settings-maintenance-diagnostics-action' onClick={() => setDiagnosticsVisible(true)}>
            {t('settings.oplEnvironmentPage.advancedDetails.title')}
          </Button>
          <Modal
            visible={diagnosticsVisible}
            title={t('settings.oplEnvironmentPage.advancedDetails.title')}
            footer={null}
            onCancel={() => setDiagnosticsVisible(false)}
            unmountOnExit
            style={{ width: 'min(900px, calc(100vw - 48px))' }}
          >
            <div
              className='opl-settings-surface--diagnostic max-h-[70vh] overflow-auto'
              id='advanced-maintenance'
              data-testid='settings-maintenance-technical-details'
            >
              <Typography.Text className='block text-12px text-t-secondary mt-6px'>
                {t('settings.oplEnvironmentPage.advancedDetails.description')}
              </Typography.Text>
              <div className='mt-14px flex flex-col gap-16px'>
                {(developerSourceActive || dirtyCheckoutActive) && (
                  <Alert
                    type='info'
                    data-testid='opl-runtime-developer-source-alert'
                    title={t('settings.oplEnvironmentPage.developerSource.title')}
                    content={
                      <span className='break-words'>
                        {dirtyCheckoutActive
                          ? t('settings.oplEnvironmentPage.developerSource.dirtyImpact')
                          : t('settings.oplEnvironmentPage.developerSource.impact')}
                      </span>
                    }
                  />
                )}
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.sections.required')}
                </Typography.Text>
                <RuntimeReadinessGrid cards={runtimeCards} t={t} />

                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.sections.agentPackages')}
                </Typography.Text>
                <AgentModuleMaintenancePanel
                  modules={modules}
                  plane={managedUpdatePlane}
                  maintenance={managedUpdateMaintenance}
                  maintenanceOperationBusy={maintenanceOperationBusy}
                  onCheck={() => void runManagedUpdateRead('check')}
                  pendingAction={pendingUpdateAction}
                  onRequestAction={(kind, component) =>
                    requestManagedUpdateAction(kind, component, 'module-maintenance')
                  }
                  onCancelAction={cancelManagedUpdateAction}
                  onConfirmAction={confirmManagedUpdateAction}
                  t={t}
                />

                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.oplEnvironmentPage.sections.maintenance')}
                </Typography.Text>
                <ManagedUpdatesPanel
                  plane={managedUpdatePlane}
                  maintenance={managedUpdateMaintenance}
                  maintenanceOperationBusy={maintenanceOperationBusy}
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

                <Collapse bordered={false}>
                  <Collapse.Item
                    header={t('settings.oplEnvironmentPage.diagnostics.title')}
                    name='environment-diagnostics'
                  >
                    <div className='flex flex-col gap-16px'>
                      <div
                        className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'
                        id='workspace'
                      >
                        <div className='min-w-0'>
                          <Typography.Text className='block font-600 text-t-primary'>
                            {t('settings.workDir')}
                          </Typography.Text>
                          <Typography.Text className='block text-12px text-t-secondary break-all'>
                            {workspaceRoot || t('settings.dirNotConfigured')}
                          </Typography.Text>
                        </div>
                      </div>

                      <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
                        <div className='min-w-0'>
                          <Typography.Text className='block font-600 text-t-primary'>
                            {t('settings.logDir')}
                          </Typography.Text>
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
                                        {t('settings.oplEnvironmentPage.moduleVersion.checkoutPath', {
                                          path: pathValue,
                                        })}
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
                                  <Tag key={`${id}-status`} color={isReadyStatus(status) ? 'gray' : 'orange'}>
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
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default RuntimeSettings;
