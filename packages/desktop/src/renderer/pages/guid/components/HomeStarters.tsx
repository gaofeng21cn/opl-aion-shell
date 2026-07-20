/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { canonicalizeOplProfessionalAgentId } from '@/common/config/oplProductProfile';
import { Button } from '@arco-design/web-react';
import { BookOpen, Microscope, Robot, Slide, Write } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';
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

const STARTER_LABEL_KEYS: Record<string, string> = {
  mas: 'guid.uiOptimization.home.shortcuts.research',
  rca: 'guid.uiOptimization.home.shortcuts.presentation',
  mag: 'guid.uiOptimization.home.shortcuts.grant',
  obf: 'guid.uiOptimization.home.shortcuts.book',
  oma: 'guid.uiOptimization.home.shortcuts.agentEngineering',
};

function starterIcon(packageId: string): React.ReactNode {
  switch (canonicalizeOplProfessionalAgentId(packageId)) {
    case 'mas':
      return <Microscope {...OPL_CHROME_ICON_PROPS} />;
    case 'mag':
      return <Write {...OPL_CHROME_ICON_PROPS} />;
    case 'rca':
      return <Slide {...OPL_CHROME_ICON_PROPS} />;
    case 'obf':
      return <BookOpen {...OPL_CHROME_ICON_PROPS} />;
    default:
      return <Robot {...OPL_CHROME_ICON_PROPS} />;
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
          const packageId = canonicalizeOplProfessionalAgentId(assistant.id);
          const labelKey = STARTER_LABEL_KEYS[packageId];
          const label = labelKey ? t(labelKey) : assistant.name_i18n?.[localeKey] || assistant.name;
          const active = assistant.id === activeCapabilityId;
          const launchGate = resolveOplPackageLaunchGate(appState, assistant.id);
          const launchReady = launchGate.state !== 'package_unavailable';
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
              data-opl-launch-ready={String(launchReady)}
              data-testid={`home-starter-${assistant.id}`}
            >
              <span className={styles.homeStarterIcon} data-testid={`starter-icon-${assistant.id}`} aria-hidden='true'>
                {starterIcon(assistant.id)}
              </span>
              <span className={styles.homeStarterLabel}>{label}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
};

export default HomeStarters;
