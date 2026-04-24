import { ConfigStorage } from '@/common/config/storage';
import { Button, Message, Tag, Typography } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import { DEFAULT_THEME_ID } from './DisplaySettings/presets';
import { resolveCssByActiveTheme } from '@renderer/utils/theme/themeCssSync';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const OPL_CODEX_THEME_ID = 'opl-codex-shell';

type OplThemeChoice = {
  id: string;
  labelKey: string;
  descriptionKey: string;
};

const OPL_THEME_CHOICES: OplThemeChoice[] = [
  {
    id: OPL_CODEX_THEME_ID,
    labelKey: 'settings.oplAppearance.codexStyle',
    descriptionKey: 'settings.oplAppearance.codexStyleDescription',
  },
  {
    id: DEFAULT_THEME_ID,
    labelKey: 'settings.oplAppearance.aionDefault',
    descriptionKey: 'settings.oplAppearance.aionDefaultDescription',
  },
];

const dispatchCustomCssUpdated = (css: string) => {
  window.dispatchEvent(new CustomEvent('custom-css-updated', { detail: { customCss: css } }));
};

const OplAppearanceThemeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [activeThemeId, setActiveThemeId] = useState(OPL_CODEX_THEME_ID);
  const [applyingThemeId, setApplyingThemeId] = useState<string | null>(null);

  useEffect(() => {
    ConfigStorage.get('css.activeThemeId')
      .then((themeId) => setActiveThemeId(themeId || OPL_CODEX_THEME_ID))
      .catch(() => setActiveThemeId(OPL_CODEX_THEME_ID));
  }, []);

  const applyTheme = useCallback(
    async (themeId: string) => {
      const css = resolveCssByActiveTheme(themeId, []);
      setApplyingThemeId(themeId);
      try {
        await Promise.all([ConfigStorage.set('customCss', css), ConfigStorage.set('css.activeThemeId', themeId)]);
        setActiveThemeId(themeId);
        dispatchCustomCssUpdated(css);
        Message.success(t('settings.oplAppearance.applied'));
      } catch (error) {
        console.error('Failed to apply OPL appearance theme:', error);
        Message.error(t('settings.oplAppearance.applyFailed'));
      } finally {
        setApplyingThemeId(null);
      }
    },
    [t]
  );

  return (
    <div className='grid gap-12px grid-cols-1 md:grid-cols-2'>
      {OPL_THEME_CHOICES.map((choice) => {
        const active = activeThemeId === choice.id || (!activeThemeId && choice.id === OPL_CODEX_THEME_ID);
        return (
          <div
            key={choice.id}
            role='button'
            tabIndex={0}
            className={`text-left rounded-14px border border-solid p-14px transition-colors bg-fill-0 hover:bg-fill-1 ${active ? 'border-[var(--color-primary)]' : 'border-[var(--border-base)]'}`}
            onClick={() => void applyTheme(choice.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                void applyTheme(choice.id);
              }
            }}
          >
            <div className='flex items-start justify-between gap-12px'>
              <div className='min-w-0'>
                <Typography.Text className='font-600 text-t-primary'>{t(choice.labelKey)}</Typography.Text>
                <Typography.Paragraph className='text-13px text-t-secondary mt-6px mb-0'>
                  {t(choice.descriptionKey)}
                </Typography.Paragraph>
              </div>
              {active ? (
                <Tag color='arcoblue' icon={<CheckOne theme='filled' />}>
                  {t('settings.oplAppearance.active')}
                </Tag>
              ) : (
                <Button
                  size='mini'
                  loading={applyingThemeId === choice.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void applyTheme(choice.id);
                  }}
                >
                  {t('settings.oplAppearance.apply')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OplAppearanceThemeSettings;
