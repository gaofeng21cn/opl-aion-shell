import { Button, Popover, Tag, Typography } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { currentStageLabel, stageDisplayName, stageStateLabel, type RuntimeTranslate } from '../formatters';
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
      <div className={styles.stageAttempt} data-testid='runtime-stage-attempt'>
        <Typography.Text className={styles.stageAttemptLabel}>
          {t('common.runtime.taskDetails.currentAttempt')}
        </Typography.Text>
        {item.execution.attemptId ? (
          <code className={styles.stageAttemptId}>{item.execution.attemptId}</code>
        ) : (
          <Typography.Text className={styles.stageAttemptMissing}>{t('common.runtime.noActiveRun')}</Typography.Text>
        )}
      </div>
      {item.stageMap.length > 0 ? (
        <ol className={styles.stagePopoverList}>
          {item.stageMap.map((stage) => (
            <li className={styles.stagePopoverItem} data-stage-state={stage.state} key={stage.id}>
              <span className={styles.stagePopoverMarker} aria-hidden='true' />
              <Typography.Text className={styles.stagePopoverName}>{stageDisplayName(stage, locale)}</Typography.Text>
              <Tag>{stageStateLabel(stage.state, t)}</Tag>
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
    <Popover content={content} trigger='click' position='bl' popupVisible={visible} onVisibleChange={setVisible}>
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
