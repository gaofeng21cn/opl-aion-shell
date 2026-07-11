/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import ScaleControl from '@/renderer/components/settings/ScaleControl';
import FontSizeStepper from '@/renderer/components/settings/FontSizeStepper';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import CssThemeSettings from '@renderer/pages/settings/AppearanceSettings/CssThemeSettings';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { FONT_SIZE_KEYS, FONT_SIZE_SPECS, FONT_SIZE_STEP, type FontSizeKey } from '@/common/config/fontSizes';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import PersonalPreferenceSettings from './SystemModalContent/PersonalPreferenceSettings';
import { useSettingsViewMode } from '../settingsViewContext';

/** Map each configurable font-size region to its row label i18n key. */
const FONT_SIZE_LABEL_KEY: Record<FontSizeKey, string> = {
  chat: 'settings.fontSizeChat',
  markdown: 'settings.fontSizeMarkdown',
  code: 'settings.fontSizeCode',
};

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
  <div className='opl-settings-row flex min-w-0 flex-col items-stretch gap-10px md:flex-row md:items-center md:justify-between md:gap-24px'>
    <div className='opl-settings-row__main min-w-0 text-14px text-t-primary leading-22px'>{label}</div>
    <div className='opl-settings-row__meta flex min-w-0 w-full md:flex-1 md:justify-end'>{children}</div>
  </div>
);

/**
 * 偏好设置内容组件 / Preferences content component
 *
 * 提供普通偏好配置，包括界面行为、显示字体和主题外观
 * Provides ordinary preferences including interface behavior, display fonts, and theme appearance
 *
 * @features
 * - 缩放比例控制 / Zoom scale control
 */
const AppearanceModalContent: React.FC = () => {
  const { t } = useTranslation();
  const { fontSizes, setFontSize } = useThemeContext();
  const isPageMode = useSettingsViewMode() === 'page';

  return (
    <div className='opl-settings-page flex flex-col h-full w-full' data-testid='settings-page-preferences'>
      {/* 内容区域 / Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-14px'>
          <div className='opl-settings-page-header'>
            <div className='opl-settings-page-header__copy'>
              <Typography.Title heading={4}>{t('settings.personalPreferencesTitle')}</Typography.Title>
              <Typography.Text>{t('settings.personalPreferencesDesc')}</Typography.Text>
            </div>
          </div>

          <div className='space-y-12px' data-testid='appearance-behavior-layer'>
            <PersonalPreferenceSettings />
          </div>

          <section className='opl-settings-section' id='display' data-testid='preferences-display-section'>
            <div className='opl-settings-section__header'>
              <div className='text-14px font-medium text-t-primary leading-22px'>
                {t('settings.appearancePreferencesTitle')}
              </div>
              <div className='text-12px text-t-tertiary mt-4px'>{t('settings.appearancePreferencesDesc')}</div>
            </div>
            <div className='opl-settings-list'>
              <PreferenceRow label={t('settings.language')}>
                <LanguageSwitcher />
              </PreferenceRow>
              {FONT_SIZE_KEYS.map((key) => (
                <PreferenceRow key={key} label={t(FONT_SIZE_LABEL_KEY[key])}>
                  <FontSizeStepper
                    value={fontSizes[key]}
                    min={FONT_SIZE_SPECS[key].min}
                    max={FONT_SIZE_SPECS[key].max}
                    step={FONT_SIZE_STEP}
                    defaultValue={FONT_SIZE_SPECS[key].default}
                    resetLabel={t('settings.fontSizeStepperReset')}
                    onChange={(px) => void setFontSize(key, px)}
                  />
                </PreferenceRow>
              ))}
              <PreferenceRow label={t('settings.scale')}>
                <ScaleControl />
              </PreferenceRow>
            </div>
          </section>

          <section className='opl-settings-section' id='themes' data-testid='preferences-theme-section'>
            <div className='opl-settings-section__header'>
              <div className='text-14px font-medium text-t-primary leading-22px'>{t('settings.theme')}</div>
            </div>
            <div className='pb-2px'>
              <CssThemeSettings />
            </div>
          </section>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default AppearanceModalContent;
