/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPairingRequest, IChannelPluginStatus, IChannelUser } from '@/common/types/channel/channel';
import { channel } from '@/common/adapter/ipcBridge';
import { getBaseUrl } from '@/common/adapter/httpBridge';
import { useFixedChannelAssistantSelection } from './assistantOptions';
import { Button, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, Delete, Refresh } from '@icon-park/react';
import { ChannelEmptyState, ChannelPreferenceRow, ChannelSectionHeader } from './ChannelItem';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';

interface WeixinConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}

const getRemainingTime = (expiresAt: number) => {
  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
  return `${remaining} min`;
};

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString();

const WeixinConfigForm: React.FC<WeixinConfigFormProps> = ({ pluginStatus, onStatusChange }) => {
  const { t } = useTranslation();
  useFixedChannelAssistantSelection('weixin', 'codex');

  const [loginState, setLoginState] = useState<LoginState>(
    pluginStatus?.hasToken && pluginStatus?.enabled ? 'connected' : 'idle'
  );
  // In Electron mode this holds a base64 data URL; in WebUI mode it holds the raw QR ticket string.
  const [qrcodeDataUrl, setQrcodeDataUrl] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Pairing state
  const [pairingLoading, setPairingLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingPairings, setPendingPairings] = useState<IChannelPairingRequest[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<IChannelUser[]>([]);

  // Close EventSource on unmount to prevent connection leaks.
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Sync connected state when pluginStatus changes externally.
  // Require enabled to be true so that a post-disable pluginStatusChanged event
  // (which still carries hasToken: true but enabled: false) does not flip back to connected.
  useEffect(() => {
    if (pluginStatus?.hasToken && pluginStatus?.enabled && loginState === 'idle') {
      setLoginState('connected');
    }
  }, [pluginStatus, loginState]);

  const loadPendingPairings = useCallback(async () => {
    setPairingLoading(true);
    try {
      const pairings = await channel.getPendingPairings.invoke();
      if (pairings) {
        setPendingPairings(pairings.filter((p) => p.platformType === 'weixin'));
      }
    } catch (error) {
      console.error('[WeixinConfig] Failed to load pending pairings:', error);
    } finally {
      setPairingLoading(false);
    }
  }, []);

  const loadAuthorizedUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const users = await channel.getAuthorizedUsers.invoke();
      if (users) {
        setAuthorizedUsers(users.filter((u) => u.platformType === 'weixin'));
      }
    } catch (error) {
      console.error('[WeixinConfig] Failed to load authorized users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingPairings();
    void loadAuthorizedUsers();
  }, [loadPendingPairings, loadAuthorizedUsers]);

  // Listen for incoming weixin pairing requests
  useEffect(() => {
    const unsubscribe = channel.pairingRequested.on((request) => {
      if (request.platformType !== 'weixin') return;
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
      if (user.platformType !== 'weixin') return;
      setAuthorizedUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [user, ...prev];
      });
      setPendingPairings((prev) => prev.filter((p) => p.platformUserId !== user.platformUserId));
    });
    return () => unsubscribe();
  }, []);

  const handleApprovePairing = async (code: string) => {
    try {
      await channel.approvePairing.invoke({ code });
      Message.success(t('settings.assistant.pairingApproved', 'Pairing approved'));
      await loadPendingPairings();
      await loadAuthorizedUsers();
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRejectPairing = async (code: string) => {
    try {
      await channel.rejectPairing.invoke({ code });
      Message.info(t('settings.assistant.pairingRejected', 'Pairing rejected'));
      await loadPendingPairings();
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRevokeUser = async (user_id: string) => {
    try {
      await channel.revokeUser.invoke({ user_id });
      Message.success(t('settings.assistant.userRevoked', 'User access revoked'));
      await loadAuthorizedUsers();
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess', 'Copied'));
  };

  const enableWeixinPlugin = async (accountId: string, botToken: string) => {
    // enablePlugin returns void; success if no throw
    await channel.enablePlugin.invoke({
      plugin_id: 'weixin',
      config: { credentials: { account_id: accountId, bot_token: botToken } },
    });
    Message.success(t('settings.weixin.pluginEnabled', 'WeChat channel enabled'));
    const plugins = await channel.getPluginStatus.invoke();
    if (plugins) {
      const weixinPlugin = plugins.find((p) => p.type === 'weixin');
      onStatusChange(weixinPlugin || null);
    }
    setLoginState('connected');
  };

  const handleLoginWebUI = () => {
    setLoginState('loading_qr');
    setQrcodeDataUrl(null);

    const es = new EventSource(`${getBaseUrl()}/api/channel/weixin/login`);
    eventSourceRef.current = es;

    es.addEventListener('qr', (e: MessageEvent) => {
      const { qrcodeData } = JSON.parse(e.data) as { qrcodeData: string };
      setQrcodeDataUrl(qrcodeData);
      setLoginState('showing_qr');
    });

    es.addEventListener('scanned', () => {
      setLoginState('scanned');
    });

    es.addEventListener('done', (e: MessageEvent) => {
      es.close();
      const { accountId, botToken } = JSON.parse(e.data) as { accountId: string; botToken: string };
      enableWeixinPlugin(accountId, botToken).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        Message.error(msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
        setLoginState('idle');
        setQrcodeDataUrl(null);
      });
    });

    es.addEventListener('error', (e: MessageEvent) => {
      es.close();
      const msg = e.data ? ((JSON.parse(e.data) as { message?: string }).message ?? '') : '';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('too many')) {
        Message.warning(t('settings.weixin.loginExpired', 'QR code expired, please try again'));
      } else {
        Message.error(t('settings.weixin.loginError', 'WeChat login failed'));
      }
      setLoginState('idle');
      setQrcodeDataUrl(null);
    });

    es.onerror = () => {
      es.close();
      setLoginState('idle');
      setQrcodeDataUrl(null);
    };
  };

  const handleLogin = () => {
    handleLoginWebUI();
  };

  const handleDisconnect = async () => {
    try {
      await channel.disablePlugin.invoke({ plugin_id: 'weixin' });
      Message.success(t('settings.weixin.pluginDisabled', 'WeChat channel disabled'));
      onStatusChange(null);
      setLoginState('idle');
      setQrcodeDataUrl(null);
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const renderLoginArea = () => {
    if (loginState === 'connected' || (pluginStatus?.hasToken && pluginStatus?.enabled)) {
      return (
        <div className='flex min-w-0 flex-wrap items-center gap-8px'>
          <CheckOne theme='filled' size={16} className='text-success-6' />
          <span className='text-14px text-t-primary'>{t('settings.weixin.connected', 'Connected')}</span>
          {pluginStatus?.botUsername && <span className='text-12px text-t-tertiary'>({pluginStatus.botUsername})</span>}
          <Button
            type='secondary'
            size='small'
            status='danger'
            onClick={() => {
              void handleDisconnect();
            }}
          >
            {t('settings.weixin.disconnect', 'Disconnect')}
          </Button>
        </div>
      );
    }

    if (loginState === 'showing_qr' || loginState === 'scanned') {
      return (
        <div className='flex flex-col items-center gap-8px'>
          {qrcodeDataUrl && <QRCodeSVG value={qrcodeDataUrl} size={160} />}
          {loginState === 'scanned' ? (
            <div className='flex items-center gap-6px text-13px text-t-secondary'>
              <Spin size={14} />
              <span>{t('settings.weixin.scanned', 'Scanned, waiting for confirmation...')}</span>
            </div>
          ) : (
            <span className='text-13px text-t-secondary'>
              {t('settings.weixin.scanPrompt', 'Please scan the QR code with WeChat')}
            </span>
          )}
        </div>
      );
    }

    // idle or loading_qr
    return (
      <Button
        type='primary'
        loading={loginState === 'loading_qr'}
        onClick={() => {
          void handleLogin();
        }}
      >
        {t('settings.weixin.loginButton', 'Scan to Login')}
      </Button>
    );
  };

  return (
    <div className='flex max-w-full min-w-0 flex-col gap-24px'>
      {/* Login / connection status */}
      <ChannelPreferenceRow
        label={t('settings.weixin.accountId', 'Account ID')}
        description={
          loginState === 'idle' || loginState === 'loading_qr'
            ? t('settings.weixin.scanPrompt', 'Please scan the QR code with WeChat')
            : undefined
        }
      >
        {renderLoginArea()}
      </ChannelPreferenceRow>

      {/* Next Steps Guide - shown when connected but no authorized users yet */}
      {pluginStatus?.connected && authorizedUsers.length === 0 && (
        <div className='border-0 border-t border-solid border-line pt-16px'>
          <ChannelSectionHeader title={t('settings.assistant.nextSteps', 'Next Steps')} />
          <div className='text-14px text-t-secondary space-y-8px'>
            <p className='m-0'>
              <strong>1.</strong> {t('settings.weixin.step1', 'Find and send a message to your bot in WeChat')}
            </p>
            <p className='m-0'>
              <strong>2.</strong>{' '}
              {t(
                'settings.weixin.step2',
                'A pairing request will appear below. Click "Approve" to authorize the user.'
              )}
            </p>
            <p className='m-0'>
              <strong>3.</strong>{' '}
              {t(
                'settings.weixin.step3',
                'Once approved, you can start chatting with the AI assistant through WeChat!'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Pending Pairing Requests */}
      {pluginStatus?.connected && (
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
                {t('common.refresh', 'Refresh')}
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
                        <Button
                          type='text'
                          size='mini'
                          icon={<Copy size={14} />}
                          onClick={() => copyToClipboard(pairing.code)}
                        />
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

export default WeixinConfigForm;
