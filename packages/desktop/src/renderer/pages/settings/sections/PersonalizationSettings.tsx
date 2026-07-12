import React from 'react';
import { Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import OplPersonalizationSettings from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

export const PersonalizationSettingsContent: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='opl-settings-page flex flex-col gap-14px' data-testid='settings-page-personalization'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>{t('settings.personalization.pageTitle')}</Typography.Title>
          <Typography.Text>{t('settings.personalization.pageDescription')}</Typography.Text>
        </div>
      </header>
      <div data-testid='settings-personalization-primary'>
        <OplPersonalizationSettings />
      </div>
    </div>
  );
};

const PersonalizationSettings: React.FC = () => (
  <SettingsPageWrapper>
    <PersonalizationSettingsContent />
  </SettingsPageWrapper>
);

export default PersonalizationSettings;
