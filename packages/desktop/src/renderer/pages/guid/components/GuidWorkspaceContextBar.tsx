import { ipcBridge } from '@/common';
import { addRecentWorkspace, getRecentWorkspaces } from '@/renderer/components/workspace';
import { Button, Tooltip } from '@arco-design/web-react';
import { CloseSmall, FolderOpen, SettingTwo } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';
import GuidWorkspaceManagementModal from './GuidWorkspaceManagementModal';

type GuidWorkspaceContextBarProps = {
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
  workspaceAccessDisabled?: boolean;
  workspaceAccessDisabledReason?: string;
};

const GuidWorkspaceContextBar: React.FC<GuidWorkspaceContextBarProps> = ({
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
  workspaceAccessDisabled = false,
  workspaceAccessDisabledReason,
}) => {
  const { t } = useTranslation();
  const [managementOpen, setManagementOpen] = useState(false);
  const workspaceName = workspaceDir ? workspaceDir.split(/[\\/]/).pop() || workspaceDir : '';
  const hasRegisteredWorkspaces = getRecentWorkspaces().length > 0;

  const openWorkspacePicker = useCallback(() => {
    if (workspaceAccessDisabled) return;
    void ipcBridge.dialog.showOpen
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((directories) => {
        const selectedDirectory = directories?.[0];
        if (!selectedDirectory) return;
        addRecentWorkspace(selectedDirectory);
        onSelectWorkspace(selectedDirectory);
      })
      .catch((error) => {
        console.error('Failed to open workspace directory dialog:', error);
      });
  }, [onSelectWorkspace, workspaceAccessDisabled]);

  return (
    <>
      <div
        className={styles.workspaceContextBar}
        data-testid='guid-workspace-context-bar'
        aria-label={t('guid.context.workingDirectory')}
        aria-disabled={workspaceAccessDisabled}
      >
        <span className={styles.workspaceContextLabel}>
          <FolderOpen theme='outline' size='16' aria-hidden='true' />
          <span>{t('guid.context.workingDirectory')}</span>
        </span>
        {workspaceDir ? (
          <Tooltip content={workspaceDir} position='top'>
            <Button
              type='text'
              size='mini'
              className={styles.workspaceContextPath}
              disabled={workspaceAccessDisabled}
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
            disabled={workspaceAccessDisabled}
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
                icon={<SettingTwo theme='outline' size='13' />}
                disabled={workspaceAccessDisabled}
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
                icon={<CloseSmall theme='outline' size='13' strokeWidth={3} />}
                disabled={workspaceAccessDisabled}
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
