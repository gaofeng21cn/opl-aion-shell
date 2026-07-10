/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import styles from '../Sider.module.css';

interface SiderToolbarProps {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onNewChat: () => void;
}

const SiderToolbar: React.FC<SiderToolbarProps> = ({ isMobile, collapsed, siderTooltipProps, onNewChat }) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className='shrink-0 flex flex-col items-center gap-2px w-full'>
        <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newTask')} position='right'>
          <Button
            type='text'
            className={classNames(
              '!w-full !h-34px !flex !items-center !justify-center !text-t-primary !rd-8px !bg-transparent hover:!bg-fill-3 active:!bg-fill-4',
              styles.newChatTrigger
            )}
            onClick={onNewChat}
            aria-label={t('conversation.welcome.newTask')}
          >
            <Plus
              theme='outline'
              size='16'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className='shrink-0 flex items-center gap-8px'>
      <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newTask')} position='right'>
        <Button
          type='text'
          className={classNames(
            styles.newChatTrigger,
            '!h-34px !flex-1 !flex !items-center !justify-start !gap-8px !pl-10px !pr-8px !rd-8px !bg-transparent !text-t-primary hover:!bg-fill-3 active:!bg-fill-4',
            isMobile && 'sider-action-btn-mobile'
          )}
          onClick={onNewChat}
        >
          <span className='size-22px rd-6px bg-aou-2 border border-solid border-[var(--color-border-2)] group-hover:bg-fill-3 group-hover:border-transparent flex items-center justify-center shrink-0 transition-colors'>
            <Plus
              theme='outline'
              size='14'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </span>
          <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px'>
            {t('conversation.welcome.newTask')}
          </span>
        </Button>
      </Tooltip>
    </div>
  );
};

export default SiderToolbar;
