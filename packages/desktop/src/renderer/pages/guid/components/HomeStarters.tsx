/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { canonicalizeOplProfessionalAgentId } from '@/common/config/oplProductProfile';
import { Button } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getOplHomePurposeAssistantIds } from '../utils/oplHomeAssistants';

type HomeStartersProps = {
  assistants: Assistant[];
  localeKey: string;
  activeCapabilityId?: string;
  onSelect: (assistantId: string) => void;
};

const MAX_HOME_STARTERS = 4;

const HomeStarters: React.FC<HomeStartersProps> = ({ assistants, localeKey, activeCapabilityId, onSelect }) => {
  const { t } = useTranslation();
  const starters = useMemo(() => {
    const allowedIds = new Set(getOplHomePurposeAssistantIds());
    return assistants
      .filter((assistant) => allowedIds.has(canonicalizeOplProfessionalAgentId(assistant.id)))
      .slice(0, MAX_HOME_STARTERS);
  }, [assistants]);

  if (starters.length === 0) return null;

  return (
    <section className='mb-12px' aria-label={t('guid.home.startersLabel')} data-testid='opl-home-starters'>
      <div className='grid grid-cols-2 gap-x-8px gap-y-2px'>
        {starters.map((assistant) => {
          const label = assistant.name_i18n?.[localeKey] || assistant.name;
          const active = assistant.id === activeCapabilityId;
          return (
            <Button
              key={assistant.id}
              type='text'
              className={`!h-36px !w-full !justify-start !px-8px !rd-6px !text-13px ${
                active ? '!bg-fill-2 !text-t-primary' : '!bg-transparent !text-t-secondary hover:!bg-fill-2'
              }`}
              onClick={() => onSelect(assistant.id)}
              data-testid={`home-starter-${assistant.id}`}
            >
              <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
              <Right theme='outline' size='12' fill='currentColor' className='shrink-0 text-t-tertiary' />
            </Button>
          );
        })}
      </div>
    </section>
  );
};

export default HomeStarters;
