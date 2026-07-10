/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WorkspaceGroupedHistory from './index';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ArchivedPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <main className='h-full overflow-y-auto bg-1'>
      <div className='mx-auto w-full max-w-720px box-border px-24px py-24px'>
        <header className='mb-16px'>
          <h1 className='m-0 text-20px leading-28px font-semibold text-t-primary'>
            {t('conversation.history.archivedTitle')}
          </h1>
          <p className='m-0 mt-4px text-13px leading-20px text-t-secondary'>
            {t('conversation.history.archivedDescription')}
          </p>
        </header>
        <WorkspaceGroupedHistory archived />
      </div>
    </main>
  );
};

export default ArchivedPage;
