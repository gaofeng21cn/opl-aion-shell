/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';
import { resolveOplPackageLaunchGate, type OplHomeAssistant } from '../utils/oplHomeAssistants';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import styles from '../index.module.css';

type HomeStartersProps = {
  assistants: OplHomeAssistant[];
  localeKey: string;
  activeCapabilityId?: string;
  activeShortcutId?: string;
  onSelect: (assistantId: string) => void;
  onClear?: () => void;
};

function starterIcon(): React.ReactNode {
  return <Robot {...OPL_CHROME_ICON_PROPS} />;
}

const HomeStarters: React.FC<HomeStartersProps> = ({
  assistants,
  localeKey,
  activeCapabilityId,
  activeShortcutId,
  onSelect,
  onClear,
}) => {
  const { t } = useTranslation();
  const { appState } = useOplAppState('fast');
  const starters = assistants;

  if (starters.length === 0) return null;

  return (
    <section className={styles.homeStarters} aria-label={t('guid.home.startersLabel')} data-testid='opl-home-starters'>
      <div className={styles.homeStarterGrid}>
        {starters.map((assistant) => {
          const label = assistant.name_i18n?.[localeKey] || assistant.name;
          const active =
            assistant.opl_package_id === activeCapabilityId && assistant.opl_shortcut_id === activeShortcutId;
          const launchGate = resolveOplPackageLaunchGate(appState, assistant.opl_package_id);
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
              onClick={() => (active && onClear ? onClear() : onSelect(assistant.opl_shortcut_id))}
              title={blockedTitle}
              aria-pressed={active}
              data-opl-active={String(active)}
              data-opl-launch-ready={String(launchReady)}
              data-opl-package-id={assistant.opl_package_id}
              data-testid={`home-starter-${assistant.opl_shortcut_id}`}
            >
              <span
                className={styles.homeStarterIcon}
                data-testid={`starter-icon-${assistant.opl_shortcut_id}`}
                aria-hidden='true'
              >
                {starterIcon()}
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
