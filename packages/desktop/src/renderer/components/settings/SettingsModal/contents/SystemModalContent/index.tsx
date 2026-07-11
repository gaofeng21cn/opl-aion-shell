/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Tooltip, Typography } from '@arco-design/web-react';
import { FolderSearch, Info } from '@icon-park/react';
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
  const pathsReady = Boolean(workspacePath && logsPath);

  const handleOpenPath = useCallback((path: string) => {
    if (!path) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' }).catch((caughtError) => {
      console.error('[SystemModalContent] Failed to open directory:', caughtError);
    });
  }, []);

  const pathStatus = (path: string) =>
    path ? t('settings.workspacePage.status.ready') : t('settings.dirNotConfigured');

  return (
    <div className='opl-settings-page flex h-full w-full flex-col' data-testid='settings-page-advanced'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-14px'>
          <div className='opl-settings-page-header'>
            <div className='opl-settings-page-header__copy'>
              <Typography.Title heading={4}>{t('settings.advancedSettings')}</Typography.Title>
              <Typography.Text>{t('settings.advancedPathsDesc')}</Typography.Text>
            </div>
          </div>

          <section
            className={`opl-settings-section ${pathsReady ? '' : 'opl-settings-section--attention'}`}
            id='working-directories'
            data-testid='settings-advanced-primary'
          >
            <span id='resolved-paths' aria-hidden='true' />
            {!pathsReady && <span data-testid='settings-advanced-exception' aria-hidden='true' />}
            <div className='opl-settings-section__header'>
              <div className='flex min-w-0 items-start gap-12px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center rounded-6px bg-fill-2 text-t-secondary'>
                  <Info theme='outline' size='16' />
                </span>
                <div className='min-w-0'>
                  <div className='text-14px font-medium text-t-primary leading-22px'>
                    {t('settings.advancedPathsTitle')}
                  </div>
                  <div className='mt-2px text-12px text-t-tertiary leading-18px'>{t('settings.advancedPathsDesc')}</div>
                </div>
              </div>
            </div>
            <div
              className='grid min-w-0 border-t border-solid border-[var(--border-base)] sm:grid-cols-2'
              data-layout='path-status-grid'
            >
              <div className='min-w-0 p-16px'>
                <div className='mb-10px text-13px font-medium text-t-primary'>{t('settings.workDir')}</div>
                <div>
                  <span
                    className={`opl-settings-status ${workspacePath ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
                  >
                    {pathStatus(workspacePath)}
                  </span>
                </div>
              </div>
              <div className='min-w-0 border-t border-solid border-[var(--border-base)] p-16px sm:border-l sm:border-t-0'>
                <div className='mb-10px text-13px font-medium text-t-primary'>{t('settings.logDir')}</div>
                <div>
                  <span
                    className={`opl-settings-status ${logsPath ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
                  >
                    {pathStatus(logsPath)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <details className='opl-settings-details' data-testid='settings-advanced-technical-details'>
            <summary>{t('common.technical_details')}</summary>
            <div className='mb-10px text-12px text-t-tertiary'>{t('settings.advancedPathsDesc')}</div>
            <div className='opl-settings-list mt-10px'>
              <ReadOnlyPathRow
                label={t('settings.workDir')}
                path={workspacePath}
                onOpen={() => handleOpenPath(workspacePath)}
              />
              <ReadOnlyPathRow label={t('settings.logDir')} path={logsPath} onOpen={() => handleOpenPath(logsPath)} />
            </div>
          </details>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
