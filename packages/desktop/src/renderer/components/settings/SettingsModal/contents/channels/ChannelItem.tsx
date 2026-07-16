/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse } from '@arco-design/web-react';
import React from 'react';
import ChannelHeader from './ChannelHeader';
import type { ChannelConfig } from './types';

type ChannelEmptyStateProps = {
  children: React.ReactNode;
  testId: string;
};

export const ChannelEmptyState: React.FC<ChannelEmptyStateProps> = ({ children, testId }) => (
  <div
    className='flex min-h-44px items-center justify-center px-12px py-10px text-center text-12px leading-18px text-t-secondary'
    data-testid={testId}
  >
    {children}
  </div>
);

interface ChannelItemProps {
  channel: ChannelConfig;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isCollapsed, onToggleCollapse, onToggleEnabled }) => {
  return (
    <div
      data-channel-id={channel.id}
      data-channel-status={channel.status}
      data-channel-extension={channel.isExtension ? 'true' : 'false'}
    >
      <Collapse
        activeKey={isCollapsed ? [] : ['1']}
        onChange={onToggleCollapse}
        className='[&_div.arco-collapse-item-header-title]:flex-1'
      >
        <Collapse.Item
          header={<ChannelHeader channel={channel} onToggleEnabled={onToggleEnabled} />}
          name='1'
          className='[&_div.arco-collapse-item-content-box]:py-3'
        >
          {channel.content}
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

export default ChannelItem;
