import { Spin } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AppLoader.module.css';

export type AppLoaderStep = {
  label: string;
  state?: 'active' | 'complete' | 'pending';
};

type AppLoaderProps = {
  title?: string;
  description?: string;
  steps?: AppLoaderStep[];
  testId?: string;
};

const AppLoader: React.FC<AppLoaderProps> = ({ title, description, steps = [], testId = 'app-loader' }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.appLoader} data-testid={testId} aria-label={testId}>
      <div className={styles.appLoaderPanel} aria-live='polite'>
        <div className={styles.appLoaderHeader}>
          <Spin dot />
          <div>
            <div className={styles.appLoaderTitle}>{title ?? t('common.loading')}</div>
            {description ? <div className={styles.appLoaderDescription}>{description}</div> : null}
          </div>
        </div>
        {steps.length > 0 ? (
          <div className={styles.appLoaderSteps}>
            {steps.map((step) => (
              <div className={styles.appLoaderStep} data-state={step.state ?? 'pending'} key={step.label}>
                <span className={styles.appLoaderStepMarker} />
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AppLoader;
