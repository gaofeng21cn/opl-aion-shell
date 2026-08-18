/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import ConversationSearchPopover from '@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderSearchEntryProps {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onConversationSelect: () => void;
  onSessionClick?: () => void;
}

const SiderSearchEntry: React.FC<SiderSearchEntryProps> = ({
  isMobile,
  collapsed,
  siderTooltipProps,
  onConversationSelect,
  onSessionClick,
}) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content={t('conversation.historySearch.tooltip')} position='right'>
        <div className='w-full'>
          <ConversationSearchPopover
            onSessionClick={onSessionClick}
            onConversationSelect={onConversationSelect}
            label={t('conversation.historySearch.shortTitle')}
            buttonClassName='!w-full !h-34px !py-0 !px-0 !justify-center !rd-10px'
          />
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content={t('conversation.historySearch.tooltip')} position='right'>
      <div className='flex shrink-0 items-center justify-center'>
        <ConversationSearchPopover
          onSessionClick={onSessionClick}
          onConversationSelect={onConversationSelect}
          label={t('conversation.historySearch.shortTitle')}
          buttonClassName={isMobile ? 'sider-action-icon-btn-mobile !w-32px !h-32px' : '!w-28px !h-28px'}
        />
      </div>
    </Tooltip>
  );
};

export default SiderSearchEntry;
