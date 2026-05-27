/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Message, Radio } from '@arco-design/web-react';
import {
  isOplVisibleCssThemeId,
  OPL_CLASSIC_CSS_THEME_ID,
  OPL_CODEX_CSS_THEME_ID,
  type OplVisibleCssThemeId,
} from '@/common/config/oplProductProfile';
import { configService } from '@/common/config/configService';
import type { ICssTheme } from '@/common/config/storage';
import FontSizeControl from '@/renderer/components/settings/FontSizeControl';
import { ThemeSwitcher } from '@/renderer/components/settings/ThemeSwitcher';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { resolveCssByActiveTheme } from '@renderer/utils/theme/themeCssSync';
import { useSettingsViewMode } from '../settingsViewContext';

/**
 * 偏好设置行组件 / Preference row component
 * 用于显示标签和对应的控件，统一的水平布局 / Used for displaying labels and corresponding controls in a unified horizontal layout
 */
const PreferenceRow: React.FC<{
  /** 标签文本 / Label text */
  label: string;
  /** 控件元素 / Control element */
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className='flex flex-col items-stretch gap-10px py-12px md:flex-row md:items-center md:justify-between md:gap-24px'>
    <div className='text-14px text-t-primary leading-22px'>{label}</div>
    <div className='w-full flex md:flex-1 md:justify-end'>{children}</div>
  </div>
);

const OplThemeProfileSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const [activeThemeId, setActiveThemeId] = React.useState<OplVisibleCssThemeId>(OPL_CODEX_CSS_THEME_ID);
  const [savingThemeId, setSavingThemeId] = React.useState<OplVisibleCssThemeId | null>(null);

  const applyTheme = React.useCallback(
    async (themeId: OplVisibleCssThemeId, showToast: boolean) => {
      setSavingThemeId(themeId);
      try {
        await configService.whenReady();
        const savedThemes = (configService.get('css.themes') || []) as ICssTheme[];
        const css = resolveCssByActiveTheme(themeId, savedThemes);
        await configService.setBatch({
          customCss: css,
          'css.activeThemeId': themeId,
        });
        setActiveThemeId(themeId);
        window.dispatchEvent(new CustomEvent('custom-css-updated', { detail: { customCss: css } }));
        if (showToast) {
          Message.success(t('settings.appearancePage.themeSaved'));
        }
      } catch (error) {
        console.error('Failed to apply OPL appearance theme:', error);
        Message.error(t('settings.appearancePage.themeSaveFailed'));
      } finally {
        setSavingThemeId(null);
      }
    },
    [t]
  );

  React.useEffect(() => {
    let cancelled = false;
    const loadActiveTheme = async () => {
      await configService.whenReady();
      if (cancelled) return;
      const storedThemeId = configService.get('css.activeThemeId');
      const effectiveThemeId = isOplVisibleCssThemeId(storedThemeId) ? storedThemeId : OPL_CODEX_CSS_THEME_ID;
      setActiveThemeId(effectiveThemeId);
      if (storedThemeId !== effectiveThemeId) {
        await applyTheme(effectiveThemeId, false);
      }
    };

    loadActiveTheme().catch((error) => {
      console.error('Failed to load OPL appearance theme:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [applyTheme]);

  const options = [
    {
      value: OPL_CODEX_CSS_THEME_ID,
      label: t('settings.appearancePage.codexTheme'),
    },
    {
      value: OPL_CLASSIC_CSS_THEME_ID,
      label: t('settings.appearancePage.defaultTheme'),
    },
  ];

  return (
    <Radio.Group
      type='button'
      value={activeThemeId}
      onChange={(value) => {
        if (isOplVisibleCssThemeId(value) && value !== activeThemeId) {
          void applyTheme(value, true);
        }
      }}
      disabled={Boolean(savingThemeId)}
    >
      {options.map((option) => (
        <Radio key={option.value} value={option.value}>
          {option.label}
        </Radio>
      ))}
    </Radio.Group>
  );
};

/**
 * 显示设置内容组件 / Display settings content component
 *
 * 提供显示相关的配置选项，包括主题、缩放比例和 OPL 外观主题。
 * Provides display-related configuration options including theme, zoom scale and OPL appearance theme.
 *
 * @features
 * - 主题切换：亮色/暗色/跟随系统 / Theme: light/dark/system
 * - 缩放比例控制 / Zoom scale control
 * - OPL 主题配置 / OPL theme profile
 */
const DisplayModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // 显示设置项配置 / Display items configuration
  const displayItems = [
    { key: 'theme', label: t('settings.theme'), component: <ThemeSwitcher /> },
    {
      key: 'oplTheme',
      label: t('settings.appearancePage.visualTheme'),
      component: <OplThemeProfileSwitcher />,
    },
    { key: 'fontSize', label: t('settings.fontSize'), component: <FontSizeControl /> },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      {/* 内容区域 / Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* 显示设置 / Display Settings */}
          <div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px space-y-10px md:space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {displayItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default DisplayModalContent;
