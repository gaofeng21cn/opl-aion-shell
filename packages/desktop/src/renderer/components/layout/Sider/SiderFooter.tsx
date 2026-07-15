/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { Download, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

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
  onSettingsClick: (target: 'general' | 'access') => void;
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
            className={classNames(
              '!h-32px !min-w-0 !flex !items-center !overflow-hidden !rd-8px !text-t-primary !border-0 !bg-transparent hover:!bg-fill-3',
              collapsed ? '!w-26px !justify-center !px-0' : '!flex-1 !justify-start !px-8px',
              isMobile && 'sider-footer-btn-mobile !h-44px'
            )}
            onClick={() => onSettingsClick(account ? 'access' : 'general')}
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
                  <SettingTwo
                    theme='outline'
                    size='16'
                    fill='currentColor'
                    className='block leading-none'
                    style={{ lineHeight: 0 }}
                  />
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
              className={classNames(
                '!h-28px !w-28px !min-w-28px !shrink-0 !rd-7px !p-0 !text-white !bg-transparent hover:!bg-fill-2',
                collapsed && '!h-22px !w-20px !min-w-20px',
                isMobile && 'sider-footer-btn-mobile !h-40px !w-40px !min-w-40px'
              )}
              aria-label={updateLabel}
              data-testid='sider-footer-update'
              data-update-available='true'
            >
              <span className='flex size-20px items-center justify-center rounded-full bg-[var(--opl-accent-blue)] shadow-sm'>
                <Download
                  theme='outline'
                  size={collapsed ? 11 : 12}
                  fill='currentColor'
                  className='block leading-none'
                />
              </span>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
