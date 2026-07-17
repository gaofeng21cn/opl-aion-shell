/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { FileService, type FileMetadata } from '@/renderer/services/FileService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Message } from '@arco-design/web-react';
import { FolderOpen, FolderUpload, Paperclip } from '@icon-park/react';
import React, { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MobileActionSheetEntry } from './types';

interface UseAttachEntryOptions {
  /** Open the host-side file picker (paths from disk via IPC). */
  openFileSelector: () => void;
  /** Optional host-side directory picker, shown beside the file action. */
  openDirectorySelector?: () => void;
  /** User-facing label for the optional directory picker. */
  directoryLabel?: ReactNode;
  /** Receives FileMetadata[] for files uploaded through the browser <input>. WebUI only. */
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  /** Whether to render the first entry above a divider — passed through. */
  dividerBefore?: boolean;
}

interface UseAttachEntryResult {
  /** File entry plus an optional directory entry; WebUI also includes device upload.
   * Entries stay flat so all top-level rows share a uniform height. */
  entries: MobileActionSheetEntry[];
  /** Mount this near the sendbox so the hidden file input can be triggered. */
  hiddenFileInput: React.ReactElement;
}

/**
 * Builds the "Attach" entries for the mobile action sheet, branching on platform:
 * - Desktop: host file picker plus the optional host directory picker.
 * - WebUI: host file/directory pickers plus browser device upload.
 */
export const useAttachEntry = ({
  openFileSelector,
  openDirectorySelector,
  directoryLabel,
  onLocalFilesAdded,
  dividerBefore,
}: UseAttachEntryOptions): UseAttachEntryResult => {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = isElectronDesktop();

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversation_id);
        if (processed.length > 0) onLocalFilesAdded(processed);
      } catch {
        Message.error(t('common.fileAttach.failed'));
      }
      e.target.value = '';
    },
    [conversationContext?.conversation_id, onLocalFilesAdded, t]
  );

  const triggerLocalUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const entries = useMemo<MobileActionSheetEntry[]>(() => {
    if (isDesktop) {
      const desktopEntries: MobileActionSheetEntry[] = [
        {
          key: 'attach',
          icon: <Paperclip theme='outline' size='16' />,
          label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
          variant: 'muted',
          dividerBefore,
          onClick: () => openFileSelector(),
        },
      ];
      if (openDirectorySelector) {
        desktopEntries.push({
          key: 'attach-directory',
          icon: <FolderOpen theme='outline' size='16' />,
          label: directoryLabel,
          variant: 'muted',
          onClick: () => openDirectorySelector(),
        });
      }
      return desktopEntries;
    }

    const webEntries: MobileActionSheetEntry[] = [
      {
        key: 'attach-host-files',
        icon: <Paperclip theme='outline' size='16' />,
        label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
        variant: 'muted',
        dividerBefore,
        onClick: () => openFileSelector(),
      },
    ];
    if (openDirectorySelector) {
      webEntries.push({
        key: 'attach-host-directory',
        icon: <FolderOpen theme='outline' size='16' />,
        label: directoryLabel,
        variant: 'muted',
        onClick: () => openDirectorySelector(),
      });
    }
    webEntries.push({
      key: 'attach-my-device',
      icon: <FolderUpload theme='outline' size='16' />,
      label: t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' }),
      variant: 'muted',
      onClick: () => triggerLocalUpload(),
    });
    return webEntries;
  }, [directoryLabel, dividerBefore, isDesktop, openDirectorySelector, openFileSelector, t, triggerLocalUpload]);

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type='file'
      multiple
      style={{ display: 'none' }}
      onChange={handleLocalFileChange}
      data-testid='mobile-sheet-file-upload-input'
    />
  );

  return { entries, hiddenFileInput };
};
