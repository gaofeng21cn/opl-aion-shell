/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { AllApplication, Inbox } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderPrimaryNavProps = {
  collapsed: boolean;
  isMobile: boolean;
  pathname: string;
  siderTooltipProps: SiderTooltipProps;
  onArchivedClick: () => void;
  onCapabilitiesClick: () => void;
};

const SiderPrimaryNav: React.FC<SiderPrimaryNavProps> = ({
  collapsed,
  isMobile,
  pathname,
  siderTooltipProps,
  onArchivedClick,
  onCapabilitiesClick,
}) => {
  const { t } = useTranslation();
  const entries = [
    {
      key: 'archived',
      label: t('conversation.history.archivedTitle'),
      active: pathname === '/archived',
      icon: <Inbox theme='outline' size='16' fill='currentColor' />,
      onClick: onArchivedClick,
    },
    {
      key: 'capabilities',
      label: t('guid.capabilities.title'),
      active: pathname === '/capabilities',
      icon: <AllApplication theme='outline' size='16' fill='currentColor' />,
      onClick: onCapabilitiesClick,
    },
  ];

  return (
    <nav aria-label={t('common.primaryNavigation')} className='shrink-0 flex flex-col gap-2px'>
      {entries.map((entry) => (
        <Tooltip key={entry.key} {...siderTooltipProps} content={entry.label} position='right'>
          <Button
            type='text'
            className={classNames(
              '!h-34px !w-full !rd-8px !text-t-primary !justify-start !px-10px !border-0',
              isMobile && 'sider-action-btn-mobile',
              collapsed && '!justify-center !px-0',
              entry.active ? '!bg-fill-3' : '!bg-transparent hover:!bg-fill-3 active:!bg-fill-4'
            )}
            icon={<span className='size-22px flex-center shrink-0'>{entry.icon}</span>}
            onClick={entry.onClick}
            data-testid={`sider-nav-${entry.key}`}
          >
            {!collapsed && <span className='text-14px font-[500] leading-24px'>{entry.label}</span>}
          </Button>
        </Tooltip>
      ))}
    </nav>
  );
};

export default SiderPrimaryNav;
