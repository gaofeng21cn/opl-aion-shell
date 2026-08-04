/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spin, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const BackendStartingView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      className='min-h-screen bg-bg-1 flex flex-col items-center justify-center gap-16px'
      data-testid='backend-starting-view'
    >
      <Spin size={28} />
      <div className='text-center px-24px max-w-480px'>
        <Typography.Title heading={5} className='mb-8px text-t-1'>
          {t('common.backendStartup.pendingSlow.title')}
        </Typography.Title>
        <Typography.Paragraph className='mb-0 text-t-secondary' data-testid='backend-starting-description'>
          {t('common.backendStartup.pendingSlow.description')}
        </Typography.Paragraph>
      </div>
    </div>
  );
};

export default BackendStartingView;
