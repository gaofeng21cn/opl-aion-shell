import { ipcBridge } from '@/common';
import { addRecentWorkspace, getRecentWorkspaces } from '@/renderer/components/workspace';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';
import GuidWorkspaceManagementModal from './GuidWorkspaceManagementModal';

type GuidWorkspaceContextBarProps = {
  workspaceDir: string;
  workspaceDisplayDir?: string;
  webWorkspaceRoot?: string;
  onSelectWorkspace: (workspace: { runtimePath: string; hostPath: string }) => void;
  onClearWorkspace: () => void;
  workspaceAccessDisabled?: boolean;
  workspaceAccessDisabledReason?: string;
};

const GuidWorkspaceContextBar: React.FC<GuidWorkspaceContextBarProps> = ({
  workspaceDir,
  workspaceDisplayDir,
  webWorkspaceRoot,
  onSelectWorkspace,
  onClearWorkspace,
  workspaceAccessDisabled = false,
  workspaceAccessDisabledReason,
}) => {
  const { t } = useTranslation();
  const [managementOpen, setManagementOpen] = useState(false);
  const isDesktop = isElectronDesktop();
  const displayDir = workspaceDisplayDir || workspaceDir;
  const workspaceName = displayDir ? displayDir.split(/[\\/]/).pop() || displayDir : '';
  const hasRegisteredWorkspaces = isDesktop && getRecentWorkspaces().length > 0;
  const selectionDisabled = workspaceAccessDisabled || (!isDesktop && !webWorkspaceRoot?.trim());

  const openWorkspacePicker = useCallback(() => {
    if (selectionDisabled) return;
    if (!isDesktop) {
      const runtimePath = webWorkspaceRoot?.trim();
      if (!runtimePath) return;
      onSelectWorkspace({ runtimePath, hostPath: runtimePath });
      return;
    }
    void ipcBridge.dialog.showWorkspace
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((selection) => {
        if (!selection) return;
        addRecentWorkspace(selection.runtime_path);
        onSelectWorkspace({ runtimePath: selection.runtime_path, hostPath: selection.host_path });
      })
      .catch((error) => {
        console.error('Failed to open workspace directory dialog:', error);
      });
  }, [isDesktop, onSelectWorkspace, selectionDisabled, webWorkspaceRoot]);

  return (
    <>
      <div
        className={styles.workspaceContextBar}
        data-testid='guid-workspace-context-bar'
        aria-label={t('guid.context.workingDirectory')}
        aria-disabled={selectionDisabled}
      >
        <span className={styles.workspaceContextLabel}>
          <OplIcon name='folderOpen' size={16} aria-hidden='true' />
          <span>{t('guid.context.workingDirectory')}</span>
        </span>
        {workspaceDir ? (
          <Tooltip content={displayDir} position='top'>
            <Button
              type='text'
              size='mini'
              className={styles.workspaceContextPath}
              disabled={selectionDisabled}
              onClick={openWorkspacePicker}
              data-testid='guid-workspace-select'
            >
              {workspaceName}
            </Button>
          </Tooltip>
        ) : (
          <Button
            type='text'
            size='mini'
            className={styles.workspaceContextPath}
            disabled={selectionDisabled}
            onClick={openWorkspacePicker}
            data-testid='guid-workspace-select'
          >
            {t('guid.workspace.specifyWorkspace')}
          </Button>
        )}
        <span className={styles.workspaceContextActions}>
          {hasRegisteredWorkspaces ? (
            <Tooltip content={t('guid.workspace.manageRegistered')}>
              <Button
                type='text'
                shape='circle'
                size='mini'
                icon={<OplIcon name='settingsSmall' size={13} />}
                disabled={selectionDisabled}
                onClick={() => setManagementOpen(true)}
                aria-label={t('guid.workspace.manageRegistered')}
                data-testid='guid-workspace-manage'
              />
            </Tooltip>
          ) : null}
          {workspaceDir ? (
            <Tooltip content={t('guid.context.clearWorkingDirectory')}>
              <Button
                type='text'
                shape='circle'
                size='mini'
                icon={<OplIcon name='closeFill' size={13} />}
                disabled={selectionDisabled}
                onClick={onClearWorkspace}
                aria-label={t('guid.context.clearWorkingDirectoryNamed', { name: workspaceName })}
                data-testid='guid-workspace-clear'
              />
            </Tooltip>
          ) : null}
        </span>
        {workspaceAccessDisabled ? (
          <span className='sr-only' data-testid='opl-guid-workspace-access-disabled'>
            {workspaceAccessDisabledReason}
          </span>
        ) : null}
      </div>
      <GuidWorkspaceManagementModal visible={managementOpen} onClose={() => setManagementOpen(false)} />
    </>
  );
};

export default GuidWorkspaceContextBar;
