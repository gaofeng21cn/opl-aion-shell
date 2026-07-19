/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Alert, Button, Input, Message, Modal, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Download, Earth, Open, Search, SettingTwo, Toolkit } from '@icon-park/react';
import { ipcBridge } from '@/common';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';
import { oplRecord, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { openExternalUrl } from '@/renderer/utils/platform';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import OplConnectionsSection, { buildConnectionRegistry } from './OplConnectionsSection';
import {
  buildAccessProjection,
  type DockerWebuiAction,
  type DockerWebuiProjection,
  type ResourceSourceProjection,
} from '../accessProjection';

type OplCommandResult = Awaited<ReturnType<typeof ipcBridge.oplRuntime.executeAction.invoke>>;
type ResourceReadiness = 'ready' | 'notConfigured' | 'unverified';
type DockerActionEvidencePhase = 'check' | 'precheck' | 'execute';
type DockerActionEvidence = {
  actionId: string;
  actionLabel: string;
  phase: DockerActionEvidencePhase;
  summary: string;
  receiptSummary: string | null;
  receiptRef: string | null;
};
type DockerActionPayload = Record<string, string>;
function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

function statusToken(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function resourceReadiness(status: string): ResourceReadiness {
  const normalized = statusToken(status);
  if (
    ['ready', 'healthy', 'configured', 'connected', 'running', 'runtimeready', 'resourceready'].includes(normalized)
  ) {
    return 'ready';
  }
  if (['missing', 'notconfigured', 'notinstalled', 'disabled'].includes(normalized)) return 'notConfigured';
  return 'unverified';
}

function dockerResourceReadiness(dockerWebui: DockerWebuiProjection): ResourceReadiness {
  const normalized = statusToken(dockerWebui.status);
  if (['healthy', 'configured', 'connected', 'running', 'runtimeready', 'resourceready'].includes(normalized)) {
    return 'ready';
  }
  if (['missing', 'notconfigured', 'notinstalled', 'disabled'].includes(normalized)) return 'notConfigured';
  return 'unverified';
}

function resourceReadinessLabel(
  readiness: ResourceReadiness,
  t: (key: string, options?: Record<string, string>) => string
): string {
  if (readiness === 'ready') {
    return t('settings.resourcesPage.statusLabels.resourceReady', { defaultValue: 'Ready' });
  }
  if (readiness === 'notConfigured') {
    return t('settings.resourcesPage.statusLabels.not_configured');
  }
  return t('settings.resourcesPage.statusLabels.unverified', { defaultValue: 'Not verified' });
}

function resourceReadinessColor(readiness: ResourceReadiness): 'orange' | 'gray' {
  return readiness === 'notConfigured' ? 'orange' : 'gray';
}

function dockerBrowserUrl(result: OplCommandResult): string | null {
  const parsed = oplRecord(result.parsed);
  const execution = oplRecord(parsed.app_action_execution ?? parsed);
  const actionResult = oplRecord(execution.result);
  const browserEntry = oplRecord(actionResult.docker_webui_browser_entry);
  return typeof browserEntry.browser_url === 'string' && browserEntry.browser_url.length > 0
    ? browserEntry.browser_url
    : null;
}

function firstNestedString(value: unknown, keys: string[], depth = 0): string | null {
  const record = oplRecord(value);
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  if (depth >= 3) return null;
  for (const candidate of Object.values(record)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const nested = firstNestedString(candidate, keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function dockerActionEvidence(
  result: OplCommandResult,
  action: DockerWebuiAction,
  phase: DockerActionEvidencePhase,
  t: (key: string, options?: Record<string, string>) => string
): DockerActionEvidence {
  const parsed = oplRecord(result.parsed);
  const execution = oplRecord(parsed.app_action_execution ?? parsed);
  const actionResult = oplRecord(execution.result);
  const doctor = oplRecord(actionResult.docker_webui_doctor);
  const diagnosticSummary = oplRecord(doctor.diagnostic_summary);
  const controlCenterAction = oplRecord(actionResult.settings_control_center_action);
  const installResult = oplRecord(actionResult.opl_install);
  const receipt = oplRecord(actionResult.receipt ?? execution.receipt);
  const receiptSummary =
    firstNestedString(actionResult, ['receipt_summary']) ?? firstNestedString(receipt, ['summary', 'message']);
  const receiptRef =
    firstNestedString(actionResult, [
      'receipt_ref',
      'latest_receipt_ref',
      'execute_receipt_ref',
      'action_receipt_ref',
    ]) ?? firstNestedString(receipt, ['ref', 'receipt_ref']);
  const resultSummary =
    firstNestedString(actionResult, ['result_summary']) ??
    firstNestedString(diagnosticSummary, ['summary', 'message', 'status']) ??
    firstNestedString(controlCenterAction, ['summary', 'message', 'status']) ??
    firstNestedString(installResult, ['summary', 'message', 'status']) ??
    firstNestedString(actionResult, ['summary', 'message', 'status']);
  const summary =
    resultSummary ??
    (receiptSummary || receiptRef
      ? t('settings.resourcesPage.docker.receiptAvailable', { defaultValue: 'Action receipt recorded.' })
      : Object.keys(actionResult).length > 0
        ? t('settings.resourcesPage.docker.structuredResultAvailable', {
            defaultValue: 'Structured action result received.',
          })
        : t('settings.resourcesPage.docker.resultSummaryUnavailable', {
            defaultValue: 'No action result summary was returned.',
          }));

  return {
    actionId: action.actionId,
    actionLabel: t(`settings.resourcesPage.docker.actions.${action.actionId}`, { defaultValue: action.label }),
    phase,
    summary,
    receiptSummary: phase === 'precheck' ? null : receiptSummary,
    receiptRef: phase === 'precheck' ? null : receiptRef,
  };
}

function dockerActionKind(action: DockerWebuiAction): 'open' | 'check' | 'modelAccess' | 'configure' | 'other' {
  const actionId = action.actionId.toLowerCase();
  if (actionId.includes('open')) return 'open';
  if (actionId.includes('diagnose')) return 'check';
  if (actionId.includes('configure_webui_api_key')) return 'modelAccess';
  if (actionId.includes('install') || actionId.includes('configure') || actionId.includes('select')) {
    return 'configure';
  }
  return 'other';
}

function dockerActionCtaLabel(
  action: DockerWebuiAction,
  t: (key: string, options?: Record<string, string>) => string
): string {
  const actionLabelKey = `settings.resourcesPage.docker.actionButtons.${action.actionId}`;
  const translatedActionLabel = t(actionLabelKey, { defaultValue: '' });
  if (translatedActionLabel) return translatedActionLabel;
  const kind = dockerActionKind(action);
  if (kind === 'open') return t('settings.resourcesPage.docker.openResource');
  if (kind === 'check') return t('settings.resourcesPage.docker.recheck');
  if (kind === 'modelAccess') return t('settings.resourcesPage.docker.openModelAccess');
  if (kind === 'configure') return t('settings.resourcesPage.docker.prepareEnvironment');
  return t('settings.resourcesPage.docker.runDryRoute');
}

function dockerActionIcon(action: DockerWebuiAction): React.ReactNode {
  const kind = dockerActionKind(action);
  if (kind === 'open') return <Open theme='outline' size='16' />;
  if (kind === 'check') return <Search theme='outline' size='16' />;
  if (kind === 'configure') return <Download theme='outline' size='16' />;
  if (kind === 'modelAccess') return <SettingTwo theme='outline' size='16' />;
  return <Toolkit theme='outline' size='16' />;
}

function preferredDockerAction(actions: DockerWebuiAction[], readiness: ResourceReadiness): DockerWebuiAction | null {
  const candidates = actions.filter((action) => !action.payloadRequired || dockerActionKind(action) === 'modelAccess');
  const priority =
    readiness === 'ready'
      ? { open: 0, check: 1, modelAccess: 2, configure: 3, other: 4 }
      : readiness === 'notConfigured'
        ? { configure: 0, modelAccess: 1, check: 2, open: 3, other: 4 }
        : { check: 0, modelAccess: 1, configure: 2, open: 3, other: 4 };
  return (
    candidates.toSorted((left, right) => priority[dockerActionKind(left)] - priority[dockerActionKind(right)])[0] ??
    null
  );
}

export const ResourcesSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const [remoteSettingsVisible, setRemoteSettingsVisible] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [pendingDockerAction, setPendingDockerAction] = useState<DockerWebuiAction | null>(null);
  const [pendingDockerPayload, setPendingDockerPayload] = useState<DockerActionPayload | null>(null);
  const [seedAction, setSeedAction] = useState<DockerWebuiAction | null>(null);
  const [seedForm, setSeedForm] = useState({ imageManifestPath: '', imageSeedDir: '' });
  const [actionEvidence, setActionEvidence] = useState<DockerActionEvidence | null>(null);
  const actionInFlightRef = useRef(false);
  const { dockerWebui, resourceSources } = buildAccessProjection(appStateQuery.appState, t);
  const connectionRegistry = buildConnectionRegistry(appStateQuery.appState);
  const workspaceSources = resourceSources.filter((source) => source.category === 'oplWorkspace');
  const externalSources = resourceSources.filter((source) => source.category !== 'oplWorkspace');
  const dockerReadiness = dockerResourceReadiness(dockerWebui);
  const primaryDockerAction = preferredDockerAction(dockerWebui.actions, dockerReadiness);
  const nextDockerAction = primaryDockerAction ?? dockerWebui.actions[0] ?? null;
  const secondaryDockerActions = dockerWebui.actions.filter((action) => action !== primaryDockerAction);

  const handleDockerAction = async (action: DockerWebuiAction, payload?: DockerActionPayload) => {
    if (actionInFlightRef.current) return;
    const kind = dockerActionKind(action);
    if (kind === 'modelAccess') {
      void navigate('/settings/gateway');
      return;
    }
    if (action.payloadRequired && !payload) {
      if (action.actionId === 'settings_select_webui_seed') setSeedAction(action);
      return;
    }
    actionInFlightRef.current = true;
    setRunningActionId(action.actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: action.actionId,
        dryRun: kind !== 'open' && kind !== 'check',
        ...(payload ? { payloadRefsOnlyJson: payload } : {}),
      });
      assertOplCommandOk(result);
      if (kind === 'open') {
        const url = dockerBrowserUrl(result);
        if (!url) throw new Error('Docker WebUI browser URL is unavailable');
        await openExternalUrl(url);
        Message.success(t('settings.resourcesPage.docker.openSuccess'));
      } else if (kind === 'check') {
        setActionEvidence(dockerActionEvidence(result, action, 'check', t));
        Message.success(t('settings.resourcesPage.docker.checkSuccess'));
      } else {
        setActionEvidence(dockerActionEvidence(result, action, 'precheck', t));
        setPendingDockerAction(action);
        setPendingDockerPayload(payload ?? null);
        Message.success(t('settings.resourcesPage.docker.actionDryRunSuccess'));
      }
      if (kind === 'open' || kind === 'check') {
        await appStateQuery.load('fast', { showRefreshing: true });
      }
    } catch {
      Message.error(
        t(
          kind === 'open'
            ? 'settings.resourcesPage.docker.openFailed'
            : kind === 'check'
              ? 'settings.resourcesPage.docker.checkFailed'
              : 'settings.resourcesPage.docker.actionDryRunFailed'
        )
      );
    } finally {
      actionInFlightRef.current = false;
      setRunningActionId(null);
    }
  };

  const executePendingDockerAction = async () => {
    if (!pendingDockerAction || actionInFlightRef.current) return;
    const action = pendingDockerAction;
    actionInFlightRef.current = true;
    setRunningActionId(action.actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: action.actionId,
        dryRun: false,
        ...(pendingDockerPayload ? { payloadRefsOnlyJson: pendingDockerPayload } : {}),
      });
      assertOplCommandOk(result);
      setActionEvidence(dockerActionEvidence(result, action, 'execute', t));
      setPendingDockerAction(null);
      setPendingDockerPayload(null);
      Message.success(t('settings.resourcesPage.docker.actionExecuteSuccess'));
      await appStateQuery.load('fast', { showRefreshing: true });
    } catch {
      Message.error(t('settings.resourcesPage.docker.actionExecuteFailed'));
    } finally {
      actionInFlightRef.current = false;
      setRunningActionId(null);
    }
  };

  const submitSeedForm = () => {
    if (!seedAction || !seedForm.imageManifestPath.trim() || !seedForm.imageSeedDir.trim()) return;
    const action = seedAction;
    const payload = {
      image_manifest_path: seedForm.imageManifestPath.trim(),
      image_seed_dir: seedForm.imageSeedDir.trim(),
    };
    setSeedAction(null);
    void handleDockerAction(action, payload);
  };

  const executeConnectionAction = async (
    actionId: string,
    payloadRefsOnlyJson: Record<string, unknown>
  ): Promise<boolean> => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    const actionToken = `${actionId}:${String(payloadRefsOnlyJson.connection_id ?? '')}`;
    setRunningActionId(actionToken);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId,
        dryRun: false,
        payloadRefsOnlyJson,
      });
      assertOplCommandOk(result);
      Message.success(t(`settings.resourcesPage.oplConnections.actions.${actionId}Success`));
      await appStateQuery.load('fast', { showRefreshing: true });
      return true;
    } catch {
      Message.error(t(`settings.resourcesPage.oplConnections.actions.${actionId}Failed`));
      return false;
    } finally {
      actionInFlightRef.current = false;
      setRunningActionId(null);
    }
  };

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='settings-page-resources'>
      <span data-testid='resources-settings-page' aria-hidden='true' />
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.resourcesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.resourcesPage.description')}</Typography.Text>
        </div>
      </header>

      <div className='opl-settings-flat-stack' data-testid='settings-resources-primary'>
        <section
          className='opl-settings-section'
          id='local-browser-access'
          data-testid='settings-resources-browser-access'
        >
          <span id='web-access' aria-hidden='true' />
          <div className='opl-settings-row items-start'>
            <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                <Earth theme='outline' size='16' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.accessPage.remote.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.description')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.nativePort')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.nativeAccount')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.accessPage.remote.nativePassword')}
                </Typography.Text>
              </div>
            </div>
            <div className='opl-settings-row__meta'>
              <Button
                data-testid='opl-settings-open-native-remote-settings'
                icon={<Open theme='outline' size='16' fill='currentColor' />}
                onClick={() => setRemoteSettingsVisible(true)}
              >
                {t('settings.accessPage.remote.openNativeSettings')}
              </Button>
            </div>
          </div>
        </section>

        <section className='opl-settings-section' id='resource-readiness' data-testid='opl-settings-server-webui'>
          {dockerReadiness !== 'ready' && <span data-testid='settings-resources-exception' aria-hidden='true' />}
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.resourcesPage.sections.serverWebui.title', { defaultValue: 'Server WebUI' })}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.resourcesPage.sections.serverWebui.description', {
                  defaultValue:
                    'Configure, verify, or open the browser workbench without treating an available action as resource readiness.',
                })}
              </Typography.Text>
            </div>
            <Button
              type='text'
              size='small'
              icon={<SettingTwo theme='outline' size='14' />}
              data-testid='settings-resources-diagnostics-action'
              onClick={() => setDiagnosticsVisible(true)}
            >
              {t('settings.oplEnvironmentPage.updates.diagnostics.title')}
            </Button>
          </div>

          <div className='opl-settings-list'>
            <div className='opl-settings-row' id='action-readiness'>
              <div className='opl-settings-row__main flex min-w-0 items-start gap-10px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                  <Toolkit theme='outline' size='16' />
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {t('settings.resourcesPage.docker.docker')}
                  </Typography.Text>
                  {nextDockerAction && (
                    <Typography.Text className='block break-words text-12px text-t-secondary'>
                      {t(`settings.resourcesPage.docker.actions.${nextDockerAction.actionId}`, {
                        defaultValue: nextDockerAction.label,
                      })}
                    </Typography.Text>
                  )}
                </div>
              </div>
              <div className='opl-settings-row__meta flex flex-wrap items-center gap-10px'>
                <Tag color={resourceReadinessColor(dockerReadiness)}>{resourceReadinessLabel(dockerReadiness, t)}</Tag>
                {primaryDockerAction && !pendingDockerAction ? (
                  <span data-testid='settings-resources-primary-action'>
                    <DockerActionButton
                      action={primaryDockerAction}
                      loading={runningActionId === primaryDockerAction.actionId}
                      singleFlight={runningActionId !== null}
                      primary
                      onAction={handleDockerAction}
                    />
                  </span>
                ) : nextDockerAction && !pendingDockerAction ? (
                  <Tag color='orange'>{t('settings.resourcesPage.docker.payloadRequired')}</Tag>
                ) : !pendingDockerAction ? (
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.resourcesPage.docker.noActions')}
                  </Typography.Text>
                ) : null}
              </div>
            </div>
          </div>

          {pendingDockerAction && (
            <Alert
              type='warning'
              title={t('settings.resourcesPage.docker.confirmTitle')}
              data-testid='opl-settings-docker-webui-confirmation'
              content={
                <div className='flex flex-col gap-8px'>
                  <span className='break-words'>
                    {t('settings.resourcesPage.docker.confirmDescription', {
                      action: t(`settings.resourcesPage.docker.actions.${pendingDockerAction.actionId}`, {
                        defaultValue: pendingDockerAction.label,
                      }),
                    })}
                  </span>
                  <span className='text-12px text-t-secondary'>
                    {t('settings.resourcesPage.docker.confirmBoundary')}
                  </span>
                  <Space wrap size='small'>
                    <Button
                      size='small'
                      disabled={runningActionId !== null}
                      onClick={() => {
                        setPendingDockerAction(null);
                        setPendingDockerPayload(null);
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                    <span data-testid='settings-resources-primary-action'>
                      <Button
                        size='small'
                        type='primary'
                        loading={runningActionId === pendingDockerAction.actionId}
                        disabled={runningActionId !== null}
                        onClick={() => void executePendingDockerAction()}
                        data-testid='opl-settings-docker-webui-confirm'
                      >
                        {t('settings.resourcesPage.docker.confirmAction')}
                      </Button>
                    </span>
                  </Space>
                </div>
              }
            />
          )}

          {actionEvidence && <DockerActionEvidencePanel evidence={actionEvidence} />}

          {!pendingDockerAction && secondaryDockerActions.length > 0 && (
            <DockerMoreActions
              actions={secondaryDockerActions}
              runningActionId={runningActionId}
              onAction={handleDockerAction}
            />
          )}

          <Modal
            visible={seedAction !== null}
            title={t('settings.resourcesPage.docker.seedForm.title')}
            footer={
              <Space>
                <Button onClick={() => setSeedAction(null)}>{t('common.cancel')}</Button>
                <Button
                  type='primary'
                  disabled={!seedForm.imageManifestPath.trim() || !seedForm.imageSeedDir.trim()}
                  onClick={submitSeedForm}
                  data-testid='opl-settings-webui-seed-submit'
                >
                  {t('settings.resourcesPage.docker.seedForm.review')}
                </Button>
              </Space>
            }
            onCancel={() => setSeedAction(null)}
            unmountOnExit
          >
            <div className='flex flex-col gap-14px' data-testid='opl-settings-webui-seed-form'>
              <label className='flex flex-col gap-6px'>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.resourcesPage.docker.seedForm.manifestPath')}
                </Typography.Text>
                <Input
                  value={seedForm.imageManifestPath}
                  placeholder='/path/to/image-manifest.json'
                  onChange={(imageManifestPath) => setSeedForm((current) => ({ ...current, imageManifestPath }))}
                  data-testid='opl-settings-webui-seed-manifest'
                />
              </label>
              <label className='flex flex-col gap-6px'>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.resourcesPage.docker.seedForm.seedDirectory')}
                </Typography.Text>
                <Input
                  value={seedForm.imageSeedDir}
                  placeholder='/path/to/webui-seed'
                  onChange={(imageSeedDir) => setSeedForm((current) => ({ ...current, imageSeedDir }))}
                  data-testid='opl-settings-webui-seed-directory'
                />
              </label>
              <Typography.Text className='text-12px text-t-tertiary'>
                {t('settings.resourcesPage.docker.seedForm.help')}
              </Typography.Text>
            </div>
          </Modal>
        </section>

        <OplConnectionsSection
          registry={connectionRegistry}
          runningActionId={runningActionId}
          onAction={executeConnectionAction}
        />

        {workspaceSources.length > 0 && (
          <section className='opl-settings-section' id='workspace-resources'>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.resourcesPage.connections.workspaceDescription')}
            </Typography.Text>
            <ResourceSources
              sources={workspaceSources}
              emptyKey='settings.resourcesPage.connections.noWorkspaceSources'
              testId='opl-settings-workspace-resource-sources'
            />
          </section>
        )}

        {externalSources.length > 0 && (
          <section className='opl-settings-section' id='reported-resources'>
            <div className='opl-settings-section__header'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.resourcesPage.connections.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.resourcesPage.connections.description')}
                </Typography.Text>
              </div>
            </div>
            <ResourceSources
              sources={externalSources}
              emptyKey='settings.resourcesPage.connections.noSources'
              testId='opl-settings-resource-sources'
            />
          </section>
        )}
      </div>

      <Modal
        visible={diagnosticsVisible}
        title={t('settings.oplEnvironmentPage.updates.diagnostics.title')}
        footer={null}
        onCancel={() => setDiagnosticsVisible(false)}
        unmountOnExit
      >
        <div
          className='grid grid-cols-1 gap-10px text-12px text-t-secondary'
          data-testid='settings-resources-technical-details'
        >
          <Typography.Text className='break-words'>
            {t('settings.resourcesPage.docker.technicalState')}: {dockerWebui.status}
          </Typography.Text>
          <Typography.Text className='break-words'>
            {t('settings.accessPage.remote.runtimeStatus', { status: dockerWebui.runtimeStatus })}
          </Typography.Text>
          <Typography.Text className='break-words'>
            {t('settings.accessPage.remote.recoveryStatus', { status: dockerWebui.recoveryStatus })}
          </Typography.Text>
          {dockerWebui.actions.map((action) => (
            <div key={action.actionId} className='border-0 border-t border-solid border-[var(--border-base)] pt-8px'>
              <DockerActionTechnicalDetails action={action} expanded />
            </div>
          ))}
          {actionEvidence && (
            <div className='border-0 border-t border-solid border-[var(--border-base)] pt-8px'>
              <Typography.Text className='block break-words'>
                {t('settings.resourcesPage.docker.technicalActionId')}: {actionEvidence.actionId}
              </Typography.Text>
              {actionEvidence.receiptRef && (
                <Typography.Text className='block break-words'>{actionEvidence.receiptRef}</Typography.Text>
              )}
            </div>
          )}
          {resourceSources
            .flatMap((source) => [...source.managementRefs, ...source.environmentRefs, ...source.refs])
            .map((ref) => (
              <Typography.Text key={ref} className='break-words'>
                {ref}
              </Typography.Text>
            ))}
        </div>
      </Modal>

      <Modal
        visible={remoteSettingsVisible}
        title={t('settings.accessPage.remote.nativeTitle')}
        footer={null}
        className='settings-sub-modal'
        style={{ width: 'min(820px, calc(100vw - 48px))' }}
        onCancel={() => setRemoteSettingsVisible(false)}
      >
        <WebuiModalContent />
      </Modal>
    </div>
  );
};

