/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { getOplVisualPrimitiveProps, OplIcon } from '@/renderer/components/opl/OplVisualProvider';
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
            {...getOplVisualPrimitiveProps(
              'rail_row',
              classNames(
                '!w-full !h-36px !flex !items-center !justify-center !text-t-primary !rd-10px',
                styles.newChatTrigger
              )
            )}
            onClick={onNewChat}
            aria-label={t('conversation.welcome.newTask')}
          >
            <OplIcon name='newChat' className={classNames('block leading-none', styles.newChatIcon)} />
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
          {...getOplVisualPrimitiveProps(
            'rail_row',
            classNames(
              styles.newChatTrigger,
              '!h-38px !flex-1 !flex !items-center !justify-start !gap-8px !pl-10px !pr-8px !rd-12px !text-t-primary',
              isMobile && 'sider-action-btn-mobile'
            )
          )}
          onClick={onNewChat}
        >
          <span className='size-22px flex items-center justify-center shrink-0'>
            <OplIcon name='newChat' className={classNames('block leading-none', styles.newChatIcon)} />
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
