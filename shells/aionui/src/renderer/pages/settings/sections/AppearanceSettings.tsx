import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Message, Typography } from '@arco-design/web-react';
import { ConfigStorage } from '@/common/config/storage';
import {
  dispatchOplBrandNameChanged,
  normalizeOplBrandName,
  OPL_DEFAULT_BRAND_NAME,
} from '@/renderer/hooks/system/useOplBrandName';
import DisplayModalContent from '@/renderer/components/settings/SettingsModal/contents/DisplayModalContent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import OplAppearanceThemeSettings from '../OplAppearanceThemeSettings';
import { PetSettingsContent } from '../PetSettings';
import SettingRow from './SettingRow';

const AppearanceSettings: React.FC = () => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const [brandName, setBrandName] = useState(OPL_DEFAULT_BRAND_NAME);

  useEffect(() => {
    ConfigStorage.get('opl.brandName')
      .then((value) => setBrandName(normalizeOplBrandName(value)))
      .catch(() => setBrandName(OPL_DEFAULT_BRAND_NAME));
  }, []);

  const saveBrandName = useCallback(() => {
    const normalized = normalizeOplBrandName(brandName);
    setBrandName(normalized);
    ConfigStorage.set('opl.brandName', normalized)
      .then(() => {
        dispatchOplBrandNameChanged();
        message.success(t('settings.appearancePage.messages.brandNameSaved'));
      })
      .catch(() => message.error(t('settings.appearancePage.messages.brandNameSaveFailed')));
  }, [brandName, message, t]);

  return (
    <SettingsPageWrapper contentClassName='md:max-w-920px'>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.appearancePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.appearancePage.description')}</Typography.Text>
        </div>

        <div className='rounded-10px border border-solid border-border-1 bg-bg-1 divide-y divide-border-1 overflow-hidden'>
          <SettingRow
            title={t('settings.appearancePage.brandTitle')}
            description={t('settings.appearancePage.brandDescription')}
          >
            <Input
              value={brandName}
              placeholder={OPL_DEFAULT_BRAND_NAME}
              onChange={setBrandName}
              onBlur={saveBrandName}
              onPressEnter={saveBrandName}
            />
          </SettingRow>

          <SettingRow
            title={t('settings.appearancePage.themeTitle')}
            description={t('settings.appearancePage.themeDescription')}
          >
            <OplAppearanceThemeSettings />
          </SettingRow>
        </div>

        <DisplayModalContent />
        <PetSettingsContent />
      </div>
    </SettingsPageWrapper>
  );
};

export default AppearanceSettings;
