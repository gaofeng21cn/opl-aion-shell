/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Input, Message, Modal, Radio, Select, Typography } from '@arco-design/web-react';
import { CheckOne, Key, Terminal, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { getOplCodexModelDisplayOptions } from '@/common/config/oplProductProfile';
import { oplRecord, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import OplRefreshIconButton from '@/renderer/components/opl/OplRefreshIconButton';
import { useTranslation } from 'react-i18next';
import { buildAccessProjection } from '../accessProjection';
import { useLocation } from 'react-router-dom';
import { ResourcesSettingsContent } from './ResourcesSettings';
import type { OplGatewayAccountActionId, OplGatewayAccountReadModel } from '@/common/types/opl/appState';
import type { IOplGatewayAccountErrorCode } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';

type OplCommandResult = Awaited<ReturnType<typeof ipcBridge.oplRuntime.executeAction.invoke>>;

function assertOplCommandOk(result: OplCommandResult): void {
  if (result?.ok === false) {
    throw new Error(result.error?.message || result.error?.stderr || 'OPL command failed');
  }
}

function splitAccessDetail(detail: string): string[] {
  return detail.split(' · ').filter((line) => line.trim().length > 0);
}

export function readGatewayAccountProjection(appState: unknown): OplGatewayAccountReadModel | null {
  const settings = oplRecord(oplRecord(appState).settings_control_center);
  const readModel = oplRecord(settings.app_settings_read_model);
  const gateway = oplRecord(readModel.opl_gateway_account);
  return gateway.surface_kind === 'opl_gateway_account_read_model.v1' ? (gateway as OplGatewayAccountReadModel) : null;
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

export const AccessSettingsContent: React.FC = () => {
  const { t, i18n } = useTranslation();
  const appStateQuery = useOplAppState('fast');
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
  const [selectedGatewayGroup, setSelectedGatewayGroup] = useState('');
  const [disconnectConfirmVisible, setDisconnectConfirmVisible] = useState(false);
  const [configureLoading, setConfigureLoading] = useState(false);
  const { cards } = buildAccessProjection(appStateQuery.appState, t);
  const gatewayAccount = readGatewayAccountProjection(appStateQuery.appState);
  const isDesktopApp = isElectronDesktop();
  const accountLoginSupported = Boolean(isDesktopApp && gatewayAccount?.capabilities.account_login_supported === true);
  const manualKeySupported = gatewayAccount?.capabilities.manual_key_supported !== false;
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
  const preferredModelOptions = [
    {
      label: isZh ? modelOptions.auto_option.label_zh : modelOptions.auto_option.label_en,
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

  const refreshFastState = async (): Promise<void> => {
    await appStateQuery.load('fast', { showRefreshing: true });
  };

  const handleGatewayLogin = async () => {
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
      if (result.stateRefreshRequired) await refreshFastState();
    } catch {
      setGatewayLoginError('gateway_account_failed');
    } finally {
      setGatewayPassword('');
      setGatewayLoginLoading(false);
    }
  };

  const handleGatewayAction = async (
    actionId: OplGatewayAccountActionId,
    payloadJson?: Record<string, unknown>
  ): Promise<void> => {
    setGatewayActionLoading(actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId,
        dryRun: false,
        ...(payloadJson ? { payloadJson } : {}),
      });
      assertOplCommandOk(result);
      setDisconnectConfirmVisible(false);
      Message.success(t('settings.accessPage.gatewayAccount.actionSuccess'));
      await refreshFastState();
    } catch {
      Message.error(t('settings.accessPage.gatewayAccount.actionFailed'));
    } finally {
      setGatewayActionLoading(null);
    }
  };

  const gatewayNumber = (value: number | null): string =>
    value === null ? '--' : new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 2 }).format(value);

  const gatewayStatusError =
    gatewayLoginError ??
    gatewayAccount?.freshness.last_error_code ??
    (gatewayAccount?.status === 'reauth_required'
      ? 'auth_expired'
      : gatewayAccount?.status === 'disconnect_pending'
        ? 'disconnect_pending'
        : null);

  return (
    <div className='opl-settings-page' data-testid='settings-page-access'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>{t('settings.accessPage.title')}</Typography.Title>
          <Typography.Text>{t('settings.accessPage.modelAccessSection.description')}</Typography.Text>
        </div>
      </header>

      <div className='grid grid-cols-1 gap-14px md:grid-cols-2'>
        <section
          className={`opl-settings-section opl-settings-surface--status ${
            modelAccessNeedsAttention ? 'opl-settings-section--attention' : ''
          }`}
          id='provider-source'
          data-testid='settings-access-primary'
        >
          <span id='model-access' aria-hidden='true' />
          {modelAccessNeedsAttention && <span data-testid='settings-access-exception' aria-hidden='true' />}
          <div className='opl-settings-row h-full items-start'>
            <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                <CheckOne theme='outline' />
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
                data-testid='settings-access-model-status'
              >
                {modelAccessCompactStatus}
              </span>
            </div>
          </div>
        </section>

        <section
          className='opl-settings-section opl-settings-surface--status'
          id='codex-cli'
          data-testid='settings-access-codex-cli'
        >
          <span id='model' aria-hidden='true' />
          <div className='opl-settings-row h-full items-start'>
            <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                <Terminal theme='outline' />
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
              <Button
                type='text'
                icon={<UpdateRotation theme='outline' />}
                loading={appStateQuery.refreshing}
                onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
              >
                {t('settings.accessPage.actions.recheck')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section
        className='opl-settings-section opl-settings-surface--configuration'
        id='authentication'
        data-testid='settings-access-gateway'
      >
        <span id='opl-gateway' aria-hidden='true' />
        <div className='opl-settings-row items-start'>
          <div className='opl-settings-row__main flex min-w-0 flex-row items-start gap-10px'>
            <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
              <Key theme='outline' />
            </span>
            <div className='min-w-0 flex-1'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.accessPage.gatewayAccount.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.accessPage.gatewayAccount.description')}
              </Typography.Text>

              {gatewayAccount?.freshness.stale && (
                <div
                  className='mt-8px rd-6px bg-fill-2 px-10px py-8px text-12px text-t-secondary'
                  data-testid='settings-access-gateway-stale'
                >
                  {t('settings.accessPage.gatewayAccount.stale', {
                    observedAt:
                      gatewayAccount.freshness.observed_at ?? t('settings.accessPage.gatewayAccount.unknownObservedAt'),
                  })}
                </div>
              )}

              {gatewayStatusError && !gatewayFormVisible && (
                <div className='mt-8px rd-6px bg-fill-2 px-10px py-8px text-12px text-t-secondary'>
                  {t(gatewayErrorTranslationKey(gatewayStatusError))}
                </div>
              )}

              {gatewayAccount?.status === 'reauth_required' &&
                !gatewayAccount.account_card_visible &&
                accountLoginSupported &&
                !gatewayFormVisible && (
                  <Button
                    className='mt-8px'
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
                )}

              {gatewayAccount?.account_card_visible && gatewayAccount.account && (
                <div className='mt-12px flex flex-col gap-10px' data-testid='settings-access-gateway-account'>
                  <div className='flex flex-wrap items-baseline gap-x-10px gap-y-4px'>
                    <Typography.Text className='font-600 text-t-primary'>
                      {gatewayAccount.account.display_name || gatewayAccount.account.masked_email}
                    </Typography.Text>
                    <Typography.Text className='text-12px text-t-secondary'>
                      {gatewayAccount.account.masked_email}
                    </Typography.Text>
                    <Typography.Text className='text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.accountStatus', {
                        status: gatewayAccount.account.status,
                      })}
                    </Typography.Text>
                  </div>
                  <div className='grid grid-cols-2 gap-x-18px gap-y-8px md:grid-cols-3'>
                    <Typography.Text className='text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.balance', {
                        amount: gatewayNumber(gatewayAccount.account.balance.amount),
                        currency: gatewayAccount.account.balance.currency,
                      })}
                    </Typography.Text>
                    {gatewayAccount.usage && (
                      <>
                        <Typography.Text className='text-12px text-t-secondary'>
                          {t('settings.accessPage.gatewayAccount.todayTokens', {
                            value: gatewayNumber(gatewayAccount.usage.today_tokens),
                          })}
                        </Typography.Text>
                        <Typography.Text className='text-12px text-t-secondary'>
                          {t('settings.accessPage.gatewayAccount.todayCost', {
                            value: gatewayNumber(gatewayAccount.usage.today_actual_cost),
                            currency: gatewayAccount.usage.currency,
                          })}
                        </Typography.Text>
                        <Typography.Text className='text-12px text-t-secondary'>
                          {t('settings.accessPage.gatewayAccount.totalTokens', {
                            value: gatewayNumber(gatewayAccount.usage.total_tokens),
                          })}
                        </Typography.Text>
                        <Typography.Text className='text-12px text-t-secondary'>
                          {t('settings.accessPage.gatewayAccount.totalCost', {
                            value: gatewayNumber(gatewayAccount.usage.total_actual_cost),
                            currency: gatewayAccount.usage.currency,
                          })}
                        </Typography.Text>
                        <Typography.Text className='text-12px text-t-secondary'>
                          {t('settings.accessPage.gatewayAccount.dayTimezone', {
                            timezone: gatewayAccount.usage.day_timezone,
                          })}
                        </Typography.Text>
                      </>
                    )}
                  </div>
                  {gatewayAccount.managed_key && (
                    <Typography.Text className='break-words text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.managedKey', {
                        name: gatewayAccount.managed_key.name,
                        status: gatewayAccount.managed_key.status,
                      })}
                    </Typography.Text>
                  )}
                  {gatewayAccount.freshness.observed_at && (
                    <Typography.Text className='text-12px text-t-secondary'>
                      {t('settings.accessPage.gatewayAccount.updatedAt', {
                        observedAt: gatewayAccount.freshness.observed_at,
                      })}
                    </Typography.Text>
                  )}
                  <div className='flex flex-wrap gap-8px'>
                    {gatewayAccount.status === 'reauth_required' && accountLoginSupported && (
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
                    )}
                    {gatewayAccount.actions.refresh && (
                      <OplRefreshIconButton
                        size='small'
                        label={t('settings.accessPage.gatewayAccount.actions.refresh')}
                        loading={gatewayActionLoading === gatewayAccount.actions.refresh}
                        onClick={() => void handleGatewayAction(gatewayAccount.actions.refresh!)}
                      />
                    )}
                    {gatewayAccount.actions.repair && (
                      <Button
                        size='small'
                        loading={gatewayActionLoading === gatewayAccount.actions.repair}
                        onClick={() => void handleGatewayAction(gatewayAccount.actions.repair!)}
                      >
                        {t('settings.accessPage.gatewayAccount.actions.repair')}
                      </Button>
                    )}
                    {gatewayAccount.actions.use_for_model_access && (
                      <Button
                        size='small'
                        type='primary'
                        loading={gatewayActionLoading === gatewayAccount.actions.use_for_model_access}
                        onClick={() => void handleGatewayAction(gatewayAccount.actions.use_for_model_access!)}
                      >
                        {t('settings.accessPage.gatewayAccount.actions.useForModelAccess')}
                      </Button>
                    )}
                    {gatewayAccount.actions.disconnect && (
                      <Button size='small' status='danger' onClick={() => setDisconnectConfirmVisible(true)}>
                        {t('settings.accessPage.gatewayAccount.actions.disconnect')}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {gatewayAccount?.status === 'setup_required' && gatewayAccount.available_groups.length > 0 && (
                <div
                  className='mt-12px flex max-w-560px flex-col gap-8px md:flex-row'
                  data-testid='settings-access-gateway-setup'
                >
                  <Select
                    className='min-w-0 flex-1'
                    value={selectedGatewayGroup || undefined}
                    placeholder={t('settings.accessPage.gatewayAccount.groupPlaceholder')}
                    options={gatewayAccount.available_groups.map((group) => ({
                      label: group.label,
                      value: group.group_id,
                    }))}
                    onChange={(value) => setSelectedGatewayGroup(String(value))}
                  />
                  <Button
                    type='primary'
                    disabled={!selectedGatewayGroup || !gatewayAccount.actions.complete_setup}
                    loading={gatewayActionLoading === gatewayAccount.actions.complete_setup}
                    onClick={() => {
                      if (gatewayAccount.actions.complete_setup && selectedGatewayGroup) {
                        void handleGatewayAction(gatewayAccount.actions.complete_setup, {
                          group_id: selectedGatewayGroup,
                        });
                      }
                    }}
                  >
                    {t('settings.accessPage.gatewayAccount.actions.completeSetup')}
                  </Button>
                </div>
              )}

              {gatewayFormVisible && (
                <div className='mt-12px max-w-560px' data-testid='settings-access-gateway-setup'>
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
                      data-testid='settings-access-gateway-manual-key'
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
            </div>
          </div>
          {!gatewayFormVisible && gatewayAccount?.connection_mode !== 'account' && (
            <div className='opl-settings-row__meta'>
              <span data-testid='settings-access-primary-action'>
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
            </div>
          )}
        </div>
      </section>

      <Modal
        visible={disconnectConfirmVisible}
        title={t('settings.accessPage.gatewayAccount.disconnectConfirmTitle')}
        footer={null}
        onCancel={() => setDisconnectConfirmVisible(false)}
      >
        <div data-testid='settings-access-gateway-disconnect-confirm'>
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

      <section
        className='opl-settings-section opl-settings-surface--configuration'
        id='model-preference'
        data-testid='settings-access-model-preference'
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
                data-testid='settings-access-preferred-model'
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
                data-testid='settings-access-preferred-reasoning'
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const AccessSettings: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <SettingsPageWrapper>
      {pathname.endsWith('/resources') ? <ResourcesSettingsContent /> : <AccessSettingsContent />}
    </SettingsPageWrapper>
  );
};

export default AccessSettings;
