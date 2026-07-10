/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { ArrowCircleLeft, Help, Moon, SettingTwo, SunOne, User } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onAccountClick: () => void;
  onHelpClick: () => void;
  onThemeToggle: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onAccountClick,
  onHelpClick,
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
  const showThemeToggle = isSettings && !collapsed;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
      <div className='flex flex-col gap-2px'>
        {[
          {
            key: 'account',
            label: t('common.account'),
            icon: <User theme='outline' size='16' fill='currentColor' />,
            onClick: onAccountClick,
          },
          {
            key: 'help',
            label: t('common.help'),
            icon: <Help theme='outline' size='16' fill='currentColor' />,
            onClick: onHelpClick,
          },
          {
            key: 'settings',
            label: isSettings ? t('common.back') : t('common.settings'),
            icon: settingsIcon,
            onClick: onSettingsClick,
          },
        ].map((entry) => (
          <Tooltip key={entry.key} {...siderTooltipProps} content={entry.label} position='right'>
            <Button
              type='text'
              className={classNames(
                '!h-34px !w-full !flex !items-center !gap-8px !rd-8px !text-t-primary !border-0',
                collapsed ? '!justify-center !px-0' : '!justify-start !px-10px',
                isMobile && 'sider-footer-btn-mobile',
                entry.key === 'settings' && isSettings ? '!bg-fill-3' : '!bg-transparent hover:!bg-fill-3'
              )}
              onClick={entry.onClick}
              data-testid={`sider-footer-${entry.key}`}
            >
              <span className='size-22px flex-center shrink-0 text-t-secondary'>{entry.icon}</span>
              {!collapsed && <span className='text-14px font-[500] leading-24px truncate'>{entry.label}</span>}
            </Button>
          </Tooltip>
        ))}
        {showThemeToggle && (
          <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
            <Button
              type='text'
              onClick={onThemeToggle}
              className={classNames(
                '!h-32px !w-full !justify-center !rd-8px !text-t-secondary !bg-transparent hover:!bg-fill-2',
                isMobile && 'sider-footer-btn-mobile'
              )}
              aria-label={themeTooltip}
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
