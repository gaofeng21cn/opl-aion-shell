/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { canonicalizeOplProfessionalAgentId } from '@/common/config/oplProductProfile';
import { Button } from '@arco-design/web-react';
import { faCheck, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';
import React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getOplHomePurposeAssistantIds } from '../utils/oplHomeAssistants';
import { resolveOplPackageLaunchGate } from '../utils/oplHomeAssistants';
import { useOplHomeShortcutPreferences } from '../utils/oplHomeShortcutPreferences';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import styles from '../index.module.css';

type HomeStartersProps = {
  assistants: Assistant[];
  localeKey: string;
  activeCapabilityId?: string;
  onSelect: (assistantId: string) => void;
  onClear?: () => void;
};

const HomeStarters: React.FC<HomeStartersProps> = ({
  assistants,
  localeKey,
  activeCapabilityId,
  onSelect,
  onClear,
}) => {
  const { t } = useTranslation();
  const shortcutPreferences = useOplHomeShortcutPreferences();
  const { appState } = useOplAppState('fast');
  const starters = useMemo(() => {
    const allowedIds = new Set(getOplHomePurposeAssistantIds());
    const available = assistants.filter((assistant) =>
      allowedIds.has(canonicalizeOplProfessionalAgentId(assistant.id))
    );
    return available;
  }, [activeCapabilityId, assistants, shortcutPreferences]);

  if (starters.length === 0) return null;

  return (
    <section className='mb-12px' aria-label={t('guid.home.startersLabel')} data-testid='opl-home-starters'>
      <div className='grid grid-cols-2 gap-x-8px gap-y-2px'>
        {starters.map((assistant) => {
          const label = assistant.name_i18n?.[localeKey] || assistant.name;
          const active = assistant.id === activeCapabilityId;
          const launchGate = resolveOplPackageLaunchGate(appState, assistant.id);
          const launchBlocked = launchGate.launchAllowed === false && !launchGate.activationRequired;
          const blockedTitle = launchBlocked
            ? t('guid.home.launchBlocked', {
                reason: launchGate.launchBlockedReason ?? t('guid.home.operationalNotReady'),
                actions: launchGate.allowedWhenBlocked.join(', '),
              })
            : undefined;
          return (
            <Button
              key={assistant.id}
              type='text'
              className={classNames(
                '!h-36px !w-full !justify-start !border !border-transparent !bg-transparent !px-8px !rd-6px !text-13px !text-t-secondary hover:!border-border-1 hover:!bg-fill-2',
                active && styles.homeStarterActive
              )}
              onClick={() => (active && onClear ? onClear() : onSelect(assistant.id))}
              disabled={launchBlocked}
              title={blockedTitle}
              aria-pressed={active}
              data-opl-active={String(active)}
              data-testid={`home-starter-${assistant.id}`}
            >
              <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
              {active ? (
                <FontAwesomeIcon
                  icon={faCheck}
                  className='shrink-0 text-13px'
                  data-testid='starter-active-check'
                  aria-hidden='true'
                />
              ) : (
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className='shrink-0 text-12px text-t-tertiary'
                  aria-hidden='true'
                />
              )}
            </Button>
          );
        })}
      </div>
    </section>
  );
};

export default HomeStarters;
