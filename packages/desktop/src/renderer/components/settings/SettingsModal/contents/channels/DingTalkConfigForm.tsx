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

interface DingTalkConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GoogleModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}

const DINGTALK_DEV_DOCS_URL = 'https://github.com/iOfficeAI/AionUi/wiki/DingTalk-Bot-Setup-Guide';

const DingTalkConfigForm: React.FC<DingTalkConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange }) => {
  const { t } = useTranslation();

  // DingTalk credentials
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [testLoading, setTestLoading] = useState(false);
  const [_credentialsTested, setCredentialsTested] = useState(false);
  const [touched, setTouched] = useState({ clientId: false, clientSecret: false });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  const {
    availableAgents,
    selectedAgent,
    persistSelectedAgent: saveSelectedAgent,
  } = useChannelAssistantSelection('dingtalk');

  // Load pending pairings
  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const pairings = await channel.getPendingPairings.invoke();
      if (pairings) {
        setPendingPairings(pairings.filter((p) => p.platformType === 'dingtalk'));
      }
    } catch (error) {
      console.error('[DingTalkConfig] Failed to load pending pairings:', error);
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
        setAuthorizedUsers(users.filter((u) => u.platformType === 'dingtalk'));
      }
    } catch (error) {
      console.error('[DingTalkConfig] Failed to load authorized users:', error);
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
      console.error('[DingTalkConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  // Listen for pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'dingtalk') return;
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
      if (user.platformType !== 'dingtalk') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  // Test DingTalk connection
  const handleTestConnection = async () => {
    setTouched({ clientId: true, clientSecret: true });

    if (!clientId.trim() || !clientSecret.trim()) {
      Message.warning(t('settings.dingtalk.credentialsRequired', 'Please enter Client ID and Client Secret'));
      return;
    }

    setTestLoading(true);
    setCredentialsTested(false);
    try {
      // testPlugin returns { success, botUsername?, error? } directly
      const result = await channel.testPlugin.invoke({
        plugin_id: 'dingtalk',
        token: clientId.trim(),
        extra_config: {
          app_secret: clientSecret.trim(),
        },
      });

      if (result.success) {
        setCredentialsTested(true);
        Message.success(t('settings.dingtalk.connectionSuccess', 'Connected to DingTalk API!'));
        await handleAutoEnable();
      } else {
        setCredentialsTested(false);
        Message.error(result.error || t('settings.dingtalk.connectionFailed', 'Connection failed'));
      }
    } catch (error: any) {
      setCredentialsTested(false);
      Message.error(error.message || t('settings.dingtalk.connectionFailed', 'Connection failed'));
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-enable plugin after successful test
  const handleAutoEnable = async () => {
    try {
      await channel.enablePlugin.invoke({
        plugin_id: 'dingtalk',
        config: {
          credentials: {
            client_id: clientId.trim(),
            client_secret: clientSecret.trim(),
          },
        },
      });

      Message.success(t('settings.dingtalk.pluginEnabled', 'DingTalk bot enabled'));
      const plugins = await channel.getPluginStatus.invoke();
      if (plugins) {
        const dingtalkPlugin = plugins.find((p) => p.type === 'dingtalk');
        onStatusChange(dingtalkPlugin || null);
      }
    } catch (error: unknown) {
      console.error('[DingTalkConfig] Auto-enable failed:', error);
      Message.error(
        (error instanceof Error ? error.message : String(error)) ||
          t('settings.dingtalk.enableFailed', 'Failed to enable DingTalk plugin')
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
      {/* Client ID */}
      <ChannelPreferenceRow
        label={t('settings.dingtalk.clientId', 'Client ID')}
        description={
          <span className='block w-full min-w-0 max-w-full sm:w-240px'>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={DINGTALK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(DINGTALK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.dingtalk.devConsoleLink', 'DingTalk Open Platform')}
            </a>{' '}
            {t('settings.dingtalk.clientIdDescSuffix', 'to get your Client ID')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip
            content={t(
              'settings.assistant.tokenLocked',
              'Please close the Channel and delete all authorized users before modifying'
            )}
          >
            <span>
              <Input
                value={clientId}
                onChange={(value) => {
                  setClientId(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, clientId: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'dingxxxxxxxxxx'}
                className='w-full min-w-0 max-w-full'
                status={touched.clientId && !clientId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input
            value={clientId}
            onChange={(value) => {
              setClientId(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, clientId: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'dingxxxxxxxxxx'}
            className='w-full min-w-0 max-w-full sm:w-240px'
            status={touched.clientId && !clientId.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            disabled={hasExistingUsers}
          />
        )}
      </ChannelPreferenceRow>

      {/* Client Secret */}
      <ChannelPreferenceRow
        label={t('settings.dingtalk.clientSecret', 'Client Secret')}
        description={
          <span className='block w-full min-w-0 max-w-full sm:w-240px'>
            <a
              className='text-primary hover:underline cursor-pointer text-12px'
              href={DINGTALK_DEV_DOCS_URL}
              onClick={(e) => {
                e.preventDefault();
                openExternalUrl(DINGTALK_DEV_DOCS_URL).catch(console.error);
              }}
            >
              {t('settings.dingtalk.devConsoleLink', 'DingTalk Open Platform')}
            </a>{' '}
            {t('settings.dingtalk.clientSecretDescSuffix', 'to get Client Secret')}
          </span>
        }
        required
      >
        {hasExistingUsers ? (
          <Tooltip
            content={t(
              'settings.assistant.tokenLocked',
              'Please close the Channel and delete all authorized users before modifying'
            )}
          >
            <span>
              <Input.Password
                value={clientSecret}
                onChange={(value) => {
                  setClientSecret(value);
                  handleCredentialsChange();
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, clientSecret: true }))}
                placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
                className='w-full min-w-0 max-w-full'
                status={touched.clientSecret && !clientSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
                visibilityToggle
                disabled={hasExistingUsers}
              />
            </span>
          </Tooltip>
        ) : (
          <Input.Password
            value={clientSecret}
            onChange={(value) => {
              setClientSecret(value);
              handleCredentialsChange();
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, clientSecret: true }))}
            placeholder={hasExistingUsers || pluginStatus?.hasToken ? '••••••••••••••••' : 'xxxxxxxxxxxxxxxxxx'}
            className='w-full min-w-0 max-w-full sm:w-240px'
            status={touched.clientSecret && !clientSecret.trim() && !pluginStatus?.hasToken ? 'error' : undefined}
            visibilityToggle
            disabled={hasExistingUsers}
          />
        )}
      </ChannelPreferenceRow>

      {/* Test Connection Button */}
      {!hasExistingUsers && !pluginStatus?.connected && (
        <div className='flex flex-wrap items-center justify-end gap-8px'>
          {pluginStatus?.hasToken && !clientId.trim() && !clientSecret.trim() ? (
            <span className='min-w-0 break-words text-12px text-t-tertiary'>
              {t('settings.dingtalk.credentialsSaved', 'Credentials already configured. Enter new values to update.')}
            </span>
          ) : null}
          <Button
            type='primary'
            loading={testLoading}
            onClick={handleTestConnection}
            disabled={pluginStatus?.hasToken && !clientId.trim() && !clientSecret.trim()}
          >
            {t('settings.dingtalk.testAndConnect', 'Test & Connect')}
          </Button>
        </div>
      )}

      {/* Agent Selection */}
      <div className='flex flex-col gap-8px'>
        <ChannelPreferenceRow
          label={t('settings.dingtalk.agent', 'Agent')}
          description={t('settings.dingtalk.agentDesc', 'Used for DingTalk conversations')}
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
                          const savedModel = configService.get('assistant.dingtalk.defaultModel');
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
              <span className='truncate'>{selectedAgent?.name || t('settings.dingtalk.agent', 'Agent')}</span>
              <Down theme='outline' size={14} />
            </Button>
          </Dropdown>
        </ChannelPreferenceRow>
      </div>

      {/* Default Model Selection */}
      <ChannelPreferenceRow
        label={t('settings.assistant.defaultModel', 'Model')}
        description={t('settings.dingtalk.defaultModelDesc', 'Used for Agent conversations')}
      >
        <GoogleModelSelector
          selection={showModelSelector ? modelSelection : undefined}
          disabled={!showModelSelector}
          label={
            !showModelSelector ? t('settings.assistant.autoFollowCliModel', 'Auto-follow CLI runtime model') : undefined
          }
          variant='settings'
        />
      </ChannelPreferenceRow>

      {/* Connection Status */}
      {pluginStatus?.enabled && authorizedUsers.length === 0 && (
        <div className='border-0 border-t border-solid border-line pt-16px'>
          <ChannelSectionHeader
            title={t('settings.dingtalk.connectionStatus', 'Connection Status')}
            action={
              <ChannelStatusBadge
                tone={pluginStatus?.connected ? 'success' : pluginStatus?.error ? 'danger' : 'warning'}
              >
                {pluginStatus?.connected
                  ? t('settings.dingtalk.statusConnected', 'Connected')
                  : pluginStatus?.error
                    ? t('settings.dingtalk.statusError', 'Error')
                    : t('settings.dingtalk.statusConnecting', 'Connecting...')}
              </ChannelStatusBadge>
            }
          />
          {pluginStatus?.error && <div className='mb-12px break-words text-14px text-danger'>{pluginStatus.error}</div>}
          {pluginStatus?.connected && (
            <div className='text-14px text-t-secondary space-y-8px'>
              <p className='m-0 font-500'>{t('settings.assistant.nextSteps', 'Next Steps')}:</p>
              <p className='m-0'>
                <strong>1.</strong> {t('settings.dingtalk.step1', 'Open DingTalk and find your bot application')}
              </p>
              <p className='m-0'>
                <strong>2.</strong> {t('settings.dingtalk.step2', 'Send any message to initiate pairing')}
              </p>
              <p className='m-0'>
                <strong>3.</strong>{' '}
                {t(
                  'settings.dingtalk.step3',
                  'A pairing request will appear below. Click "Approve" to authorize the user.'
                )}
              </p>
              <p className='m-0'>
                <strong>4.</strong>{' '}
                {t(
                  'settings.dingtalk.step4',
                  'Once approved, you can start chatting with the AI assistant through DingTalk!'
                )}
              </p>
            </div>
          )}
          {!pluginStatus?.connected && !pluginStatus?.error && (
            <div className='text-14px text-t-secondary'>
              {t('settings.dingtalk.waitingConnection', 'Connection is being established. Please wait...')}
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

export default DingTalkConfigForm;
