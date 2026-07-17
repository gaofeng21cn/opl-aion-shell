/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/common/types/channel/channel';
import { channel } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { openExternalUrl } from '@/renderer/utils/platform';
import GoogleModelSelector from '@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector';
import type { GoogleModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';
import { useChannelAssistantSelection, type ChannelAgentOption } from './assistantOptions';
import { Button, Dropdown, Input, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Down, Refresh } from '@icon-park/react';
import { ChannelEmptyState, ChannelPreferenceRow, ChannelSectionHeader, ChannelStatusBadge } from './ChannelItem';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LarkConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GoogleModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}

const LARK_DEV_DOCS_URL = 'https://open.feishu.cn/document/develop-an-echo-bot/introduction';

const LarkConfigForm: React.FC<LarkConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange }) => {
  const { t } = useTranslation();

  // Lark credentials
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [encryptKey, setEncryptKey] = useState('');
  const [verificationToken, setVerificationToken] = useState('');

  const [showOptional, setShowOptional] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [credentialsTested, setCredentialsTested] = useState(false);
  const [touched, setTouched] = useState({ appId: false, appSecret: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  const {
    availableAgents,
    selectedAgent,
    persistSelectedAgent: saveSelectedAgent,
  } = useChannelAssistantSelection('lark');

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const pairings = await channel.getPendingPairings.invoke();
      if (pairings) {
        // Filter for Lark platform only
        setPendingPairings(pairings.filter((p) => p.platformType === 'lark'));
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, []);

  // Load authorized users
  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const users = await channel.getAuthorizedUsers.invoke();
      if (users) {
        // Filter for Lark platform only
        setAuthorizedUsers(users.filter((u) => u.platformType === 'lark'));
      }
    } catch (error) {
      console.error('[LarkConfig] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPendingPairings, loadAuthorizedUsers]);

  const persistSelectedAgent = async (agent: ChannelAgentOption) => {
    try {
      await saveSelectedAgent(agent);
      Message.success(t('settings.assistant.agentSwitched', 'Agent switched successfully'));
    } catch (error) {
      console.error('[LarkConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'lark') return;
      setPendingPairings((prev) => {
        const exists = prev.some((p) => p.code === request.code);
        if (exists) return prev;
        return [request, ...prev];
      });
    });
    return () => unsubscribe();
  }, []);

  // Listen for user authorization
  useEffect(() => {
    const unsubscribe = channel.userAuthorized.on((user) => {
      if (user.platformType !== 'lark') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  // Test Lark connection
  const handleTestConnection = async () => {
    // Mark fields as touched to show validation errors
    setTouched({ appId: true, appSecret: true });

    if (!appId.trim() || !appSecret.trim()) {
      Message.warning(t('settings.lark.credentialsRequired', 'Please enter App ID and App Secret'));
      return;
    }

    setTestLoading(true);
    setCredentialsTested(false);
    try {
      // testPlugin returns { success, botUsername?, error? } directly
      const result = await channel.testPlugin.invoke({
        plugin_id: 'lark',
        token: '',
        extra_config: {
          app_id: appId.trim(),
          app_secret: appSecret.trim(),
        },
      });

      if (result.success) {
        setCredentialsTested(true);
        Message.success(t('settings.lark.connectionSuccess', 'Connected to Lark API!'));

        // Auto-enable bot after successful test
        await handleAutoEnable();
      } else {
        setCredentialsTested(false);
        Message.error(result.error || t('settings.lark.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      setCredentialsTested(false);
      Message.error(error.message || t('settings.lark.connectionFailed', 'Connection failed'));
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      await channel.enablePlugin.invoke({
        plugin_id: 'lark',
        config: {
          credentials: {
            app_id: appId.trim(),
            app_secret: appSecret.trim(),
            encrypt_key: encryptKey.trim() || undefined,
            verification_token: verificationToken.trim() || undefined,
          },
        },
      });

      Message.success(t('settings.lark.pluginEnabled', 'Lark bot enabled'));
      const plugins = await channel.getPluginStatus.invoke();
      if (plugins) {
        const larkPlugin = plugins.find((p) => p.type === 'lark');
        onStatusChange(larkPlugin || null);
      }
    } catch (error: unknown) {
      console.error('[LarkConfig] Auto-enable failed:', error);
      Message.error(
        (error instanceof Error ? error.message : String(error)) ||
          t('settings.lark.enableFailed', 'Failed to enable Lark plugin')
      );
    }
  };

  // Reset credentials tested state when credentials change
  const handleCredentialsChange = () => {
    setCredentialsTested(false);
  };

  // Approve pairing
  const handleApprovePairing = async (code: string) => {
    try {
      await channel.approvePairing.invoke({ code });
      Message.success(t('settings.assistant.pairingApproved', 'Pairing approved'));
      await loadPendingPairings();
      await loadAuthorizedUsers();
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Reject pairing
  const handleRejectPairing = async (code: string) => {
    try {
      await channel.rejectPairing.invoke({ code });
      Message.info(t('settings.assistant.pairingRejected', 'Pairing rejected'));
      await loadPendingPairings();
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Revoke user
  const handleRevokeUser = async (user_id: string) => {
    try {
      await channel.revokeUser.invoke({ user_id });
      Message.success(t('settings.assistant.userRevoked', 'User access revoked'));
      await loadAuthorizedUsers();
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess', 'Copied'));
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate remaining time
  const getRemainingTime = (expiresAt: number) => {
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
    return `${remaining} min`;
  };

  const hasExistingUsers = authorizedUsers.length > 0;
  const showModelSelector = selectedAgent?.agent_type === 'aionrs';
  const agentOptions = availableAgents;

  return (
    <div className='flex max-w-full min-w-0 flex-col gap-24px'>
      {/* App ID */}
      <ChannelPreferenceRow
        label={t('settings.lark.appId', 'App ID')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={LARK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(LARK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.lark.devConsoleLink', 'Feishu Developer Console')}
            </a>{' '}
            {t('settings.lark.appIdDescSuffix', 'to get your App ID')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip
            content={t(
              'settings.assistant.tokenLocked',
              'Please close the Channel and delete all authorized users before modifying the configuration'
            )}
          >
            <span className='block w-full min-w-0 max-w-full sm:w-240px'>
              <Input
                value={appId}
                onChange={(value) => {
                  setAppId(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, appId: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'cli_xxxxxxxxxx'}
                className='w-full min-w-0 max-w-full'
                status={touched.appId && !appId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input
            value={appId}
            onChange={(value) => {
              setAppId(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, appId: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'cli_xxxxxxxxxx'}
            className='w-full min-w-0 max-w-full sm:w-240px'
            status={touched.appId && !appId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            disabled={hasExistingUsers}
          />
        )}
      </ChannelPreferenceRow>

      {/* App Secret */}
      <ChannelPreferenceRow
        label={t('settings.lark.appSecret', 'App Secret')}
        description={
          <span>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={LARK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(LARK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.lark.devConsoleLink', 'Feishu Developer Console')}
            </a>{' '}
            {t('settings.lark.appSecretDescSuffix', 'to get App Secret')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip
            content={t(
              'settings.assistant.tokenLocked',
              'Please close the Channel and delete all authorized users before modifying the configuration'
            )}
          >
            <span className='block w-full min-w-0 max-w-full sm:w-240px'>
              <Input.Password
                value={appSecret}
                onChange={(value) => {
                  setAppSecret(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, appSecret: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
                className='w-full min-w-0 max-w-full'
                status={touched.appSecret && !appSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input.Password
            value={appSecret}
            onChange={(value) => {
              setAppSecret(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, appSecret: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
            className='w-full min-w-0 max-w-full sm:w-240px'
            status={touched.appSecret && !appSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            visibilityToggle
            disabled={hasExistingUsers}
          />
        )}
      </ChannelPreferenceRow>

      {/* Optional fields toggle */}
      <Button
        type='text'
        size='mini'
        className='!h-auto !justify-start !px-0 text-t-tertiary'
        aria-expanded={showOptional}
        aria-controls='lark-optional-fields'
        data-testid='lark-optional-fields-toggle'
        icon={
          <Down
            theme='outline'
            size={12}
            style={{ transform: showOptional ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          />
        }
        onClick={() => setShowOptional((prev) => !prev)}
      >
        {showOptional
          ? t('settings.lark.hideOptionalFields', 'Hide optional settings')
          : t('settings.lark.showOptionalFields', 'Show optional settings')}
      </Button>

      {showOptional && (
        <div id='lark-optional-fields' className='flex flex-col gap-24px'>
          {/* Encrypt Key (Optional) */}
          <ChannelPreferenceRow
            label={t('settings.lark.encryptKey', 'Encrypt Key')}
            description={t(
              'settings.lark.encryptKeyDesc',
              'Optional: For event encryption (from Event Subscription settings)'
            )}
          >
            {hasExistingUsers ? (
              <Tooltip
                content={t(
                  'settings.assistant.tokenLocked',
                  'Please close the Channel and delete all authorized users before modifying the configuration'
                )}
              >
                <span className='block w-full min-w-0 max-w-full sm:w-240px'>
                  <Input.Password
                    value={encryptKey}
                    onChange={(value) => {
                      setEncryptKey(value);
                      handleCredentialsChange();
                    }}
                    placeholder={t('settings.lark.optional', 'Optional')}
                    className='w-full min-w-0 max-w-full'
                    visibilityToggle
                    disabled={hasExistingUsers}
                  />
                </span>
              </Tooltip>
            ) : (
              <Input.Password
                value={encryptKey}
                onChange={(value) => {
                  setEncryptKey(value);
                  handleCredentialsChange();
                }}
                placeholder={t('settings.lark.optional', 'Optional')}
                className='w-full min-w-0 max-w-full sm:w-240px'
                visibilityToggle
                disabled={hasExistingUsers}
              />
            )}
          </ChannelPreferenceRow>

          {/* Verification Token (Optional) */}
          <ChannelPreferenceRow
            label={t('settings.lark.verificationToken', 'Verification Token')}
            description={t(
              'settings.lark.verificationTokenDesc',
              'Optional: For event verification (from Event Subscription settings)'
            )}
          >
            {hasExistingUsers ? (
              <Tooltip
                content={t(
                  'settings.assistant.tokenLocked',
                  'Please close the Channel and delete all authorized users before modifying the configuration'
                )}
              >
                <span className='block w-full min-w-0 max-w-full sm:w-240px'>
                  <Input.Password
                    value={verificationToken}
                    onChange={(value) => {
                      setVerificationToken(value);
                      handleCredentialsChange();
                    }}
                    placeholder={t('settings.lark.optional', 'Optional')}
                    className='w-full min-w-0 max-w-full'
                    visibilityToggle
                    disabled={hasExistingUsers}
                  />
                </span>
              </Tooltip>
            ) : (
              <Input.Password
                value={verificationToken}
                onChange={(value) => {
                  setVerificationToken(value);
                  handleCredentialsChange();
                }}
                placeholder={t('settings.lark.optional', 'Optional')}
                className='w-full min-w-0 max-w-full sm:w-240px'
                visibilityToggle
                disabled={hasExistingUsers}
              />
            )}
          </ChannelPreferenceRow>
        </div>
      )}

      {/* Test Connection Button - only show when not connected or no existing users */}
      {!hasExistingUsers && !pluginStatus?.connected && (
        <div className='flex flex-wrap items-center justify-end gap-8px'>
          {pluginStatus?.hasToken && !appId.trim() && !appSecret.trim() ? (
            // Credentials already saved but not entered in UI - show info message
            <span className='min-w-0 break-words text-12px text-t-tertiary'>
              {t('settings.lark.credentialsSaved', 'Credentials already configured. Enter new values to update.')}
            </span>
          ) : null}
          <Button
            type='primary'
            loading={testLoading}
            onClick={handleTestConnection}
            disabled={pluginStatus?.hasToken && !appId.trim() && !appSecret.trim()}
          >
            {t('settings.lark.testAndConnect', 'Test & Connect')}
          </Button>
        </div>
      )}

      {/* Agent Selection */}
      <div className='flex flex-col gap-8px'>
        <ChannelPreferenceRow
          label={t('settings.lark.agent', 'Agent')}
          description={t('settings.lark.agentDesc', 'Used for Lark conversations')}
        >
          <Dropdown
            trigger='click'
            position='br'
            droplist={
              <Menu selectedKeys={selectedAgent ? [selectedAgent.assistant_id] : []}>
                {agentOptions.map((a) => {
                  const key = a.assistant_id;
                  return (
                    <Menu.Item
                      key={key}
                      onClick={() => {
                        const currentKey = selectedAgent?.assistant_id;
                        if (key === currentKey) {
                          return;
                        }
                        void persistSelectedAgent(a);

                        if (a.agent_type === 'aionrs') {
                          const savedModel = configService.get('assistant.lark.defaultModel');
                          const providers = modelSelection.providers;
                          const savedProviderExists = savedModel?.id && providers.some((p) => p.id === savedModel.id);
                          if (!savedProviderExists && providers.length > 0) {
                            const firstProvider = providers[0];
                            if (firstProvider.id && firstProvider.models?.[0]) {
                              void modelSelection.handleSelectModel(firstProvider, firstProvider.models[0]);
                            }
                          }
                        }
                      }}
                    >
                      {a.name}
                    </Menu.Item>
                  );
                })}
              </Menu>
            }
          >
            <Button
              type='secondary'
              className='flex w-full min-w-0 max-w-full items-center justify-between gap-8px sm:w-auto sm:min-w-160px'
            >
              <span className='truncate'>{selectedAgent?.name || t('settings.lark.agent', 'Agent')}</span>
              <Down theme='outline' size={14} />
            </Button>
          </Dropdown>
        </ChannelPreferenceRow>
      </div>

      {/* Default Model Selection */}
      <ChannelPreferenceRow
        label={t('settings.assistant.defaultModel', 'Default Model')}
        description={t('settings.lark.defaultModelDesc', 'Model used for Lark conversations')}
      >
        <GoogleModelSelector
          selection={showModelSelector ? modelSelection : undefined}
          disabled={!showModelSelector}
          label={
            !showModelSelector
              ? t('settings.assistant.autoFollowCliModel', 'Automatically follow the model when CLI is running')
              : undefined
          }
          variant='settings'
        />
      </ChannelPreferenceRow>

      {/* Connection Status - show when bot is enabled */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className='border-0 border-t border-solid border-line pt-16px'>
          <ChannelSectionHeader
            title={t('settings.lark.connectionStatus', 'Connection Status')}
            action={
              <ChannelStatusBadge
                tone={pluginStatus?.connected ? 'success' : pluginStatus?.error ? 'danger' : 'warning'}
              >
                {pluginStatus?.connected
                  ? t('settings.lark.statusConnected', 'Connected')
                  : pluginStatus?.error
                    ? t('settings.lark.statusError', 'Error')
                    : t('settings.lark.statusConnecting', 'Connecting...')}
              </ChannelStatusBadge>
            }
          />
          {pluginStatus?.error && <div className='mb-12px break-words text-14px text-danger'>{pluginStatus.error}</div>}
          {pluginStatus?.connected && (
            <div className='text-14px text-t-secondary space-y-8px'>
              <p className='m-0 font-500'>{t('settings.assistant.nextSteps', 'Next Steps')}:</p>
              <p className='m-0'>
                <strong>1.</strong> {t('settings.lark.step1', 'Open Feishu/Lark and find your bot application')}
              </p>
              <p className='m-0'>
                <strong>2.</strong> {t('settings.lark.step2', 'Send any message to initiate pairing')}
              </p>
              <p className='m-0'>
                <strong>3.</strong>{' '}
                {t(
                  'settings.lark.step3',
                  'A pairing request will appear below. Click "Approve" to authorize the user.'
                )}
              </p>
              <p className='m-0'>
                <strong>4.</strong>{' '}
                {t('settings.lark.step4', 'Once approved, you can start chatting with the AI assistant through Lark!')}
              </p>
            </div>
          )}
          {!pluginStatus?.connected && !pluginStatus?.error && (
            <div className='text-14px text-t-secondary'>
              {t('settings.lark.waitingConnection', 'WebSocket connection is being established. Please wait...')}
            </div>
          )}
        </div>
      )}

      {/* Pending Pairings */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className='border-0 border-t border-solid border-line pt-16px'>
          <ChannelSectionHeader
            title={t('settings.assistant.pendingPairings', 'Pending Pairing Requests')}
            action={
              <Button
                size='mini'
                type='text'
                icon={<Refresh size={14} />}
                loading={pairingLoading}
                onClick={loadPendingPairings}
              >
                {t('conversation.workspace.refresh', 'Refresh')}
              </Button>
            }
          />

          {pairingLoading ? (
            <div className='flex justify-center py-24px'>
              <Spin />
            </div>
          ) : pendingPairings.length === 0 ? (
            <ChannelEmptyState testId='channel-pending-pairings-empty'>
              {t('settings.assistant.noPendingPairings', 'No pending pairing requests')}
            </ChannelEmptyState>
          ) : (
            <div className='flex flex-col gap-12px'>
              {pendingPairings.map((pairing) => (
                <div
                  key={pairing.code}
                  className='flex flex-wrap items-center justify-between gap-12px border-0 border-t border-solid border-line py-12px'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex min-w-0 flex-wrap items-center gap-8px'>
                      <span className='text-14px font-500 text-t-primary'>
                        {pairing.display_name || 'Unknown User'}
                      </span>
                      <Tooltip content={t('settings.assistant.copyCode', 'Copy pairing code')}>
                        <button
                          className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer'
                          onClick={() => copyToClipboard(pairing.code)}
                        >
                          <Copy size={14} />
                        </button>
                      </Tooltip>
                    </div>
                    <div className='mt-4px break-words text-12px text-t-tertiary'>
                      {t('settings.assistant.pairingCode', 'Code')}:{' '}
                      <code className='break-all bg-fill-3 px-4px rd-2px'>{pairing.code}</code>
                      <span className='mx-8px'>|</span>
                      {t('settings.assistant.expiresIn', 'Expires in')}: {getRemainingTime(pairing.expiresAt)}
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-8px'>
                    <Button
                      type='primary'
                      size='small'
                      icon={<CheckOne size={14} />}
                      onClick={() => handleApprovePairing(pairing.code)}
                    >
                      {t('settings.assistant.approve', 'Approve')}
                    </Button>
                    <Button
                      type='secondary'
                      size='small'
                      status='danger'
                      icon={<CloseOne size={14} />}
                      onClick={() => handleRejectPairing(pairing.code)}
                    >
                      {t('settings.assistant.reject', 'Reject')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Authorized Users */}
      {authorizedUsers.length > 0 && (
        <div className='border-0 border-t border-solid border-line pt-16px'>
          <ChannelSectionHeader
            title={t('settings.assistant.authorizedUsers', 'Authorized Users')}
            action={
              <Button
                size='mini'
                type='text'
                icon={<Refresh size={14} />}
                loading={usersLoading}
                onClick={loadAuthorizedUsers}
              >
                {t('common.refresh', 'Refresh')}
              </Button>
            }
          />

          {usersLoading ? (
            <div className='flex justify-center py-24px'>
              <Spin />
            </div>
          ) : authorizedUsers.length === 0 ? (
            <ChannelEmptyState testId='channel-authorized-users-empty'>
              {t('settings.assistant.noAuthorizedUsers', 'No authorized users yet')}
            </ChannelEmptyState>
          ) : (
            <div className='flex flex-col gap-12px'>
              {authorizedUsers.map((user) => (
                <div
                  key={user.id}
                  className='flex flex-wrap items-center justify-between gap-12px border-0 border-t border-solid border-line py-12px'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='text-14px font-500 text-t-primary'>{user.display_name || 'Unknown User'}</div>
                    <div className='mt-4px break-words text-12px text-t-tertiary'>
                      {t('settings.assistant.platform', 'Platform')}: {user.platformType}
                      <span className='mx-8px'>|</span>
                      {t('settings.assistant.authorizedAt', 'Authorized')}: {formatTime(user.authorizedAt)}
                    </div>
                  </div>
                  <Tooltip content={t('settings.assistant.revokeAccess', 'Revoke access')}>
                    <Button
                      type='text'
                      status='danger'
                      size='small'
                      icon={<Delete size={16} />}
                      onClick={() => handleRevokeUser(user.id)}
                    />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LarkConfigForm;
