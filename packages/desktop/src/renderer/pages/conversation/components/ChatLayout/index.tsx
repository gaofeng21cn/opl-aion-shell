import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import type { PresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import ChatTitleEditor from '@/renderer/pages/conversation/components/ChatTitleEditor';
import { useContainerWidth } from '@/renderer/pages/conversation/hooks/useContainerWidth';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import { useLayoutConstraints } from '@/renderer/pages/conversation/hooks/useLayoutConstraints';
import { useTitleRename } from '@/renderer/pages/conversation/hooks/useTitleRename';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/Preview';
import {
  DEFAULT_WORKSPACE_PANEL_PX,
  MAX_WORKSPACE_PANEL_PX,
  MIN_WORKSPACE_PANEL_PX,
  WORKSPACE_HEADER_HEIGHT,
  calcLayoutMetrics,
} from '@/renderer/pages/conversation/utils/layoutCalc';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { Button, Layout as ArcoLayout, Tooltip } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight, Left, Right } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import MobileWorkspaceOverlay from './MobileWorkspaceOverlay';
import WorkspacePanelHeader from './WorkspacePanelHeader';
import './chat-layout.css';

const WORKSPACE_OVERLAY_MAX_PX = 1100;

const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  presetAssistant?: PresetAssistantInfo & { id?: string };
  agent_name?: string;
  environmentSlot?: React.ReactNode;
  workspaceEnabled?: boolean;
  conversation_id?: string;
  tabsSlot?: React.ReactNode;
  workspacePath?: string;
  isTemporaryWorkspace?: boolean;
  workspacePreferenceKey?: string;
  onRenameTitle?: (new_name: string) => Promise<boolean>;
  headerLeading?: React.ReactNode;
}> = (props) => {
  const { t } = useTranslation();
  const { conversation_id, workspacePath, isTemporaryWorkspace } = props;
  const { backend, presetAssistant, agent_name, workspaceEnabled = true, workspacePreferenceKey } = props;
  const layout = useLayoutContext();
  const navigationHistory = useNavigationHistory();
  const isMobile = Boolean(layout?.isMobile);
  const { containerRef, containerWidth } = useContainerWidth();
  const usesWorkspaceOverlay = isMobile || (containerWidth > 0 && containerWidth <= WORKSPACE_OVERLAY_MAX_PX);
  const isDesktop = !usesWorkspaceOverlay;
  const { isOpen: isPreviewOpen, closePreview } = usePreviewContext();
  const previewOwnsCanvas = isPreviewOpen && usesWorkspaceOverlay;
  const { rightSiderCollapsed, setRightSiderCollapsed } = useWorkspaceCollapse({
    workspaceEnabled,
    isMobile: usesWorkspaceOverlay,
    conversation_id,
    preferenceKey: workspacePreferenceKey ?? conversation_id,
  });

  useEffect(() => {
    if (usesWorkspaceOverlay && isPreviewOpen) {
      setRightSiderCollapsed(true);
    }
  }, [isPreviewOpen, setRightSiderCollapsed, usesWorkspaceOverlay]);

  const toggleWorkspace = () => {
    if (usesWorkspaceOverlay && rightSiderCollapsed) {
      closePreview();
    }
    dispatchWorkspaceToggleEvent();
  };

  const workspacePanelRef = useRef<HTMLElement>(null);
  const previousWorkspaceCollapsedRef = useRef(true);

  useEffect(() => {
    const wasCollapsed = previousWorkspaceCollapsedRef.current;
    previousWorkspaceCollapsedRef.current = rightSiderCollapsed;
    if (!isDesktop || !wasCollapsed || rightSiderCollapsed) return undefined;

    const frameId = requestAnimationFrame(() => {
      const panel = workspacePanelRef.current;
      const workspace = panel?.querySelector<HTMLElement>('.chat-workspace');
      (workspace ?? panel)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [isDesktop, rightSiderCollapsed]);
  const { editingTitle, setEditingTitle, titleDraft, setTitleDraft, renameLoading, canRenameTitle, submitTitleRename } =
    useTitleRename({
      title: props.title,
      conversation_id,
      onRename: props.onRenameTitle,
    });
  const { cliAgents } = useConversationAgents();
  const backendAgentName = backend
    ? cliAgents.find((agent) => agent.backend === backend || agent.agent_type === backend)?.name
    : undefined;
  const capitalizedBackend = backend ? backend.charAt(0).toUpperCase() + backend.slice(1) : backend;
  const displayName = presetAssistant?.name || agent_name || backendAgentName || capitalizedBackend;
  const {
    splitRatio: workspaceWidthPxPref,
    setSplitRatio: setWorkspaceWidthPxPref,
    createDragHandle: createWorkspaceDragHandle,
  } = useResizableSplit({
    unit: 'px',
    defaultWidth: DEFAULT_WORKSPACE_PANEL_PX,
    minWidth: MIN_WORKSPACE_PANEL_PX,
    maxWidth: MAX_WORKSPACE_PANEL_PX,
    storageKey: 'chat-workspace-width-px',
  });
  const { dynamicChatMinRatio, dynamicChatMaxRatio } = calcLayoutMetrics({
    containerWidth,
    workspaceWidthPx: workspaceWidthPxPref,
    chatSplitRatio: 60,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    isMobile: usesWorkspaceOverlay,
  });
  const {
    splitRatio: chatSplitRatio,
    setSplitRatio: setChatSplitRatio,
    createDragHandle: createPreviewDragHandle,
  } = useResizableSplit({
    defaultWidth: 60,
    minWidth: dynamicChatMinRatio,
    maxWidth: dynamicChatMaxRatio,
    storageKey: 'chat-preview-split-ratio',
  });
  const { chatFlex, workspaceWidthPx, titleAreaMaxWidth, mobileWorkspaceHandleRight } = calcLayoutMetrics({
    containerWidth,
    workspaceWidthPx: workspaceWidthPxPref,
    chatSplitRatio,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    isMobile: usesWorkspaceOverlay,
  });
  useLayoutConstraints({
    containerWidth,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    setRightSiderCollapsed,
    workspaceWidthPx: workspaceWidthPxPref,
    setWorkspaceWidthPx: setWorkspaceWidthPxPref,
    chatSplitRatio,
    setChatSplitRatio,
    dynamicChatMinRatio,
    dynamicChatMaxRatio,
  });
  const [mobileActionsSlot, setMobileActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!isMobile) {
      setMobileActionsSlot(null);
      return;
    }
    const findSlot = () => document.getElementById('app-titlebar-actions-slot');
    setMobileActionsSlot(findSlot());
    const observer = new MutationObserver(() => {
      const next = findSlot();
      setMobileActionsSlot((previous) => (previous === next ? previous : next));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isMobile]);

  const panelToggle = (
    <Tooltip content={rightSiderCollapsed ? t('conversation.sidePanel.open') : t('conversation.sidePanel.close')} mini>
      <Button
        type='text'
        size='small'
        icon={rightSiderCollapsed ? <ExpandLeft size={16} /> : <ExpandRight size={16} />}
        aria-label={rightSiderCollapsed ? t('conversation.sidePanel.open') : t('conversation.sidePanel.close')}
        aria-expanded={!rightSiderCollapsed}
        aria-controls='conversation-workspace-panel'
        onClick={toggleWorkspace}
        data-testid='conversation-side-panel-toggle'
      />
    </Tooltip>
  );

  const headerTools = (
    <div className='conversation-header-tools' data-testid='conversation-header-tools'>
      {props.environmentSlot}
      {workspaceEnabled && panelToggle}
    </div>
  );

  const titleLeading = (
    <div className='conversation-header-navigation'>
      <Tooltip content={t('conversation.navigation.back')} mini>
        <Button
          type='text'
          size='mini'
          icon={<Left size={14} />}
          aria-label={t('conversation.navigation.back')}
          disabled={!navigationHistory?.canBack}
          onClick={() => navigationHistory?.back()}
        />
      </Tooltip>
      <Tooltip content={t('conversation.navigation.forward')} mini>
        <Button
          type='text'
          size='mini'
          icon={<Right size={14} />}
          aria-label={t('conversation.navigation.forward')}
          disabled={!navigationHistory?.canForward}
          onClick={() => navigationHistory?.forward()}
        />
      </Tooltip>
      {props.headerLeading ??
        ((backend || presetAssistant) && (
          <AgentLogoIcon
            backend={backend}
            agent_name={displayName}
            agentLogo={presetAssistant?.logo}
            agentLogoIsEmoji={presetAssistant?.isEmoji}
          />
        ))}
    </div>
  );

  const desktopHeader = (
    <ArcoLayout.Header className='chat-layout-header chat-layout-header--glass'>
      <FlexFullContainer className='h-full min-w-0' containerClassName='flex items-center'>
        <ChatTitleEditor
          editingTitle={editingTitle}
          titleDraft={titleDraft}
          setTitleDraft={setTitleDraft}
          setEditingTitle={setEditingTitle}
          renameLoading={renameLoading}
          canRenameTitle={canRenameTitle}
          submitTitleRename={submitTitleRename}
          titleAreaMaxWidth={titleAreaMaxWidth}
          title={props.title}
          conversation_id={conversation_id}
          leading={titleLeading}
        />
      </FlexFullContainer>
      {headerTools}
    </ArcoLayout.Header>
  );

  const previewSurface = (
    <div
      className={`preview-panel flex flex-col overflow-visible rounded-[15px] ${
        isDesktop ? 'relative mb-[12px] mr-[12px] ml-[8px]' : 'fixed'
      }`}
      style={{
        top: previewOwnsCanvas ? 'calc(var(--titlebar-height) + 8px)' : undefined,
        right: previewOwnsCanvas ? '8px' : undefined,
        bottom: previewOwnsCanvas ? '8px' : undefined,
        left: previewOwnsCanvas ? '8px' : undefined,
        zIndex: previewOwnsCanvas ? 20 : undefined,
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        border: '1px solid var(--bg-3)',
        minWidth: isDesktop ? '260px' : 0,
        boxSizing: 'border-box',
      }}
      data-testid='conversation-preview-surface'
    >
      {isDesktop &&
        createPreviewDragHandle({
          className: 'absolute top-0 bottom-0 z-30',
          style: { width: '20px', left: '-20px' },
          linePlacement: 'end',
          lineClassName: 'opacity-30 group-hover:opacity-100 group-active:opacity-100',
          lineStyle: { width: '2px' },
        })}
      <div className='h-full w-full overflow-hidden rounded-[15px]'>
        <PreviewPanel />
      </div>
    </div>
  );

  return (
    <ArcoLayout className='size-full color-black'>
      <div ref={containerRef} className='flex flex-1 relative w-full overflow-hidden'>
        <div className='flex flex-col min-w-0 flex-1' data-testid='conversation-main-column'>
          <div className='shrink-0 !bg-1'>
            {isMobile ? mobileActionsSlot && createPortal(headerTools, mobileActionsSlot) : desktopHeader}
            {props.tabsSlot}
          </div>
          <div className='flex flex-1 min-h-0 relative'>
            <div
              className='flex flex-col relative min-w-0'
              aria-hidden={previewOwnsCanvas}
              data-testid='conversation-timeline-surface'
              style={{
                display: previewOwnsCanvas ? 'none' : undefined,
                flexGrow: isPreviewOpen && isDesktop ? 0 : 1,
                flexShrink: 0,
                flexBasis: isPreviewOpen && isDesktop ? `${chatFlex}%` : 0,
              }}
            >
              <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>
                {props.children}
              </ArcoLayout.Content>
            </div>
            {isPreviewOpen && isDesktop && previewSurface}
          </div>
        </div>

        {previewOwnsCanvas && createPortal(previewSurface, document.body)}

        {workspaceEnabled && isDesktop && (
          <aside
            ref={workspacePanelRef}
            id='conversation-workspace-panel'
            className='chat-layout-right-sider layout-sider'
            hidden={rightSiderCollapsed}
            aria-hidden={rightSiderCollapsed}
            aria-label={t('conversation.sidePanel.title')}
            tabIndex={-1}
            data-testid='conversation-side-panel-surface'
            style={{
              flex: `0 0 ${Math.round(workspaceWidthPx)}px`,
              width: `${Math.round(workspaceWidthPx)}px`,
              minWidth: `${MIN_WORKSPACE_PANEL_PX}px`,
            }}
          >
            {createWorkspaceDragHandle({
              className: 'absolute left-0 top-0 bottom-0',
              style: {},
              reverse: true,
            })}
            <WorkspacePanelHeader
              showToggle
              collapsed={false}
              onToggle={toggleWorkspace}
              workspacePath={workspacePath}
              isTemporaryWorkspace={isTemporaryWorkspace}
            >
              {props.siderTitle ?? t('conversation.sidePanel.title')}
            </WorkspacePanelHeader>
            <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
              {props.sider}
            </ArcoLayout.Content>
          </aside>
        )}

        {workspaceEnabled && usesWorkspaceOverlay && (
          <MobileWorkspaceOverlay
            rightSiderCollapsed={rightSiderCollapsed}
            setRightSiderCollapsed={setRightSiderCollapsed}
            workspaceWidthPx={workspaceWidthPx}
            mobileWorkspaceHandleRight={mobileWorkspaceHandleRight}
            siderTitle={props.siderTitle ?? t('conversation.sidePanel.title')}
            sider={props.sider}
            workspacePath={workspacePath}
            isTemporaryWorkspace={isTemporaryWorkspace}
          />
        )}
      </div>
    </ArcoLayout>
  );
};

export default ChatLayout;
