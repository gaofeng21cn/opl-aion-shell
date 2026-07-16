/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { canonicalizeOplProfessionalAgentId } from '@/common/config/oplProductProfile';
import { Button } from '@arco-design/web-react';
import { BookOpen, ChartHistogram, CheckOne, Flask, Microscope, WritingFluently } from '@icon-park/react';
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

function starterIcon(packageId: string): React.ReactNode {
  const props = { theme: 'outline' as const, size: 16, fill: 'currentColor' };
  switch (canonicalizeOplProfessionalAgentId(packageId)) {
    case 'mas':
      return <Microscope {...props} />;
    case 'mag':
      return <Flask {...props} />;
    case 'rca':
      return <ChartHistogram {...props} />;
    case 'obf':
      return <BookOpen {...props} />;
    default:
      return <WritingFluently {...props} />;
  }
}

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
    <section className={styles.homeStarters} aria-label={t('guid.home.startersLabel')} data-testid='opl-home-starters'>
      <div className={styles.homeStarterGrid}>
        {starters.map((assistant) => {
          const label = assistant.name_i18n?.[localeKey] || assistant.name;
          const active = assistant.id === activeCapabilityId;
          const launchGate = resolveOplPackageLaunchGate(appState, assistant.id);
          const launchReady = launchGate.launchAllowed !== false;
          const blockedTitle = !launchReady
            ? t('guid.home.launchBlocked', {
                reason: launchGate.launchBlockedReason ?? t('guid.home.operationalNotReady'),
                actions: launchGate.allowedWhenBlocked.join(', '),
              })
            : undefined;
          return (
            <Button
              key={assistant.id}
              type='text'
              className={classNames(styles.homeStarter, active && styles.homeStarterActive)}
              onClick={() => (active && onClear ? onClear() : onSelect(assistant.id))}
              title={blockedTitle}
              aria-pressed={active}
              data-opl-active={String(active)}
              data-opl-launch-ready={String(launchGate.launchAllowed !== false)}
              data-testid={`home-starter-${assistant.id}`}
            >
              <span
                className='mr-7px inline-flex h-16px w-16px shrink-0 items-center justify-center text-t-secondary'
                data-testid={`starter-icon-${assistant.id}`}
                aria-hidden='true'
              >
                {starterIcon(assistant.id)}
              </span>
              <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
              {active ? (
                <span className='inline-flex shrink-0' data-testid='starter-active-check' aria-hidden='true'>
                  <CheckOne theme='filled' size={14} fill='currentColor' />
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </section>
  );
};

export default HomeStarters;
