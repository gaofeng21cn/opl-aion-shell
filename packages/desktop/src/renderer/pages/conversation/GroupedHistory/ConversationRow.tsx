/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { CronJobIndicator } from '@/renderer/pages/cron';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Checkbox, Dropdown, Menu, Spin, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';

import type { ConversationRowProps } from './types';
import { isCodexManagedWorktreeConversation, isConversationPinned } from './utils/groupingHelpers';

const ConversationRow: React.FC<ConversationRowProps> = (props) => {
  const {
    conversation,
    isGenerating,
    hasCompletionUnread,
    collapsed,
    tooltipEnabled,
    batchMode,
    checked,
    selected,
    menuVisible,
    dimIcon = false,
  } = props;
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const {
    onToggleChecked,
    onConversationClick,
    onOpenMenu,
    onMenuVisibleChange,
    onEditStart,
    onDelete,
    onExport,
    onTogglePin,
    onArchive,
    onRestore,
    onReset,
    onMoveToProject,
    archivedView = false,
    getJobStatus,
  } = props;
  const { t } = useTranslation();
  const isPinned = isConversationPinned(conversation);
  const isManagedWorktree = isCodexManagedWorktreeConversation(conversation);
  const cronStatus = getJobStatus(conversation.id);
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const inlineNameTooltipEnabled = !collapsed && !isMobile && !!conversation.name;

  const renderLeadingStatus = () => {
    if (cronStatus !== 'none') {
      return <CronJobIndicator status={cronStatus} size={16} className='flex-shrink-0' />;
    }

    // DSH keeps ordinary expanded history rows text-only. A compact glyph is
    // retained only when the rail is collapsed and the title is unavailable.
    return collapsed ? <OplIcon name='message' size={16} className='text-t-secondary' /> : null;
  };

  const handleRowClick = () => {
    cleanupSiderTooltips();
    if (batchMode) {
      onToggleChecked(conversation);
      return;
    }
    onConversationClick(conversation);
  };

  const handleRowContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupSiderTooltips();
    if (batchMode) {
      return;
    }
    onOpenMenu(conversation);
  };

  const renderCompletionUnreadDot = () => {
    if (batchMode || !hasCompletionUnread || isGenerating) {
      return null;
    }

    return (
      <span className='absolute right-8px top-1/2 -translate-y-1/2 flex items-center justify-center group-hover:hidden'>
        <span className='h-8px w-8px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)]' />
      </span>
    );
  };

  return (
    <Tooltip
      key={conversation.id}
      {...siderTooltipProps}
      content={conversation.name || t('conversation.welcome.newConversation')}
      position='right'
    >
      <div
        id={'c-' + conversation.id}
        className={classNames(
          'chat-history__item opl-codex-rail-row opl-codex-history-row flex items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-1px min-w-0',
          collapsed ? 'justify-center px-0' : 'justify-start pr-4px',
          // DSH history rows use text indentation instead of a per-row icon slot.
          !collapsed && (dimIcon ? 'pl-34px' : 'pl-28px'),
          {
            'bg-[rgba(var(--primary-6),0.08)]': batchMode && checked,
          }
        )}
        data-selected={selected ? 'true' : 'false'}
        aria-current={selected ? 'page' : undefined}
        onClick={handleRowClick}
        onContextMenu={handleRowContextMenu}
      >
        {batchMode && (
          <span
            className='mr-8px flex-center'
            onClick={(event) => {
              event.stopPropagation();
              onToggleChecked(conversation);
            }}
          >
            <Checkbox checked={checked} />
          </span>
        )}
        {(isGenerating && !batchMode ? <Spin size={16} /> : renderLeadingStatus()) && (
          <span className='mr-8px flex h-20px w-16px shrink-0 items-center justify-center leading-none'>
            {isGenerating && !batchMode ? <Spin size={16} /> : renderLeadingStatus()}
          </span>
        )}
        <FlexFullContainer className='h-20px min-w-0 flex-1 collapsed-hidden'>
          <div className='h-full min-w-0 flex items-center gap-4px pr-24px'>
            <Tooltip
              content={conversation.name}
              disabled={!inlineNameTooltipEnabled}
              trigger='hover'
              popupVisible={inlineNameTooltipEnabled ? undefined : false}
              unmountOnExit
              popupHoverStay={false}
              position='top'
            >
              <div className='chat-history__item-name overflow-hidden text-ellipsis block min-w-0 flex-1 text-13px font-[400] lh-20px whitespace-nowrap text-t-primary'>
                <span className='block overflow-hidden text-ellipsis whitespace-nowrap'>{conversation.name}</span>
              </div>
            </Tooltip>
            {isManagedWorktree && (
              <span
                role='img'
                aria-label={t('conversation.history.managedWorktree')}
                title={t('conversation.history.managedWorktree')}
                data-opl-worktree-indicator='true'
                className='flex-shrink-0 flex items-center justify-center text-[rgb(var(--primary-6))]'
              >
                <OplIcon name='branch' size={15} aria-hidden='true' />
              </span>
            )}
          </div>
        </FlexFullContainer>

        {/* Pinned is row metadata, never the leading conversation glyph. */}
        {!batchMode && isPinned && !isMobile && !isGenerating && (
          <span
            data-opl-pin-indicator='true'
            className='pointer-events-none absolute right-32px top-1/2 flex h-20px w-16px -translate-y-1/2 items-center justify-center text-t-secondary opacity-0 transition-opacity group-hover:opacity-100'
            aria-hidden='true'
          >
            <OplIcon name='pin' size={14} />
          </span>
        )}

        {renderCompletionUnreadDot()}
        {!batchMode && (
          <div
            className={classNames(
              'absolute right-8px top-1/2 -translate-y-1/2 items-center justify-end !collapsed-hidden',
              {
                flex: isMobile || menuVisible,
                'hidden group-hover:flex': !isMobile && !menuVisible,
              }
            )}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Dropdown
              droplist={
                <Menu
                  className='opl-codex-menu'
                  onClickMenuItem={(key) => {
                    if (key === 'pin') {
                      onTogglePin(conversation);
                      return;
                    }
                    if (key === 'rename') {
                      onEditStart(conversation);
                      return;
                    }
                    if (key === 'export') {
                      onExport?.(conversation);
                      return;
                    }
                    if (key === 'move-to-project') {
                      onMoveToProject?.(conversation);
                      return;
                    }
                    if (key === 'delete') {
                      onDelete(conversation.id);
                      return;
                    }
                    if (key === 'archive') {
                      onArchive?.(conversation);
                      return;
                    }
                    if (key === 'restore') {
                      onRestore?.(conversation);
                      return;
                    }
                    if (key === 'reset') {
                      onReset?.(conversation.id);
                    }
                  }}
                >
                  {!archivedView && (
                    <Menu.Item key='pin'>
                      <div className='flex items-center gap-8px'>
                        <OplIcon name='pin' size={14} />
                        <span>{isPinned ? t('conversation.history.unpin') : t('conversation.history.pin')}</span>
                      </div>
                    </Menu.Item>
                  )}
                  <Menu.Item key='rename'>
                    <div className='flex items-center gap-8px'>
                      <OplIcon name='edit' size={14} />
                      <span>{t('conversation.history.rename')}</span>
                    </div>
                  </Menu.Item>
                  {onMoveToProject && (
                    <Menu.Item key='move-to-project'>
                      <div className='flex items-center gap-8px'>
                        <OplIcon name='folderOpen' size={14} />
                        <span>{t('conversation.history.moveToProject')}</span>
                      </div>
                    </Menu.Item>
                  )}
                  {onExport && (
                    <Menu.Item key='export'>
                      <div className='flex items-center gap-8px'>
                        <OplIcon name='export' size={14} />
                        <span>{t('conversation.history.export')}</span>
                      </div>
                    </Menu.Item>
                  )}
                  {archivedView ? (
                    <Menu.Item key='restore'>
                      <div className='flex items-center gap-8px'>
                        <OplIcon name='undo' size={14} />
                        <span>{t('conversation.history.restore')}</span>
                      </div>
                    </Menu.Item>
                  ) : (
                    <Menu.Item key='archive'>
                      <div className='flex items-center gap-8px'>
                        <OplIcon name='archive' size={14} />
                        <span>{t('conversation.history.archive')}</span>
                      </div>
                    </Menu.Item>
                  )}
                  <Menu.Item key='reset'>
                    <div className='flex items-center gap-8px'>
                      <OplIcon name='refresh' size={14} />
                      <span>{t('conversation.history.resetTitle')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='delete'>
                    <div className='flex items-center gap-8px text-[rgb(var(--warning-6))]'>
                      <OplIcon name='trash' size={14} />
                      <span>{t('conversation.history.deleteTitle')}</span>
                    </div>
                  </Menu.Item>
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={(visible) => onMenuVisibleChange(conversation.id, visible)}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                className={classNames('opl-codex-icon-button flex-center cursor-pointer sider-action-btn', {
                  flex: isMobile || menuVisible,
                  'hidden group-hover:flex': !isMobile && !menuVisible,
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(conversation);
                }}
              >
                <OplIcon name='more' size={14} className='block leading-none' />
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default ConversationRow;
