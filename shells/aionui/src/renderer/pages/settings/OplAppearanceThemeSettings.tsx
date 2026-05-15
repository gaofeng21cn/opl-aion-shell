import { ConfigStorage } from '@/common/config/storage';
import { Message, Radio } from '@arco-design/web-react';
import { DEFAULT_THEME_ID } from './DisplaySettings/presets';
import { resolveCssByActiveTheme } from '@renderer/utils/theme/themeCssSync';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const OPL_CODEX_THEME_ID = 'opl-codex-shell';

type OplThemeChoice = {
  id: string;
  labelKey: string;
};

const OPL_THEME_CHOICES: OplThemeChoice[] = [
  {
    id: OPL_CODEX_THEME_ID,
    labelKey: 'settings.oplAppearance.codexStyle',
  },
  {
    id: DEFAULT_THEME_ID,
    labelKey: 'settings.oplAppearance.aionDefault',
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
    <Radio.Group
      type='button'
      size='small'
      mode='outline'
      value={activeThemeId || OPL_CODEX_THEME_ID}
      disabled={Boolean(applyingThemeId)}
      options={OPL_THEME_CHOICES.map((choice) => ({ label: t(choice.labelKey), value: choice.id }))}
      onChange={(themeId) => void applyTheme(String(themeId))}
    />
  );
};

export default OplAppearanceThemeSettings;
