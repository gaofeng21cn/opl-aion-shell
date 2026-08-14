/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FilePreview from '@/renderer/components/media/FilePreview';
import OplUiContributionSlot from '@/renderer/components/opl/OplUiContributionSlot';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { Input } from '@arco-design/web-react';
import React from 'react';
import styles from '../index.module.css';

const MOBILE_TEXTAREA_AUTO_SIZE = { minRows: 2, maxRows: 8 };
const DESKTOP_TEXTAREA_AUTO_SIZE = { minRows: 1, maxRows: 12 };

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
  slashCommandListboxId?: string;
  slashCommandActiveOptionId?: string;
  fileAccessEnabled?: boolean;
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
  slashCommandListboxId,
  slashCommandActiveOptionId,
  fileAccessEnabled = true,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { compositionHandlers, isComposing } = useCompositionInput();
  const textareaAutoSize = isMobile ? MOBILE_TEXTAREA_AUTO_SIZE : DESKTOP_TEXTAREA_AUTO_SIZE;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return;
    onKeyDown(e);
  };

  const fileDraggingActive = fileAccessEnabled && isFileDragging;
  const borderColor = fileDraggingActive
    ? 'rgb(var(--primary-3))'
    : isInputActive
      ? activeBorderColor
      : inactiveBorderColor;
  return (
    <div
      className={`${styles.guidInputCardWrap} guid-input-card-shell relative flex flex-col overflow-visible ${fileDraggingActive ? 'guid-input-card-shell--dragging' : ''}`}
      data-testid='guid-input-card-shell'
      style={{
        zIndex: 1,
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
      {...(fileAccessEnabled ? dragHandlers : {})}
    >
      <div
        className={`${styles.guidInputInner} opl-codex-composer ${isInputActive ? 'opl-codex-composer--focused' : ''} ${fileDraggingActive ? 'opl-codex-composer--dragging' : ''} relative z-1 flex flex-col`}
        data-testid='guid-input-card-inner'
        data-composer-palette-boundary='true'
        style={{
          transition: 'box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease',
          overflow: mentionOpen || slashCommandMenu ? 'visible' : 'hidden',
          borderColor,
          boxShadow: isInputActive && !fileDraggingActive ? activeShadow : 'var(--opl-home-composer-shadow)',
        }}
      >
        <Input.TextArea
          role='combobox'
          aria-autocomplete='list'
          aria-expanded={Boolean(slashCommandMenu)}
          aria-controls={slashCommandMenu ? slashCommandListboxId : undefined}
          aria-activedescendant={slashCommandMenu ? slashCommandActiveOptionId : undefined}
          autoSize={textareaAutoSize}
          placeholder={placeholder}
          spellCheck={false}
          className={`text-14px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !py-0 !pr-0 !pl-5px ${styles.lightPlaceholder}`}
          value={input}
          onChange={onInputChange}
          onPaste={fileAccessEnabled ? onPaste : undefined}
          onFocus={onFocus}
          onBlur={onBlur}
          {...compositionHandlers}
          onKeyDown={handleKeyDown}
          data-testid='guid-input'
        />
        <div style={{ height: 8, flexShrink: 0 }} aria-hidden='true' />
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
        <OplUiContributionSlot slot='composer.palette' />
        {actionRow}
        {slashCommandMenu && (
          <div className='absolute left-0 right-0 top-[calc(100%+4px)] z-70'>{slashCommandMenu}</div>
        )}
      </div>
    </div>
  );
};

export default GuidInputCard;
