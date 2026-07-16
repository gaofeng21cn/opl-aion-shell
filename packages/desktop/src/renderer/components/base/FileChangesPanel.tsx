/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useState } from 'react';
import { Down, Edit, PreviewOpen, Right } from '@icon-park/react';
import { diffColors, iconColors } from '@/renderer/styles/colors';
import { useTranslation } from 'react-i18next';

/**
 * 文件变更项数据 / File change item data
 */
export interface FileChangeItem {
  /** 文件名 / File name */
  file_name: string;
  /** 完整路径 / Full path */
  fullPath: string;
  /** 新增行数 / Number of insertions */
  insertions: number;
  /** 删除行数 / Number of deletions */
  deletions: number;
}

/**
 * 文件变更面板属性 / File changes panel props
 */
export interface FileChangesPanelProps {
  /** 面板标题 / Panel title */
  title: string;
  /** 文件变更列表 / File changes list */
  files: FileChangeItem[];
  /** 默认是否展开 / Default expanded state */
  defaultExpanded?: boolean;
  /** 点击预览按钮的回调 / Callback when preview button is clicked */
  onFileClick?: (file: FileChangeItem) => void;
  /** 点击变更统计的回调（+8/-3 数字触发，打开 diff 对比）/ Callback when change stats are clicked (opens diff view) */
  onDiffClick?: (file: FileChangeItem) => void;
  /** 额外的类名 / Additional class name */
  className?: string;
  /** Conversation timelines use the compact Codex-style disclosure row. */
  variant?: 'panel' | 'conversation';
}

/**
 * 文件变更面板组件
 * File changes panel component
 *
 * 用于显示会话中生成/修改的文件列表，支持展开收起
 * Used to display generated/modified files in conversation, supports expand/collapse
 */
const FileChangesPanel: React.FC<FileChangesPanelProps> = ({
  title,
  files,
  defaultExpanded,
  onFileClick,
  onDiffClick,
  className,
  variant = 'panel',
}) => {
  const { t } = useTranslation();
  const compact = variant === 'conversation';
  const [expanded, setExpanded] = useState(defaultExpanded ?? !compact);

  if (files.length === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        'w-full box-border',
        compact ? 'text-t-secondary' : 'rounded-8px overflow-hidden border border-solid border-[var(--aou-2)]',
        className
      )}
      style={{ width: '100%' }}
      data-variant={variant}
    >
      {/* 标题栏 / Header */}
      <button
        type='button'
        className={classNames(
          'w-full flex items-center justify-between cursor-pointer select-none border-0 bg-transparent font-inherit text-left',
          compact ? 'py-2px' : 'px-16px py-12px'
        )}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className='flex items-center gap-8px'>
          {compact ? (
            <Edit theme='outline' size='14' />
          ) : (
            <span className='w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: diffColors.addition }} />
          )}
          {/* 标题 / Title */}
          <span className={compact ? 'text-13px text-t-secondary font-400' : 'text-14px text-t-primary font-medium'}>
            {title}
          </span>
        </div>
        {/* 展开/收起箭头 / Expand/collapse arrow */}
        {compact ? (
          <Right
            theme='outline'
            size='12'
            fill={iconColors.secondary}
            className={classNames('transition-transform duration-200', expanded && 'rotate-90')}
          />
        ) : (
          <Down
            theme='outline'
            size='16'
            fill={iconColors.secondary}
            className={classNames('transition-transform duration-200', expanded && 'rotate-180')}
          />
        )}
      </button>

      {/* 文件列表 / File list */}
      {expanded && (
        <div
          className={classNames(
            'w-full',
            compact ? 'ml-20px border-l border-solid border-border-1 py-4px pl-12px' : 'bg-2'
          )}
        >
          {files.map((file, index) => (
            <div
              key={`${file.fullPath}-${index}`}
              className={classNames(
                'group flex items-center justify-between transition-colors',
                compact ? 'py-6px pr-20px hover:bg-fill-1' : 'px-16px py-12px hover:bg-3'
              )}
            >
              {/* 文件名 / File name */}
              <div className='flex items-center min-w-0'>
                <span className={compact ? 'text-12px text-t-secondary truncate' : 'text-14px text-t-primary truncate'}>
                  {file.file_name}
                </span>
              </div>
              {/* 变更统计 + 预览按钮 / Change statistics + Preview button */}
              <div className='flex items-center gap-8px shrink-0'>
                {/* 变更统计 - 点击打开 diff 对比 / Change stats - click to open diff view */}
                {(file.insertions > 0 || file.deletions > 0) && (
                  <span
                    className={classNames(
                      'flex items-center gap-4px rd-4px px-4px py-2px',
                      onDiffClick && 'cursor-pointer hover:bg-4 transition-colors'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiffClick?.(file);
                    }}
                  >
                    {file.insertions > 0 && (
                      <span className='text-14px font-medium' style={{ color: diffColors.addition }}>
                        +{file.insertions}
                      </span>
                    )}
                    {file.deletions > 0 && (
                      <span className='text-14px font-medium' style={{ color: diffColors.deletion }}>
                        -{file.deletions}
                      </span>
                    )}
                  </span>
                )}
                {/* 预览按钮 - 点击打开文件预览 / Preview button - click to open file preview */}
                <span
                  className='group-hover:opacity-100 transition-opacity shrink-0 ml-4px flex items-center gap-4px text-12px text-t-secondary cursor-pointer rd-4px px-4px py-2px hover:bg-4'
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileClick?.(file);
                  }}
                >
                  <PreviewOpen className='line-height-8px' theme='outline' size='14' fill={iconColors.secondary} />
                  {t('preview.preview')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileChangesPanel;
