/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse } from '@arco-design/web-react';
import React from 'react';
import ChannelHeader from './ChannelHeader';
import type { ChannelConfig } from './types';

type ChannelPreferenceRowProps = {
  label: string;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
};

export const ChannelPreferenceRow: React.FC<ChannelPreferenceRowProps> = ({
  label,
  description,
  extra,
  required,
  children,
}) => (
  <div
    className='flex min-w-0 flex-col gap-8px py-12px sm:flex-row sm:items-center sm:justify-between sm:gap-24px'
    data-channel-preference-row
  >
    <div className='min-w-0 flex-1'>
      <div className='flex min-w-0 flex-wrap items-center gap-8px'>
        <span className='text-14px text-t-primary'>
          {label}
          {required && <span className='ml-2px text-danger'>*</span>}
        </span>
        {extra}
      </div>
      {description && <div className='mt-2px break-words text-12px text-t-tertiary'>{description}</div>}
    </div>
    <div
      className='flex w-full min-w-0 max-w-full flex-wrap items-center gap-8px [&>*]:max-w-full sm:w-auto sm:flex-nowrap sm:justify-end'
      data-channel-row-actions
    >
      {children}
    </div>
  </div>
);

type ChannelSectionHeaderProps = {
  title: string;
  action?: React.ReactNode;
};

export const ChannelSectionHeader: React.FC<ChannelSectionHeaderProps> = ({ title, action }) => (
  <div className='mb-12px flex min-w-0 flex-wrap items-start justify-between gap-8px'>
    <h3 className='m-0 min-w-0 break-words text-14px font-500 text-t-primary'>{title}</h3>
    {action}
  </div>
);

type ChannelStatusBadgeProps = {
  children: React.ReactNode;
  tone: 'success' | 'warning' | 'danger';
};

const CHANNEL_STATUS_TONE_CLASS: Record<ChannelStatusBadgeProps['tone'], string> = {
  success: 'bg-success-1 text-success-6',
  warning: 'bg-warning-1 text-warning-6',
  danger: 'bg-danger-1 text-danger-6',
};

export const ChannelStatusBadge: React.FC<ChannelStatusBadgeProps> = ({ children, tone }) => (
  <span
    className={`inline-flex max-w-full items-center break-words rd-4px px-8px py-2px text-12px ${CHANNEL_STATUS_TONE_CLASS[tone]}`}
    data-channel-status-tone={tone}
  >
    {children}
  </span>
);

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
      className='w-full min-w-0 max-w-full'
      data-channel-id={channel.id}
      data-channel-status={channel.status}
      data-channel-extension={channel.isExtension ? 'true' : 'false'}
    >
      <Collapse
        activeKey={isCollapsed ? [] : ['1']}
        onChange={onToggleCollapse}
        className='w-full min-w-0 max-w-full [&_div.arco-collapse-item-header-title]:flex-1'
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
