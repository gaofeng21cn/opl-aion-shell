import { Button, Collapse, Empty, Input, Radio, Spin, Tag } from '@arco-design/web-react';
import { CheckOne, Config, Help, Right, Shield, Tool, Workbench } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { IOplGatewayAccountErrorCode } from '@/common/adapter/ipcBridge';
import { getOplProductDisplayName } from '@/common/config/oplProductProfile';
import type { OplAppStatePayload } from '@/common/types/opl/appState';
import appLogo from '@/renderer/assets/logos/brand/app.png';
import WindowControls from '@/renderer/components/layout/WindowControls';
import { getAppState } from '@/renderer/hooks/system/useOplAppState';
import { readGatewayAccountProjection, resolveDefaultGatewayGroup } from '@/renderer/pages/settings/accessProjection';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import {
  FIRST_RUN_ITEM_IDS,
  findChecklistItem,
  findNextVisibleStep,
  formatFullReadinessProgressText,
  formatMaintenanceProgressText,
  hasCodexConfigBlocker,
  readInitializePayload,
  type FirstRunItemId,
} from './initializeModel';
import type {
  FirstRunChecklistItem,
  FirstRunCommandResult,
  FirstRunInitialize,
  FirstRunInitializeEvent,
} from './types';
import styles from './FirstRun.module.css';

type MaintenanceAction = 'install_prep' | 'startup_maintenance' | 'reconcile_modules';
type AccessMethod = 'gateway_account' | 'api_key';
type Translate = (key: string, values?: Record<string, string | number>) => string;
type FirstRunError = {
  source: 'initialize' | 'configure_codex' | 'gateway_account' | 'maintenance' | 'workspace';
  detail: string;
  gatewayErrorCode?: IOplGatewayAccountErrorCode;
};

class GatewayAccountFlowError extends Error {
  readonly code: IOplGatewayAccountErrorCode;

  constructor(code: IOplGatewayAccountErrorCode) {
    super(code);
    this.code = code;
  }
}

const POST_INSTALL_SELF_CHECK_STATE = { postInstallSelfCheck: true };
const PRODUCT_DISPLAY_NAME = getOplProductDisplayName();
const PRIMARY_FIRST_RUN_ITEM_IDS: FirstRunItemId[] = ['workspace_root', 'codex', 'codex_config'];
const STATUS_READY = new Set(['ready', 'installed', 'detected', 'configured']);
const STATUS_NEEDS_ACTION = new Set(['missing', 'blocking', 'failed']);
const STATUS_LABEL_KEYS: Record<string, string> = {
  ready: 'settings.firstRun.status.ready',
  installed: 'settings.firstRun.status.installed',
  detected: 'settings.firstRun.status.detected',
  configured: 'settings.firstRun.status.configured',
  disabled: 'settings.firstRun.status.disabled',
  missing: 'settings.firstRun.status.missing',
  initializing: 'settings.firstRun.status.initializing',
  attention_needed: 'settings.firstRun.status.attentionNeeded',
  blocking: 'settings.firstRun.status.blocking',
  failed: 'settings.firstRun.status.failed',
};
const INITIALIZE_PHASE_LABEL_KEYS: Record<string, string> = {
  environment: 'settings.firstRun.initializePhases.environment',
  codex: 'settings.firstRun.initializePhases.codex',
  family_runtime_provider: 'settings.firstRun.initializePhases.familyRuntimeProvider',
  native_helpers: 'settings.firstRun.initializePhases.nativeHelpers',
  modules: 'settings.firstRun.initializePhases.modules',
  developer_mode: 'settings.firstRun.initializePhases.developerMode',
  settings: 'settings.firstRun.initializePhases.settings',
  workspace_root: 'settings.firstRun.initializePhases.workspaceRoot',
  recommended_skills: 'settings.firstRun.initializePhases.recommendedSkills',
  gui_shell: 'settings.firstRun.initializePhases.guiShell',
  summary: 'settings.firstRun.initializePhases.summary',
};
const ITEM_LABEL_KEYS: Record<FirstRunItemId, string> = {
  workspace_root: 'settings.firstRun.items.workspaceRoot',
  codex: 'settings.firstRun.items.codex',
  codex_config: 'settings.firstRun.items.codexConfig',
  domain_modules: 'settings.firstRun.items.domainModules',
  family_runtime_provider: 'settings.firstRun.items.familyRuntimeProvider',
  recommended_skills: 'settings.firstRun.items.recommendedSkills',
};
const ITEM_SUMMARY_KEYS: Record<
  FirstRunItemId,
  { pending: string; checking: string; ready: string; needsAction: string; maintenance: string }
