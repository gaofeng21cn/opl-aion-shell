import { Spin } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AppLoader.module.css';

export type AppLoaderStep = {
  label: string;
  state?: 'active' | 'complete' | 'pending';
  /** Optional detailed message for the current step */
  message?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
};

type AppLoaderProps = {
  title?: string;
  description?: string;
  steps?: AppLoaderStep[];
  testId?: string;
  /** Show progress bar for active step */
  showProgress?: boolean;
  /** Show skip button */
  showSkipButton?: boolean;
  /** Skip button text */
  skipButtonText?: string;
  /** Callback when skip button is clicked */
  onSkip?: () => void;
  /** Estimated remaining seconds */
  estimatedSeconds?: number;
};

const AppLoader: React.FC<AppLoaderProps> = ({
  title,
  description,
  steps = [],
  testId = 'app-loader',
  showProgress = true,
  showSkipButton = false,
  skipButtonText,
  onSkip,
  estimatedSeconds,
}) => {
  const { t } = useTranslation();

  // Find the active step to show its progress
  const activeStep = steps.find((step) => step.state === 'active');
  const hasProgress = showProgress && activeStep && typeof activeStep.progress === 'number';
  const progress = hasProgress ? Math.max(0, Math.min(100, activeStep.progress)) : 0;

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
                <div className={styles.appLoaderStepContent}>
                  <span className={styles.appLoaderStepLabel}>{step.label}</span>
                  {step.state === 'active' && step.message ? (
                    <span className={styles.appLoaderStepMessage}>{step.message}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {hasProgress ? (
          <div className={styles.appLoaderProgress}>
            <div className={styles.appLoaderProgressBar}>
              <div className={styles.appLoaderProgressFill} style={{ width: `${progress}%` }} />
            </div>
            <div className={styles.appLoaderProgressText}>
              {activeStep.message ? (
                <span className={styles.appLoaderProgressMessage}>{activeStep.message}</span>
              ) : null}
              <span className={styles.appLoaderProgressPercent}>{progress}%</span>
            </div>
          </div>
        ) : null}
        {(estimatedSeconds !== undefined || showSkipButton) && (
          <div className={styles.appLoaderFooter}>
            {estimatedSeconds !== undefined && estimatedSeconds > 0 ? (
              <span className={styles.appLoaderEstimatedTime}>
                {t('common.startupPreflight.estimatedTime', { seconds: estimatedSeconds })}
              </span>
            ) : (
              <span />
            )}
            {showSkipButton && onSkip ? (
              <button className={styles.appLoaderSkipButton} onClick={onSkip} type='button'>
                {skipButtonText ?? t('common.skip')}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppLoader;
