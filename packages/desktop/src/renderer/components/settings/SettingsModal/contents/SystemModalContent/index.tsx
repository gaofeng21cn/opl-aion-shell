/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Tooltip, Typography } from '@arco-design/web-react';
import { FolderSearch } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../../settingsViewContext';

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

type ReadOnlyPathRowProps = {
  label: string;
  path: string;
  onOpen: () => void;
};

const ReadOnlyPathRow: React.FC<ReadOnlyPathRowProps> = ({ label, path, onOpen }) => {
  const { t } = useTranslation();
  const displayPath = path || t('settings.dirNotConfigured');
  const openLabel = `${t('common.open')} ${label}`;

  return (
    <div className='opl-settings-row'>
      <div className='opl-settings-row__main'>
        <Typography.Text className='font-500 text-t-primary'>{label}</Typography.Text>
        <Tooltip content={displayPath} position='top'>
          <Typography.Text className='block break-all text-12px text-t-secondary'>{displayPath}</Typography.Text>
        </Tooltip>
      </div>
      <div className='opl-settings-row__meta'>
        <Tooltip content={openLabel}>
          <Button
            type='text'
            aria-label={openLabel}
            icon={<FolderSearch theme='outline' size='18' />}
            disabled={!path}
            onClick={onOpen}
          />
        </Tooltip>
      </div>
    </div>
  );
};

const SystemModalContent: React.FC = () => {
  const { t } = useTranslation();
  const isPageMode = useSettingsViewMode() === 'page';
  const appStateQuery = useOplAppState('fast');
  const appPaths = oplRecord(appStateQuery.appState.paths);
  const workspacePath =
    oplString(appPaths.workspace_root_path) ??
    oplPathString(appPaths.workspace_root) ??
    oplPathString(appPaths.family_workspace_root) ??
    '';
  const logsPath = oplString(appPaths.logs_dir) ?? oplString(appPaths.logs_root) ?? oplString(appPaths.log_dir) ?? '';
  const handleOpenPath = useCallback((path: string) => {
    if (!path) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' }).catch((caughtError) => {
      console.error('[SystemModalContent] Failed to open directory:', caughtError);
    });
  }, []);

  return (
    <div
      className='opl-settings-page opl-settings-surface--diagnostic-page flex h-full w-full flex-col'
      data-testid='settings-page-advanced'
    >
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-14px'>
          <div className='opl-settings-page-header'>
            <div className='opl-settings-page-header__copy'>
              <Typography.Title heading={4}>{t('settings.advancedSettings')}</Typography.Title>
              <Typography.Text>{t('settings.advancedPathsDesc')}</Typography.Text>
            </div>
          </div>

          <section
            className='opl-settings-section opl-settings-surface--diagnostic'
            id='working-directories'
            data-testid='settings-advanced-primary'
          >
            <span id='resolved-paths' aria-hidden='true' />
            <div className='opl-settings-section__header'>
              <div className='min-w-0'>
                <div className='text-14px font-medium text-t-primary leading-22px'>
                  {t('settings.advancedPathsTitle')}
                </div>
              </div>
            </div>
            <div className='opl-settings-list border-t border-solid border-[var(--border-base)]'>
              <ReadOnlyPathRow
                label={t('settings.workDir')}
                path={workspacePath}
                onOpen={() => handleOpenPath(workspacePath)}
              />
              <ReadOnlyPathRow label={t('settings.logDir')} path={logsPath} onOpen={() => handleOpenPath(logsPath)} />
            </div>
          </section>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