> = {
  workspace_root: {
    pending: 'settings.firstRun.itemSummaries.workspaceRoot.pending',
    checking: 'settings.firstRun.itemSummaries.workspaceRoot.checking',
    ready: 'settings.firstRun.itemSummaries.workspaceRoot.ready',
    needsAction: 'settings.firstRun.itemSummaries.workspaceRoot.needsAction',
    maintenance: 'settings.firstRun.itemSummaries.workspaceRoot.pending',
  },
  codex: {
    pending: 'settings.firstRun.itemSummaries.codex.pending',
    checking: 'settings.firstRun.itemSummaries.codex.checking',
    ready: 'settings.firstRun.itemSummaries.codex.ready',
    needsAction: 'settings.firstRun.itemSummaries.codex.needsAction',
    maintenance: 'settings.firstRun.itemSummaries.codex.pending',
  },
  codex_config: {
    pending: 'settings.firstRun.itemSummaries.codexConfig.pending',
    checking: 'settings.firstRun.itemSummaries.codexConfig.checking',
    ready: 'settings.firstRun.itemSummaries.codexConfig.ready',
    needsAction: 'settings.firstRun.itemSummaries.codexConfig.needsAction',
    maintenance: 'settings.firstRun.itemSummaries.codexConfig.pending',
  },
  domain_modules: {
    pending: 'settings.firstRun.itemSummaries.domainModules.pending',
    checking: 'settings.firstRun.itemSummaries.domainModules.checking',
    ready: 'settings.firstRun.itemSummaries.domainModules.ready',
    needsAction: 'settings.firstRun.itemSummaries.domainModules.maintenance',
    maintenance: 'settings.firstRun.itemSummaries.domainModules.maintenance',
  },
  family_runtime_provider: {
    pending: 'settings.firstRun.itemSummaries.familyRuntimeProvider.pending',
    checking: 'settings.firstRun.itemSummaries.familyRuntimeProvider.checking',
    ready: 'settings.firstRun.itemSummaries.familyRuntimeProvider.ready',
    needsAction: 'settings.firstRun.itemSummaries.familyRuntimeProvider.maintenance',
    maintenance: 'settings.firstRun.itemSummaries.familyRuntimeProvider.maintenance',
  },
  recommended_skills: {
    pending: 'settings.firstRun.itemSummaries.recommendedSkills.pending',
    checking: 'settings.firstRun.itemSummaries.recommendedSkills.checking',
    ready: 'settings.firstRun.itemSummaries.recommendedSkills.ready',
    needsAction: 'settings.firstRun.itemSummaries.recommendedSkills.maintenance',
    maintenance: 'settings.firstRun.itemSummaries.recommendedSkills.maintenance',
  },
};
const NEXT_STEP_KEYS: Record<FirstRunItemId, string> = {
  workspace_root: 'settings.firstRun.nextSteps.workspaceRoot',
  codex: 'settings.firstRun.nextSteps.codex',
  codex_config: 'settings.firstRun.nextSteps.codexConfig',
  domain_modules: 'settings.firstRun.nextSteps.domainModules',
  family_runtime_provider: 'settings.firstRun.nextSteps.familyRuntimeProvider',
  recommended_skills: 'settings.firstRun.nextSteps.recommendedSkills',
};

function itemStatusColor(item: FirstRunChecklistItem | null): string {
  if (!item) return 'gray';
  if (item.blocking || item.severity === 'blocking') return 'red';
  if (item.severity === 'maintenance') return 'orange';
  if (STATUS_READY.has(item.status)) return 'green';
  return 'gray';
}

function isItemReady(item: FirstRunChecklistItem | null): boolean {
  return STATUS_READY.has(item?.status ?? '');
}

function isKnownFirstRunItemId(itemId: string | undefined): itemId is FirstRunItemId {
  return Boolean(itemId && FIRST_RUN_ITEM_IDS.includes(itemId as FirstRunItemId));
}

function formatItemStatus(item: FirstRunChecklistItem | null, fallback: string, t: Translate): string {
  if (!item?.status) return fallback;
  const labelKey = STATUS_LABEL_KEYS[item.status];
  return labelKey ? t(labelKey) : fallback;
}

function formatItemLabel(item: FirstRunChecklistItem | null, fallbackLabel: string, t: Translate): string {
  if (isKnownFirstRunItemId(item?.item_id)) return t(ITEM_LABEL_KEYS[item.item_id]);
  return fallbackLabel;
}

function formatItemSummary(item: FirstRunChecklistItem | null, fallbackSummary: string, t: Translate): string {
  if (!item || !isKnownFirstRunItemId(item.item_id)) return fallbackSummary;
  const summaryKeys = ITEM_SUMMARY_KEYS[item.item_id];
  if (
    item.blocking ||
    item.severity === 'blocking' ||
    STATUS_NEEDS_ACTION.has(item.status) ||
    (item.status === 'attention_needed' && item.severity !== 'maintenance')
  ) {
    return t(summaryKeys.needsAction);
  }
  if (STATUS_READY.has(item.status)) return t(summaryKeys.ready);
  if (item.severity === 'maintenance' || item.status === 'attention_needed') return t(summaryKeys.maintenance);
  if (item.status === 'initializing') return t(summaryKeys.checking);
  return t(summaryKeys.pending);
}

function formatItemIds(ids: string[], t: Translate): string[] {
  return ids.map((itemId) => {
    if (isKnownFirstRunItemId(itemId)) return t(ITEM_LABEL_KEYS[itemId]);
    return t('settings.firstRun.items.otherSetup');
  });
}

function formatNextVisibleStep(initialize: FirstRunInitialize | null, t: Translate): string | null {
  const blockingItemIds = initialize?.setup_flow?.blocking_items ?? [];
  const blockedItem = initialize?.checklist?.find((entry) => blockingItemIds.includes(entry.item_id) || entry.blocking);
  const item = blockedItem ?? initialize?.checklist?.find((entry) => entry.next_visible_step);
  if (!isKnownFirstRunItemId(item?.item_id)) return null;
  return t(NEXT_STEP_KEYS[item.item_id]);
}

function resultPreview(result: FirstRunCommandResult): string {
  if (!result) return '';
  return JSON.stringify(result.parsed ?? {}, null, 2);
}

function formatInitializeEvent(event: FirstRunInitializeEvent, t: Translate): string {
  if (!event) return t('settings.firstRun.initializePending.progress');
  const labelKey = INITIALIZE_PHASE_LABEL_KEYS[event.phase];
  const label = labelKey ? t(labelKey) : t('settings.firstRun.initializePending.progress');
  const duration =
    event.duration_ms && event.duration_ms > 0
      ? t('settings.firstRun.initializePending.duration', {
          seconds: Math.max(1, Math.round(event.duration_ms / 1000)),
        })
      : '';
  return `${label}${duration}`;
}

function formatFirstRunError(error: FirstRunError | null, t: (key: string) => string): string | null {
  if (!error) return null;
  if (error.source === 'configure_codex') return t('settings.firstRun.error.codexConfig');
  if (error.source === 'gateway_account') return t(gatewayAccountErrorTranslationKey(error.gatewayErrorCode));
  if (error.source === 'workspace') return t('settings.firstRun.error.workspace');
  if (error.source === 'maintenance') return t('settings.firstRun.error.blocked');
  return t('settings.firstRun.error.general');
}

