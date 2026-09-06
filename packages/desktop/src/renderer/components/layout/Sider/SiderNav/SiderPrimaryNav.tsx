/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getOplVisualPrimitiveProps, OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderPrimaryNavProps = {
  collapsed: boolean;
  isMobile: boolean;
  pathname: string;
  siderTooltipProps: SiderTooltipProps;
  onRuntimeClick: () => void;
  onScheduledClick: () => void;
  onArchivedClick: () => void;
};

const SiderPrimaryNav: React.FC<SiderPrimaryNavProps> = ({
  collapsed,
  isMobile,
  pathname,
  siderTooltipProps,
  onRuntimeClick,
  onScheduledClick,
  onArchivedClick,
}) => {
  const { t } = useTranslation();
  const entries = [
    {
      key: 'runtime',
      label: t('common.runtime.sidebarEntry'),
      active: pathname.startsWith('/runtime'),
      icon: <OplIcon name='data' />,
      onClick: onRuntimeClick,
    },
    {
      key: 'scheduled',
      label: t('cron.scheduledTasks'),
      active: pathname.startsWith('/scheduled'),
      icon: <OplIcon name='schedule' />,
      onClick: onScheduledClick,
    },
    {
      key: 'archived',
      label: t('conversation.history.archivedTitle'),
      active: pathname === '/archived',
      icon: <OplIcon name='archive' />,
      onClick: onArchivedClick,
    },
  ];

  return (
    <nav aria-label={t('common.primaryNavigation')} className='shrink-0 flex flex-col gap-2px'>
      {entries.map((entry) => (
        <Tooltip key={entry.key} {...siderTooltipProps} content={entry.label} position='right'>
          <Button
            type='text'
            {...getOplVisualPrimitiveProps(
              'rail_row',
              classNames(
                '!h-34px !w-full !flex !items-center !gap-8px !rd-10px !justify-start !px-10px',
                isMobile && 'sider-action-btn-mobile',
                collapsed && '!justify-center !px-0'
              )
            )}
            aria-current={entry.active ? 'page' : undefined}
            data-selected={String(entry.active)}
            aria-label={entry.label}
            onClick={entry.onClick}
            data-testid={`sider-nav-${entry.key}`}
          >
            <span className='opl-navigation-icon-slot'>{entry.icon}</span>
            {!collapsed && <span className='opl-navigation-label'>{entry.label}</span>}
          </Button>
        </Tooltip>
      ))}
    </nav>
  );
};

export default SiderPrimaryNav;