const ResourcesSettings: React.FC = () => (
  <SettingsPageWrapper>
    <ResourcesSettingsContent />
  </SettingsPageWrapper>
);

export default ResourcesSettings;

const DockerActionButton: React.FC<{
  action: DockerWebuiAction;
  loading: boolean;
  singleFlight: boolean;
  onAction: (action: DockerWebuiAction) => void;
  primary?: boolean;
  size?: 'mini' | 'small';
}> = ({ action, loading, singleFlight, onAction, primary = false, size }) => {
  const { t } = useTranslation();
  const actionButton = (
    <Button
      data-testid={`opl-settings-docker-webui-action-${action.actionId}`}
      type={primary ? 'primary' : 'secondary'}
      size={size}
      icon={dockerActionIcon(action)}
      loading={loading}
      disabled={singleFlight}
      onClick={() => void onAction(action)}
    >
      {dockerActionCtaLabel(action, t)}
    </Button>
  );

  return actionButton;
};

const DockerMoreActions: React.FC<{
  actions: DockerWebuiAction[];
  runningActionId: string | null;
  onAction: (action: DockerWebuiAction) => void;
}> = ({ actions, runningActionId, onAction }) => {
  const { t } = useTranslation();
  return (
    <div className='opl-settings-flat-subgroup' data-testid='opl-settings-docker-webui-actions'>
      <div className='pt-12px text-12px font-600 text-t-secondary'>
        {t('settings.resourcesPage.docker.availableActions')}
      </div>
      <div className='opl-settings-list mt-6px'>
        {actions.map((action) => (
          <div
            key={action.actionId}
            className='opl-settings-row'
            data-testid={`opl-settings-docker-webui-route-${action.actionId}`}
          >
            <div className='opl-settings-row__main min-w-0'>
              <Typography.Text className='block break-words font-600 text-t-primary'>
                {t(`settings.resourcesPage.docker.actions.${action.actionId}`, {
                  defaultValue: action.label,
                })}
              </Typography.Text>
              <Typography.Text className='block break-words text-12px text-t-secondary'>
                {t(`settings.resourcesPage.docker.actionDescriptions.${action.actionId}`, {
                  defaultValue: action.label,
                })}
              </Typography.Text>
            </div>
            <div className='opl-settings-row__meta flex flex-wrap items-center gap-8px'>
              {action.confirmationRequired && (
                <Tag color='gray'>{t('settings.resourcesPage.docker.confirmationRequired')}</Tag>
              )}
              <DockerActionButton
                action={action}
                loading={runningActionId === action.actionId}
                singleFlight={runningActionId !== null}
                size='small'
                onAction={onAction}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DockerActionEvidencePanel: React.FC<{ evidence: DockerActionEvidence }> = ({ evidence }) => {
  const { t } = useTranslation();
  const title = t(
    evidence.phase === 'check'
      ? 'settings.resourcesPage.docker.checkSuccess'
      : evidence.phase === 'precheck'
        ? 'settings.resourcesPage.docker.actionDryRunSuccess'
        : 'settings.resourcesPage.docker.actionExecuteSuccess'
  );

  return (
    <Alert
      type='success'
      title={title}
      data-testid='opl-settings-docker-webui-action-evidence'
      content={
        <div className='flex flex-col gap-6px'>
          <Typography.Text className='font-600 text-t-primary'>{evidence.actionLabel}</Typography.Text>
          <Typography.Text
            className='break-words text-12px text-t-secondary'
            data-testid='opl-settings-docker-webui-action-result'
          >
            {evidence.summary}
          </Typography.Text>
          {evidence.receiptSummary && (
            <Typography.Text
              className='break-words text-12px text-t-secondary'
              data-testid='opl-settings-docker-webui-action-receipt'
            >
              {t('settings.capabilitiesPage.refLabels.receipt')}: {evidence.receiptSummary}
            </Typography.Text>
          )}
        </div>
      }
    />
  );
};

const DockerActionTechnicalDetails: React.FC<{ action: DockerWebuiAction; expanded?: boolean }> = ({ action }) => {
  const { t } = useTranslation();

  return (
    <div className='grid grid-cols-1 gap-4px text-12px text-t-secondary'>
      <Typography.Text className='font-600 text-t-primary'>{action.label}</Typography.Text>
      <Typography.Text className='break-words'>
        {t('settings.resourcesPage.docker.technicalState')}: {action.state}
      </Typography.Text>
      <Typography.Text className='break-words'>
        {t('settings.resourcesPage.docker.technicalActionId')}: {action.actionId}
      </Typography.Text>
      {action.route && (
        <Typography.Text className='break-words'>
          {t('settings.resourcesPage.docker.technicalCommand')}: {action.route}
        </Typography.Text>
      )}
      {action.dryRunRoute && (
        <Typography.Text className='break-words'>
          {t('settings.resourcesPage.docker.technicalPreviewCommand')}: {action.dryRunRoute}
        </Typography.Text>
      )}
    </div>
  );
};

const ResourceSources: React.FC<{
  sources: ResourceSourceProjection[];
  emptyKey: string;
  testId: string;
}> = ({ sources, emptyKey, testId }) => {
  const { t } = useTranslation();
  if (sources.length === 0) {
    return (
      <div className='opl-settings-empty'>
        <Typography.Text className='text-13px text-t-secondary'>{t(emptyKey)}</Typography.Text>
      </div>
    );
  }
  return (
    <div className='opl-settings-list border-0 border-t border-solid border-border-1' data-testid={testId}>
      {sources.map((source) => (
        <ResourceSourceRow key={source.key} source={source} />
      ))}
    </div>
  );
};

const ResourceSourceRow: React.FC<{ source: ResourceSourceProjection }> = ({ source }) => {
  const { t } = useTranslation();
  const refs = [...source.managementRefs, ...source.environmentRefs, ...source.refs];
  const readiness = resourceReadiness(source.status);

  return (
    <div className='opl-settings-row'>
      <div className='opl-settings-row__main min-w-0'>
        <Typography.Text className='block break-words font-600 text-t-primary'>{source.title}</Typography.Text>
        <div className='mt-4px flex flex-wrap gap-6px'>
          {source.category !== 'oplWorkspace' && (
            <Tag color='gray'>{t(`settings.resourcesPage.resourceSources.categories.${source.category}`)}</Tag>
          )}
          {source.management && (
            <Tag color={source.management === 'consoleManaged' ? 'arcoblue' : 'gray'}>
              {t(`settings.resourcesPage.resourceSources.management.${source.management}`)}
            </Tag>
          )}
          {source.managementRefs.length > 0 && (
            <Tag color='gray'>{t('settings.resourcesPage.resourceSources.managementRefs')}</Tag>
          )}
          {source.environmentRefs.length > 0 && (
            <Tag color='gray'>{t('settings.resourcesPage.resourceSources.environmentRefs')}</Tag>
          )}
        </div>
        {refs.length === 0 && (
          <Typography.Text className='mt-4px block text-12px text-t-secondary'>
            {t('settings.resourcesPage.resourceSources.noRefs')}
          </Typography.Text>
        )}
      </div>
      <div className='opl-settings-row__meta'>
        <Tag color={resourceReadinessColor(readiness)}>{resourceReadinessLabel(readiness, t)}</Tag>
      </div>
    </div>
  );
};
