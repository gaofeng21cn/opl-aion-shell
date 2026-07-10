/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FilePreview from '@/renderer/components/media/FilePreview';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { Input } from '@arco-design/web-react';
import React from 'react';
import styles from '../index.module.css';
import GuidWorkspaceFootnote from './GuidWorkspaceFootnote';

const MOBILE_TEXTAREA_AUTO_SIZE = { minRows: 2, maxRows: 8 };
const DESKTOP_TEXTAREA_AUTO_SIZE = { minRows: 2, maxRows: 20 };

type GuidInputCardProps = {
  // Input state
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste: React.ClipboardEventHandler;
  onFocus: () => void;
  onBlur: () => void;
  placeholder: string;

  // Styling
  isInputActive: boolean;
  isFileDragging: boolean;
  activeBorderColor: string;
  inactiveBorderColor: string;
  activeShadow: string;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;

  // Mention state
  mentionOpen: boolean;
  mentionDropdown: React.ReactNode;

  // Files
  files: string[];
  onRemoveFile: (path: string) => void;

  // Action row
  actionRow: React.ReactNode;
  slashCommandMenu?: React.ReactNode;

  // Workspace
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
  workspaceAccessDisabled?: boolean;
  workspaceAccessDisabledReason?: string;
  activeCapabilityLabel?: string;
  fileContextEnabled?: boolean;
};

const GuidInputCard: React.FC<GuidInputCardProps> = ({
  input,
  onInputChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  placeholder,
  isInputActive,
  isFileDragging,
  activeBorderColor,
  inactiveBorderColor,
  activeShadow,
  dragHandlers,
  mentionOpen,
  mentionDropdown,
  files,
  onRemoveFile,
  actionRow,
  slashCommandMenu,
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
  workspaceAccessDisabled = false,
  workspaceAccessDisabledReason,
  activeCapabilityLabel,
  fileContextEnabled = true,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { compositionHandlers, isComposing } = useCompositionInput();
  const textareaAutoSize = isMobile ? MOBILE_TEXTAREA_AUTO_SIZE : DESKTOP_TEXTAREA_AUTO_SIZE;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return;
    onKeyDown(e);
  };

  const fileDraggingActive = fileContextEnabled && isFileDragging;
  const borderColor = fileDraggingActive
    ? 'rgb(var(--primary-3))'
    : isInputActive
      ? activeBorderColor
      : inactiveBorderColor;

  return (
    <div
      className={`${styles.guidInputCardWrap} guid-input-card-shell relative rd-24px flex flex-col ${mentionOpen || slashCommandMenu ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 ${fileDraggingActive ? 'b b-solid border-dashed guid-input-card-shell--dragging' : ''}`}
      data-testid='guid-input-card-shell'
      style={{
        zIndex: 1,
        transition: 'box-shadow 0.25s ease',
        width: isMobile ? 'calc(100% + 28px)' : undefined,
        marginLeft: isMobile ? -14 : undefined,
        marginRight: isMobile ? -14 : undefined,
        ...(fileDraggingActive
          ? {
              backgroundColor: 'var(--color-primary-light-1)',
              borderColor: 'rgb(var(--primary-3))',
              borderWidth: '1px',
            }
          : {}),
      }}
      {...(fileContextEnabled ? dragHandlers : {})}
    >
      <div
        className={`${styles.guidInputInner} relative p-12px flex flex-col bg-dialog-fill-0`}
        style={{
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
          borderColor: fileDraggingActive ? 'rgb(var(--primary-3))' : borderColor,
          boxShadow: isInputActive && !fileDraggingActive ? activeShadow : 'none',
        }}
      >
        <Input.TextArea
          autoSize={textareaAutoSize}
          placeholder={placeholder}
          spellCheck={false}
          className={`text-14px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !py-0 !pr-0 !pl-7px ${styles.lightPlaceholder}`}
          value={input}
          onChange={onInputChange}
          onPaste={fileContextEnabled ? onPaste : undefined}
          onFocus={onFocus}
          onBlur={onBlur}
          {...compositionHandlers}
          onKeyDown={handleKeyDown}
          data-testid='guid-input'
        />
        <div style={{ height: 12, flexShrink: 0 }} aria-hidden='true' />
        {mentionOpen && (
          <div className='absolute z-50' style={{ left: 16, top: 44 }}>
            {mentionDropdown}
          </div>
        )}
        {files.length > 0 && (
          <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px'>
            {files.map((path) => (
              <FilePreview key={path} path={path} onRemove={() => onRemoveFile(path)} />
            ))}
          </div>
        )}
        <UploadProgressBar source='sendbox' />
        {actionRow}
        {slashCommandMenu && (
          <div className='absolute left-0 right-0 top-[calc(100%+4px)] z-70'>{slashCommandMenu}</div>
        )}
      </div>
      <GuidWorkspaceFootnote
        workspaceDir={workspaceDir}
        onSelectWorkspace={onSelectWorkspace}
        onClearWorkspace={onClearWorkspace}
        accessDisabled={workspaceAccessDisabled}
        accessDisabledReason={workspaceAccessDisabledReason}
        activeCapabilityLabel={activeCapabilityLabel}
      />
    </div>
  );
};

export default GuidInputCard;
