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

export type SiderFooterAccount = {
  displayName: string | null;
  email: string | null;
  initials: string;
};

interface SiderFooterProps {
  isMobile: boolean;
  collapsed?: boolean;
  updateAvailable?: boolean;
  account?: SiderFooterAccount | null;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: (target: 'general' | 'gateway') => void;
  onUpdateClick: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  collapsed = false,
  updateAvailable = false,
  account,
  siderTooltipProps,
  onSettingsClick,
  onUpdateClick,
}) => {
  const { t } = useTranslation();

  const settingsLabel = t('common.settings');
  const accountLabel = account?.displayName || account?.email || settingsLabel;
  const accountSecondary = account?.displayName && account.email ? account.email : null;
  const updateLabel = t('settings.updateAvailable');

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
      <div className='flex min-w-0 items-center gap-2px'>
        <Tooltip {...siderTooltipProps} content={accountSecondary || accountLabel} position='right'>
          <Button
            type='text'
            {...getOplVisualPrimitiveProps(
              'rail_row',
              classNames(
                '!h-34px !min-w-0 !flex !items-center !overflow-hidden !rd-10px',
                collapsed ? '!w-28px !justify-center !px-0' : '!flex-1 !justify-start !px-8px',
                isMobile && 'sider-footer-btn-mobile !h-44px'
              )
            )}
            onClick={() => onSettingsClick(account ? 'gateway' : 'general')}
            data-testid={account ? 'sider-footer-account' : 'sider-footer-settings'}
            aria-label={accountLabel}
          >
            <span className={classNames('flex min-w-0 items-center', collapsed ? 'justify-center' : 'w-full gap-9px')}>
              {account ? (
                <span
                  className='flex size-22px shrink-0 items-center justify-center rounded-full bg-success text-10px font-600 text-inverse'
                  data-testid='sider-footer-account-avatar'
                  aria-hidden='true'
                >
                  {account.initials}
                </span>
              ) : (
                <span className='size-22px flex-center shrink-0 text-t-secondary'>
                  <OplIcon name='settings' className='block leading-none' />
                </span>
              )}
              {!collapsed && (
                <span className='min-w-0 flex-1 truncate text-left text-13px font-[500] leading-20px'>
                  {accountLabel}
                </span>
              )}
            </span>
          </Button>
        </Tooltip>
        {updateAvailable && (
          <Tooltip {...siderTooltipProps} content={updateLabel} position='right'>
            <Button
              type='text'
              onClick={onUpdateClick}
              {...getOplVisualPrimitiveProps(
                'icon_button',
                classNames(
                  '!shrink-0 !p-0 !text-white',
                  collapsed && '!h-24px !w-24px !min-w-24px',
                  isMobile && 'sider-footer-btn-mobile !h-40px !w-40px !min-w-40px'
                )
              )}
              aria-label={updateLabel}
              data-testid='sider-footer-update'
              data-update-available='true'
            >
              <span className='flex size-20px items-center justify-center rounded-full bg-[var(--opl-accent-blue)] shadow-sm'>
                <OplIcon name='download' size={collapsed ? 11 : 12} className='block leading-none' />
              </span>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
