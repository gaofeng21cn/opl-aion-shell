import { Button } from '@arco-design/web-react';
import AionSelect from '@/renderer/components/base/AionSelect';
import type { SelectHandle } from '@arco-design/web-react/es/Select/interface';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/renderer/services/i18n';
import { isSameLanguageCode, LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from '@/common/config/i18n';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();
  const selectRef = useRef<SelectHandle>(null);
  const pending = useRef(false);
  const requestedLanguage = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error' | null>(null);

  const handleLanguageChange = useCallback(
    (value: string) => {
      if (pending.current || (saveState !== 'error' && isSameLanguageCode(i18n.language, value))) return;
      requestedLanguage.current = value;
      pending.current = true;
      setSaveState('saving');

      // 切换前先 blur 触发元素，避免弹层和语言切换竞争布局
      // Blur before switching to avoid dropdown and language change fighting for layout
      selectRef.current?.blur?.();

      const applyLanguage = () => {
        (saveState === 'error' ? changeLanguage(value, { retryPersistence: true }) : changeLanguage(value))
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
          .finally(() => {
            pending.current = false;
          });
      };

      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        // 延迟到下一帧执行，确保 DOM 动画已完成 / defer to next frame so DOM animations finish
        window.requestAnimationFrame(() => window.requestAnimationFrame(applyLanguage));
      } else {
        setTimeout(applyLanguage, 0);
      }
    },
    [i18n.language, saveState]
  );

  return (
    <div className='flex flex-col gap-4px'>
      <AionSelect
        disabled={saveState === 'saving'}
        ref={selectRef}
        className='w-160px'
        value={i18n.language}
        onChange={handleLanguageChange}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <AionSelect.Option key={language} value={language}>
            {LANGUAGE_LABELS[language] ?? language}
          </AionSelect.Option>
        ))}
      </AionSelect>
      {saveState === 'error' && (
        <Button
          size='mini'
          type='text'
          onClick={() => handleLanguageChange(requestedLanguage.current ?? i18n.language)}
        >
          {t('settings.preferenceSave.retry', { defaultValue: 'Retry' })}
        </Button>
      )}
      {saveState && (
        <span role='status' className='text-12px text-t-secondary'>
          {saveState === 'saving'
            ? t('settings.preferenceSave.saving', { defaultValue: 'Saving…' })
            : saveState === 'saved'
              ? t('settings.preferenceSave.saved', { defaultValue: 'Saved' })
              : t('settings.preferenceSave.languageError', { defaultValue: 'Could not save language. Try again.' })}
        </span>
      )}
    </div>
  );
};

export default LanguageSwitcher;
