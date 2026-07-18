import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePreviewContext } from '@renderer/pages/conversation/Preview/context/PreviewContext';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import { useTeamCreatedRedirect } from '@renderer/pages/team/hooks/useTeamCreatedRedirect';
import { useTranslation } from 'react-i18next';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import { SETTINGS_DEFAULT_ROUTE } from '@/renderer/pages/settings/registry/settingsRegistry';
import { gatewayAccountInitials, readGatewayAccountProjection } from '@/renderer/pages/settings/accessProjection';
import { useDesktopAutoUpdateStatus } from '@/renderer/hooks/ui/useDesktopAutoUpdateStatus';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { projectDesktopAutoUpdateStatus } from '@/renderer/services/desktopAutoUpdateProjection';
import { useAllCronJobs } from '@/renderer/pages/cron/useCronJobs';
import { SiderPrimaryNav, SiderSearchEntry, SiderToolbar } from './SiderNav';
import CronJobSiderSection from './CronJobSiderSection';
import SiderFooter from './SiderFooter';
import TeamSiderSection from './TeamSiderSection';
import FirstRunSetupEntry from './FirstRunSetupEntry';
import siderStyles from './Sider.module.css';

const WorkspaceGroupedHistory = React.lazy(() => import('@renderer/pages/conversation/GroupedHistory'));
const SettingsSider = React.lazy(() => import('@renderer/pages/settings/components/SettingsSider'));

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

interface CronJobSiderContentProps {
  pathname: string;
  onNavigate: (path: string) => void;
}

const CronJobSiderContent: React.FC<CronJobSiderContentProps> = ({ pathname, onNavigate }) => {
  const { jobs } = useAllCronJobs();
  return <CronJobSiderSection jobs={jobs} pathname={pathname} onNavigate={onNavigate} />;
};

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const location = useLocation();
  const { pathname } = location;

  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const { logout, status } = useAuth();
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const desktopAutoUpdateState = useDesktopAutoUpdateStatus();
  useTeamCreatedRedirect();
  const isSettings = pathname.startsWith('/settings');
  const showLogout =
    typeof window !== 'undefined' && !(window as { electronAPI?: unknown }).electronAPI && status === 'authenticated';
  const gatewayAccount = readGatewayAccountProjection(appStateQuery.appState);
  const desktopAutoUpdate = React.useMemo(
    () => projectDesktopAutoUpdateStatus(desktopAutoUpdateState.supported, desktopAutoUpdateState.status, t),
    [desktopAutoUpdateState.status, desktopAutoUpdateState.supported, t]
  );
  const footerAccount =
    gatewayAccount?.connection_mode === 'account' && gatewayAccount.account_card_visible && gatewayAccount.account
      ? {
          displayName: gatewayAccount.account.display_name,
          email: gatewayAccount.account.email,
          initials: gatewayAccountInitials(gatewayAccount.account.display_name, gatewayAccount.account.email),
        }
      : null;

  const handleNewChat = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    Promise.resolve(navigate('/guid', { state: { resetAssistant: true } })).catch((error) => {
      console.error('Navigation failed:', error);
    });
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleSettingsClick = (target: 'general' | 'gateway') => {
    cleanupSiderTooltips();
    blurActiveElement();
    Promise.resolve(navigate(target === 'gateway' ? '/settings/gateway' : SETTINGS_DEFAULT_ROUTE)).catch((error) => {
      console.error('Navigation failed:', error);
    });
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleConversationSelect = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
  };

  const handlePrimaryNavigate = (path: string) => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    Promise.resolve(navigate(path)).catch((error) => {
      console.error('Navigation failed:', error);
    });
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleUpdateClick = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    window.dispatchEvent(
      new CustomEvent('aionui-open-update-modal', { detail: { source: 'sider-footer', intent: 'update' } })
    );
  };

  const handleLogout = useCallback(async () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
      return; // logout 失败时不执行后续操作
    }
    if (onSessionClick) {
      onSessionClick();
    }
  }, [closePreview, logout, onSessionClick]);

  useEffect(() => {
    if (!showLogout) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        handleLogout();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleLogout, showLogout]);

  const tooltipEnabled = collapsed && !isMobile;
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);

  const workspaceHistoryProps = {
    collapsed,
    tooltipEnabled,
    onSessionClick,
  };

  return (
    <div className='size-full flex flex-col'>
      {/* Main content area */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        {isSettings ? (
          <Suspense fallback={<div className='size-full' />}>
            <SettingsSider collapsed={collapsed} tooltipEnabled={tooltipEnabled} />
          </Suspense>
        ) : (
          <div className='size-full flex flex-col gap-2px'>
            <SiderToolbar
              isMobile={isMobile}
              collapsed={collapsed}
              siderTooltipProps={siderTooltipProps}
              onNewChat={handleNewChat}
            />
            <SiderPrimaryNav
              pathname={pathname}
              isMobile={isMobile}
              collapsed={collapsed}
              siderTooltipProps={siderTooltipProps}
              onRuntimeClick={() => handlePrimaryNavigate('/runtime')}
              onScheduledClick={() => handlePrimaryNavigate('/scheduled')}
              onArchivedClick={() => handlePrimaryNavigate('/archived')}
            />
            <div
              className={classNames(
                'shrink-0 mt-6px mb-2px h-1px bg-[var(--color-border-2)]',
                collapsed ? 'mx-6px' : 'mx-10px'
              )}
            />
            <div className={classNames('flex-1 min-h-0 overflow-y-auto', siderStyles.scrollArea)}>
              {!collapsed ? (
                <div
                  className='h-32px px-12px flex items-center justify-between gap-8px text-12px leading-18px font-[500] text-t-tertiary'
                  data-testid='conversation-history-header'
                >
                  <span>{t('conversation.history.title')}</span>
                  <SiderSearchEntry
                    isMobile={isMobile}
                    collapsed={false}
                    siderTooltipProps={siderTooltipProps}
                    onConversationSelect={handleConversationSelect}
                    onSessionClick={onSessionClick}
                  />
                </div>
              ) : (
                <SiderSearchEntry
                  isMobile={isMobile}
                  collapsed
                  siderTooltipProps={siderTooltipProps}
                  onConversationSelect={handleConversationSelect}
                  onSessionClick={onSessionClick}
                />
              )}
              <Suspense fallback={<div className='min-h-200px' />}>
                <WorkspaceGroupedHistory
                  {...workspaceHistoryProps}
                  afterPinnedContent={
                    <>
                      {!collapsed && <CronJobSiderContent pathname={pathname} onNavigate={handlePrimaryNavigate} />}
                      {TEAM_MODE_ENABLED && (
                        <TeamSiderSection
                          collapsed={collapsed}
                          pathname={pathname}
                          siderTooltipProps={siderTooltipProps}
                          onSessionClick={onSessionClick}
                        />
                      )}
                    </>
                  }
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
      {!isSettings && <FirstRunSetupEntry collapsed={collapsed} isMobile={isMobile} onNavigate={onSessionClick} />}
      {/* Footer */}
      <SiderFooter
        isMobile={isMobile}
        collapsed={collapsed}
        updateAvailable={desktopAutoUpdate.updateAvailable}
        account={footerAccount}
        siderTooltipProps={siderTooltipProps}
        onSettingsClick={handleSettingsClick}
        onUpdateClick={handleUpdateClick}
      />
    </div>
  );
};

export default Sider;
