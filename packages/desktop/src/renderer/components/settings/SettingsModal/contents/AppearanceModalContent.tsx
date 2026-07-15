/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { Text } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import ScaleControl from '@/renderer/components/settings/ScaleControl';
import FontSizeStepper from '@/renderer/components/settings/FontSizeStepper';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { FONT_SIZE_KEYS, FONT_SIZE_SPECS, FONT_SIZE_STEP, type FontSizeKey } from '@/common/config/fontSizes';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import type { ThemeAppearanceMode } from '@/common/theme/types';
import PersonalPreferenceSettings from './SystemModalContent/PersonalPreferenceSettings';
import { useSettingsViewMode } from '../settingsViewContext';

/** Map each configurable font-size region to its row label i18n key. */
const FONT_SIZE_LABEL_KEY: Record<FontSizeKey, string> = {
  chat: 'settings.fontSizeChat',
  markdown: 'settings.fontSizeMarkdown',
  code: 'settings.fontSizeCode',
};

const APPEARANCE_MODES: ThemeAppearanceMode[] = ['system', 'light', 'dark'];

const AppearanceModePreview: React.FC<{ mode: ThemeAppearanceMode }> = ({ mode }) => (
  <span
    aria-hidden='true'
    className={`relative block aspect-[1.48] w-full overflow-hidden rounded-7px border border-solid border-black/10 ${
      mode === 'light' ? 'bg-[#f2f2f2]' : mode === 'dark' ? 'bg-[#565656]' : 'bg-[#a8a8a8]'
    }`}
  >
    {mode === 'system' && <span className='absolute inset-y-0 right-0 w-1/2 bg-[#4f4f4f]' />}
    <span
      className={`absolute bottom-[10%] left-[11%] right-[11%] top-[35%] overflow-hidden rounded-5px shadow-sm ${mode === 'dark' ? 'bg-[#f7f7f7]' : 'bg-white'}`}
    >
      {mode === 'system' && <span className='absolute inset-y-0 right-0 w-1/2 bg-[#626262]' />}
      <span className='absolute left-[12%] top-[24%] h-4px w-[42%] rounded-full bg-[#d2d2d2]' />
      <span className='absolute left-[12%] top-[47%] h-4px w-[66%] rounded-full bg-[#dedede]' />
      <span className='absolute left-[12%] top-[70%] h-4px w-[52%] rounded-full bg-[#e5e5e5]' />
    </span>
    <span className='absolute left-1/2 top-[20%] h-4px w-[28%] -translate-x-1/2 rounded-full bg-[#c7c7c7]' />
  </span>
);

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
  <div className='opl-settings-row'>
    <div className='opl-settings-row__main min-w-0 text-14px text-t-primary leading-22px'>{label}</div>
    <div className='opl-settings-row__meta w-full md:w-240px'>{children}</div>
  </div>
);

const SectionHeading: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
}> = ({ icon, title, description }) => (
  <div className='opl-settings-section__header'>
    <div className='flex min-w-0 items-start gap-12px'>
      <span className='flex h-28px w-28px shrink-0 items-center justify-center rounded-6px bg-fill-2 text-t-secondary'>
        {icon}
      </span>
      <div className='min-w-0'>
        <div className='text-14px font-medium text-t-primary leading-22px'>{title}</div>
        {description && <div className='mt-2px text-12px text-t-tertiary leading-18px'>{description}</div>}
      </div>
    </div>
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
  const { appearanceMode, setAppearanceMode, fontSizes, setFontSize } = useThemeContext();
  const isPageMode = useSettingsViewMode() === 'page';

  const selectAppearanceMode = (mode: ThemeAppearanceMode) => {
    void setAppearanceMode(mode);
  };

  const handleAppearanceModeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % APPEARANCE_MODES.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + APPEARANCE_MODES.length) % APPEARANCE_MODES.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = APPEARANCE_MODES.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextMode = APPEARANCE_MODES[nextIndex];
    selectAppearanceMode(nextMode);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-testid="appearance-mode-${nextMode}"]`)?.focus();
    });
  };

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

          <div className='flex min-w-0 flex-col gap-12px' data-testid='preferences-card-grid'>
            <PersonalPreferenceSettings />

            <section className='opl-settings-section' id='display' data-testid='preferences-display-section'>
              <span id='display-fonts' aria-hidden='true' />
              <SectionHeading
                icon={<Text theme='outline' size='16' />}
                title={t('settings.appearancePreferencesTitle')}
                description={t('settings.appearancePreferencesDesc')}
              />
              <div className='border-t border-solid border-[var(--border-base)] px-16px py-14px'>
                <span id='themes' aria-hidden='true' />
                <div className='mb-10px text-14px font-medium text-t-primary'>{t('settings.appearanceMode')}</div>
                <div
                  role='radiogroup'
                  aria-label={t('settings.appearanceMode')}
                  className='grid grid-cols-3 gap-12px'
                  data-testid='appearance-mode-selector'
                >
                  {APPEARANCE_MODES.map((mode, index) => {
                    const selected = appearanceMode === mode;
                    const label = t(
                      mode === 'system'
                        ? 'settings.systemMode'
                        : mode === 'light'
                          ? 'settings.lightMode'
                          : 'settings.darkMode'
                    );
                    return (
                      <Button
                        key={mode}
                        type='text'
                        htmlType='button'
                        role='radio'
                        aria-checked={selected}
                        aria-label={label}
                        tabIndex={selected ? 0 : -1}
                        data-testid={`appearance-mode-${mode}`}
                        className='group !block !h-auto !w-full !min-w-0 !border-0 !bg-transparent !p-0 !text-center !text-t-secondary focus-visible:!outline-none'
                        onClick={() => selectAppearanceMode(mode)}
                        onKeyDown={(event) => handleAppearanceModeKeyDown(event, index)}
                      >
                        <span
                          className={`block rounded-8px border-2 border-solid p-2px transition-colors ${
                            selected
                              ? 'border-[var(--color-text-1)]'
                              : 'border-transparent group-hover:border-[var(--color-border-3)]'
                          } group-focus-visible:border-[var(--color-primary)]`}
                        >
                          <AppearanceModePreview mode={mode} />
                        </span>
                        <span className={`mt-7px block text-13px leading-18px ${selected ? 'text-t-primary' : ''}`}>
                          {label}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className='opl-settings-list border-t border-solid border-[var(--border-base)]'>
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
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default AppearanceModalContent;
