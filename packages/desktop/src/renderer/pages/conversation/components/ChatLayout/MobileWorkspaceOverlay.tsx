import WorkspacePanelHeader from './WorkspacePanelHeader';
import { WORKSPACE_HEADER_HEIGHT } from '@/renderer/pages/conversation/utils/layoutCalc';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { Button, Layout as ArcoLayout } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type MobileWorkspaceOverlayProps = {
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: (collapsed: boolean) => void;
  workspaceWidthPx: number;
  mobileWorkspaceHandleRight: number;
  siderTitle?: React.ReactNode;
  sider: React.ReactNode;
  workspacePath?: string;
  isTemporaryWorkspace?: boolean;
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Full-screen overlay + fixed workspace panel + floating collapse handle for mobile viewports
const MobileWorkspaceOverlay: React.FC<MobileWorkspaceOverlayProps> = ({
  rightSiderCollapsed,
  setRightSiderCollapsed,
  workspaceWidthPx,
  mobileWorkspaceHandleRight,
  siderTitle,
  sider,
  workspacePath,
  isTemporaryWorkspace,
}) => {
  const { t } = useTranslation();
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const panel = panelRef.current;
    if (!layer || !panel) return undefined;
    if (rightSiderCollapsed) {
      layer.setAttribute('inert', '');
      return undefined;
    }
    layer.removeAttribute('inert');

    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isolatedSiblings: Array<{
      element: HTMLElement;
      ariaHidden: string | null;
      wasInert: boolean;
    }> = [];
    let branch: HTMLElement = layer;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        isolatedSiblings.push({
          element: sibling,
          ariaHidden: sibling.getAttribute('aria-hidden'),
          wasInert: sibling.hasAttribute('inert'),
        });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      if (parent === document.body) break;
      branch = parent;
    }

    const focusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true'
      );
    (focusable()[0] ?? panel).focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setRightSiderCollapsed(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      if (!targets.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      for (const { element, ariaHidden, wasInert } of isolatedSiblings) {
        if (!wasInert) element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    };
  }, [rightSiderCollapsed, setRightSiderCollapsed]);

  return (
    <div
      ref={layerRef}
      className='fixed inset-0 z-90'
      aria-hidden={rightSiderCollapsed}
      style={{ pointerEvents: rightSiderCollapsed ? 'none' : 'auto' }}
    >
      {!rightSiderCollapsed && (
        <div className='absolute inset-0 bg-black/30' onClick={() => setRightSiderCollapsed(true)} aria-hidden='true' />
      )}
      <div
        ref={panelRef}
        className='!bg-1 chat-layout-right-sider'
        role='dialog'
        aria-modal={rightSiderCollapsed ? undefined : 'true'}
        aria-label={t('conversation.sidePanel.title')}
        aria-hidden={rightSiderCollapsed}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          height: '100vh',
          width: `${Math.round(workspaceWidthPx)}px`,
          zIndex: 100,
          transform: rightSiderCollapsed ? 'translateX(100%)' : 'translateX(0)',
          transition: 'none',
          pointerEvents: rightSiderCollapsed ? 'none' : 'auto',
        }}
      >
        <WorkspacePanelHeader
          showToggle
          collapsed={rightSiderCollapsed}
          onToggle={() => dispatchWorkspaceToggleEvent()}
          togglePlacement='left'
          workspacePath={workspacePath}
          isTemporaryWorkspace={isTemporaryWorkspace}
        >
          {siderTitle}
        </WorkspacePanelHeader>
        <ArcoLayout.Content className='bg-1' style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
          {sider}
        </ArcoLayout.Content>
        {!rightSiderCollapsed && (
          <Button
            type='text'
            className='fixed z-101 flex items-center justify-center transition-colors workspace-toggle-floating'
            style={{
              top: '50%',
              right: `${mobileWorkspaceHandleRight}px`,
              transform: 'translateY(-50%)',
              width: '20px',
              height: '64px',
              borderTopLeftRadius: '10px',
              borderBottomLeftRadius: '10px',
              borderTopRightRadius: '0',
              borderBottomRightRadius: '0',
              borderRight: 'none',
              backgroundColor: 'var(--bg-2)',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
            }}
            onClick={() => dispatchWorkspaceToggleEvent()}
            aria-label={t('conversation.sidePanel.close')}
          >
            <span className='flex flex-col items-center justify-center gap-5px text-t-secondary'>
              <span className='block w-8px h-2px rd-999px bg-current opacity-85'></span>
              <span className='block w-8px h-2px rd-999px bg-current opacity-65'></span>
              <span className='block w-8px h-2px rd-999px bg-current opacity-45'></span>
            </span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default MobileWorkspaceOverlay;
