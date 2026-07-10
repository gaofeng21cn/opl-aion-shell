import { ipcBridge } from '@/common';
import { Tooltip } from '@arco-design/web-react';
import { BranchOne, FolderClose } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ConversationComposerContextStripProps = {
  workspacePath?: string;
  branch?: string;
  activeCapabilityLabel?: string;
};

const ConversationComposerContextStrip: React.FC<ConversationComposerContextStripProps> = ({
  workspacePath,
  branch,
  activeCapabilityLabel,
}) => {
  const { t } = useTranslation();
  const workspaceName = workspacePath?.split(/[\\/]/).pop() || workspacePath;
  const [resolvedBranch, setResolvedBranch] = useState(branch);

  useEffect(() => {
    let cancelled = false;
    setResolvedBranch(branch);
    if (branch || !workspacePath) return;

    void ipcBridge.fileSnapshot.getInfo
      .invoke({ workspace: workspacePath })
      .then((info) => {
        if (!cancelled && info.branch) setResolvedBranch(info.branch);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [branch, workspacePath]);

  return (
    <div
      className='flex flex-wrap items-center gap-x-8px gap-y-4px min-h-24px px-8px pb-4px text-12px text-t-tertiary'
      data-testid='conversation-composer-context-strip'
    >
      {workspacePath ? (
        <Tooltip content={workspacePath} position='top'>
          <span className='inline-flex items-center gap-4px min-w-0 max-w-240px' data-testid='composer-project-context'>
            <FolderClose size={13} className='shrink-0' />
            <span className='truncate'>{workspaceName}</span>
          </span>
        </Tooltip>
      ) : (
        <span data-testid='composer-projectless-context'>{t('guid.workspace.noProject')}</span>
      )}
      <span data-testid='composer-local-context'>{t('conversation.environment.local')}</span>
      {!workspacePath && <span>{t('guid.home.projectlessTextOnly')}</span>}
      {resolvedBranch && (
        <span className='inline-flex items-center gap-4px min-w-0 max-w-180px' data-testid='composer-branch-context'>
          <BranchOne size={13} className='shrink-0' />
          <span className='truncate'>{resolvedBranch}</span>
        </span>
      )}
      {activeCapabilityLabel && (
        <span className='truncate max-w-220px' data-testid='composer-active-capability'>
          {t('guid.home.activeCapability', { capability: activeCapabilityLabel })}
        </span>
      )}
    </div>
  );
};

export default ConversationComposerContextStrip;
