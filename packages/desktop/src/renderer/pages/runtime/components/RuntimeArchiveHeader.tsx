import { Button, Typography } from '@arco-design/web-react';
import { Left } from '@icon-park/react';
import React from 'react';
import type { RuntimeTranslate } from '../formatters';
import styles from '../RuntimePage.module.css';

type RuntimeArchiveHeaderProps = {
  count: number;
  t: RuntimeTranslate;
  onBack: () => void;
};

export function RuntimeArchiveHeader({ count, t, onBack }: RuntimeArchiveHeaderProps) {
  return (
    <section className={styles.archiveHeader} data-testid='runtime-archive-header'>
      <Button icon={<Left theme='outline' />} onClick={onBack} data-testid='runtime-archive-back'>
        {t('common.runtime.archivedTasks.back')}
      </Button>
      <div className={styles.archiveHeaderCopy}>
        <Typography.Title heading={5}>{t('common.runtime.archivedTasks.title')}</Typography.Title>
        <Typography.Text className={styles.archiveCount}>
          {t('common.runtime.archivedTasks.count', { count })}
        </Typography.Text>
      </div>
    </section>
  );
}
