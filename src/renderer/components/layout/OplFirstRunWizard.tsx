import { Alert, Button, Input, Spin } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';

import type { OplCodexDefaultProfile, OplFirstLaunchPreparationResult } from './oplFirstLaunchPreparation';

export type OplFirstRunWizardState = {
  status: OplFirstLaunchPreparationResult['status'] | 'preparing';
  message?: string;
  blockers?: string[];
  codexDefaultProfile?: OplCodexDefaultProfile;
  logPath?: string;
};

type OplFirstRunWizardProps = {
  state: OplFirstRunWizardState;
  onConfigureCodex: (apiKey: string) => Promise<void> | void;
  onRetry: () => void;
  onOpenEnvironment: () => void;
  t: (key: string, options?: Record<string, string>) => string;
};

const formatProviderEndpointLine = (profile?: OplCodexDefaultProfile): string => {
  if (!profile) return '';
  return [
    profile.provider_name ?? profile.model_provider,
    profile.base_url,
  ].filter(Boolean).join(' / ');
};

const formatInitialModelProfileLine = (profile?: OplCodexDefaultProfile): string => {
  if (!profile) return '';
  return [profile.model, profile.model_reasoning_effort].filter(Boolean).join(' / ');
};

export const OplFirstRunWizard: React.FC<OplFirstRunWizardProps> = ({
  state,
  onConfigureCodex,
  onRetry,
  onOpenEnvironment,
  t,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const blockers = state.blockers ?? [];
  const needsCodexConfig = state.status === 'codex-config-needed';
  const isPreparing = state.status === 'preparing';
  const isReady = state.status === 'prepared' || state.status === 'already-prepared';
  const providerEndpointLine = useMemo(
    () => formatProviderEndpointLine(state.codexDefaultProfile),
    [state.codexDefaultProfile]
  );
  const initialModelProfileLine = useMemo(
    () => formatInitialModelProfileLine(state.codexDefaultProfile),
    [state.codexDefaultProfile]
  );

  const handleConfigure = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setInputError(t('settings.oplFirstLaunch.codex.apiKeyRequired'));
      return;
    }
    setInputError(null);
    setSubmitting(true);
    try {
      await onConfigureCodex(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid='opl-first-run-window'
      aria-label='opl-first-run-window'
      className='min-h-full bg-bg-1 px-24px py-28px flex items-center justify-center'
    >
      <div className='w-full max-w-720px border border-border-1 bg-bg-2 p-24px rd-8px shadow-sm'>
        <div className='flex flex-col gap-16px'>
          <div>
            <div className='text-24px text-t-primary font-700'>{t('settings.oplFirstLaunch.wizardTitle')}</div>
            <div
              data-testid='opl-first-run-progress'
              aria-label='opl-first-run-progress'
              className='mt-8px text-14px text-t-secondary'
            >
              {isPreparing
                ? t('settings.oplFirstLaunch.preparing')
                : isReady
                  ? t('settings.oplFirstLaunch.complete')
                  : state.message || t('settings.oplFirstLaunch.setupNeeded')}
            </div>
          </div>

          {isPreparing && (
            <div className='flex items-center gap-12px text-14px text-t-secondary'>
              <Spin size={18} />
              <span>{t('settings.oplFirstLaunch.preparing')}</span>
            </div>
          )}

          {needsCodexConfig && (
            <div className='flex flex-col gap-14px'>
              <Alert type='info' content={t('settings.oplFirstLaunch.codex.prompt')} />
              {(providerEndpointLine || initialModelProfileLine) && (
                <div className='grid grid-cols-1 gap-8px text-13px text-t-secondary'>
                  {providerEndpointLine && (
                    <>
                      <div>{t('settings.oplFirstLaunch.codex.providerEndpoint')}</div>
                      <div className='font-mono text-12px text-t-primary break-all'>{providerEndpointLine}</div>
                    </>
                  )}
                  {initialModelProfileLine && (
                    <>
                      <div>{t('settings.oplFirstLaunch.codex.initialModelProfile')}</div>
                      <div className='font-mono text-12px text-t-primary break-all'>{initialModelProfileLine}</div>
                    </>
                  )}
                </div>
              )}
              <div
                data-testid='opl-first-run-codex-api-key-input'
                aria-label='opl-first-run-codex-api-key-input'
              >
                <Input.Password
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder={t('settings.oplFirstLaunch.codex.apiKeyPlaceholder')}
                  status={inputError ? 'error' : undefined}
                  autoComplete='off'
                />
              </div>
              {inputError && <div className='text-12px text-danger-6'>{inputError}</div>}
              <div className='flex flex-wrap items-center gap-10px'>
                <Button
                  type='primary'
                  loading={submitting}
                  data-testid='opl-first-run-configure-codex-button'
                  aria-label='opl-first-run-configure-codex-button'
                  onClick={() => void handleConfigure()}
                >
                  {t('settings.oplFirstLaunch.codex.configure')}
                </Button>
                <Button
                  data-testid='opl-first-run-retry-button'
                  aria-label='opl-first-run-retry-button'
                  onClick={onRetry}
                >
                  {t('settings.oplFirstLaunch.actions.retry')}
                </Button>
                <Button
                  data-testid='opl-first-run-open-environment-button'
                  aria-label='opl-first-run-open-environment-button'
                  onClick={onOpenEnvironment}
                >
                  {t('settings.oplFirstLaunch.actions.openEnvironment')}
                </Button>
              </div>
            </div>
          )}

          {!needsCodexConfig && !isPreparing && (
            <div className='flex flex-wrap items-center gap-10px'>
              <Button
                type='primary'
                data-testid='opl-first-run-install-button'
                aria-label='opl-first-run-install-button'
                onClick={onRetry}
              >
                {t('settings.oplFirstLaunch.actions.install')}
              </Button>
              <Button
                data-testid='opl-first-run-open-environment-button'
                aria-label='opl-first-run-open-environment-button'
                onClick={onOpenEnvironment}
              >
                {t('settings.oplFirstLaunch.actions.openEnvironment')}
              </Button>
            </div>
          )}

          {isReady && (
            <div
              data-testid='opl-first-run-ready-entry'
              aria-label='opl-first-run-ready-entry'
              className='text-13px text-success-6'
            >
              {t('settings.oplFirstLaunch.readyEntry')}
            </div>
          )}

          {blockers.length > 0 && (
            <ul
              data-testid='opl-first-run-blockers-list'
              aria-label='opl-first-run-blockers-list'
              className='m-0 pl-18px text-12px text-warning-6'
            >
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}

          {state.logPath && (
            <div className='text-11px text-t-tertiary truncate'>
              {t('settings.oplFirstLaunch.logPath', { path: state.logPath })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
