import WorkspacePanelHeader from './WorkspacePanelHeader';
import { WORKSPACE_HEADER_HEIGHT } from '@/renderer/pages/conversation/utils/layoutCalc';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type MobileWorkspaceOverlayProps = {
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: (collapsed: boolean) => void;
  workspaceWidthPx: number;
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
        (element) => !element.closest('[hidden], [aria-hidden="true"], [inert]')
      );
    const focusWithinPanel = (target: HTMLElement) => {
      target.focus({ preventScroll: true });
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    };
    focusWithinPanel(focusable()[0] ?? panel);

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
        focusWithinPanel(panel);
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        focusWithinPanel(last);
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        focusWithinPanel(first);
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
      const replacementToggle = document.querySelector<HTMLElement>('[data-testid="conversation-side-panel-toggle"]');
      if (replacementToggle) replacementToggle.focus({ preventScroll: true });
      else if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    };
  }, [rightSiderCollapsed, setRightSiderCollapsed]);

  return (
    <div
      ref={layerRef}
      className='fixed inset-0 z-90'
      aria-hidden={rightSiderCollapsed}
      data-testid='conversation-side-panel-layer'
      style={{ pointerEvents: rightSiderCollapsed ? 'none' : 'auto' }}
    >
      {!rightSiderCollapsed && (
        <div
          className='absolute inset-0 bg-black/30'
          onClick={() => setRightSiderCollapsed(true)}
          aria-hidden='true'
          data-testid='conversation-side-panel-backdrop'
        />
      )}
      <div
        ref={panelRef}
        className='!bg-1 chat-layout-right-sider'
        role='dialog'
        aria-modal={rightSiderCollapsed ? undefined : 'true'}
        aria-label={t('conversation.sidePanel.title')}
        aria-hidden={rightSiderCollapsed}
        tabIndex={-1}
        data-testid='conversation-side-panel-surface'
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
      </div>
    </div>
  );
};

export default MobileWorkspaceOverlay;
