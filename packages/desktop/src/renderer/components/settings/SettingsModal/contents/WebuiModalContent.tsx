/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';
import { shell, webui, type IWebUIStatus } from '@/common/adapter/ipcBridge';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { configService } from '@/common/config/configService';
import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import ChannelDingTalkLogo from '@/renderer/assets/channel-logos/dingtalk.svg';
import ChannelDiscordLogo from '@/renderer/assets/channel-logos/discord.svg';
import ChannelLarkLogo from '@/renderer/assets/channel-logos/lark.svg';
import ChannelSlackLogo from '@/renderer/assets/channel-logos/slack.svg';
import ChannelTelegramLogo from '@/renderer/assets/channel-logos/telegram.svg';
import ChannelWecomLogo from '@/renderer/assets/channel-logos/wecom.svg';
import ChannelWeixinLogo from '@/renderer/assets/channel-logos/weixin.svg';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Form, Input, Message, Switch, Tabs, Tooltip } from '@arco-design/web-react';
import { Communication, Copy, Earth, EditTwo, Refresh } from '@icon-park/react';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../settingsViewContext';

const CHANNEL_LOGOS = [
  { src: ChannelTelegramLogo, alt: 'Telegram' },
  { src: ChannelLarkLogo, alt: 'Lark' },
  { src: ChannelDingTalkLogo, alt: 'DingTalk' },
  { src: ChannelWeixinLogo, alt: 'WeChat' },
  { src: ChannelWecomLogo, alt: 'WeCom' },
  { src: ChannelSlackLogo, alt: 'Slack' },
  { src: ChannelDiscordLogo, alt: 'Discord' },
] as const;

const ChannelModalContentLazy = React.lazy(() => import('./channels/ChannelModalContent'));
const QRCodeSVGLazy = React.lazy(async () => {
  const mod = await import('qrcode.react');
  return { default: mod.QRCodeSVG };
});

const DESKTOP_WEBUI_ENABLED_KEY = 'webui.desktop.enabled';
const DESKTOP_WEBUI_ALLOW_REMOTE_KEY = 'webui.desktop.allowRemote';
const WEBUI_ICON_ACTION_CLASS =
  '!inline-flex !h-32px !min-h-32px !w-32px !min-w-32px !cursor-pointer !items-center !justify-center !border-0 !bg-transparent !p-0 !text-t-tertiary !rd-6px transition-colors hover:!bg-fill-2 hover:!text-t-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:!cursor-not-allowed disabled:!opacity-50';

/**
 * WebUI 设置内容组件
 * WebUI settings content component
 */
const WebuiModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [activeTab, setActiveTab] = useState<'webui' | 'channels'>('webui');

  // 检测是否在 Electron 桌面环境 / Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const [status, setStatus] = useState<IWebUIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const port = WEBUI_DEFAULT_PORT;
  const [webuiEnabled, setWebuiEnabled] = useState(false);
  const [allowRemotePreference, setAllowRemotePreference] = useState(false);
  const [cachedIP, setCachedIP] = useState<string | null>(null);
  const [cachedPassword, setCachedPassword] = useState<string | null>(null);
  // 标记密码是否可以明文显示（首次启动且未复制过）/ Flag for plaintext password display (first startup and not copied)
  const [canShowPlainPassword, setCanShowPlainPassword] = useState(false);
  // 设置新密码弹窗 / Set new password modal
  const [setPasswordModalVisible, setSetPasswordModalVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [setUsernameModalVisible, setSetUsernameModalVisible] = useState(false);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [form] = Form.useForm();
  const [usernameForm] = Form.useForm();

  // 二维码登录相关状态 / QR code login related state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const qrRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 加载状态 / Load status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const savedAllowRemote = configService.get(DESKTOP_WEBUI_ALLOW_REMOTE_KEY) ?? false;
      setAllowRemotePreference(savedAllowRemote === true);

      // getStatus goes via IPC to the Electron main process which tracks the
      // WebUI lifecycle; backend does not know it's being wrapped.
      const statusData: IWebUIStatus | null = await webui.getStatus.invoke();

      if (statusData) {
        setStatus(statusData);
        // Switch must track the *real* server state, not the persisted
        // preference. Reading `webui.desktop.enabled` from config and using it
        // as the Switch's checked value used to make the Switch look "on" when
        // the main-process auto-restore silently failed (port conflict, etc.),
        // so users clicked the saved URL and got a white screen because 25808
        // was empty. The main process is the sole writer of this key — the
        // start/stop IPC providers and restoreDesktopWebUIFromPreferences own
        // reconciliation, so the renderer only reads `running` and never
        // writes the flag back.
        setWebuiEnabled(statusData.running);

        if (statusData.lanIP) {
          setCachedIP(statusData.lanIP);
        } else if (statusData.networkUrl) {
          const match = statusData.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) {
            setCachedIP(match[1]);
          }
        }
        if (statusData.initialPassword) {
          setCachedPassword(statusData.initialPassword);
          // 有初始密码说明可以显示明文 / Having initial password means can show plaintext
          setCanShowPlainPassword(true);
        }
        // 注意：如果 running 但没有密码，会在下面的 useEffect 中自动重置
        // Note: If running but no password, auto-reset will be triggered in the useEffect below
      } else {
        // getStatus failed — fall back to treating server as stopped rather
        // than believing a possibly-stale config flag.
        setWebuiEnabled(false);
        setStatus(
          (prev) =>
            prev || {
              running: false,
              port: WEBUI_DEFAULT_PORT,
              allowRemote: false,
              localUrl: `http://localhost:${WEBUI_DEFAULT_PORT}`,
              adminUsername: 'admin',
            }
        );
      }
    } catch (error) {
      console.error('[WebuiModal] Failed to load WebUI status:', error);
      setWebuiEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 监听状态变更事件 / Listen to status change events
  useEffect(() => {
    const unsubscribe = webui.statusChanged.on((data) => {
      // Keep the Switch checkbox in lock-step with the actual server state so
      // a main-process auto-restore (or external stop) is reflected in the UI
      // without a page reload.
      setWebuiEnabled(data.running === true);
      if (data.running) {
        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port: data.port ?? prev?.port ?? WEBUI_DEFAULT_PORT,
          allowRemote: prev?.allowRemote ?? false,
          localUrl: data.localUrl ?? `http://localhost:${data.port ?? WEBUI_DEFAULT_PORT}`,
          networkUrl: data.networkUrl,
          lanIP: prev?.lanIP,
          initialPassword: prev?.initialPassword,
        }));
        if (data.networkUrl) {
          const match = data.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) setCachedIP(match[1]);
        }
      } else {
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
      }
    });
    return () => unsubscribe();
  }, []);

  // 注意：不再自动重置密码，用户已有密码存储在数据库中
  // Note: No longer auto-reset password, user already has password stored in database
  // 如果用户忘记密码，可以手动点击重置按钮
  // If user forgets password, they can manually click reset button
  useEffect(() => {
    // 仅在组件首次加载且没有显示过密码时，标记为密文状态
    // Only when component first loads and password hasn't been shown, mark as hidden
    if (status?.running && !status?.initialPassword && !cachedPassword && !loading) {
      // 不自动重置，只是确保密码显示为 ******
      // Don't auto-reset, just ensure password shows as ******
      setCanShowPlainPassword(false);
    }
  }, [status?.running, status?.initialPassword, cachedPassword, loading]);

  // 获取当前 IP 地址 / Get current IP
  const getLocalIP = useCallback(() => {
    if (status?.lanIP) return status.lanIP;
    if (cachedIP) return cachedIP;
    if (status?.networkUrl) {
      const match = status.networkUrl.match(/http:\/\/([^:]+):/);
      if (match) return match[1];
    }
    return null;
  }, [status?.lanIP, cachedIP, status?.networkUrl]);

  // 获取显示的 URL / Get display URL
  const getDisplayUrl = useCallback(() => {
    const currentIP = getLocalIP();
    const currentPort = status?.port || port;
    const useRemote = status?.running ? status.allowRemote : allowRemotePreference;
    if (useRemote && currentIP) {
      return `http://${currentIP}:${currentPort}`;
    }
    return `http://localhost:${currentPort}`;
  }, [allowRemotePreference, getLocalIP, status?.allowRemote, status?.port, status?.running, port]);

  // 启动/停止 WebUI / Start/Stop WebUI
  const handleToggle = async (enabled: boolean) => {
    // 使用缓存的 IP，不再阻塞获取 / Use cached IP, no longer block to fetch
    const currentIP = getLocalIP();

    // 保存原始值用于回滚 / Save original value for rollback
    const previousEnabled = webuiEnabled;

    // 立即显示 loading / Immediately show loading
    setStartLoading(true);
    setWebuiEnabled(enabled);

    try {
      if (enabled) {
        const localUrl = `http://localhost:${port}`;

        // Await the real result — Promise.race with a 3s fallback used to hide
        // backend failures behind a fake "started" toast while the server was
        // still RESOLVING or had crashed, leaving webui.desktop.enabled unset.
        const startResult = await webui.start.invoke({ port, allowRemote: allowRemotePreference });

        const responseIP = startResult.lanIP || currentIP;
        const responsePassword = startResult.initialPassword;

        if (responseIP) setCachedIP(responseIP);
        if (responsePassword) {
          setCachedPassword(responsePassword);
          setCanShowPlainPassword(true);
        }

        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port,
          allowRemote: allowRemotePreference,
          localUrl,
          networkUrl: allowRemotePreference && responseIP ? `http://${responseIP}:${port}` : undefined,
          lanIP: responseIP,
          initialPassword: responsePassword || cachedPassword || prev?.initialPassword,
        }));

        await configService.set(DESKTOP_WEBUI_ENABLED_KEY, true);
        Message.success(t('settings.webui.startSuccess'));
      } else {
        // 立即更新UI，异步停止服务器 / Update UI immediately, stop server async
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
        await configService.set(DESKTOP_WEBUI_ENABLED_KEY, false);
        Message.success(t('settings.webui.stopSuccess'));
        webui.stop.invoke().catch((err) => console.error('WebUI stop error:', err));
      }
    } catch (error) {
      // 回滚 UI 状态 / Rollback UI state
      setWebuiEnabled(previousEnabled);
      console.error('Toggle WebUI error:', error);
      Message.error(t('settings.webui.operationFailed'));
    } finally {
      setStartLoading(false);
    }
  };

  // 处理允许远程访问切换 / Handle allow remote toggle
  // 需要重启服务器才能更改绑定地址 / Need to restart server to change binding address
  const handleAllowRemoteChange = async (checked: boolean) => {
    // 保存原始值用于回滚 / Save original value for rollback
    const previousAllowRemote = allowRemotePreference;
    setAllowRemotePreference(checked);

    const wasRunning = status?.running;

    // 如果服务器正在运行，需要重启以应用新的绑定设置
    // If server is running, need to restart to apply new binding settings
    if (wasRunning) {
      setStartLoading(true);
      try {
        // 1. 先停止服务器 / First stop the server
        try {
          await Promise.race([webui.stop.invoke(), new Promise((resolve) => setTimeout(resolve, 1500))]);
        } catch (err) {
          console.error('WebUI stop error:', err);
        }

        // Await the real result — a 3s race fallback used to mask backend
        // failures as success (see handleToggle).
        const startResult = await webui.start.invoke({ port, allowRemote: checked });

        const responseIP = startResult.lanIP;
        const responsePassword = startResult.initialPassword;

        if (responseIP) setCachedIP(responseIP);
        if (responsePassword) setCachedPassword(responsePassword);

        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port,
          allowRemote: checked,
          localUrl: `http://localhost:${port}`,
          networkUrl: checked && responseIP ? `http://${responseIP}:${port}` : undefined,
          lanIP: responseIP,
          initialPassword: responsePassword || cachedPassword || prev?.initialPassword,
        }));

        await configService.set(DESKTOP_WEBUI_ALLOW_REMOTE_KEY, checked);
        Message.success(t('settings.webui.restartSuccess'));
      } catch (error) {
        // 回滚 UI 状态 / Rollback UI state
        setAllowRemotePreference(previousAllowRemote);
        console.error('[WebuiModal] Restart error:', error);
        Message.error(t('settings.webui.operationFailed'));
      } finally {
        setStartLoading(false);
      }
    } else {
      // 服务器未运行，直接持久化 / Server not running, persist directly
      try {
        await configService.set(DESKTOP_WEBUI_ALLOW_REMOTE_KEY, checked);

        // 获取 IP 用于显示 / Get IP for display
        let newIP: string | undefined;
        try {
          const snapshot = await webui.getStatus.invoke();
          if (snapshot?.lanIP) {
            newIP = snapshot.lanIP;
            setCachedIP(newIP);
          }
        } catch {
          // ignore
        }

        const existingIP = newIP || cachedIP || status?.lanIP;
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                allowRemote: checked,
                lanIP: existingIP || prev.lanIP,
                networkUrl: checked && existingIP ? `http://${existingIP}:${port}` : undefined,
              }
            : null
        );
      } catch (error) {
        // 回滚 UI 状态 / Rollback UI state
        setAllowRemotePreference(previousAllowRemote);
        console.error('[WebuiModal] Failed to persist allowRemote:', error);
        Message.error(t('settings.webui.operationFailed'));
      }
    }
  };

  // 复制内容 / Copy content
  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess'));
  };

  // 打开设置新密码弹窗 / Open set new password modal
  const handleResetPassword = () => {
    form.resetFields();
    setSetPasswordModalVisible(true);
  };

  const handleResetUsername = () => {
    usernameForm.setFieldsValue({
      newUsername: status?.adminUsername || 'admin',
    });
    setSetUsernameModalVisible(true);
  };

  // 提交新密码 / Submit new password
  const handleSetNewPassword = async () => {
    try {
      const values = await form.validate();
      setPasswordLoading(true);

      // changePassword goes through httpBridge; on 4xx/5xx it throws
      // BackendHttpError, caught below and translated via errorCodeMap.
      await webui.changePassword.invoke({
        newPassword: values.newPassword,
      });
      Message.success(t('settings.webui.passwordChanged'));
      setSetPasswordModalVisible(false);
      form.resetFields();
      // 更新缓存的密码为新密码，不再显示明文 / Update cached password, no longer show plaintext
      setCachedPassword(values.newPassword);
      setCanShowPlainPassword(false);
      setStatus((prev) => (prev ? { ...prev, initialPassword: undefined } : null));
    } catch (error) {
      console.error('Set new password error:', error);
      const errorCodeMap: Record<string, string> = {
        PASSWORD_TOO_SHORT: t('settings.webui.passwordTooShort'),
        PASSWORD_TOO_LONG: t('settings.webui.passwordTooLong'),
        PASSWORD_TOO_COMMON: t('settings.webui.passwordTooCommon'),
      };
      const rawMsg =
        isBackendHttpError(error) && error.backendMessage
          ? error.backendMessage
          : error instanceof Error
            ? error.message
            : '';
      const codes = rawMsg.split('; ');
      const translated = codes.map((code) => errorCodeMap[code]).filter(Boolean);
      Message.error(translated.length > 0 ? translated.join('; ') : rawMsg || t('settings.webui.passwordChangeFailed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSetNewUsername = async () => {
    try {
      const values = await usernameForm.validate();
      setUsernameLoading(true);

      // HTTP bridge: changeUsername returns { username: string } directly;
      // httpBridge throws BackendHttpError on 4xx/5xx — caught below.
      const result = await webui.changeUsername.invoke({
        newUsername: values.newUsername,
      });
      const nextUsername = result?.username ?? values.newUsername.trim();
      Message.success(t('settings.webui.usernameChanged'));
      setSetUsernameModalVisible(false);
      usernameForm.resetFields();
      setStatus((prev) => (prev ? { ...prev, adminUsername: nextUsername } : null));
    } catch (error) {
      console.error('Set new username error:', error);
      const fallback = t('settings.webui.usernameChangeFailed');
      const msg = isBackendHttpError(error) && error.backendMessage ? error.backendMessage : fallback;
      Message.error(msg);
    } finally {
      setUsernameLoading(false);
    }
  };

  // 生成二维码 / Generate QR code
  const generateQRCode = useCallback(async () => {
    if (!status?.running) return;

    setQrLoading(true);
    try {
      // Backend returns only { token, expires_at_ms }; the scannable URL is
      // composed here from the current status so it points at the right host
      // (networkUrl for remote-enabled servers, localUrl otherwise).
      const qrData = await webui.generateQRToken.invoke();

      if (qrData) {
        const baseUrl =
          status.allowRemote && status.networkUrl
            ? status.networkUrl
            : (status.localUrl ?? `http://localhost:${status.port ?? port}`);
        setQrUrl(`${baseUrl}/qr-login?token=${qrData.token}`);
        setQrExpiresAt(qrData.expires_at_ms);

        // 设置自动刷新定时器（4分钟后自动刷新，因为 token 5分钟过期）
        // Set auto-refresh timer (refresh after 4 minutes, as token expires in 5 minutes)
        if (qrRefreshTimerRef.current) {
          clearTimeout(qrRefreshTimerRef.current);
        }
        qrRefreshTimerRef.current = setTimeout(
          () => {
            void generateQRCode();
          },
          4 * 60 * 1000
        );
      } else {
        console.error('Generate QR code failed: no data returned');
        Message.error(t('settings.webui.qrGenerateFailed'));
      }
    } catch (error) {
      console.error('Generate QR code error:', error);
      Message.error(t('settings.webui.qrGenerateFailed'));
    } finally {
      setQrLoading(false);
    }
  }, [status?.running, status?.allowRemote, status?.networkUrl, status?.localUrl, status?.port, port, t]);

  // 当服务器启动且允许远程访问时自动生成二维码 / Auto-generate QR code when server starts and remote access is allowed
  useEffect(() => {
    if (status?.running && status.allowRemote && !qrUrl) {
      void generateQRCode();
    }
    // 清理定时器 / Cleanup timer
    return () => {
      if (qrRefreshTimerRef.current) {
        clearTimeout(qrRefreshTimerRef.current);
      }
    };
  }, [status?.allowRemote, status?.running, generateQRCode, qrUrl]);

  // 服务器停止或关闭远程访问时清除二维码 / Clear QR code when server stops or remote access is disabled
  useEffect(() => {
    if (!status?.running || !status.allowRemote) {
      setQrUrl(null);
      setQrExpiresAt(null);
      if (qrRefreshTimerRef.current) {
        clearTimeout(qrRefreshTimerRef.current);
        qrRefreshTimerRef.current = null;
      }
    }
  }, [status?.allowRemote, status?.running]);

  // 格式化过期时间 / Format expiration time
  const formatExpiresAt = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  // 获取实际密码 / Get actual password
  const actualPassword = status?.initialPassword || cachedPassword;
  // 获取显示的密码 / Get display password
  // 密码默认显示 ***，只在首次启动时显示明文 / Password shows *** by default, only show plaintext on first startup
  // 重置中显示加载状态 / Show loading state when resetting
  const getDisplayPassword = () => {
    // 可以显示明文且有密码时显示明文 / Show plaintext when allowed and has password
    if (canShowPlainPassword && actualPassword) return actualPassword;
    // 否则显示 ****** / Otherwise show ******
    return t('settings.webui.passwordHidden');
  };
  const displayPassword = getDisplayPassword();
  const displayUsername = status?.adminUsername || 'admin';

  // 浏览器端只显示 Channels 配置，不显示 WebUI 服务配置 / In browser mode, only show Channels config, not WebUI service config
  if (!isDesktop) {
    return (
      <div className='flex flex-col h-full w-full'>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <h2 className='text-20px font-500 text-t-primary m-0'>Channels</h2>
            <Suspense fallback={<div className='text-13px text-t-secondary'>{t('common.loading')}</div>}>
              <ChannelModalContentLazy />
            </Suspense>
          </div>
        </AionScrollArea>
      </div>
    );
  }

  const webuiPanel = (
    <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
      <div className='opl-settings-flat-stack px-[12px] md:px-[28px]'>
        <section className='opl-settings-section'>
          <div className='opl-settings-section__header'>
            <div className='min-w-0'>
              <h2 className='m-0 text-20px font-500 text-t-primary'>WebUI</h2>
              <p className='m-0 mt-4px text-13px leading-relaxed text-t-secondary'>{t('settings.webui.description')}</p>
            </div>
          </div>
        </section>

        <section className='opl-settings-section' data-testid='webui-service-settings'>
          <div className='opl-settings-section__header'>
            <h3 className='m-0 text-14px font-500 text-t-primary'>{t('settings.webui.configuration')}</h3>
          </div>
          <div className='opl-settings-list'>
            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <span className='text-13px text-t-primary'>{t('settings.webui.enable')}</span>
                <span className='text-12px leading-relaxed text-t-secondary'>
                  {t('settings.webui.featureRemoteDesc')}
                </span>
              </div>
              <div className='opl-settings-row__meta'>
                {(startLoading || status?.running) && (
                  <span
                    aria-live='polite'
                    className={startLoading ? 'text-12px text-warning' : 'text-12px text-success'}
                  >
                    {startLoading ? t('settings.webui.starting') : t('settings.webui.running')}
                  </span>
                )}
                <Switch
                  aria-label={t('settings.webui.enable')}
                  checked={webuiEnabled}
                  loading={startLoading}
                  onChange={handleToggle}
                />
              </div>
            </div>

            {webuiEnabled && (
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <span className='text-13px text-t-primary'>{t('settings.webui.accessUrl')}</span>
                </div>
                <div className='opl-settings-row__meta min-w-0 flex-nowrap'>
                  <Button
                    htmlType='button'
                    type='text'
                    size='small'
                    className='!h-32px !min-w-0 !overflow-hidden !bg-transparent !px-0 !font-mono !text-13px !text-primary hover:!bg-transparent hover:!underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
                    onClick={() => shell.openExternal.invoke(getDisplayUrl()).catch(console.error)}
                  >
                    {getDisplayUrl()}
                  </Button>
                  <Tooltip content={t('settings.webui.copyAccessUrl')}>
                    <Button
                      htmlType='button'
                      type='text'
                      className={WEBUI_ICON_ACTION_CLASS}
                      aria-label={t('settings.webui.copyAccessUrl')}
                      icon={<Copy aria-hidden='true' size={16} />}
                      onClick={() => handleCopy(getDisplayUrl())}
                    />
                  </Tooltip>
                </div>
              </div>
            )}

            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <span className='text-13px text-t-primary'>{t('settings.webui.allowRemote')}</span>
                <span className='text-12px leading-relaxed text-t-secondary'>
                  {t('settings.webui.allowRemoteDesc')}{' '}
                  <Button
                    htmlType='button'
                    type='text'
                    size='mini'
                    className='!h-auto !bg-transparent !p-0 !text-12px !text-primary hover:!bg-transparent hover:!underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
                    onClick={() =>
                      shell.openExternal
                        .invoke('https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide')
                        .catch(console.error)
                    }
                  >
                    {t('settings.webui.viewGuide')}
                  </Button>
                </span>
              </div>
              <div className='opl-settings-row__meta'>
                <Switch
                  aria-label={t('settings.webui.allowRemote')}
                  checked={allowRemotePreference}
                  onChange={handleAllowRemoteChange}
                />
              </div>
            </div>
          </div>
        </section>

        <section className='opl-settings-section' data-testid='webui-login-settings'>
          <div className='opl-settings-section__header'>
            <h3 className='m-0 text-14px font-500 text-t-primary'>{t('settings.webui.loginInfo')}</h3>
          </div>
          <div className='opl-settings-list'>
            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <span className='text-13px text-t-primary'>{t('settings.webui.username')}</span>
              </div>
              <div className='opl-settings-row__meta flex-nowrap'>
                <span className='min-w-0 truncate text-13px text-t-primary'>{displayUsername}</span>
                <Tooltip content={t('settings.webui.copyUsername')}>
                  <Button
                    htmlType='button'
                    type='text'
                    className={WEBUI_ICON_ACTION_CLASS}
                    aria-label={t('settings.webui.copyUsername')}
                    icon={<Copy aria-hidden='true' size={16} />}
                    onClick={() => handleCopy(displayUsername)}
                  />
                </Tooltip>
                <Tooltip content={t('settings.webui.editUsernameTooltip')}>
                  <Button
                    htmlType='button'
                    type='text'
                    className={WEBUI_ICON_ACTION_CLASS}
                    aria-label={t('settings.webui.editUsernameTooltip')}
                    icon={<EditTwo aria-hidden='true' size={16} />}
                    onClick={handleResetUsername}
                  />
                </Tooltip>
              </div>
            </div>

            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <span className='text-13px text-t-primary'>{t('settings.webui.initialPassword')}</span>
              </div>
              <div className='opl-settings-row__meta flex-nowrap'>
                <span className='min-w-0 truncate font-mono text-13px text-t-primary'>{displayPassword}</span>
                <Tooltip content={t('settings.webui.resetPasswordTooltip')}>
                  <Button
                    htmlType='button'
                    type='text'
                    className={WEBUI_ICON_ACTION_CLASS}
                    aria-label={t('settings.webui.resetPassword')}
                    icon={<EditTwo aria-hidden='true' size={16} />}
                    onClick={handleResetPassword}
                  />
                </Tooltip>
              </div>
            </div>

            {status?.running && status.allowRemote && (
              <div className='opl-settings-row items-start'>
                <div className='opl-settings-row__main'>
                  <span className='text-13px text-t-primary'>{t('settings.webui.qrLogin')}</span>
                  <span className='text-12px leading-relaxed text-t-secondary'>{t('settings.webui.qrLoginHint')}</span>
                </div>
                <div className='opl-settings-row__meta flex-col items-end'>
                  {qrLoading ? (
                    <div className='flex h-140px w-140px items-center justify-center'>
                      <span className='text-13px text-t-tertiary'>{t('common.loading')}</span>
                    </div>
                  ) : qrUrl ? (
                    <div className='bg-white p-8px rd-8px' data-testid='webui-qr-scan-surface'>
                      <Suspense
                        fallback={
                          <div className='flex h-140px w-140px items-center justify-center'>
                            <span className='text-13px text-t-tertiary'>{t('common.loading')}</span>
                          </div>
                        }
                      >
                        <QRCodeSVGLazy value={qrUrl} size={140} level='M' />
                      </Suspense>
                    </div>
                  ) : (
                    <div className='flex h-140px w-140px items-center justify-center'>
                      <span className='text-13px text-t-tertiary'>{t('settings.webui.qrGenerateFailed')}</span>
                    </div>
                  )}

                  <div className='flex items-center gap-4px'>
                    {qrExpiresAt && (
                      <span className='mr-4px text-12px text-t-tertiary'>
                        {t('settings.webui.qrExpires', { time: formatExpiresAt(qrExpiresAt) })}
                      </span>
                    )}
                    {qrUrl && (
                      <Tooltip content={t('settings.webui.copyQrLink')}>
                        <Button
                          htmlType='button'
                          type='text'
                          className={WEBUI_ICON_ACTION_CLASS}
                          aria-label={t('settings.webui.copyQrLink')}
                          icon={<Copy aria-hidden='true' size={16} />}
                          onClick={() => handleCopy(qrUrl)}
                        />
                      </Tooltip>
                    )}
                    <Tooltip content={t('settings.webui.refreshQr')}>
                      <Button
                        htmlType='button'
                        type='text'
                        className={WEBUI_ICON_ACTION_CLASS}
                        aria-label={t('settings.webui.refreshQr')}
                        aria-busy={qrLoading}
                        icon={<Refresh aria-hidden='true' size={16} className={qrLoading ? 'animate-spin' : ''} />}
                        onClick={() => void generateQRCode()}
                        disabled={qrLoading}
                      />
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </AionScrollArea>
  );

  return (
    <div className='flex flex-col h-full w-full'>
      <Tabs
        activeTab={activeTab}
        onChange={(key) => setActiveTab((key as 'webui' | 'channels') || 'webui')}
        type='line'
        className='mb-12px settings-remote-tabs'
      >
        <Tabs.TabPane
          key='webui'
          title={
            <span
              data-webui-tab='webui'
              className={`inline-flex items-center gap-6px transition-colors ${activeTab === 'webui' ? 'text-t-primary font-600' : 'text-t-secondary'}`}
            >
              <Earth theme='outline' size='15' />
              <span>WebUI</span>
            </span>
          }
        />
        <Tabs.TabPane
          key='channels'
          title={
            <span
              data-webui-tab='channels'
              className={`inline-flex items-center gap-6px transition-colors ${activeTab === 'channels' ? 'text-t-primary font-600' : 'text-t-secondary'}`}
            >
              <Communication theme='outline' size='15' />
              <span>Channels</span>
              <span className='inline-flex items-center gap-4px ml-2px'>
                {CHANNEL_LOGOS.map((item) => (
                  <span
                    key={item.alt}
                    className='inline-flex items-center justify-center w-16px h-16px rd-50% border border-line bg-fill-1'
                    title={item.alt}
                    aria-label={item.alt}
                  >
                    <img src={item.src} alt={item.alt} className='w-14px h-14px object-contain' />
                  </span>
                ))}
              </span>
            </span>
          }
        />
      </Tabs>

      {activeTab === 'webui' ? (
        webuiPanel
      ) : (
        <div className='flex-1 min-h-0'>
          <Suspense
            fallback={<div className='px-[12px] md:px-[28px] text-13px text-t-secondary'>{t('common.loading')}</div>}
          >
            <ChannelModalContentLazy />
          </Suspense>
        </div>
      )}

      <AionModal
        visible={setUsernameModalVisible}
        onCancel={() => setSetUsernameModalVisible(false)}
        onOk={handleSetNewUsername}
        confirmLoading={usernameLoading}
        title={t('settings.webui.setNewUsername')}
        size='small'
      >
        <Form form={usernameForm} layout='vertical' className='pt-16px'>
          <Form.Item
            label={t('settings.webui.newUsername')}
            field='newUsername'
            rules={[
              { required: true, message: t('settings.webui.newUsernameRequired') },
              {
                validator: (value, callback) => {
                  if (typeof value !== 'string') {
                    callback();
                    return;
                  }

                  const trimmed = value.trim();
                  if (trimmed.length < 3) {
                    callback(t('settings.webui.usernameMinLength'));
                    return;
                  }

                  if (trimmed.length > 32) {
                    callback(t('settings.webui.usernameMaxLength'));
                    return;
                  }

                  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
                    callback(t('settings.webui.usernameFormatError'));
                    return;
                  }

                  if (/^[_-]|[_-]$/.test(trimmed)) {
                    callback(t('settings.webui.usernameEdgeError'));
                    return;
                  }

                  callback();
                },
              },
            ]}
          >
            <Input placeholder={t('settings.webui.newUsernamePlaceholder')} />
          </Form.Item>
        </Form>
      </AionModal>

      {/* 设置新密码弹窗 / Set New Password Modal */}
      <AionModal
        visible={setPasswordModalVisible}
        onCancel={() => setSetPasswordModalVisible(false)}
        onOk={handleSetNewPassword}
        confirmLoading={passwordLoading}
        title={t('settings.webui.setNewPassword')}
        size='small'
      >
        <Form form={form} layout='vertical' className='pt-16px'>
          <Form.Item
            label={t('settings.webui.newPassword')}
            field='newPassword'
            rules={[
              { required: true, message: t('settings.webui.newPasswordRequired') },
              { minLength: 8, message: t('settings.webui.passwordMinLength') },
            ]}
          >
            <Input.Password placeholder={t('settings.webui.newPasswordPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('settings.webui.confirmPassword')}
            field='confirmPassword'
            rules={[
              { required: true, message: t('settings.webui.confirmPasswordRequired') },
              {
                validator: (value, callback) => {
                  if (value !== form.getFieldValue('newPassword')) {
                    callback(t('settings.webui.passwordMismatch'));
                  } else {
                    callback();
                  }
                },
              },
            ]}
          >
            <Input.Password placeholder={t('settings.webui.confirmPasswordPlaceholder')} />
          </Form.Item>
        </Form>
      </AionModal>
    </div>
  );
};

export default WebuiModalContent;
