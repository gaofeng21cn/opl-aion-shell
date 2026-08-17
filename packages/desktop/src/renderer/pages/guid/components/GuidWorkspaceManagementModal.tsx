/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRecentWorkspaces, removeRecentWorkspace } from '@/renderer/components/workspace';
import { Button, Modal, Typography } from '@arco-design/web-react';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type GuidWorkspaceManagementModalProps = {
  visible: boolean;
  onClose: () => void;
};

const GuidWorkspaceManagementModal: React.FC<GuidWorkspaceManagementModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [registeredWorkspaces, setRegisteredWorkspaces] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setRegisteredWorkspaces(getRecentWorkspaces());
    }
  }, [visible]);

  const removeWorkspaceRegistration = useCallback((path: string) => {
    removeRecentWorkspace(path);
    setRegisteredWorkspaces(getRecentWorkspaces());
  }, []);

  return (
    <Modal visible={visible} title={t('guid.workspace.registeredTitle')} footer={null} onCancel={onClose} unmountOnExit>
      <Typography.Text className='block pb-12px text-13px text-t-secondary'>
        {t('guid.workspace.registeredDescription')}
      </Typography.Text>
      <div className='flex flex-col divide-y divide-border-1' data-testid='registered-workspace-list'>
        {registeredWorkspaces.map((path) => {
          const name = path.split(/[\\/]/).pop() || path;
          return (
            <div key={path} className='flex min-w-0 items-center gap-10px py-10px'>
              <OplIcon name='folderOpen' size={14} className='shrink-0 text-t-secondary' />
              <div className='min-w-0 flex-1'>
                <Typography.Text className='block font-500 text-t-primary'>{name}</Typography.Text>
                <Typography.Text className='block break-all text-12px text-t-secondary'>{path}</Typography.Text>
              </div>
              <Button
                type='text'
                status='danger'
                onClick={() => removeWorkspaceRegistration(path)}
                aria-label={t('guid.workspace.removeRegistered', { name })}
              >
                {t('guid.workspace.removeRegisteredAction')}
              </Button>
            </div>
          );
        })}
        {registeredWorkspaces.length === 0 && (
          <Typography.Text className='py-12px text-13px text-t-secondary'>
            {t('guid.workspace.noRegistered')}
          </Typography.Text>
        )}
      </div>
    </Modal>
  );
};

export default GuidWorkspaceManagementModal;
