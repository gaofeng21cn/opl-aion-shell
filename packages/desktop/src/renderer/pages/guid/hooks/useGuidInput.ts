/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChatFileRef, chatFileRefPath, localFileRef, uploadFileRef } from '@/common/types/chatFile';
import { useDragUpload } from '@/renderer/hooks/file/useDragUpload';
import { usePasteService } from '@/renderer/hooks/file/usePasteService';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { measureCaretTop, scrollCaretToLastLine } from '../utils/caretUtils';
import { useCallback, useEffect, useState } from 'react';

export type GuidInputResult = {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: ChatFileRef[];
  setFiles: React.Dispatch<React.SetStateAction<ChatFileRef[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  isInputFocused: boolean;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleFilesPasted: (pastedFiles: FileMetadata[]) => void;
  handleFilesUploaded: (uploadedPaths: string[]) => void;
  handleFilesPicked: (pickedPaths: string[]) => void;
  handleRemoveFile: (targetPath: string) => void;
  handleTextareaFocus: () => void;
  handleTextareaBlur: () => void;
  onPaste: ReturnType<typeof usePasteService>['onPaste'];
  isFileDragging: boolean;
  dragHandlers: ReturnType<typeof useDragUpload>['dragHandlers'];
};

type UseGuidInputOptions = {
  locationState: { workspace?: string } | null;
  fileAccessEnabled?: boolean;
  onFileAccessBlocked?: () => void;
};

/**
 * Hook that manages input state, file handling, and drag/paste for the Guid page.
 */
export const useGuidInput = ({
  locationState,
  fileAccessEnabled = true,
  onFileAccessBlocked,
}: UseGuidInputOptions): GuidInputResult => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<ChatFileRef[]>([]);
  const [dir, setDir] = useState<string>('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // Read workspace from location.state (passed from tabs add button)
  useEffect(() => {
    if (locationState?.workspace) {
      setDir(locationState.workspace);
    }
  }, [locationState]);

  // Handle pasted files (append mode to support multiple pastes)
  // Do NOT clear dir here: paste/drag should coexist with a selected workspace,
  // matching the dialog-upload path (handleFilesUploaded).
  const handleFilesPasted = useCallback(
    (pastedFiles: FileMetadata[]) => {
      if (!fileAccessEnabled) {
        onFileAccessBlocked?.();
        return;
      }
      setFiles((prevFiles) => [...prevFiles, ...pastedFiles.map((file) => uploadFileRef(file.path))]);
    },
    [fileAccessEnabled, onFileAccessBlocked]
  );

  // Handle files uploaded via dialog (append mode)
  const handleFilesUploaded = useCallback(
    (uploadedPaths: string[]) => {
      if (!fileAccessEnabled) {
        onFileAccessBlocked?.();
        return;
      }
      setFiles((prevFiles) => [...prevFiles, ...uploadedPaths.map(uploadFileRef)]);
    },
    [fileAccessEnabled, onFileAccessBlocked]
  );

  const handleFilesPicked = useCallback(
    (pickedPaths: string[]) => {
      if (!fileAccessEnabled) {
        onFileAccessBlocked?.();
        return;
      }
      setFiles((prevFiles) => [...prevFiles, ...pickedPaths.map(localFileRef)]);
    },
    [fileAccessEnabled, onFileAccessBlocked]
  );

  const handleRemoveFile = useCallback((targetPath: string) => {
    setFiles((prevFiles) => prevFiles.filter((file) => chatFileRefPath(file) !== targetPath));
  }, []);

  // Use drag upload hook (drag treated like paste, appends to existing files)
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesPasted,
  });

  // Use shared PasteService integration (paste appends to existing files)
  const { onPaste, onFocus } = usePasteService({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesPasted,
    onTextPaste: (text: string) => {
      const textarea = document.activeElement as HTMLTextAreaElement | null;
      if (textarea && textarea.tagName === 'TEXTAREA') {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const current_value = textarea.value;
        const newValue = current_value.slice(0, start) + text + current_value.slice(end);
        setInput(newValue);

        setTimeout(() => {
          const newPos = start + text.length;
          textarea.setSelectionRange(newPos, newPos);
          const caretTop = measureCaretTop(textarea, newPos);
          scrollCaretToLastLine(textarea, caretTop);
        }, 0);
      } else {
        setInput((prev) => prev + text);
      }
    },
  });

  const handleTextareaFocus = useCallback(() => {
    onFocus();
    setIsInputFocused(true);
  }, [onFocus]);

  const handleTextareaBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  return {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    isInputFocused,
    loading,
    setLoading,
    handleFilesPasted,
    handleFilesUploaded,
    handleFilesPicked,
    handleRemoveFile,
    handleTextareaFocus,
    handleTextareaBlur,
    onPaste,
    isFileDragging,
    dragHandlers,
  };
};
