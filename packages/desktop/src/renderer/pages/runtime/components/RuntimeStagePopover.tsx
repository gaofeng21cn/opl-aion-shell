import { Button, Popover, Tag, Typography } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import {
  currentStageLabel,
  executionStateLabel,
  stageDisplayName,
  stageStateLabel,
  type RuntimeTranslate,
} from '../formatters';
import type { RuntimeWorkItem } from '../types';
import styles from '../RuntimePage.module.css';

type RuntimeStagePopoverProps = {
  item: RuntimeWorkItem;
  locale: string;
  t: RuntimeTranslate;
};

export function RuntimeStagePopover({ item, locale, t }: RuntimeStagePopoverProps) {
  const [visible, setVisible] = useState(false);
  const currentStage = currentStageLabel(item, locale, t);

  useEffect(() => {
    if (!visible) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [visible]);

  const content = (
    <div className={styles.stagePopover} data-testid='runtime-stage-popover'>
      <Typography.Text className={styles.stagePopoverTitle}>{t('common.runtime.taskDetails.stageMap')}</Typography.Text>
      <div className={styles.stageRunStatus} data-testid='runtime-stage-run-status'>
        <Typography.Text className={styles.stageRunStatusLabel}>{t('common.tray.runtimeStatus')}</Typography.Text>
        <Typography.Text className={styles.stageRunStatusValue} data-execution-state={item.execution.state}>
          {executionStateLabel(item.execution.state, t)}
        </Typography.Text>
      </div>
      {item.execution.attemptId ? (
        <div className={styles.stageRunStatus} data-testid='runtime-stage-attempt'>
          <Typography.Text className={styles.stageRunStatusLabel}>
            {t('common.runtime.taskDetails.currentAttempt')}
          </Typography.Text>
          <code className={styles.detailAttemptId}>{item.execution.attemptId}</code>
        </div>
      ) : null}
      {item.stageMap.length > 0 ? (
        <ol className={styles.stagePopoverList}>
          {item.stageMap.map((stage) => (
            <li className={styles.stagePopoverItem} data-stage-state={stage.state} key={stage.id}>
              <span className={styles.stagePopoverMarker} aria-hidden='true' />
              <div className={styles.stagePopoverItemBody}>
                <Typography.Text className={styles.stagePopoverName} data-stage-name>
                  {stageDisplayName(stage, locale)}
                </Typography.Text>
                <Tag>{stageStateLabel(stage.state, t)}</Tag>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Typography.Text className={styles.stagePopoverEmpty}>
          {t('common.runtime.taskDetails.stageMapUnavailable')}
        </Typography.Text>
      )}
    </div>
  );

  return (
    <Popover
      className={styles.stagePopoverPopup}
      style={{
        boxSizing: 'border-box',
        width: 'min(360px, calc(100vw - 32px))',
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 1200,
      }}
      content={content}
      trigger='click'
      position='bl'
      popupVisible={visible}
      onVisibleChange={setVisible}
    >
      <Button
        type='text'
        size='small'
        className={styles.stageTrigger}
        data-testid='runtime-stage-trigger'
        aria-label={t('common.runtime.currentStage', { stage: currentStage })}
        onClick={(event) => event.stopPropagation()}
      >
        <span>{t('common.runtime.currentStage', { stage: currentStage })}</span>
        <Down theme='outline' size={12} />
      </Button>
    </Popover>
  );
}
