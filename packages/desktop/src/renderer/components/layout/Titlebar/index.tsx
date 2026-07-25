import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowLeft, ArrowRight, Help, LeftBar, Peoples } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import {
  buildOplAppIssueUrl,
  getOplGlobalFeedbackIssueUrl,
  getOplOrdinaryChromeName,
} from '@/common/config/oplProductProfile';
import MobileConversationBrand from './MobileConversationBrand';
import WindowControls from '../WindowControls';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { isElectronDesktop, isMacOS, openExternalUrl } from '@/renderer/utils/platform';
import { rememberSettingsReturnPath, resolveSettingsReturnPath } from '@/renderer/utils/ui/settingsReturnPath';
import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';
import './titlebar.css';

interface TitlebarProps {
  workspaceAvailable: boolean;
}

const Titlebar: React.FC<TitlebarProps> = ({ workspaceAvailable }) => {
  const { t } = useTranslation();
  const appTitle = useMemo(() => getOplOrdinaryChromeName(), []);
  const [mobileCenterTitle, setMobileCenterTitle] = useState(appTitle);
  const [mobileCenterOffset, setMobileCenterOffset] = useState(0);
  const layout = useLayoutContext();
  const navigationHistory = useNavigationHistory();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const isDesktopRuntime = isElectronDesktop();
  const isMacRuntime = isDesktopRuntime && isMacOS();
  // Windows/Linux 显示自定义窗口按钮；macOS 在标题栏给工作区一个切换入口
  const showWindowControls = isDesktopRuntime && !isMacRuntime;
  const backToAppTooltip = t('settings.backToApp');
  const feedbackTooltip = t('settings.githubIssue.tooltip');
  const isSettingsRoute = location.pathname.startsWith('/settings');
  // 统一在标题栏左侧展示主侧栏开关 / Always expose sidebar toggle on titlebar left side
  const showSiderToggle = Boolean(layout?.setSiderCollapsed) && !(layout?.isMobile && isSettingsRoute);
  const showBackToChatButton = Boolean(layout?.isMobile && isSettingsRoute);
  const siderTooltip = layout?.siderCollapsed
    ? t('common.expandMore', { defaultValue: 'Expand sidebar' })
    : t('common.collapse', { defaultValue: 'Collapse sidebar' });
  // Settings owns its desktop return action in the sider; narrow Settings keeps the titlebar action.
  const showHistoryNav = Boolean(navigationHistory) && !layout?.isMobile && !isSettingsRoute;
  const historyBackTooltip = t('common.historyBack', { defaultValue: 'Back' });
  const historyForwardTooltip = t('common.forward', { defaultValue: 'Forward' });

  const handleSiderToggle = () => {
    if (!showSiderToggle || !layout?.setSiderCollapsed) return;
    layout.setSiderCollapsed(!layout.siderCollapsed);
  };

  const handleBackToChat = () => {
    void navigate(resolveSettingsReturnPath());
  };

  const handleFeedback = () => {
    const route = `${location.pathname}${location.search}`;
    const version = __OPL_RELEASE_VERSION__ || __APP_VERSION__;
    const issueUrl = buildOplAppIssueUrl(
      getOplGlobalFeedbackIssueUrl(),
      t('settings.githubIssue.title'),
      t('settings.githubIssue.body', { route, version })
    );
    void openExternalUrl(issueUrl).catch((error) => {
      console.error('Failed to open OPL App issue:', error);
    });
  };

  useEffect(() => {
    rememberSettingsReturnPath({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!layout?.isMobile) {
      setMobileCenterTitle(appTitle);
      return;
    }

    // Team mode: show team name
    if (TEAM_MODE_ENABLED) {
      const teamMatch = location.pathname.match(/^\/team\/([^/]+)/);
      const team_id = teamMatch?.[1];
      if (team_id) {
        let cancelled = false;
        void ipcBridge.team.get
          .invoke({ id: team_id })
          .then((team) => {
            if (cancelled) return;
            setMobileCenterTitle(team?.name || appTitle);
          })
          .catch(() => {
            if (cancelled) return;
            setMobileCenterTitle(appTitle);
          });
        return () => {
          cancelled = true;
        };
      }
    }

    // Single agent mode: show conversation name
    const match = location.pathname.match(/^\/conversation\/([^/]+)/);
    const conversation_id = match?.[1];
    if (!conversation_id) {
      setMobileCenterTitle(appTitle);
      return;
    }

    let cancelled = false;
    void ipcBridge.conversation.get
      .invoke({ id: conversation_id })
      .then((conversation) => {
        if (cancelled) return;
        setMobileCenterTitle(conversation?.name || appTitle);
      })
      .catch(() => {
        if (cancelled) return;
        setMobileCenterTitle(appTitle);
      });

    return () => {
      cancelled = true;
    };
  }, [appTitle, layout?.isMobile, location.pathname]);

  useEffect(() => {
    if (!layout?.isMobile) {
      setMobileCenterOffset(0);
      return;
    }

    const updateOffset = () => {
      const leftWidth = menuRef.current?.offsetWidth || 0;
      const rightWidth = toolbarRef.current?.offsetWidth || 0;
      setMobileCenterOffset((leftWidth - rightWidth) / 2);
    };

    updateOffset();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateOffset);
      return () => window.removeEventListener('resize', updateOffset);
    }

    const observer = new ResizeObserver(() => updateOffset());
    if (containerRef.current) observer.observe(containerRef.current);
    if (menuRef.current) observer.observe(menuRef.current);
    if (toolbarRef.current) observer.observe(toolbarRef.current);

    return () => observer.disconnect();
  }, [layout?.isMobile, showBackToChatButton, mobileCenterTitle]);

  const mobileCenterStyle = layout?.isMobile
    ? ({
        '--app-titlebar-mobile-center-offset': `${workspaceAvailable ? mobileCenterOffset : 0}px`,
      } as React.CSSProperties)
    : undefined;

  const menuStyle: React.CSSProperties = useMemo(() => {
    if (!isMacRuntime || !showSiderToggle) return {};
    // macOS: sit the menu buttons right next to the traffic lights (which occupy ~70px).
    // Mobile keeps its own layout (no traffic lights).
    const marginLeft = layout?.isMobile ? '0px' : '76px';
    return {
      marginLeft,
    };
  }, [isMacRuntime, showSiderToggle, layout?.isMobile]);

  return (
    <div
      ref={containerRef}
      style={mobileCenterStyle}
      className={classNames('flex items-center gap-8px app-titlebar bg-2 border-b border-[var(--border-base)]', {
        'app-titlebar--mobile': layout?.isMobile,
        'app-titlebar--mobile-conversation': layout?.isMobile && workspaceAvailable,
        'app-titlebar--desktop': isDesktopRuntime,
        'app-titlebar--mac': isMacRuntime,
      })}
    >
      <div ref={menuRef} className='app-titlebar__menu' style={menuStyle}>
        {showBackToChatButton && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleBackToChat}
            aria-label={backToAppTooltip}
            title={backToAppTooltip}
            data-testid='settings-titlebar-back-to-app'
          >
            <ArrowLeft aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
          </button>
        )}
        {showSiderToggle && (
          <button
            type='button'
            className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
            onClick={handleSiderToggle}
            aria-label={siderTooltip}
            title={siderTooltip}
            data-testid='app-navigation-rail-toggle'
          >
            <LeftBar aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
          </button>
        )}
        {showHistoryNav && (
          <>
            <button
              type='button'
              className='app-titlebar__button app-titlebar__button--nav'
              onClick={() => navigationHistory?.back()}
              disabled={!navigationHistory?.canBack}
              aria-label={historyBackTooltip}
              title={historyBackTooltip}
            >
              <ArrowLeft aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
            </button>
            <button
              type='button'
              className='app-titlebar__button app-titlebar__button--nav'
              onClick={() => navigationHistory?.forward()}
              disabled={!navigationHistory?.canForward}
              aria-label={historyForwardTooltip}
              title={historyForwardTooltip}
            >
              <ArrowRight aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
            </button>
          </>
        )}
      </div>
      <div
        className={classNames('app-titlebar__brand', {
          'app-titlebar__brand--centered': layout?.isMobile || !location.pathname.match(/^\/(conversation|team)\//),
        })}
        aria-label={layout?.isMobile ? mobileCenterTitle : appTitle}
        title={layout?.isMobile ? mobileCenterTitle : appTitle}
      >
        {layout?.isMobile &&
          (() => {
            const conversationMatch = location.pathname.match(/^\/conversation\/([^/]+)/);
            const conversation_id = conversationMatch?.[1];
            if (conversation_id) {
              return <MobileConversationBrand conversation_id={conversation_id} fallbackTitle={mobileCenterTitle} />;
            }
            const isTeamRoute = TEAM_MODE_ENABLED && /^\/team\/[^/]+/.test(location.pathname);
            return (
              <span className='app-titlebar__brand-mobile'>
                {isTeamRoute && (
                  <span className='app-titlebar__brand-icon' aria-hidden='true'>
                    <Peoples {...OPL_CHROME_ICON_PROPS} />
                  </span>
                )}
                <span className='app-titlebar__brand-text'>{mobileCenterTitle}</span>
              </span>
            );
          })()}
      </div>
      <div ref={toolbarRef} className='app-titlebar__toolbar'>
        {layout?.isMobile && <div id='app-titlebar-actions-slot' className='app-titlebar__actions-slot' />}
        <button
          type='button'
          className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
          onClick={handleFeedback}
          aria-label={feedbackTooltip}
          title={feedbackTooltip}
        >
          <Help {...OPL_CHROME_ICON_PROPS} data-testid='app-titlebar-help-icon' aria-hidden='true' />
        </button>
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
};

export default Titlebar;
