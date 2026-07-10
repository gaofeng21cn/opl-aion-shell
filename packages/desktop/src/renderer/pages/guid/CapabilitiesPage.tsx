/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { ArrowLeft, Right } from '@icon-park/react';
import React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { resolveLocaleKey } from '@/common/utils';
import { resolveOplHomeAssistants } from './utils/oplHomeAssistants';

const CapabilitiesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const localeKey = resolveLocaleKey(i18n.language);
  const capabilities = useMemo(() => resolveOplHomeAssistants([]), []);

  return (
    <main className='h-full overflow-y-auto bg-1'>
      <div className='mx-auto w-full max-w-760px box-border px-24px py-24px'>
        <header className='mb-16px flex items-start gap-8px'>
          <Button
            type='text'
            shape='circle'
            aria-label={t('common.back')}
            icon={<ArrowLeft theme='outline' size='16' fill='currentColor' />}
            onClick={() => void navigate('/guid')}
          />
          <div className='min-w-0'>
            <h1 className='m-0 text-20px leading-28px font-semibold text-t-primary'>{t('guid.capabilities.title')}</h1>
            <p className='m-0 mt-4px text-13px leading-20px text-t-secondary'>{t('guid.capabilities.description')}</p>
          </div>
        </header>

        <div className='border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'>
          {capabilities.map((capability) => {
            const name = capability.name_i18n?.[localeKey] || capability.name;
            const description = capability.description_i18n?.[localeKey] || capability.description || '';
            return (
              <Button
                key={capability.id}
                type='text'
                className='!w-full !h-auto !min-h-56px !px-8px !py-8px !rd-0 !justify-start !border-b !border-solid !border-[var(--color-border-2)] !border-t-0 !border-l-0 !border-r-0 !bg-transparent hover:!bg-fill-2'
                onClick={() =>
                  void navigate('/guid', {
                    state: { selectedCapabilityId: capability.id },
                  })
                }
                data-testid={`capability-${capability.id}`}
              >
                <span className='size-30px shrink-0 flex-center text-13px font-semibold text-t-primary'>
                  {capability.avatar || name.slice(0, 2)}
                </span>
                <span className='min-w-0 flex-1 text-left'>
                  <span className='block text-14px leading-20px font-[500] text-t-primary'>{name}</span>
                  <span className='block mt-2px text-12px leading-18px text-t-secondary whitespace-normal'>
                    {description}
                  </span>
                </span>
                <Right theme='outline' size='14' fill='currentColor' className='shrink-0 text-t-tertiary' />
              </Button>
            );
          })}
        </div>
      </div>
    </main>
  );
};

export default CapabilitiesPage;