const GATEWAY_ACCOUNT_ERROR_CODES = new Set<IOplGatewayAccountErrorCode>([
  'invalid_credentials',
  'account_disabled',
  'mfa_or_challenge_required',
  'session_not_persistable',
  'group_selection_required',
  'auth_expired',
  'network_unreachable',
  'rate_limited',
  'managed_key_missing',
  'managed_key_conflict',
  'managed_key_identity_drift',
  'disconnect_pending',
  'invalid_request',
  'internal_contract_violation',
  'gateway_account_failed',
]);

function normalizeGatewayAccountErrorCode(value: unknown): IOplGatewayAccountErrorCode {
  return typeof value === 'string' && GATEWAY_ACCOUNT_ERROR_CODES.has(value as IOplGatewayAccountErrorCode)
    ? (value as IOplGatewayAccountErrorCode)
    : 'gateway_account_failed';
}

function gatewayAccountErrorTranslationKey(code: IOplGatewayAccountErrorCode | undefined): string {
  const keys: Record<IOplGatewayAccountErrorCode, string> = {
    invalid_request: 'settings.accessPage.gatewayAccount.errors.invalidRequest',
    invalid_credentials: 'settings.accessPage.gatewayAccount.errors.invalidCredentials',
    account_disabled: 'settings.accessPage.gatewayAccount.errors.accountDisabled',
    mfa_or_challenge_required: 'settings.accessPage.gatewayAccount.errors.mfaOrChallengeRequired',
    session_not_persistable: 'settings.accessPage.gatewayAccount.errors.sessionNotPersistable',
    group_selection_required: 'settings.accessPage.gatewayAccount.errors.groupSelectionRequired',
    auth_expired: 'settings.accessPage.gatewayAccount.errors.authExpired',
    network_unreachable: 'settings.accessPage.gatewayAccount.errors.networkUnreachable',
    rate_limited: 'settings.accessPage.gatewayAccount.errors.rateLimited',
    managed_key_missing: 'settings.accessPage.gatewayAccount.errors.managedKeyMissing',
    managed_key_conflict: 'settings.accessPage.gatewayAccount.errors.managedKeyConflict',
    managed_key_identity_drift: 'settings.accessPage.gatewayAccount.errors.managedKeyIdentityDrift',
    disconnect_pending: 'settings.accessPage.gatewayAccount.errors.disconnectPending',
    internal_contract_violation: 'settings.accessPage.gatewayAccount.errors.internalContractViolation',
    gateway_account_failed: 'settings.accessPage.gatewayAccount.errors.generic',
  };
  return keys[code ?? 'gateway_account_failed'];
}

function assertBridgeResultOk(result: Exclude<FirstRunCommandResult, null>): void {
  if (result.ok === false) {
    throw new Error(result.error?.message || 'OPL runtime command failed');
  }
}

function redactSensitiveValue(value: string, secret: string): string {
  return secret ? value.split(secret).join('[REDACTED]') : value;
}

function redactDiagnosticValue(value: unknown, secret: string): unknown {
  if (typeof value === 'string') return redactSensitiveValue(value, secret);
  if (Array.isArray(value)) return value.map((entry) => redactDiagnosticValue(entry, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactDiagnosticValue(entry, secret)]));
  }
  return value;
}

function redactCommandResult(
  result: Exclude<FirstRunCommandResult, null>,
  secret: string
): Exclude<FirstRunCommandResult, null> {
  return {
    ...result,
    command: redactSensitiveValue(result.command, secret),
    stdout: redactSensitiveValue(result.stdout, secret),
    parsed: redactDiagnosticValue(result.parsed, secret),
    error: result.error
      ? {
          ...result.error,
          message: redactSensitiveValue(result.error.message, secret),
          stderr: result.error.stderr ? redactSensitiveValue(result.error.stderr, secret) : result.error.stderr,
        }
      : undefined,
  };
}

function ReadinessItem({
  item,
  fallbackLabel,
  fallbackSummary,
}: {
  item: FirstRunChecklistItem | null;
  fallbackLabel: string;
  fallbackSummary: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.firstRunItem}>
      <div className={styles.firstRunItemBody}>
        <div className={styles.firstRunItemTitle}>{formatItemLabel(item, fallbackLabel, t)}</div>
        <div className={styles.firstRunItemSummary}>{formatItemSummary(item, fallbackSummary, t)}</div>
        {item?.action_command_ref && <code className={styles.firstRunCommand}>{item.action_command_ref}</code>}
      </div>
      <Tag size='small' color={itemStatusColor(item)}>
        {formatItemStatus(item, t('settings.firstRun.status.unknown'), t)}
      </Tag>
    </div>
  );
}

