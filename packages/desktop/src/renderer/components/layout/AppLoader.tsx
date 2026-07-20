import { Button, Spin } from '@arco-design/web-react';
import { Down, Up } from '@icon-park/react';
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import appLogo from '@/renderer/assets/logos/brand/app.png';
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
  brand?: string;
  title?: string;
  description?: string;
  steps?: AppLoaderStep[];
  testId?: string;
  /** Show progress bar for active step */
  showProgress?: boolean;
  /** Progress is measured by the underlying operation rather than estimated */
  progressIsReliable?: boolean;
  /** Show skip button */
  showSkipButton?: boolean;
  /** Skip button text */
  skipButtonText?: string;
  /** Callback when skip button is clicked */
  onSkip?: () => void;
  /** Estimated remaining seconds */
  estimatedSeconds?: number;
  /** Optional content hidden behind an explicit disclosure */
  details?: React.ReactNode;
  detailsLabel?: string;
};

const AppLoader: React.FC<AppLoaderProps> = ({
  brand,
  title,
  description,
  steps = [],
  testId = 'app-loader',
  showProgress = true,
  progressIsReliable = false,
  showSkipButton = false,
  skipButtonText,
  onSkip,
  estimatedSeconds,
  details,
  detailsLabel,
}) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const startupSurface = testId === 'opl-startup-preflight' || testId === 'opl-startup-gate';
  const resolvedBrand = brand ?? (startupSurface ? t('common.uiOptimization.startup.brand') : undefined);
  const resolvedTitle = startupSurface ? t('common.uiOptimization.startup.title') : (title ?? t('common.loading'));

  // Find the active step to show its progress
  const activeStep = steps.find((step) => step.state === 'active');
  const hasProgress = progressIsReliable && showProgress && activeStep && typeof activeStep.progress === 'number';
  const progress = hasProgress ? Math.max(0, Math.min(100, activeStep.progress)) : 0;

  return (
    <div className={styles.appLoader} data-testid={testId} aria-label={testId}>
      <div className={styles.appLoaderPanel} aria-live='polite'>
        {resolvedBrand ? (
          <div className={styles.appLoaderBrand}>
            <img src={appLogo} alt='' aria-hidden='true' />
            <span>{resolvedBrand}</span>
          </div>
        ) : null}
        <div className={styles.appLoaderHeader}>
          <Spin dot />
          <div>
            <div className={styles.appLoaderTitle}>{resolvedTitle}</div>
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
        {details ? (
          <div className={styles.appLoaderDetails}>
            <Button
              type='text'
              size='small'
              className={styles.appLoaderDetailsButton}
              icon={detailsOpen ? <Up aria-hidden='true' /> : <Down aria-hidden='true' />}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsLabel ?? t('common.uiOptimization.startup.viewDetails')}
            </Button>
            {detailsOpen ? (
              <div className={styles.appLoaderDetailsBody} id={detailsId}>
                {details}
              </div>
            ) : null}
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
              <Button className={styles.appLoaderSkipButton} onClick={onSkip} type='secondary' size='small'>
                {skipButtonText ?? t('common.skip')}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppLoader;
