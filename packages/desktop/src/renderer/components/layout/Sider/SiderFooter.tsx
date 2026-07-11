/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { ArrowCircleLeft, Moon, SettingTwo, SunOne } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
}) => {
  const { t } = useTranslation();

  const settingsIcon = isSettings ? (
    <ArrowCircleLeft
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  ) : (
    <SettingTwo
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  );
  const settingsLabel = isSettings ? t('common.back') : t('common.settings');
  const showThemeToggle = isSettings;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  const isSettingsRow = isSettings && !collapsed;

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
      <div className={classNames('flex gap-2px', isSettingsRow ? 'flex-row items-center' : 'flex-col')}>
        <Tooltip {...siderTooltipProps} content={settingsLabel} position='right'>
          <Button
            type='text'
            className={classNames(
              '!h-34px !flex !items-center !gap-8px !overflow-hidden !text-t-primary !border-0',
              isSettingsRow ? '!flex-1 !justify-start !px-10px !bg-fill-3 hover:!bg-fill-3' : '!w-full',
              !isSettingsRow && (collapsed ? '!justify-center !px-0' : '!justify-start !px-10px'),
              !isSettings && '!bg-transparent hover:!bg-fill-3',
              isMobile && 'sider-footer-btn-mobile !h-44px !min-h-44px'
            )}
            onClick={onSettingsClick}
            data-testid='sider-footer-settings'
            aria-label={settingsLabel}
          >
            <span
              className={classNames('flex min-w-0 items-center', collapsed ? 'justify-center' : 'w-full gap-8px')}
              data-testid='sider-footer-settings-content'
            >
              <span className='size-22px flex-center shrink-0 text-t-secondary'>{settingsIcon}</span>
              {!collapsed && (
                <span className='min-w-0 truncate text-14px font-[500] leading-24px'>{settingsLabel}</span>
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
                '!h-34px !justify-center !rd-8px !text-t-secondary !bg-transparent hover:!bg-fill-2',
                isSettingsRow ? '!w-34px !shrink-0' : '!w-full',
                isMobile && 'sider-footer-btn-mobile !h-44px !min-h-44px',
                isMobile && isSettingsRow && '!w-44px'
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
