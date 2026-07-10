import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import type { PresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import ChatTitleEditor from '@/renderer/pages/conversation/components/ChatTitleEditor';
import { useContainerWidth } from '@/renderer/pages/conversation/hooks/useContainerWidth';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import { useTitleRename } from '@/renderer/pages/conversation/hooks/useTitleRename';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
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
  currentTaskSlot?: React.ReactNode;
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
  const isMobile = Boolean(layout?.isMobile);
  const isDesktop = !isMobile;
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const { rightSiderCollapsed, setRightSiderCollapsed } = useWorkspaceCollapse({
    workspaceEnabled,
    isMobile,
    conversation_id,
    preferenceKey: workspacePreferenceKey ?? conversation_id,
  });
  const previousPreviewOpenRef = useRef(isPreviewOpen);
  const previewStateInitializedRef = useRef(false);
  useEffect(() => {
    if (!previewStateInitializedRef.current) {
      previewStateInitializedRef.current = true;
      previousPreviewOpenRef.current = isPreviewOpen;
      return;
    }

    const wasOpen = previousPreviewOpenRef.current;
    previousPreviewOpenRef.current = isPreviewOpen;
    if (!wasOpen && isPreviewOpen && workspaceEnabled) {
      setRightSiderCollapsed(false);
    }
  }, [isPreviewOpen, setRightSiderCollapsed, workspaceEnabled]);
  const { containerRef, containerWidth } = useContainerWidth();
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
  const { splitRatio: workspaceWidthPxPref, createDragHandle: createWorkspaceDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: DEFAULT_WORKSPACE_PANEL_PX,
    minWidth: MIN_WORKSPACE_PANEL_PX,
    maxWidth: MAX_WORKSPACE_PANEL_PX,
    storageKey: 'chat-workspace-width-px',
  });
  const { workspaceWidthPx, titleAreaMaxWidth, mobileWorkspaceHandleRight } = calcLayoutMetrics({
    containerWidth,
    workspaceWidthPx: workspaceWidthPxPref,
    chatSplitRatio: 100,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen: false,
    rightSiderCollapsed,
    isMobile,
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
        onClick={() => dispatchWorkspaceToggleEvent()}
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
          onClick={() => window.history.back()}
        />
      </Tooltip>
      <Tooltip content={t('conversation.navigation.forward')} mini>
        <Button
          type='text'
          size='mini'
          icon={<Right size={14} />}
          aria-label={t('conversation.navigation.forward')}
          onClick={() => window.history.forward()}
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

  return (
    <ArcoLayout className='size-full color-black'>
      <div ref={containerRef} className='flex flex-1 relative w-full overflow-hidden'>
        <div className='flex flex-col min-w-0 flex-1'>
          <div className='shrink-0 !bg-1'>
            {isMobile ? mobileActionsSlot && createPortal(headerTools, mobileActionsSlot) : desktopHeader}
            {props.tabsSlot}
          </div>
          {props.currentTaskSlot && <div className='shrink-0 !bg-1'>{props.currentTaskSlot}</div>}
          <div
            className='flex flex-1 min-h-0 relative'
            onClick={() => {
              if (isMobile && !rightSiderCollapsed) setRightSiderCollapsed(true);
            }}
          >
            <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>
              {props.children}
            </ArcoLayout.Content>
          </div>
        </div>

        {workspaceEnabled && isDesktop && !rightSiderCollapsed && (
          <aside
            className='chat-layout-right-sider layout-sider'
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
              onToggle={() => dispatchWorkspaceToggleEvent()}
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

        {workspaceEnabled && isMobile && (
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
