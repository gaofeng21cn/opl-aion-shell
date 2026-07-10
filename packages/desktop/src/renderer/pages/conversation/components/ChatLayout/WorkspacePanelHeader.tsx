import { WORKSPACE_HEADER_HEIGHT } from '@/renderer/pages/conversation/utils/layoutCalc';
import { Button } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import WorkspaceOpenButton from './WorkspaceOpenButton';

type WorkspaceHeaderProps = {
  children?: React.ReactNode;
  showToggle?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  togglePlacement?: 'left' | 'right';
  workspacePath?: string;
  /**
   * Authoritative temp-workspace flag from
   * `conversation.extra.is_temporary_workspace`. Passed straight through
   * to `WorkspaceOpenButton`, which hides for temp workspaces.
   */
  isTemporaryWorkspace?: boolean;
};

// Compact header bar for the workspace side panel with optional collapse toggle
const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({
  children,
  showToggle = false,
  collapsed,
  onToggle,
  togglePlacement = 'right',
  workspacePath,
  isTemporaryWorkspace = false,
}) => {
  const { t } = useTranslation();
  const toggle = (
    <Button
      type='text'
      size='mini'
      className='workspace-header__toggle'
      icon={collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      aria-label={collapsed ? t('conversation.sidePanel.open') : t('conversation.sidePanel.close')}
      onClick={onToggle}
    />
  );

  return (
    <div
      className='workspace-panel-header flex items-center justify-start px-8px py-2px gap-8px border-b border-[var(--bg-3)]'
      style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}
    >
      {showToggle && togglePlacement === 'left' && toggle}
      <div className='flex-1 truncate'>{children}</div>

      {workspacePath && !collapsed && (
        <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={isTemporaryWorkspace} />
      )}
      {showToggle && togglePlacement === 'right' && toggle}
    </div>
  );
};

export default WorkspacePanelHeader;
