/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Modal, Spin } from '@arco-design/web-react';
import { FileText, FolderOpen, Up } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBaseUrl } from '@/common/adapter/httpBridge';
import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
}

interface DirectoryData {
  items: DirectoryItem[];
  canGoUp: boolean;
  parentPath?: string;
}

interface DirectorySelectionModalProps {
  visible: boolean;
  isFileMode?: boolean;
  onConfirm: (paths: string[] | undefined) => void;
  onCancel: () => void;
}

const DirectorySelectionModal: React.FC<DirectorySelectionModalProps> = ({
  visible,
  isFileMode = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [directoryData, setDirectoryData] = useState<DirectoryData>({ items: [], canGoUp: false });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusListAfterLoadRef = useRef(false);

  const loadDirectory = useCallback(
    async (dirPath = '') => {
      setLoading(true);
      setError(null);
      try {
        const showFiles = isFileMode ? 'true' : 'false';
        const response = await fetch(
          `${getBaseUrl()}/api/fs/browse?path=${encodeURIComponent(dirPath)}&showFiles=${showFiles}`,
          {
            method: 'GET',
            credentials: 'include',
          }
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `HTTP ${response.status}`);
          return;
        }
        const envelope = await response.json();
        // Backend wraps the payload in { success, data, ... }.
        const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
        if (!data || !Array.isArray(data.items)) {
          setError('Invalid response from server');
          return;
        }
        // Older backends return Windows verbatim paths (`\\?\C:\DEV`), which
        // break agent spawning when stored as a workspace (issue #3191).
        // 旧版后端会返回 `\\?\` 前缀的 Windows 路径，存为工作区后会导致 agent 启动失败。
        const normalized: DirectoryData = {
          ...data,
          items: (data.items as DirectoryItem[]).map((item) => ({
            ...item,
            path: stripWindowsVerbatimPrefix(item.path),
          })),
          parentPath:
            typeof data.parentPath === 'string' ? stripWindowsVerbatimPrefix(data.parentPath) : data.parentPath,
        };
        setDirectoryData(normalized);
        setCurrentPath(dirPath);
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [isFileMode]
  );

  useEffect(() => {
    if (visible) {
      setSelectedPath('');
      loadDirectory('').catch((error) => console.error('Failed to load initial directory:', error));
    }
  }, [visible, loadDirectory]);

  useEffect(() => {
    if (loading || !focusListAfterLoadRef.current) return;
    focusListAfterLoadRef.current = false;
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>('[data-directory-action]')?.focus({ preventScroll: true });
    });
  }, [directoryData.canGoUp, directoryData.items, loading]);

  const handleItemClick = (item: DirectoryItem) => {
    if (item.isDirectory) {
      focusListAfterLoadRef.current = true;
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
    }
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined) {
      // Handle '__ROOT__' as empty path to show drive list on Windows
      // 处理 '__ROOT__' 为空路径，在 Windows 上显示驱动器列表
      const targetPath = directoryData.parentPath === '__ROOT__' ? '' : directoryData.parentPath;
      focusListAfterLoadRef.current = true;
      loadDirectory(targetPath).catch((error) => console.error('Failed to load parent directory:', error));
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onConfirm([selectedPath]);
    }
  };

  const canSelect = (item: DirectoryItem) => {
    return isFileMode ? item.isFile : item.isDirectory;
  };

  return (
    // This picker is opened *from* other modals (team/cron create dialogs sit at
    // zIndex 10000, the cron workspace menu at 10020), so it must float above all
    // of them — it's the topmost layer while choosing a folder.
    <Modal
      visible={visible}
      title={
        <span className='inline-flex items-center gap-8px'>
          {isFileMode ? (
            <FileText theme='outline' size='16' fill='currentColor' aria-hidden='true' />
          ) : (
            <FolderOpen theme='outline' size='16' fill='currentColor' aria-hidden='true' />
          )}
          <span>{isFileMode ? t('fileSelection.selectFile') : t('fileSelection.selectDirectory')}</span>
        </span>
      }
      onCancel={onCancel}
      onOk={handleConfirm}
      okButtonProps={{ disabled: !selectedPath }}
      className='w-[90vw] md:w-[600px]'
      style={{ width: 'min(600px, 90vw)' }}
      wrapStyle={{ zIndex: 10050 }}
      maskStyle={{ zIndex: 10040 }}
      focusLock
      autoFocus
      footer={
        <div className='w-full flex justify-between items-center'>
          <div
            className='text-t-secondary text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]'
            title={selectedPath || currentPath}
          >
            {selectedPath ||
              currentPath ||
              (isFileMode ? t('fileSelection.pleaseSelectFile') : t('fileSelection.pleaseSelectDirectory'))}
          </div>
          <div className='flex gap-10px'>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type='primary' onClick={handleConfirm} disabled={!selectedPath}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      }
    >
      <Spin loading={loading} className='w-full'>
        <div className='w-full border border-b-base rd-4px overflow-hidden' style={{ height: 'min(400px, 60vh)' }}>
          <div ref={listRef} className='h-full overflow-y-auto' role='list'>
            {directoryData.canGoUp && (
              <div role='listitem'>
                <button
                  type='button'
                  className='w-full flex items-center p-10px border-0 border-b border-b-light bg-transparent text-left cursor-pointer hover:bg-hover focus-visible:outline-2 focus-visible:outline-[var(--opl-focus-ring)] transition'
                  onClick={handleGoUp}
                  data-directory-action='parent'
                >
                  <Up
                    theme='outline'
                    size='16'
                    fill='currentColor'
                    className='mr-10px text-t-secondary'
                    aria-hidden='true'
                  />
                  <span>..</span>
                </button>
              </div>
            )}
            {error && (
              <div className='p-16px text-center text-danger text-13px'>
                <div>{error}</div>
                <Button size='mini' className='mt-8px' onClick={() => loadDirectory(currentPath).catch(() => {})}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            )}
            {directoryData.items.map((item, index) => (
              <div
                key={item.path || `${item.name}-${index}`}
                role='listitem'
                className='flex items-center justify-between border-b border-b-light hover:bg-hover transition'
                style={selectedPath === item.path ? { background: 'var(--brand-light)' } : {}}
              >
                {item.isDirectory ? (
                  <button
                    type='button'
                    className='flex items-center flex-1 min-w-0 p-10px border-0 bg-transparent text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--opl-focus-ring)]'
                    onClick={() => handleItemClick(item)}
                    data-directory-action={item.path}
                  >
                    <FolderOpen
                      theme='outline'
                      size='16'
                      fill='currentColor'
                      className='mr-10px shrink-0 text-t-secondary'
                      aria-hidden='true'
                    />
                    <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                  </button>
                ) : (
                  <div className='flex items-center flex-1 min-w-0 p-10px'>
                    <FileText
                      theme='outline'
                      size='16'
                      fill='currentColor'
                      className='mr-10px shrink-0 text-t-secondary'
                      aria-hidden='true'
                    />
                    <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                  </div>
                )}
                {canSelect(item) && (
                  <Button
                    type='primary'
                    size='mini'
                    onClick={() => {
                      handleSelect(item.path);
                    }}
                    aria-label={`${t('common.select')} ${item.name}`}
                  >
                    {t('common.select')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Spin>
    </Modal>
  );
};

export default DirectorySelectionModal;