const FirstRun: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktopRuntime = isElectronDesktop();
  const [initializeResult, setInitializeResult] = useState<FirstRunCommandResult>(null);
  const [actionResult, setActionResult] = useState<FirstRunCommandResult>(null);
  const [apiKey, setApiKey] = useState('');
  const [gatewayEmail, setGatewayEmail] = useState('');
  const [gatewayPassword, setGatewayPassword] = useState('');
  const [accessMethod, setAccessMethod] = useState<AccessMethod>(isDesktopRuntime ? 'gateway_account' : 'api_key');
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);
  const [initializeLoading, setInitializeLoading] = useState(false);
  const [initializeEvent, setInitializeEvent] = useState<FirstRunInitializeEvent>(null);
  const [actionLoading, setActionLoading] = useState<
    MaintenanceAction | 'configure_codex' | 'gateway_account' | 'workspace_root' | null
  >(null);
  const [error, setError] = useState<FirstRunError | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const taskPanelRef = useRef<HTMLElement>(null);
  const previousActivePrimaryStepRef = useRef<FirstRunItemId | null>(null);
  const readyEntryRef = useRef<HTMLButtonElement>(null);
  const technicalDetailsRef = useRef<HTMLDivElement>(null);
  const isMacRuntime = isDesktopRuntime && isMacOS();
  const showWindowControls = isDesktopRuntime && !isMacRuntime && Boolean(ipcBridge.windowControls);

  const initialize = useMemo<FirstRunInitialize | null>(
    () => readInitializePayload(initializeResult?.parsed),
    [initializeResult]
  );
  const initializePending = initializeLoading && !initializeResult;
  const readyToLaunch = initialize?.setup_flow?.ready_to_launch === true;
  const codexConfigBlocked = hasCodexConfigBlocker(initialize);
  const fullReadinessProgressText = formatFullReadinessProgressText(initialize);
  const maintenanceProgressText = formatMaintenanceProgressText(initialize);
  const blockingItems = initialize?.setup_flow?.blocking_items ?? [];
  const maintenanceItems = initialize?.setup_flow?.maintenance_items ?? [];
  const hasBlockingItems = blockingItems.length > 0;
  const currentPhase = initializePending
    ? (initializeEvent?.phase ?? t('settings.firstRun.initializePending.phase'))
    : (initialize?.setup_flow?.phase ?? initialize?.overall_state ?? t('settings.firstRun.status.unknown'));
  const rawNextVisibleStep = findNextVisibleStep(initialize);
  const nextVisibleStep =
    formatNextVisibleStep(initialize, t) ?? (rawNextVisibleStep ? t('settings.firstRun.nextSteps.generic') : null);
  const coreProgress = initialize?.setup_flow?.progress;
  const readyCoreCount = coreProgress?.ready_required_count ?? coreProgress?.required_completed_count ?? 0;
  const totalCoreCount = coreProgress?.total_required_count ?? coreProgress?.required_total_count ?? 3;

  const refreshInitialize = useCallback(async () => {
    setInitializeLoading(true);
    setInitializeEvent(null);
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.getInitialize.invoke();
      assertBridgeResultOk(result);
      const initializePayload = readInitializePayload(result.parsed);
      if (!initializePayload) {
        throw new Error('OPL initialize payload is missing or invalid.');
      }
      setInitializeResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError({ source: 'initialize', detail: message });
    } finally {
      setInitializeLoading(false);
    }
  }, []);

  const runMaintenanceAction = useCallback(
    async (action: MaintenanceAction) => {
      setActionLoading(action);
      setError(null);
      try {
        const result =
          action === 'install_prep'
            ? await ipcBridge.oplRuntime.runInstallPrep.invoke()
            : action === 'startup_maintenance'
              ? await ipcBridge.oplRuntime.runStartupMaintenance.invoke()
              : await ipcBridge.oplRuntime.runReconcileModules.invoke();
        assertBridgeResultOk(result);
        setActionResult(result);
        await refreshInitialize();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError({ source: 'maintenance', detail: message });
      } finally {
        setActionLoading(null);
      }
    },
    [refreshInitialize, t]
  );

  const configureCodex = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError({ source: 'configure_codex', detail: t('settings.firstRun.codex.apiKeyRequired') });
      return;
    }
    setActionLoading('configure_codex');
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.configureCodex.invoke({ apiKey: trimmed });
      assertBridgeResultOk(result);
      setActionResult(redactCommandResult(result, trimmed));
      setApiKey('');
      await refreshInitialize();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError({ source: 'configure_codex', detail: redactSensitiveValue(message, trimmed) });
    } finally {
      setActionLoading(null);
    }
  }, [apiKey, refreshInitialize, t]);

  const completeGatewayAccountSetup = useCallback(async () => {
    const stateResult = await ipcBridge.oplRuntime.getAppState.invoke({ profile: 'fast' });
    if (stateResult.ok === false) {
      throw new GatewayAccountFlowError(normalizeGatewayAccountErrorCode(stateResult.error?.code));
    }
    const gatewayAccount = readGatewayAccountProjection(getAppState(stateResult.parsed as OplAppStatePayload));
    if (!gatewayAccount || gatewayAccount.connection_mode !== 'account' || !gatewayAccount.account_card_visible) {
      throw new GatewayAccountFlowError('internal_contract_violation');
    }
    if (gatewayAccount.freshness.last_error_code) {
      throw new GatewayAccountFlowError(normalizeGatewayAccountErrorCode(gatewayAccount.freshness.last_error_code));
    }
    if (gatewayAccount.managed_key) return;
    if (gatewayAccount.actions.complete_setup !== 'gateway_account_complete_setup') {
      throw new GatewayAccountFlowError('internal_contract_violation');
    }
    const groupId = resolveDefaultGatewayGroup(gatewayAccount.available_groups);
    if (!groupId) throw new GatewayAccountFlowError('group_selection_required');
    const setupResult = await ipcBridge.oplRuntime.executeAction.invoke({
      actionId: 'gateway_account_complete_setup',
      dryRun: false,
      payloadJson: { group_id: groupId },
    });
    if (setupResult.ok === false) {
      throw new GatewayAccountFlowError(normalizeGatewayAccountErrorCode(setupResult.error?.code));
    }
    setActionResult(setupResult);
  }, []);

  const loginGatewayAccount = useCallback(async () => {
    const email = gatewayEmail.trim();
    if (!isDesktopRuntime || !email || !gatewayPassword) {
      setError({
        source: 'gateway_account',
        detail: 'invalid_request',
        gatewayErrorCode: 'invalid_request',
      });
      setGatewayPassword('');
      return;
    }
    setActionLoading('gateway_account');
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.loginGatewayAccount.invoke({
        email,
        password: gatewayPassword,
      });
      if (!result.ok) {
        throw new GatewayAccountFlowError(result.errorCode ?? 'gateway_account_failed');
      }
      await completeGatewayAccountSetup();
      await refreshInitialize();
    } catch (err) {
      const code = err instanceof GatewayAccountFlowError ? err.code : 'gateway_account_failed';
      setError({ source: 'gateway_account', detail: code, gatewayErrorCode: code });
    } finally {
      setGatewayPassword('');
      setActionLoading(null);
    }
  }, [completeGatewayAccountSetup, gatewayEmail, gatewayPassword, isDesktopRuntime, refreshInitialize]);

  const changeAccessMethod = useCallback((value: string | number) => {
    setGatewayPassword('');
    setError(null);
    setAccessMethod(value === 'api_key' ? 'api_key' : 'gateway_account');
  }, []);

  const chooseWorkspaceRoot = useCallback(async () => {
    setActionLoading('workspace_root');
    setError(null);
    try {
      const paths = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] });
      const selectedPath = paths?.[0];
      if (!selectedPath) return;
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'workspace_root_set',
        dryRun: false,
        payloadRefsOnlyJson: { path: selectedPath },
      });
      assertBridgeResultOk(result);
      setActionResult(result);
      await refreshInitialize();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError({ source: 'workspace', detail: message });
    } finally {
      setActionLoading(null);
    }
  }, [refreshInitialize]);

  useEffect(() => {
    return ipcBridge.oplRuntime.initializeEvent.on((event) => {
      setInitializeEvent(event);
    });
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return undefined;

    const hiddenSiblings: Array<{
      element: HTMLElement;
      ariaHidden: string | null;
      hadInert: boolean;
    }> = [];
    let branch: HTMLElement = page;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        hiddenSiblings.push({
          element: sibling,
          ariaHidden: sibling.getAttribute('aria-hidden'),
          hadInert: sibling.hasAttribute('inert'),
        });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      if (parent === document.body) break;
      branch = parent;
    }
    page.focus({ preventScroll: true });

    return () => {
      for (const { element, ariaHidden, hadInert } of hiddenSiblings) {
        if (!hadInert) element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
    };
  }, []);

  useEffect(() => {
    document.title = 'One Person Lab App';
    void refreshInitialize();
  }, [refreshInitialize]);

  useEffect(() => {
    if (readyToLaunch) {
      readyEntryRef.current?.focus({ preventScroll: true });
    }
  }, [readyToLaunch]);

  const itemLabels = Object.fromEntries(
    FIRST_RUN_ITEM_IDS.map((itemId) => [itemId, t(ITEM_LABEL_KEYS[itemId])])
  ) as Record<FirstRunItemId, string>;
  const primaryItems = PRIMARY_FIRST_RUN_ITEM_IDS.map((itemId) => ({
    id: itemId,
    item: findChecklistItem(initialize, itemId),
    label: itemLabels[itemId],
  }));
  const activePrimaryStepId = primaryItems.find(({ item }) => !isItemReady(item))?.id ?? 'codex_config';
  const activePrimaryStepIndex = Math.max(1, primaryItems.findIndex(({ id }) => id === activePrimaryStepId) + 1);
  const showModelAccessTask = codexConfigBlocked && activePrimaryStepId === 'codex_config';
  const initializeUnresolved = initialize === null;
  const requestInFlight = initializeLoading || actionLoading !== null;
  const userFacingError = formatFirstRunError(error, t);
  const primaryBlockerLabels = formatItemIds(blockingItems, t);
  const maintenanceLabels = formatItemIds(maintenanceItems, t);
  const blockerSummary = initializeUnresolved
    ? t('settings.firstRun.checking.itemsPending')
    : primaryBlockerLabels.length > 0
      ? primaryBlockerLabels.join(', ')
      : t('settings.firstRun.noCoreBlockers');
  const nextStepSummary = initializeUnresolved
    ? t('settings.firstRun.checking.nextStepPending')
    : readyToLaunch
      ? t('settings.firstRun.noNextStep')
      : (nextVisibleStep ?? t('settings.firstRun.noNextStep'));
  const beginnerSummary = initializeLoading
    ? t('settings.firstRun.beginner.summaryChecking')
    : readyToLaunch
      ? t('settings.firstRun.beginner.summaryReady')
      : hasBlockingItems
        ? t('settings.firstRun.beginner.summaryNeedsAction')
        : t('settings.firstRun.beginner.summaryPreparing');

  useEffect(() => {
    if (!initialize || readyToLaunch) return;
    const previousActiveStep = previousActivePrimaryStepRef.current;
    previousActivePrimaryStepRef.current = activePrimaryStepId;
    if (previousActiveStep && previousActiveStep !== activePrimaryStepId) {
      taskPanelRef.current?.focus({ preventScroll: true });
    }
  }, [activePrimaryStepId, initialize, readyToLaunch]);

  const openTechnicalDetails = useCallback(() => {
    setTechnicalDetailsOpen(true);
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      technicalDetailsRef.current?.scrollIntoView({ behavior, block: 'start' });
    });
  }, []);

  return (
    <main
      ref={pageRef}
      className={styles.firstRunPage}
      aria-labelledby='opl-first-run-setup-title'
      data-testid='opl-first-run-window'
      tabIndex={-1}
    >
      <header className={`${styles.firstRunBrandBar} ${isMacRuntime ? styles.firstRunBrandBarMac : ''}`}>
        <div className={styles.firstRunBrandIdentity}>
          <img src={appLogo} alt='' aria-hidden='true' />
          <span>{PRODUCT_DISPLAY_NAME}</span>
        </div>
        <div className={styles.firstRunBrandActions} data-testid='opl-first-run-window-actions'>
          {!readyToLaunch && (
            <Button
              type='text'
              size='small'
              icon={<Right />}
              className={styles.firstRunEnterButton}
              onClick={() => navigate('/guid')}
              data-testid='opl-first-run-enter-app'
            >
              {t('settings.firstRun.enterGuid')}
            </Button>
          )}
          <Button
            type='text'
            size='small'
            icon={<Help />}
            className={styles.firstRunHelpButton}
            onClick={openTechnicalDetails}
            aria-label={t('settings.firstRun.help')}
            title={t('settings.firstRun.help')}
          >
            <span className={styles.firstRunHelpLabel}>{t('settings.firstRun.help')}</span>
          </Button>
          {showWindowControls && (
            <div className={styles.firstRunWindowControls} data-testid='opl-first-run-window-controls'>
              <WindowControls />
            </div>
          )}
        </div>
      </header>

      <div className={styles.firstRunScrollArea}>
        <section className={styles.firstRunWorkspace} data-testid='opl-first-run-focused-workspace'>
          <div className={styles.firstRunWorkspaceBody} data-testid='opl-first-run-progress'>
            <div className={styles.firstRunBeginnerSurface} data-testid='opl-first-run-beginner-primary'>
              <aside className={styles.firstRunStepRail} data-testid='opl-first-run-step-rail'>
                <div className={styles.firstRunStepRailHeader}>
                  <h1 id='opl-first-run-setup-title'>{t('settings.firstRun.setupTitle')}</h1>
                  <p>{t('settings.firstRun.estimatedTime')}</p>
                </div>

                <ol className={styles.firstRunStepList}>
                  {primaryItems.map(({ id, item, label }, index) => {
                    const ready = isItemReady(item);
                    const active = !ready && id === activePrimaryStepId;
                    const stateClass = ready
                      ? styles.firstRunStepComplete
                      : active
                        ? styles.firstRunStepActive
                        : styles.firstRunStepPending;
                    return (
                      <li
                        key={id}
                        className={`${styles.firstRunStep} ${stateClass}`}
                        data-testid={`opl-first-run-step-${id}`}
                        data-state={ready ? 'complete' : active ? 'active' : 'pending'}
                      >
                        <span className={styles.firstRunStepMarker} aria-hidden='true'>
                          {ready ? <CheckOne /> : index + 1}
                        </span>
                        <span className={styles.firstRunStepCopy}>
                          <span className={styles.firstRunStepLabel}>{formatItemLabel(item, label, t)}</span>
                          <span className={styles.firstRunStepStatus}>
                            {formatItemStatus(
                              item,
                              initializePending && active
                                ? t('settings.firstRun.status.initializing')
                                : t('settings.firstRun.status.unknown'),
                              t
                            )}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <div className={styles.firstRunStepProgress} data-testid='opl-first-run-core-progress'>
                  {t('settings.firstRun.stepProgress', { ready: readyCoreCount, total: totalCoreCount })}
                </div>

                <Button
                  type='text'
                  icon={<Tool />}
                  className={styles.firstRunTechnicalButton}
                  onClick={openTechnicalDetails}
                  data-testid='opl-first-run-technical-details-toggle'
                >
                  {t('settings.firstRun.technicalDetails')}
                </Button>
              </aside>

              <section
                ref={taskPanelRef}
                className={styles.firstRunTaskPanel}
                data-testid='opl-first-run-task-panel'
                aria-live='polite'
                tabIndex={-1}
              >
                <div className={styles.firstRunStepCounter}>
                  {t('settings.firstRun.stepCounter', {
                    current: readyToLaunch ? totalCoreCount : activePrimaryStepIndex,
                    total: totalCoreCount,
                  })}
                </div>

                {userFacingError && (
                  <div className={styles.firstRunError} data-testid='opl-first-run-user-error'>
                    {userFacingError}
                  </div>
                )}

                <div className={styles.firstRunTaskContent}>
                  {initializePending ? (
                    <div className={styles.firstRunStatePanel}>
                      <span className={styles.firstRunStateIcon} aria-hidden='true'>
                        <Spin />
                      </span>
                      <h2>{t('settings.firstRun.checking.title')}</h2>
                      <p data-testid='opl-first-run-beginner-summary'>{beginnerSummary}</p>
                      <div className={styles.firstRunInitializeStatus}>
                        <span>{t('settings.firstRun.checking.currentTask')}</span>
                        <strong data-testid='opl-first-run-initialize-pending'>
                          {formatInitializeEvent(initializeEvent, t)}
                        </strong>
                      </div>
                      <div className={styles.firstRunTaskActions} data-testid='opl-first-run-primary-action'>
                        <Button type='primary' size='large' loading>
                          {t('settings.firstRun.checking.action')}
                        </Button>
                      </div>
                    </div>
                  ) : initializeUnresolved && error ? (
                    <div className={styles.firstRunStatePanel} data-testid='opl-first-run-error-card'>
                      <span className={styles.firstRunStateIcon} aria-hidden='true'>
                        <Config />
                      </span>
                      <h2>{t('settings.firstRun.error.title')}</h2>
                      <p data-testid='opl-first-run-beginner-summary'>{t('settings.firstRun.error.description')}</p>
                      <div className={styles.firstRunTaskActions} data-testid='opl-first-run-primary-action'>
                        <Button
                          type='primary'
                          size='large'
                          loading={initializeLoading}
                          disabled={requestInFlight}
                          onClick={() => void refreshInitialize()}
                        >
                          {t('settings.firstRun.error.retry')}
                        </Button>
                      </div>
                    </div>
                  ) : showModelAccessTask ? (
                    <div className={styles.firstRunStatePanel} data-testid='opl-first-run-codex-card'>
                      <span className={styles.firstRunStateIcon} aria-hidden='true'>
                        <Shield />
                      </span>
                      <h2>{t('settings.firstRun.modelAccess.title')}</h2>
                      <p data-testid='opl-first-run-beginner-summary'>
                        {t('settings.firstRun.modelAccess.description')}
                      </p>
                      <div className={styles.firstRunAttentionStrip}>
                        <Config aria-hidden='true' />
                        <span>{t('settings.firstRun.modelAccess.oneStepRemaining')}</span>
                      </div>

                      {isDesktopRuntime && (
                        <Radio.Group
                          type='button'
                          value={accessMethod}
                          onChange={changeAccessMethod}
                          disabled={requestInFlight}
                          aria-label={t('settings.firstRun.modelAccess.methodLabel')}
                          className={styles.firstRunAccessMethods}
                          data-testid='opl-first-run-access-methods'
                        >
                          <Radio value='gateway_account' data-testid='opl-first-run-gateway-account-method'>
                            {t('settings.firstRun.modelAccess.gatewayAccount')}
                          </Radio>
                          <Radio value='api_key' data-testid='opl-first-run-gateway-key-method'>
                            {t('settings.firstRun.modelAccess.apiKey')}
                          </Radio>
                        </Radio.Group>
                      )}

                      {accessMethod === 'gateway_account' && isDesktopRuntime ? (
                        <div className={styles.firstRunAccessForm}>
                          <div className={styles.firstRunAccessFields}>
                            <div className={styles.firstRunAccessField}>
                              <label htmlFor='opl-first-run-gateway-email'>
                                {t('settings.firstRun.gatewayAccount.emailLabel')}
                              </label>
                              <Input
                                id='opl-first-run-gateway-email'
                                value={gatewayEmail}
                                onChange={setGatewayEmail}
                                disabled={requestInFlight}
                                autoComplete='email'
                                placeholder={t('settings.firstRun.gatewayAccount.emailPlaceholder')}
                                data-testid='opl-first-run-gateway-email-input'
                              />
                            </div>
                            <div className={styles.firstRunAccessField}>
                              <label htmlFor='opl-first-run-gateway-password'>
                                {t('settings.firstRun.gatewayAccount.passwordLabel')}
                              </label>
                              <Input.Password
                                id='opl-first-run-gateway-password'
                                value={gatewayPassword}
                                onChange={setGatewayPassword}
                                disabled={requestInFlight}
                                autoComplete='current-password'
                                placeholder={t('settings.firstRun.gatewayAccount.passwordPlaceholder')}
                                data-testid='opl-first-run-gateway-password-input'
                              />
                            </div>
                          </div>
                          <div className={styles.firstRunSecurityNote}>
                            <Shield aria-hidden='true' />
                            <span>{t('settings.firstRun.gatewayAccount.securityNote')}</span>
                          </div>
                          <div className={styles.firstRunTaskActions} data-testid='opl-first-run-primary-action'>
                            <Button
                              type='primary'
                              size='large'
                              loading={actionLoading === 'gateway_account'}
                              disabled={requestInFlight}
                              onClick={() => void loginGatewayAccount()}
                              data-testid='opl-first-run-gateway-login-button'
                            >
                              {t('settings.firstRun.gatewayAccount.loginButton')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.firstRunAccessForm}>
                          <label htmlFor='opl-first-run-gateway-key'>{t('settings.firstRun.codex.apiKeyLabel')}</label>
                          <Input.Password
                            id='opl-first-run-gateway-key'
                            value={apiKey}
                            onChange={setApiKey}
                            disabled={requestInFlight}
                            placeholder={t('settings.firstRun.codex.apiKeyPlaceholder')}
                            data-testid='opl-first-run-codex-api-key-input'
                          />
                          <div className={styles.firstRunSecurityNote}>
                            <Shield aria-hidden='true' />
                            <span>{t('settings.firstRun.codex.localOnly')}</span>
                          </div>
                          <div className={styles.firstRunTaskActions} data-testid='opl-first-run-primary-action'>
                            <Button
                              type='primary'
                              size='large'
                              loading={actionLoading === 'configure_codex'}
                              disabled={requestInFlight}
                              onClick={() => void configureCodex()}
                              data-testid='opl-first-run-configure-codex-button'
                            >
                              {t('settings.firstRun.codex.verifyAndContinue')}
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className={styles.firstRunExistingAccess}>
                        <p>{t('settings.firstRun.modelAccess.existingDescription')}</p>
                        <Button
                          type='text'
                          loading={initializeLoading}
                          disabled={requestInFlight}
                          onClick={() => void refreshInitialize()}
                          data-testid='opl-first-run-recheck-existing'
                        >
                          {t('settings.firstRun.modelAccess.recheckExisting')}
                        </Button>
                      </div>
                    </div>
                  ) : readyToLaunch ? (
                    <div className={styles.firstRunStatePanel}>
                      <span
                        className={`${styles.firstRunStateIcon} ${styles.firstRunStateIconReady}`}
                        aria-hidden='true'
                      >
                        <CheckOne />
                      </span>
                      <h2>{t('settings.firstRun.readyPanel.title')}</h2>
                      <p data-testid='opl-first-run-beginner-summary'>{beginnerSummary}</p>
                      <p className={styles.firstRunReadyDescription}>{t('settings.firstRun.readyPanel.description')}</p>
                      <div className={styles.firstRunTaskActions} data-testid='opl-first-run-primary-action'>
                        <Button
                          ref={readyEntryRef}
                          icon={<Right />}
                          type='primary'
                          size='large'
                          onClick={() => navigate('/guid', { state: POST_INSTALL_SELF_CHECK_STATE })}
                        >
                          <span data-testid='opl-first-run-ready-entry'>{t('settings.firstRun.enterGuid')}</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.firstRunStatePanel}>
                      <span className={styles.firstRunStateIcon} aria-hidden='true'>
                        <Config />
                      </span>
                      <h2>{t('settings.firstRun.blockedPanel.title')}</h2>
                      <p data-testid='opl-first-run-beginner-summary'>{beginnerSummary}</p>
                      <p>{nextVisibleStep ?? t('settings.firstRun.nextSteps.generic')}</p>
                      <div className={styles.firstRunTaskActions} data-testid='opl-first-run-primary-action'>
                        {activePrimaryStepId === 'workspace_root' ? (
                          <Button
                            type='primary'
                            size='large'
                            loading={actionLoading === 'workspace_root'}
                            disabled={requestInFlight}
                            onClick={() => void chooseWorkspaceRoot()}
                          >
                            {t('settings.firstRun.actions.chooseWorkspace')}
                          </Button>
                        ) : (
                          <Button
                            type='primary'
                            size='large'
                            loading={actionLoading === 'install_prep'}
                            disabled={requestInFlight}
                            onClick={() => void runMaintenanceAction('install_prep')}
                          >
                            {t('settings.firstRun.actions.install')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.firstRunTaskContext}>
                  <div>
                    <span>{t('settings.firstRun.blockers')}</span>
                    <p data-testid='opl-first-run-blockers-list'>{blockerSummary}</p>
                  </div>
                  <div>
                    <span>{t('settings.firstRun.beginner.nextStep')}</span>
                    <p data-testid='opl-first-run-next-step'>{nextStepSummary}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>

        <div ref={technicalDetailsRef} className={styles.firstRunTechnicalRegion}>
          <Collapse
            bordered={false}
            activeKey={technicalDetailsOpen ? ['technical-details'] : []}
            onChange={() => setTechnicalDetailsOpen((open) => !open)}
            className={styles.firstRunDetailsCollapse}
            data-testid='opl-first-run-technical-details'
          >
            <Collapse.Item name='technical-details' header={t('settings.firstRun.technicalPanelTitle')}>
              <section className={styles.firstRunDiagnostics} data-testid='opl-first-run-primary-troubleshooting'>
                <div className={styles.firstRunDiagnosticLine} data-testid='opl-first-run-stage'>
                  <span>{t('settings.firstRun.stage', { phase: currentPhase })}</span>
                </div>
                <div
                  className={styles.firstRunDiagnosticLine}
                  data-testid='opl-first-run-background-maintenance-secondary'
                >
                  <span>
                    {maintenanceItems.length > 0
                      ? t('settings.firstRun.beginner.backgroundMaintenanceWithCount', {
                          count: maintenanceItems.length,
                        })
                      : t('settings.firstRun.noMaintenance')}
                  </span>
                  {maintenanceLabels.length > 0 && (
                    <span className={styles.firstRunMeta}> {maintenanceLabels.join(', ')}</span>
                  )}
                </div>
                {error && (
                  <div className={styles.firstRunTechnicalError} data-testid='opl-first-run-technical-error'>
                    {error.detail}
                  </div>
                )}
                <div className={styles.firstRunSectionActions}>
                  <Button
                    loading={initializeLoading}
                    disabled={requestInFlight}
                    onClick={() => void refreshInitialize()}
                    data-testid='opl-first-run-retry-button'
                  >
                    {t('common.refresh')}
                  </Button>
                </div>
              </section>
              <section className={styles.firstRunGrid}>
                <div className={styles.firstRunCard}>
                  <div className={styles.firstRunCardHeader}>
                    <div className={styles.firstRunCardTitle}>
                      <span className={styles.firstRunCardIcon}>
                        <Workbench />
                      </span>
                      <h2>{t('settings.firstRun.readiness')}</h2>
                    </div>
                  </div>
                  <div className={styles.firstRunProgressDetails}>
                    <p data-testid='opl-first-run-full-readiness-progress'>
                      {t('settings.firstRun.fullReadinessProgress', { progress: fullReadinessProgressText })}
                    </p>
                    <p data-testid='opl-first-run-maintenance-progress'>
                      {t('settings.firstRun.maintenanceProgress', { progress: maintenanceProgressText })}
                    </p>
                  </div>
                  <div className={styles.firstRunList}>
                    {FIRST_RUN_ITEM_IDS.map((itemId) => (
                      <ReadinessItem
                        key={itemId}
                        item={findChecklistItem(initialize, itemId)}
                        fallbackLabel={itemLabels[itemId]}
                        fallbackSummary={t('settings.firstRun.status.pending')}
                      />
                    ))}
                  </div>
                </div>

                <div className={styles.firstRunCard}>
                  <div className={styles.firstRunCardHeader}>
                    <div className={styles.firstRunCardTitle}>
                      <span className={styles.firstRunCardIcon}>
                        <Config />
                      </span>
                      <h2>{t('settings.firstRun.codex.title')}</h2>
                    </div>
                    <Tag color={codexConfigBlocked ? 'red' : 'green'}>
                      {codexConfigBlocked ? t('settings.firstRun.needsSetup') : t('settings.firstRun.ready')}
                    </Tag>
                  </div>
                  <p>{t('settings.firstRun.codex.defaults')}</p>
                </div>
              </section>

              <section className={styles.firstRunCard}>
                <div className={styles.firstRunCardHeader}>
                  <div className={styles.firstRunCardTitle}>
                    <span className={styles.firstRunCardIcon}>
                      <Tool />
                    </span>
                    <h2>{t('settings.firstRun.maintenance.title')}</h2>
                  </div>
                </div>
                <p>{t('settings.firstRun.maintenance.description')}</p>
                <div className={styles.firstRunSectionActions}>
                  <Button
                    loading={actionLoading === 'install_prep'}
                    disabled={requestInFlight}
                    onClick={() => void runMaintenanceAction('install_prep')}
                    data-testid='opl-first-run-install-button'
                  >
                    {t('settings.firstRun.maintenance.installPrep')}
                  </Button>
                  <Button
                    loading={actionLoading === 'startup_maintenance'}
                    disabled={requestInFlight}
                    onClick={() => void runMaintenanceAction('startup_maintenance')}
                    data-testid='opl-first-run-open-environment-button'
                  >
                    {t('settings.firstRun.maintenance.startupMaintenance')}
                  </Button>
                  <Button
                    loading={actionLoading === 'reconcile_modules'}
                    disabled={requestInFlight}
                    onClick={() => void runMaintenanceAction('reconcile_modules')}
                    data-testid='opl-first-run-open-modules-button'
                  >
                    {t('settings.firstRun.maintenance.reconcileModules')}
                  </Button>
                </div>
              </section>

              {actionResult ? (
                <section className={styles.firstRunCard}>
                  <div className={styles.firstRunCardHeader}>
                    <h2>{t('settings.firstRun.lastAction')}</h2>
                    <Tag>{actionResult.surface}</Tag>
                  </div>
                  <pre className={styles.firstRunResult}>{resultPreview(actionResult)}</pre>
                </section>
              ) : (
                <Empty className='py-20px' description={t('settings.firstRun.noActionYet')} />
              )}
            </Collapse.Item>
          </Collapse>
        </div>
      </div>
    </main>
  );
};

export default FirstRun;
