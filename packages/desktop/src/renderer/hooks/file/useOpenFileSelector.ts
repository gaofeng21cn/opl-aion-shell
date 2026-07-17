import { ipcBridge } from '@/common';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useCallback } from 'react';

interface UseOpenFileSelectorOptions {
  onFilesSelected: (files: string[]) => void;
}

interface UseOpenFileSelectorResult {
  openFileSelector: () => void;
  openDirectorySelector: () => void;
  openAttachmentSelector: () => void;
  onSlashBuiltinCommand: (name: string) => void;
}

type SelectorProperty = 'openFile' | 'openDirectory' | 'multiSelections';

/**
 * Shared open-file selector behavior for send boxes.
 * Unifies '+' button and '/open' builtin command handling.
 *
 * In Electron: opens native file dialog.
 * In WebUI: triggers DirectorySelectionModal via bridge events.
 */
export function useOpenFileSelector(options: UseOpenFileSelectorOptions): UseOpenFileSelectorResult {
  const { onFilesSelected } = options;

  const openSelector = useCallback(
    (properties: SelectorProperty[]) => {
      void ipcBridge.dialog.showOpen
        .invoke({ properties })
        .then((files) => {
          if (!files || files.length === 0) {
            return;
          }
          onFilesSelected(files);
        })
        .catch((error) => {
          // In WebUI, dialog may fail if DirectorySelectionModal is not rendered
          // or bridge is not properly connected. Log error for debugging.
          console.warn('[useOpenFileSelector] Failed to open file selector:', error);
        });
    },
    [onFilesSelected]
  );

  const openFileSelector = useCallback(() => {
    openSelector(['openFile', 'multiSelections']);
  }, [openSelector]);

  const openDirectorySelector = useCallback(() => {
    openSelector(['openDirectory', 'multiSelections']);
  }, [openSelector]);

  const openAttachmentSelector = useCallback(() => {
    openSelector(['openFile', 'openDirectory', 'multiSelections']);
  }, [openSelector]);

  const onSlashBuiltinCommand = useCallback(
    (name: string) => {
      if (name === 'open') {
        // Electron can expose files and directories in one native picker. The
        // WebUI bridge keeps its existing file-only modal because its browser
        // directory picker is a separate surface.
        if (isElectronDesktop()) {
          openAttachmentSelector();
        } else {
          openFileSelector();
        }
      }
    },
    [openAttachmentSelector, openFileSelector]
  );

  return {
    openFileSelector,
    openDirectorySelector,
    openAttachmentSelector,
    onSlashBuiltinCommand,
  };
}
