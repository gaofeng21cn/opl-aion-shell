/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Space, Typography } from '@arco-design/web-react';
import { CheckOne, Earth, Lightning, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type OverviewSettingsProps = {
  withWrapper?: boolean;
};

const OverviewSettings: React.FC<OverviewSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cards = [
    {
      key: 'codex',
      title: t('settings.overviewPage.codexTitle'),
      value: t('settings.overviewPage.codexDescription'),
      icon: <Toolkit theme='outline' />,
      route: '/settings/runtime',
    },
    {
      key: 'workspace',
      title: t('settings.overviewPage.workspaceTitle'),
      value: t('settings.overviewPage.workspaceDescription'),
      icon: <CheckOne theme='outline' />,
      route: '/settings/runtime#workspace',
    },
    {
      key: 'modules',
      title: t('settings.overviewPage.modulesTitle'),
      value: t('settings.overviewPage.modulesDescription'),
      icon: <Lightning theme='outline' />,
      route: '/settings/runtime#modules',
    },
    {
      key: 'remote',
      title: t('settings.overviewPage.accessTitle'),
      value: t('settings.overviewPage.accessDescription'),
      icon: <Earth theme='outline' />,
      route: '/settings/access',
    },
  ];

  const content = (
    <div className='flex flex-col gap-16px'>
      <div>
        <Typography.Title heading={4} className='mb-6px'>
          {t('settings.overviewPage.title')}
        </Typography.Title>
        <Typography.Text className='text-t-secondary'>{t('settings.overviewPage.description')}</Typography.Text>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
        {cards.map((card) => (
          <Card key={card.key} bordered className='rd-8px'>
            <div className='flex items-start justify-between gap-14px'>
              <div className='min-w-0'>
                <div className='flex items-center gap-8px mb-8px'>
                  <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                    {card.icon}
                  </span>
                  <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
                </div>
                <Typography.Text className='block text-13px text-t-secondary break-words'>{card.value}</Typography.Text>
              </div>
              <Button size='small' onClick={() => navigate(card.route)}>
                {t('common.open', { defaultValue: 'Open' })}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card bordered className='rd-8px'>
        <div className='flex flex-col gap-12px'>
          <Typography.Text className='font-600 text-t-primary'>
            {t('settings.overviewPage.maintenanceTitle')}
          </Typography.Text>
          <Typography.Text className='text-t-secondary'>
            {t('settings.overviewPage.maintenanceDescription')}
          </Typography.Text>
          <Space wrap>
            <Button type='primary' onClick={() => navigate('/runtime')}>
              {t('settings.overviewPage.actions.openRuntimeStatus')}
            </Button>
            <Button onClick={() => navigate('/settings/runtime')}>
              {t('settings.overviewPage.actions.openRuntimeSettings')}
            </Button>
            <Button onClick={() => navigate('/settings/capabilities')}>
              {t('settings.overviewPage.actions.openFoundryAgents')}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper contentClassName='max-w-1080px'>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
