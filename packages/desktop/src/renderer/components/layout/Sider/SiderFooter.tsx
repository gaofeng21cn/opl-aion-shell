/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { Moon, SettingTwo, SunOne } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

export type SiderFooterAccount = {
  displayName: string | null;
  email: string | null;
  initials: string;
};

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  account?: SiderFooterAccount | null;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: (target: 'general' | 'access') => void;
  onThemeToggle: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  account,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
}) => {
  const { t } = useTranslation();

  const settingsLabel = t('common.settings');
  const accountLabel = account?.displayName || account?.email || settingsLabel;
  const accountSecondary = account?.displayName && account.email ? account.email : null;
  const showThemeToggle = isSettings;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
      <div className={classNames('flex gap-2px', isSettings && !collapsed ? 'items-center' : 'flex-col')}>
        <Tooltip {...siderTooltipProps} content={accountSecondary || accountLabel} position='right'>
          <Button
            type='text'
            className={classNames(
              '!min-h-40px !h-auto !flex !items-center !overflow-hidden !text-t-primary !border-0 !bg-transparent hover:!bg-fill-3',
              isSettings && !collapsed ? '!min-w-0 !flex-1' : '!w-full',
              collapsed ? '!justify-center !px-0' : '!justify-start !px-10px',
              isMobile && 'sider-footer-btn-mobile !min-h-48px'
            )}
            onClick={() => onSettingsClick(account ? 'access' : 'general')}
            data-testid={account ? 'sider-footer-account' : 'sider-footer-settings'}
            aria-label={accountLabel}
          >
            <span className={classNames('flex min-w-0 items-center', collapsed ? 'justify-center' : 'w-full gap-9px')}>
              {account ? (
                <span className='flex size-28px shrink-0 items-center justify-center rounded-full bg-fill-3 text-11px font-600 text-t-primary'>
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
                <span className='flex min-w-0 flex-1 flex-col text-left'>
                  <span className='truncate text-14px font-[500] leading-20px'>{accountLabel}</span>
                  {accountSecondary && (
                    <span className='truncate text-11px font-normal leading-16px text-t-tertiary'>
                      {accountSecondary}
                    </span>
                  )}
                </span>
              )}
            </span>
          </Button>
        </Tooltip>
        {showThemeToggle && (
          <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
            <Button
              type='text'
              onClick={onThemeToggle}
              className={classNames(
                '!h-34px !p-0 !justify-center !rd-8px !text-t-secondary !bg-transparent hover:!bg-fill-2',
                '!w-34px !shrink-0',
                isMobile && 'sider-footer-btn-mobile !h-44px !min-h-44px',
                isMobile && '!w-44px'
              )}
              aria-label={themeTooltip}
              data-testid='sider-footer-theme'
            >
              <span className='w-28px h-28px flex items-center justify-center shrink-0'>
                {theme === 'dark' ? (
                  <SunOne theme='outline' size='18' fill='currentColor' className='block leading-none' />
                ) : (
                  <Moon theme='outline' size='18' fill='currentColor' className='block leading-none' />
                )}
              </span>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
