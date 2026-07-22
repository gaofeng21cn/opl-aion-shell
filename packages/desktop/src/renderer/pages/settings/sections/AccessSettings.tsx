/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Message, Modal, Radio, Select, Typography } from '@arco-design/web-react';
import { CheckOne, Key, Terminal } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { getOplCodexModelDisplayOptions } from '@/common/config/oplProductProfile';
import { oplRecord, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import OplRefreshIconButton from '@/renderer/components/opl/OplRefreshIconButton';
import { useTranslation } from 'react-i18next';
import {
  buildAccessProjection,
  formatGatewayObservedAt,
  formatGatewayTokenCount,
  gatewayAccountInitials,
  readCodexModelResolution,
  readGatewayAccountProjection,
  resolveDefaultGatewayGroup,
} from '../accessProjection';
import { useNavigate } from 'react-router-dom';
import type { OplGatewayAccountActionId, OplGatewayAccountReadModel } from '@/common/types/opl/appState';
import type { IOplGatewayAccountErrorCode } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { formatOplCodexModelDisplay } from '@/renderer/utils/model/oplCodexModelDisplay';

type OplCommandResult = Awaited<ReturnType<typeof ipcBridge.oplRuntime.executeAction.invoke>>;

function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

function splitAccessDetail(detail: string): string[] {
  return detail.split(' · ').filter((line) => line.trim().length > 0);
}

function gatewayErrorTranslationKey(errorCode: string | null): string {
  const keys: Record<string, string> = {
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
  };
  return keys[errorCode ?? ''] ?? 'settings.accessPage.gatewayAccount.errors.generic';
}

function gatewayAccountFromActionResult(result: OplCommandResult): OplGatewayAccountReadModel | null {
  const execution = oplRecord(oplRecord(result.parsed).app_action_execution);
  const gateway = oplRecord(oplRecord(execution.result).gateway_account);
  return gateway.surface_kind === 'opl_gateway_account_read_model.v1' ? (gateway as OplGatewayAccountReadModel) : null;
}

function gatewayRefreshFailureCode(
  result: OplCommandResult,
  readback: OplGatewayAccountReadModel | null
): string | null {
  if (result?.ok === false) {
    return readback?.freshness.last_error_code ?? result.error?.code ?? 'gateway_account_failed';
  }
  const actionProjection = gatewayAccountFromActionResult(result);
  if (!actionProjection || !readback) return 'internal_contract_violation';
  const projectedFailure = actionProjection.freshness.last_error_code;
  if (projectedFailure) return projectedFailure;
  if (actionProjection.freshness.stale) return 'gateway_account_failed';
  if (readback.freshness.last_error_code) return readback.freshness.last_error_code;
  return readback.freshness.stale ? 'gateway_account_failed' : null;
}

type GatewayAmountValueProps = {
  amount: string;
  currency: string;
  testId: string;
};

const GatewayAmountValue: React.FC<GatewayAmountValueProps> = ({ amount, currency, testId }) => (
  <Typography.Text
    className='flex min-w-0 max-w-full flex-wrap items-baseline gap-x-4px text-16px font-600 leading-22px text-t-primary xl:min-h-44px'
    data-testid={testId}
  >
    <span className='break-normal whitespace-nowrap'>{amount}</span>
    {currency && (
      <>
        {' '}
        <span className='break-normal whitespace-nowrap'>{currency}</span>
      </>
    )}
  </Typography.Text>
);

type AccessSettingsSurface = 'models' | 'gateway';

type AccessSettingsContentProps = {
  surface?: AccessSettingsSurface;
};

export const AccessSettingsContent: React.FC<AccessSettingsContentProps> = ({ surface = 'models' }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast', { requireLive: surface === 'gateway' });
  const modelOptions = getOplCodexModelDisplayOptions();
  const codexPreference = configService.get('acp.config')?.codex;
  const [preferredModel, setPreferredModel] = useState(
    codexPreference?.preferredModelId?.trim() || modelOptions.auto_option.id
  );
  const [preferredReasoning, setPreferredReasoning] = useState(
    codexPreference?.preferredReasoningEffort?.trim() || modelOptions.default_reasoning_effort
  );
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [codexApiKey, setCodexApiKey] = useState('');
  const [gatewayFormVisible, setGatewayFormVisible] = useState(false);
  const [gatewayMode, setGatewayMode] = useState<'account' | 'manual_key'>('account');
  const [gatewayEmail, setGatewayEmail] = useState('');
  const [gatewayPassword, setGatewayPassword] = useState('');
  const [gatewayDeviceLabel, setGatewayDeviceLabel] = useState('');
  const [gatewayLoginError, setGatewayLoginError] = useState<IOplGatewayAccountErrorCode | null>(null);
  const [gatewayLoginLoading, setGatewayLoginLoading] = useState(false);
  const [gatewayActionLoading, setGatewayActionLoading] = useState<OplGatewayAccountActionId | null>(null);
  const autoSetupAttemptRef = useRef<string | null>(null);
  const [disconnectConfirmVisible, setDisconnectConfirmVisible] = useState(false);
  const [configureLoading, setConfigureLoading] = useState(false);
  const { cards } = buildAccessProjection(appStateQuery.appState, t);
  const gatewayAccount = readGatewayAccountProjection(appStateQuery.appState);
  const gatewayMutationAuthority = appStateQuery.provenance === 'live' && gatewayAccount !== null;
  const isDesktopApp = isElectronDesktop();
  const accountLoginSupported = Boolean(
    gatewayMutationAuthority && isDesktopApp && gatewayAccount?.capabilities.account_login_supported === true
  );
  const manualKeySupported = Boolean(
    gatewayMutationAuthority && gatewayAccount?.capabilities.manual_key_supported !== false
  );
  const modelAccessCard = cards.find((card) => card.key === 'account');
  const codexCard = cards.find((card) => card.key === 'model');
  const modelAccessNeedsAttention = modelAccessCard?.tone === 'orange';
  const modelAccessStatus =
    modelAccessCard?.statusLabel ??
    t(`settings.oplEnvironmentPage.status.${modelAccessCard?.status ?? 'unknown'}`, {
      status: modelAccessCard?.status ?? 'unknown',
    });
  const modelAccessCompactStatus =
    modelAccessCard?.tone === 'green'
      ? t('settings.accessPage.statusLabels.connected')
      : modelAccessNeedsAttention
        ? t('settings.accessPage.statusLabels.needsAttention')
        : t('settings.accessPage.statusLabels.unknown');
  const modelAccessStatusModifier =
    modelAccessCard?.tone === 'green'
      ? 'opl-settings-status--ready'
      : modelAccessCard?.tone === 'orange'
        ? 'opl-settings-status--attention'
        : '';
  const modelAccessSource = modelAccessCard?.detail || null;
  const codexDetailLines = codexCard ? splitAccessDetail(codexCard.detail) : [];
  const isZh = i18n?.resolvedLanguage?.toLowerCase().startsWith('zh') ?? false;
  const localeKey = isZh ? 'zh-CN' : 'en-US';
  const currentModelResolution = readCodexModelResolution(appStateQuery.appState);
  const currentModelLabel = currentModelResolution.modelId
    ? formatOplCodexModelDisplay({
        id: currentModelResolution.modelId,
        reasoningEffort: currentModelResolution.reasoningEffort,
        localeKey,
      }).modelLabel.replace(/^GPT-/i, '')
    : null;
  const preferredModelOptions = [
    {
      label: currentModelLabel
        ? t('settings.accessPage.modelPreference.autoCurrent', { model: currentModelLabel })
        : isZh
          ? modelOptions.auto_option.label_zh
          : modelOptions.auto_option.label_en,
      value: modelOptions.auto_option.id,
    },
    ...modelOptions.visible_models.map((model) => ({
      label: isZh ? model.label_zh : model.label_en,
      value: model.id,
    })),
  ];
  const preferredReasoningOptions = modelOptions.user_reasoning_effort_options.map((effort) => ({
    label: isZh ? modelOptions.reasoning_labels[effort].zh : modelOptions.reasoning_labels[effort].en,
    value: effort,
  }));

  const persistPreference = async (modelId: string, reasoningEffort: string): Promise<boolean> => {
    setPreferenceSaving(true);
    try {
      const config = configService.get('acp.config') ?? {};
      const backendConfig = config.codex ?? {};
      const nextCodex = { ...backendConfig };
      if (modelId === modelOptions.auto_option.id) {
        delete nextCodex.preferredModelId;
        delete nextCodex.preferredReasoningEffort;
      } else {
        nextCodex.preferredModelId = modelId;
        nextCodex.preferredReasoningEffort = reasoningEffort;
      }
      await configService.set('acp.config', { ...config, codex: nextCodex });
      Message.success(
        t('settings.accessPage.modelPreference.saved', { defaultValue: 'Default model preference saved.' })
      );
      return true;
    } catch {
      Message.error(
        t('settings.accessPage.modelPreference.saveFailed', { defaultValue: 'Could not save model preference.' })
      );
      return false;
    } finally {
      setPreferenceSaving(false);
    }
  };

  const handlePreferredModelChange = (value: string) => {
    if (preferenceSaving) return;
    const previous = preferredModel;
    setPreferredModel(value);
    void persistPreference(value, preferredReasoning).then((saved) => {
      if (!saved) setPreferredModel(previous);
    });
  };

  const handlePreferredReasoningChange = (value: string) => {
    if (preferenceSaving) return;
    const previous = preferredReasoning;
    setPreferredReasoning(value);
    void persistPreference(preferredModel, value).then((saved) => {
      if (!saved) setPreferredReasoning(previous);
    });
  };

  const handleConfigureCodex = async () => {
    if (!gatewayMutationAuthority) return;
    const trimmed = codexApiKey.trim();
    if (!trimmed) {
      Message.error(t('settings.accessPage.modelAccount.apiKeyRequired'));
      return;
    }

    setConfigureLoading(true);
    try {
      const result = await ipcBridge.oplRuntime.configureCodex.invoke({ apiKey: trimmed });
      assertOplCommandOk(result);
      setCodexApiKey('');
      Message.success(t('settings.accessPage.modelAccount.configureSuccess'));
      await appStateQuery.load('fast', { showRefreshing: true });
    } catch {
      Message.error(t('settings.accessPage.modelAccount.configureFailed'));
    } finally {
      setConfigureLoading(false);
    }
  };

  const refreshFastState = React.useCallback(
    () => appStateQuery.load('fast', { showRefreshing: true }),
    [appStateQuery.load]
  );

  const handleGatewayLogin = async () => {
    if (!gatewayMutationAuthority) return;
    const email = gatewayEmail.trim();
    if (!email || !gatewayPassword) {
      setGatewayLoginError('invalid_request');
      setGatewayPassword('');
      return;
    }
    setGatewayLoginError(null);
    setGatewayLoginLoading(true);
    try {
      const result = await ipcBridge.oplRuntime.loginGatewayAccount.invoke({
        email,
        password: gatewayPassword,
        ...(gatewayDeviceLabel.trim() ? { deviceLabel: gatewayDeviceLabel.trim() } : {}),
      });
      if (!result.ok) {
        setGatewayLoginError(result.errorCode ?? 'gateway_account_failed');
        return;
      }
      setGatewayFormVisible(false);
      Message.success(t('settings.accessPage.gatewayAccount.loginSuccess'));
      await refreshFastState();
    } catch {
      setGatewayLoginError('gateway_account_failed');
    } finally {
      setGatewayPassword('');
      setGatewayLoginLoading(false);
    }
  };

  const handleGatewayAction = React.useCallback(
    async (
      actionId: OplGatewayAccountActionId,
      payloadJson?: Record<string, unknown>,
      options: { announceSuccess?: boolean } = {}
    ): Promise<void> => {
      if (!gatewayMutationAuthority) return;
      setGatewayActionLoading(actionId);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId,
          dryRun: false,
          ...(payloadJson ? { payloadJson } : {}),
        });
        if (actionId === 'gateway_account_refresh') {
          const refreshedPayload = await refreshFastState();
          const refreshedGateway = readGatewayAccountProjection(refreshedPayload?.app_state);
          const failureCode = gatewayRefreshFailureCode(result, refreshedGateway);
          if (failureCode) {
            Message.error(t(gatewayErrorTranslationKey(failureCode)));
            return;
          }
          if (options.announceSuccess !== false) {
            Message.success(t('settings.accessPage.gatewayAccount.actionSuccess'));
          }
          return;
        }
        assertOplCommandOk(result);
        setDisconnectConfirmVisible(false);
        if (options.announceSuccess !== false) {
          Message.success(t('settings.accessPage.gatewayAccount.actionSuccess'));
        }
        await refreshFastState();
      } catch {
        Message.error(t('settings.accessPage.gatewayAccount.actionFailed'));
      } finally {
        setGatewayActionLoading(null);
      }
    },
    [gatewayMutationAuthority, refreshFastState, t]
  );

  const gatewayNumber = (value: number | null): string =>
    value === null ? '--' : new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 2 }).format(value);
  const observedAt = formatGatewayObservedAt(gatewayAccount?.freshness.observed_at ?? null, i18n.resolvedLanguage);
  const defaultGatewayGroupId = resolveDefaultGatewayGroup(gatewayAccount?.available_groups ?? []);
  const accountStatus = gatewayAccount?.account?.status?.trim() || 'unknown';
  const gatewayStatusLabel = (status: string | null | undefined): string => {
    const normalizedStatus = status?.trim() || 'unknown';
    if (normalizedStatus === 'active') return t('settings.accessPage.gatewayAccount.status.active');
    if (normalizedStatus === 'unknown') return t('settings.accessPage.gatewayAccount.status.unknown');
    return t('settings.accessPage.gatewayAccount.status.other', { status: normalizedStatus });
  };
  const accountStatusLabel = gatewayStatusLabel(accountStatus);

  const projectedGatewayStatusError =
    gatewayLoginError ??
    gatewayAccount?.freshness.last_error_code ??
    (gatewayAccount?.status === 'setup_required' && !defaultGatewayGroupId
      ? 'group_selection_required'
      : gatewayAccount?.status === 'reauth_required'
        ? 'auth_expired'
        : gatewayAccount?.status === 'disconnect_pending'
          ? 'disconnect_pending'
          : null);
  const gatewayStatusError =
    projectedGatewayStatusError === 'group_selection_required' && defaultGatewayGroupId
      ? null
      : projectedGatewayStatusError;

  useEffect(() => {
    const actionId = gatewayAccount?.actions.complete_setup;
    if (
      surface !== 'gateway' ||
      !gatewayMutationAuthority ||
      !gatewayAccount ||
      gatewayAccount.connection_mode !== 'account' ||
      !gatewayAccount.account_card_visible ||
      gatewayAccount.managed_key ||
      gatewayAccount.freshness.last_error_code ||
      !actionId ||
      !defaultGatewayGroupId
    )
      return;
    const attemptKey = [actionId, defaultGatewayGroupId, gatewayAccount.freshness.observed_at ?? 'unknown'].join(':');
    if (autoSetupAttemptRef.current === attemptKey) return;
    autoSetupAttemptRef.current = attemptKey;
    void handleGatewayAction(actionId, { group_id: defaultGatewayGroupId }, { announceSuccess: false });
  }, [defaultGatewayGroupId, gatewayAccount, gatewayMutationAuthority, handleGatewayAction, surface]);

  return (
    <div
      className='opl-settings-page'
      data-testid={surface === 'gateway' ? 'settings-page-gateway' : 'settings-page-models'}
    >
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>
            {surface === 'gateway' ? t('settings.uiOptimization.account.title') : t('settings.accessPage.title')}
          </Typography.Title>
          <Typography.Text>
            {surface === 'gateway'
              ? t('settings.uiOptimization.account.description')
              : t('settings.accessPage.modelAccessSection.description')}
          </Typography.Text>
        </div>
      </header>

      {surface === 'models' && (
        <div className='grid grid-cols-1 gap-14px' data-testid='settings-models-primary'>
          <section
            className={`opl-settings-section opl-settings-surface--status ${
              modelAccessNeedsAttention ? 'opl-settings-section--attention' : ''
            }`}
            id='provider-source'
            data-testid='settings-models-model-access'
          >
            <span id='model-access' aria-hidden='true' />
            {modelAccessNeedsAttention && <span data-testid='settings-models-exception' aria-hidden='true' />}
            <div className='opl-settings-row h-full items-start'>
              <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                  <CheckOne theme='outline' size='16' />
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {t('settings.accessPage.cards.account.title')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {modelAccessSource ?? modelAccessStatus}
                  </Typography.Text>
                </div>
              </div>
              <div className='opl-settings-row__meta'>
                <span
                  className={`opl-settings-status ${modelAccessStatusModifier}`.trim()}
                  data-testid='settings-models-model-status'
                >
                  {modelAccessCompactStatus}
                </span>
              </div>
            </div>
          </section>

          <section
            className='opl-settings-section opl-settings-surface--status'
            id='codex-cli'
            data-testid='settings-models-codex-cli'
          >
            <span id='model' aria-hidden='true' />
            <div className='opl-settings-row h-full items-start'>
              <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                  <Terminal theme='outline' size='16' />
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {codexCard?.title ?? t('settings.accessPage.cards.codexCli.title')}
                  </Typography.Text>
                  {codexDetailLines.map((line) => (
                    <Typography.Text key={line} className='block break-words text-12px text-t-secondary'>
                      {line}
                    </Typography.Text>
                  ))}
                </div>
              </div>
              <div className='opl-settings-row__meta'>
                <OplRefreshIconButton
                  data-testid='settings-models-recheck'
                  label={t('settings.accessPage.actions.recheck')}
                  loading={appStateQuery.refreshing}
                  onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {surface === 'gateway' && (
        <>
          <section
            className='opl-settings-section opl-settings-surface--configuration'
            id='connection'
            data-testid='settings-gateway-primary'
          >
            <span id='access' data-testid='settings-gateway-access' aria-hidden='true' />
            <span id='usage' aria-hidden='true' />
            <span data-testid='settings-gateway-manual-key' aria-hidden='true' />
            <div className='opl-settings-section__header'>
              <div className='flex min-w-0 items-start gap-10px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                  <Key theme='outline' size='16' />
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {t('settings.uiOptimization.account.gatewaySection')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {t('settings.accessPage.gatewayAccount.description')}
                  </Typography.Text>
                </div>
              </div>
              {!appStateQuery.loading &&
                gatewayMutationAuthority &&
                gatewayAccount &&
                !gatewayFormVisible &&
                gatewayAccount.connection_mode !== 'account' && (
                  <span className='shrink-0' data-testid='settings-gateway-primary-action'>
                    <Button
                      type={modelAccessNeedsAttention ? 'primary' : 'secondary'}
                      data-testid='opl-settings-show-gateway-config-button'
                      onClick={() => {
                        setGatewayMode(accountLoginSupported ? 'account' : 'manual_key');
                        setGatewayFormVisible(true);
                        setGatewayLoginError(null);
                      }}
                    >
                      {t('settings.accessPage.modelAccount.showConfigButton')}
                    </Button>
                  </span>
                )}
            </div>

            {appStateQuery.provenance === 'derived_bootstrap' && gatewayAccount && (
              <div
                className='mb-12px flex items-center gap-4px py-4px text-12px leading-18px text-t-secondary sm:pl-38px'
                data-testid='settings-gateway-cached-bootstrap'
              >
                <span>{t('settings.accessPage.gatewayAccount.bootstrap.cached')}</span>
                <OplRefreshIconButton
                  type='text'
                  size='mini'
                  label={t('settings.accessPage.actions.recheck')}
                  loading={appStateQuery.refreshing}
                  onClick={() => void refreshFastState()}
                />
              </div>
            )}

            {appStateQuery.error && (
              <div
                className='mb-12px py-4px text-12px leading-18px text-t-secondary sm:pl-38px'
                data-testid='settings-gateway-refresh-error'
              >
                {t('settings.accessPage.gatewayAccount.bootstrap.refreshFailed')}
              </div>
            )}

            {!appStateQuery.loading &&
              appStateQuery.provenance === 'live' &&
              !gatewayAccount &&
              !appStateQuery.error && (
                <div
                  className='mb-12px py-4px text-12px leading-18px text-t-secondary sm:pl-38px'
                  data-testid='settings-gateway-projection-unavailable'
                >
                  {t('settings.accessPage.gatewayAccount.bootstrap.projectionUnavailable')}
                </div>
              )}

            {gatewayAccount?.freshness.stale && (
              <div
                className='mb-12px py-4px text-12px leading-18px text-t-secondary sm:pl-38px'
                data-testid='settings-gateway-stale'
              >
                {t('settings.accessPage.gatewayAccount.stale', {
                  observedAt: observedAt ?? t('settings.accessPage.gatewayAccount.unknownObservedAt'),
                })}
              </div>
            )}

            {gatewayStatusError && !gatewayFormVisible && (
              <div
                className='mb-12px py-4px text-12px leading-18px text-t-secondary sm:pl-38px'
                data-testid='settings-gateway-exception'
              >
                {t(gatewayErrorTranslationKey(gatewayStatusError))}
              </div>
            )}

            {gatewayMutationAuthority &&
              gatewayAccount &&
              gatewayAccount.status === 'reauth_required' &&
              !gatewayAccount.account_card_visible &&
              accountLoginSupported &&
              !gatewayFormVisible && (
                <div className='py-10px sm:pl-38px'>
                  <Button
                    size='small'
                    type='primary'
                    onClick={() => {
                      setGatewayMode('account');
                      setGatewayFormVisible(true);
                      setGatewayLoginError(null);
                    }}
                  >
                    {t('settings.accessPage.gatewayAccount.actions.signInAgain')}
                  </Button>
                </div>
              )}

            {gatewayAccount?.account_card_visible && gatewayAccount.account && (
              <div className='sm:pl-38px' id='account' data-testid='settings-gateway-account'>
                <div
                  className='flex flex-wrap items-center justify-between gap-12px py-12px'
                  data-testid='settings-gateway-identity-row'
                >
                  <div className='flex min-w-0 items-center gap-12px'>
                    <span className='flex h-32px w-32px shrink-0 items-center justify-center rd-full bg-success-1 text-12px font-600 text-success-6'>
                      {gatewayAccountInitials(gatewayAccount.account.display_name, gatewayAccount.account.email)}
                    </span>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-8px' data-testid='settings-gateway-identity-name'>
                        <Typography.Text className='font-600 text-t-primary'>
                          {gatewayAccount.account.display_name ||
                            gatewayAccount.account.email ||
                            t('settings.accessPage.gatewayAccount.unknownAccount')}
                        </Typography.Text>
                        <span
                          className={`opl-settings-status ${
                            accountStatus === 'active' ? 'opl-settings-status--ready' : 'opl-settings-status--attention'
                          }`}
                        >
                          {accountStatusLabel}
                        </span>
                        {gatewayMutationAuthority && gatewayAccount.actions.disconnect && (
                          <Button
                            size='mini'
                            type='text'
                            status='danger'
                            onClick={() => setDisconnectConfirmVisible(true)}
                            data-testid='settings-gateway-disconnect'
                          >
                            {t('settings.accessPage.gatewayAccount.actions.disconnect')}
                          </Button>
                        )}
                      </div>
                      {gatewayAccount.account.email && (
                        <Typography.Text className='block break-all text-12px text-t-secondary'>
                          {gatewayAccount.account.email}
                        </Typography.Text>
                      )}
                    </div>
                  </div>
                  {gatewayMutationAuthority && gatewayAccount.status === 'reauth_required' && accountLoginSupported && (
                    <div
                      className='flex shrink-0 flex-wrap items-center justify-end gap-8px'
                      data-testid='settings-gateway-identity-actions'
                    >
                      <Button
                        size='small'
                        type='primary'
                        onClick={() => {
                          setGatewayMode('account');
                          setGatewayFormVisible(true);
                          setGatewayLoginError(null);
                        }}
                      >
                        {t('settings.accessPage.gatewayAccount.actions.signInAgain')}
                      </Button>
                    </div>
                  )}
                </div>

                <div
                  className='grid grid-cols-2 gap-x-24px gap-y-14px py-10px md:grid-cols-3 xl:grid-cols-5'
                  data-testid='settings-gateway-metrics'
                >
                  <div className='min-w-0'>
                    <GatewayAmountValue
                      amount={gatewayNumber(gatewayAccount.account.balance.amount)}
                      currency={gatewayAccount.account.balance.currency}
                      testId='settings-gateway-balance-value'
                    />
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.balance')}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0'>
                    <Typography.Text className='block text-16px font-600 leading-22px text-t-primary xl:min-h-44px'>
                      {formatGatewayTokenCount(gatewayAccount.usage?.today_tokens ?? null, i18n.resolvedLanguage)}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.todayTokens')}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0'>
                    <GatewayAmountValue
                      amount={gatewayNumber(gatewayAccount.usage?.today_actual_cost ?? null)}
                      currency={gatewayAccount.usage?.currency ?? ''}
                      testId='settings-gateway-today-cost-value'
                    />
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.todayCost')}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0'>
                    <Typography.Text className='block text-16px font-600 leading-22px text-t-primary xl:min-h-44px'>
                      {formatGatewayTokenCount(gatewayAccount.usage?.total_tokens ?? null, i18n.resolvedLanguage)}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.totalTokens')}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0'>
                    <GatewayAmountValue
                      amount={gatewayNumber(gatewayAccount.usage?.total_actual_cost ?? null)}
                      currency={gatewayAccount.usage?.currency ?? ''}
                      testId='settings-gateway-total-cost-value'
                    />
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.metrics.totalCost')}
                    </Typography.Text>
                  </div>
                </div>

                <div className='mt-2px py-12px' data-testid='settings-gateway-account-footer'>
                  <div className='min-w-0'>
                    {gatewayAccount.managed_key && (
                      <Typography.Text className='block break-words text-12px text-t-secondary'>
                        {t('settings.accessPage.gatewayAccount.managedKey', {
                          name: gatewayAccount.managed_key.name,
                          status: gatewayStatusLabel(gatewayAccount.managed_key.status),
                        })}
                      </Typography.Text>
                    )}
                    <div className='flex min-w-0 items-center gap-2px'>
                      <Typography.Text className='break-words text-12px text-t-secondary'>
                        {t('settings.accessPage.gatewayAccount.updatedAt', {
                          observedAt: observedAt ?? t('settings.accessPage.gatewayAccount.unknownObservedAt'),
                        })}
                      </Typography.Text>
                      {gatewayMutationAuthority && gatewayAccount.actions.refresh && (
                        <OplRefreshIconButton
                          type='text'
                          size='mini'
                          label={t('settings.accessPage.gatewayAccount.actions.refresh')}
                          loading={gatewayActionLoading === gatewayAccount.actions.refresh}
                          onClick={() => void handleGatewayAction(gatewayAccount.actions.refresh!)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {gatewayFormVisible && gatewayMutationAuthority && (
              <div className='max-w-600px pt-14px sm:pl-38px' data-testid='settings-gateway-setup'>
                {accountLoginSupported && manualKeySupported && (
                  <Radio.Group
                    type='button'
                    value={gatewayMode}
                    onChange={(value) => {
                      setGatewayMode(value as 'account' | 'manual_key');
                      setGatewayLoginError(null);
                    }}
                  >
                    <Radio value='account'>{t('settings.accessPage.gatewayAccount.modes.account')}</Radio>
                    <Radio value='manual_key'>{t('settings.accessPage.gatewayAccount.modes.manualKey')}</Radio>
                  </Radio.Group>
                )}

                {gatewayMode === 'account' && accountLoginSupported && (
                  <div className='mt-10px flex flex-col gap-8px'>
                    <Input
                      data-testid='opl-settings-gateway-email-input'
                      aria-label={t('settings.accessPage.gatewayAccount.emailLabel')}
                      value={gatewayEmail}
                      placeholder={t('settings.accessPage.gatewayAccount.emailPlaceholder')}
                      autoComplete='username'
                      onChange={setGatewayEmail}
                    />
                    <Input.Password
                      data-testid='opl-settings-gateway-password-input'
                      aria-label={t('settings.accessPage.gatewayAccount.passwordLabel')}
                      value={gatewayPassword}
                      placeholder={t('settings.accessPage.gatewayAccount.passwordPlaceholder')}
                      autoComplete='current-password'
                      onChange={setGatewayPassword}
                      onPressEnter={() => void handleGatewayLogin()}
                    />
                    <Input
                      data-testid='opl-settings-gateway-device-input'
                      aria-label={t('settings.accessPage.gatewayAccount.deviceLabel')}
                      value={gatewayDeviceLabel}
                      placeholder={t('settings.accessPage.gatewayAccount.devicePlaceholder')}
                      autoComplete='off'
                      onChange={setGatewayDeviceLabel}
                    />
                    {gatewayLoginError && (
                      <Typography.Text className='text-12px text-t-secondary'>
                        {t(gatewayErrorTranslationKey(gatewayLoginError))}
                      </Typography.Text>
                    )}
                    <div className='flex flex-wrap gap-8px'>
                      <Button type='primary' loading={gatewayLoginLoading} onClick={() => void handleGatewayLogin()}>
                        {t('settings.accessPage.gatewayAccount.loginButton')}
                      </Button>
                      <Button onClick={() => setGatewayFormVisible(false)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                )}

                {gatewayMode === 'manual_key' && manualKeySupported && (
                  <div
                    className='mt-10px flex flex-col gap-8px md:flex-row'
                    data-testid='settings-gateway-manual-key-form'
                  >
                    <Input.Password
                      data-testid='opl-settings-codex-api-key-input'
                      aria-label={t('settings.accessPage.modelAccount.keyTitle')}
                      value={codexApiKey}
                      placeholder={t('settings.accessPage.modelAccount.apiKeyPlaceholder')}
                      autoComplete='off'
                      className='min-w-0 flex-1'
                      onChange={setCodexApiKey}
                      onPressEnter={() => void handleConfigureCodex()}
                    />
                    <Button
                      data-testid='opl-settings-configure-codex-button'
                      aria-label={t('settings.accessPage.modelAccount.configureButton')}
                      type='primary'
                      loading={configureLoading}
                      onClick={() => void handleConfigureCodex()}
                    >
                      {t('settings.accessPage.modelAccount.configureButton')}
                    </Button>
                    <Button onClick={() => setGatewayFormVisible(false)}>{t('common.cancel')}</Button>
                  </div>
                )}
              </div>
            )}
          </section>

          <Modal
            visible={disconnectConfirmVisible}
            title={t('settings.accessPage.gatewayAccount.disconnectConfirmTitle')}
            footer={null}
            onCancel={() => setDisconnectConfirmVisible(false)}
          >
            <div data-testid='settings-gateway-disconnect-confirm'>
              <Typography.Text>{t('settings.accessPage.gatewayAccount.disconnectConfirmDescription')}</Typography.Text>
              <div className='mt-14px flex justify-end gap-8px'>
                <Button onClick={() => setDisconnectConfirmVisible(false)}>{t('common.cancel')}</Button>
                <Button
                  type='primary'
                  status='danger'
                  loading={gatewayActionLoading === gatewayAccount?.actions.disconnect}
                  onClick={() => {
                    if (gatewayAccount?.actions.disconnect) {
                      void handleGatewayAction(gatewayAccount.actions.disconnect);
                    }
                  }}
                >
                  {t('settings.accessPage.gatewayAccount.actions.disconnect')}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {surface === 'models' && (
        <>
          <section
            className='opl-settings-section opl-settings-surface--configuration'
            id='model'
            data-testid='settings-models-model-preference'
          >
            <div className='opl-settings-section__header'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.accessPage.modelPreference.title', { defaultValue: 'New conversation defaults' })}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.accessPage.modelPreference.description', {
                    defaultValue:
                      'Choose the default model and reasoning effort used when a new Codex conversation starts.',
                  })}
                </Typography.Text>
              </div>
            </div>
            <div className='opl-settings-list'>
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.accessPage.modelPreference.modelLabel', { defaultValue: 'Default model' })}
                  </Typography.Text>
                </div>
                <div className='opl-settings-row__meta min-w-220px'>
                  <Select
                    value={preferredModel}
                    options={preferredModelOptions}
                    loading={preferenceSaving}
                    disabled={preferenceSaving}
                    onChange={(value) => handlePreferredModelChange(String(value))}
                    data-testid='settings-models-preferred-model'
                  />
                </div>
              </div>
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.accessPage.modelPreference.reasoningLabel', { defaultValue: 'Reasoning effort' })}
                  </Typography.Text>
                  {preferredModel === modelOptions.auto_option.id && (
                    <Typography.Text className='text-12px text-t-secondary'>
                      {t('settings.accessPage.modelPreference.autoReasoning', {
                        defaultValue: 'Auto uses the App reasoning policy for the selected model.',
                      })}
                    </Typography.Text>
                  )}
                </div>
                <div className='opl-settings-row__meta min-w-220px'>
                  <Select
                    value={preferredReasoning}
                    options={preferredReasoningOptions}
                    disabled={preferenceSaving || preferredModel === modelOptions.auto_option.id}
                    loading={preferenceSaving}
                    onChange={(value) => handlePreferredReasoningChange(String(value))}
                    data-testid='settings-models-preferred-reasoning'
                  />
                </div>
              </div>
            </div>
          </section>

          <section className='opl-settings-section' data-testid='settings-models-gateway-link'>
            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <Typography.Text className='font-500 text-t-primary'>
                  {t('settings.accessPage.gatewayAccount.title')}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.accessPage.gatewayAccount.description')}
                </Typography.Text>
              </div>
              <div className='opl-settings-row__meta'>
                <Button
                  type={modelAccessNeedsAttention ? 'primary' : 'secondary'}
                  data-testid={modelAccessNeedsAttention ? 'settings-models-primary-action' : undefined}
                  onClick={() => navigate('/settings/gateway')}
                >
                  {t('common.open')}
                </Button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export const GatewaySettingsContent: React.FC = () => <AccessSettingsContent surface='gateway' />;

const AccessSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <AccessSettingsContent />
    </SettingsPageWrapper>
  );
};

export const GatewaySettings: React.FC = () => (
  <SettingsPageWrapper>
    <GatewaySettingsContent />
  </SettingsPageWrapper>
);

export default AccessSettings;
