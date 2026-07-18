import { Alert, Button, Typography } from '@arco-design/web-react';
import { MapDraw } from '@icon-park/react';
import React from 'react';
import type { RuntimeTranslate } from '../formatters';
import type { ScientificReasoningViewDescriptor } from '../types';
import styles from '../RuntimePage.module.css';

type ScientificReasoningSummaryProps = {
  descriptor: ScientificReasoningViewDescriptor;
  t: RuntimeTranslate;
  onOpen: () => void;
};

function availabilityMessage(
  descriptor: ScientificReasoningViewDescriptor,
  t: RuntimeTranslate
): { title: string; description: string; type: 'warning' | 'info' } | null {
  if (descriptor.availability === 'available' || descriptor.availability === 'unread') return null;
  if (descriptor.availability === 'stale') {
    return {
      title: t('common.runtime.researchTrajectory.staleTitle'),
      description: t('common.runtime.researchTrajectory.staleDescription'),
      type: 'warning',
    };
  }
  if (descriptor.availability === 'invalid') {
    return {
      title: t('common.runtime.researchTrajectory.unsupportedTitle'),
      description: t('common.runtime.researchTrajectory.unsupportedDescription'),
      type: 'info',
    };
  }
  if (descriptor.availability === 'read_error') {
    return {
      title: t('common.runtime.researchTrajectory.loadFailedTitle'),
      description: t('common.runtime.researchTrajectory.loadFailedDescription'),
      type: 'warning',
    };
  }
  return {
    title: t('common.runtime.researchTrajectory.missingTitle'),
    description: t('common.runtime.researchTrajectory.missingDescription'),
    type: 'info',
  };
}

/** Renders the refs-only entry carried by the fast descriptor. */
export function ScientificReasoningSummary({ descriptor, t, onOpen }: ScientificReasoningSummaryProps) {
  const message = availabilityMessage(descriptor, t);

  return (
    <section className={styles.detailSection} data-testid='runtime-research-summary'>
      <Typography.Title heading={5}>{t('common.runtime.researchTrajectory.title')}</Typography.Title>
      {message && <Alert type={message.type} showIcon title={message.title} content={message.description} />}
      <Button
        type='primary'
        icon={<MapDraw theme='outline' />}
        onClick={onOpen}
        data-testid='runtime-open-research-map'
      >
        {t('common.runtime.researchTrajectory.open')}
      </Button>
    </section>
  );
}
