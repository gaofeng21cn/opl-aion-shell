import { Button, Collapse, Empty, Input, Message, Progress, Tag } from '@arco-design/web-react';
import { CheckOne, Config, Right, SettingTwo, Tool, Workbench } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import {
  coreProgressPercent,
  FIRST_RUN_ITEM_IDS,
  findChecklistItem,
  findNextVisibleStep,
  formatFullReadinessProgressText,
  formatMaintenanceProgressText,
  formatProgressText,
  hasCodexConfigBlocker,
  isCoreLaunchReadyFromAppState,
  readInitializePayload,
  type FirstRunItemId,
} from './initializeModel';
import type { FirstRunChecklistItem, FirstRunCommandResult, FirstRunInitialize } from './types';
import styles from './FirstRun.module.css';

type MaintenanceAction = 'install_prep' | 'startup_maintenance' | 'reconcile_modules';
type Translate = (key: string, values?: Record<string, string | number>) => string;

const PRIMARY_FIRST_RUN_ITEM_IDS: FirstRunItemId[] = ['workspace_root', 'codex', 'codex_config'];
const STATUS_READY = new Set(['ready', 'installed', 'detected', 'configured', 'disabled']);
const STATUS_NEEDS_ACTION = new Set(['missing', 'blocking', 'failed']);
const STATUS_LABEL_KEYS: Record<string, string> = {
  ready: 'settings.firstRun.status.ready',
  installed: 'settings.firstRun.status.installed',
  detected: 'settings.firstRun.status.detected',
  configured: 'settings.firstRun.status.configured',
  disabled: 'settings.firstRun.status.disabled',
  missing: 'settings.firstRun.status.missing',
  initializing: 'settings.firstRun.status.initializing',
  attention_needed: 'settings.firstRun.status.attentionNeeded',
  blocking: 'settings.firstRun.status.blocking',
  failed: 'settings.firstRun.status.failed',
};
const ITEM_LABEL_KEYS: Record<FirstRunItemId, string> = {
  workspace_root: 'settings.firstRun.items.workspaceRoot',
  codex: 'settings.firstRun.items.codex',
  codex_config: 'settings.firstRun.items.codexConfig',
  domain_modules: 'settings.firstRun.items.domainModules',
  family_runtime_provider: 'settings.firstRun.items.familyRuntimeProvider',
  recommended_skills: 'settings.firstRun.items.recommendedSkills',
};
const ITEM_SUMMARY_KEYS: Record<
  FirstRunItemId,
  { pending: string; checking: string; ready: string; needsAction: string; maintenance: string }
> = {
  workspace_root: {
    pending: 'settings.firstRun.itemSummaries.workspaceRoot.pending',
    checking: 'settings.firstRun.itemSummaries.workspaceRoot.checking',
    ready: 'settings.firstRun.itemSummaries.workspaceRoot.ready',
    needsAction: 'settings.firstRun.itemSummaries.workspaceRoot.needsAction',
    maintenance: 'settings.firstRun.itemSummaries.workspaceRoot.pending',
  },
  codex: {
    pending: 'settings.firstRun.itemSummaries.codex.pending',
    checking: 'settings.firstRun.itemSummaries.codex.checking',
    ready: 'settings.firstRun.itemSummaries.codex.ready',
    needsAction: 'settings.firstRun.itemSummaries.codex.needsAction',
    maintenance: 'settings.firstRun.itemSummaries.codex.pending',
  },
  codex_config: {
    pending: 'settings.firstRun.itemSummaries.codexConfig.pending',
    checking: 'settings.firstRun.itemSummaries.codexConfig.checking',
    ready: 'settings.firstRun.itemSummaries.codexConfig.ready',
    needsAction: 'settings.firstRun.itemSummaries.codexConfig.needsAction',
    maintenance: 'settings.firstRun.itemSummaries.codexConfig.pending',
  },
  domain_modules: {
    pending: 'settings.firstRun.itemSummaries.domainModules.pending',
    checking: 'settings.firstRun.itemSummaries.domainModules.checking',
    ready: 'settings.firstRun.itemSummaries.domainModules.ready',
    needsAction: 'settings.firstRun.itemSummaries.domainModules.maintenance',
    maintenance: 'settings.firstRun.itemSummaries.domainModules.maintenance',
  },
  family_runtime_provider: {
    pending: 'settings.firstRun.itemSummaries.familyRuntimeProvider.pending',
    checking: 'settings.firstRun.itemSummaries.familyRuntimeProvider.checking',
    ready: 'settings.firstRun.itemSummaries.familyRuntimeProvider.ready',
    needsAction: 'settings.firstRun.itemSummaries.familyRuntimeProvider.maintenance',
    maintenance: 'settings.firstRun.itemSummaries.familyRuntimeProvider.maintenance',
  },
  recommended_skills: {
    pending: 'settings.firstRun.itemSummaries.recommendedSkills.pending',
    checking: 'settings.firstRun.itemSummaries.recommendedSkills.checking',
    ready: 'settings.firstRun.itemSummaries.recommendedSkills.ready',
    needsAction: 'settings.firstRun.itemSummaries.recommendedSkills.maintenance',
    maintenance: 'settings.firstRun.itemSummaries.recommendedSkills.maintenance',
  },
};
const NEXT_STEP_KEYS: Record<FirstRunItemId, string> = {
  workspace_root: 'settings.firstRun.nextSteps.workspaceRoot',
  codex: 'settings.firstRun.nextSteps.codex',
  codex_config: 'settings.firstRun.nextSteps.codexConfig',
  domain_modules: 'settings.firstRun.nextSteps.domainModules',
  family_runtime_provider: 'settings.firstRun.nextSteps.familyRuntimeProvider',
  recommended_skills: 'settings.firstRun.nextSteps.recommendedSkills',
};

function itemStatusColor(item: FirstRunChecklistItem | null): string {
  if (!item) return 'gray';
  if (item.blocking || item.severity === 'blocking') return 'red';
  if (item.severity === 'maintenance') return 'orange';
  if (STATUS_READY.has(item.status)) return 'green';
  return 'gray';
}

function isKnownFirstRunItemId(itemId: string | undefined): itemId is FirstRunItemId {
  return Boolean(itemId && FIRST_RUN_ITEM_IDS.includes(itemId as FirstRunItemId));
}

function formatItemStatus(item: FirstRunChecklistItem | null, fallback: string, t: Translate): string {
  if (!item?.status) return fallback;
  const labelKey = STATUS_LABEL_KEYS[item.status];
  return labelKey ? t(labelKey) : fallback;
}

function formatItemLabel(item: FirstRunChecklistItem | null, fallbackLabel: string, t: Translate): string {
  if (isKnownFirstRunItemId(item?.item_id)) return t(ITEM_LABEL_KEYS[item.item_id]);
  return fallbackLabel;
}

function formatItemSummary(item: FirstRunChecklistItem | null, fallbackSummary: string, t: Translate): string {
  if (!item || !isKnownFirstRunItemId(item.item_id)) return fallbackSummary;
  const summaryKeys = ITEM_SUMMARY_KEYS[item.item_id];
  if (
    item.blocking ||
    item.severity === 'blocking' ||
    STATUS_NEEDS_ACTION.has(item.status) ||
    (item.status === 'attention_needed' && item.severity !== 'maintenance')
  ) {
    return t(summaryKeys.needsAction);
  }
  if (STATUS_READY.has(item.status)) return t(summaryKeys.ready);
  if (item.severity === 'maintenance' || item.status === 'attention_needed') return t(summaryKeys.maintenance);
  if (item.status === 'initializing') return t(summaryKeys.checking);
  return t(summaryKeys.pending);
}

function formatItemIds(ids: string[], t: Translate): string[] {
  return ids.map((itemId) => {
    if (isKnownFirstRunItemId(itemId)) return t(ITEM_LABEL_KEYS[itemId]);
    return t('settings.firstRun.items.otherSetup');
  });
}

function formatNextVisibleStep(initialize: FirstRunInitialize | null, t: Translate): string | null {
  const blockingItemIds = initialize?.setup_flow?.blocking_items ?? [];
  const blockedItem = initialize?.checklist?.find((entry) => blockingItemIds.includes(entry.item_id) || entry.blocking);
  const item = blockedItem ?? initialize?.checklist?.find((entry) => entry.next_visible_step);
  if (!isKnownFirstRunItemId(item?.item_id)) return null;
  return t(NEXT_STEP_KEYS[item.item_id]);
}

function resultPreview(result: FirstRunCommandResult): string {
  if (!result) return '';
  return JSON.stringify(result.parsed ?? {}, null, 2);
}

function formatFirstRunError(
  error: string | null,
  codexConfigBlocked: boolean,
  hasBlockingItems: boolean,
  t: (key: string) => string
): string | null {
  if (!error) return null;
  if (codexConfigBlocked) return t('settings.firstRun.error.codexConfig');
  if (hasBlockingItems) return t('settings.firstRun.error.blocked');
  return t('settings.firstRun.error.general');
}

function assertBridgeResultOk(result: Exclude<FirstRunCommandResult, null>): void {
  if (result.ok === false) {
    throw new Error(result.error?.message || 'OPL runtime command failed');
  }
}

function ReadinessItem({
  item,
  fallbackLabel,
  fallbackSummary,
}: {
  item: FirstRunChecklistItem | null;
  fallbackLabel: string;
  fallbackSummary: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.firstRunItem}>
      <div className={styles.firstRunItemBody}>
        <div className={styles.firstRunItemTitle}>{formatItemLabel(item, fallbackLabel, t)}</div>
        <div className={styles.firstRunItemSummary}>{formatItemSummary(item, fallbackSummary, t)}</div>
        {item?.action_command_ref && <code className={styles.firstRunCommand}>{item.action_command_ref}</code>}
      </div>
      <Tag size='small' color={itemStatusColor(item)}>
        {formatItemStatus(item, t('settings.firstRun.status.unknown'), t)}
      </Tag>
    </div>
  );
}

const FirstRun: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [initializeResult, setInitializeResult] = useState<FirstRunCommandResult>(null);
  const [actionResult, setActionResult] = useState<FirstRunCommandResult>(null);
  const [apiKey, setApiKey] = useState('');
  const [initializeLoading, setInitializeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<MaintenanceAction | 'configure_codex' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialize = useMemo<FirstRunInitialize | null>(
    () => readInitializePayload(initializeResult?.parsed),
    [initializeResult]
  );
  const readyToLaunch =
    initialize?.setup_flow?.ready_to_launch === true || initialize?.readiness?.launch_ready === true;
  const codexConfigBlocked = hasCodexConfigBlocker(initialize);
  const progressText = formatProgressText(initialize);
  const fullReadinessProgressText = formatFullReadinessProgressText(initialize);
  const maintenanceProgressText = formatMaintenanceProgressText(initialize);
  const progressPercent = coreProgressPercent(initialize);
  const blockingItems = initialize?.setup_flow?.blocking_items ?? [];
  const maintenanceItems = initialize?.setup_flow?.maintenance_items ?? [];
  const hasBlockingItems = blockingItems.length > 0;
  const currentPhase =
    initialize?.setup_flow?.phase ?? initialize?.overall_state ?? t('settings.firstRun.status.unknown');
  const userFacingError = formatFirstRunError(error, codexConfigBlocked, hasBlockingItems, t);
  const rawNextVisibleStep = findNextVisibleStep(initialize);
  const nextVisibleStep =
    formatNextVisibleStep(initialize, t) ?? (rawNextVisibleStep ? t('settings.firstRun.nextSteps.generic') : null);
  const codexProfile = initialize?.codex_default_profile;
  const coreStatusColor = initializeLoading && !initializeResult ? 'blue' : readyToLaunch ? 'green' : 'red';
  const coreStatusLabel =
    initializeLoading && !initializeResult
      ? t('settings.firstRun.status.initializing')
      : readyToLaunch
        ? t('settings.firstRun.ready')
        : t('settings.firstRun.needsSetup');

  const refreshInitialize = useCallback(async () => {
    setInitializeLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.getInitialize.invoke();
      assertBridgeResultOk(result);
      const initializePayload = readInitializePayload(result.parsed);
      setInitializeResult(result);
      if (
        initializePayload?.setup_flow?.ready_to_launch === true ||
        initializePayload?.readiness?.launch_ready === true
      ) {
        navigate('/guid', { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setInitializeLoading(false);
    }
  }, [navigate]);

  const checkFastAppState = useCallback(async () => {
    try {
      const appState = await ipcBridge.oplRuntime.getAppState.invoke({ profile: 'fast' });
      assertBridgeResultOk(appState);
      if (isCoreLaunchReadyFromAppState(appState.parsed)) {
        navigate('/guid', { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError((current) => current ?? message);
    }
  }, [navigate]);

  const runMaintenanceAction = useCallback(
    async (action: MaintenanceAction) => {
      setActionLoading(action);
      setError(null);
      try {
        const result =
          action === 'install_prep'
            ? await ipcBridge.oplRuntime.runInstallPrep.invoke()
            : action === 'startup_maintenance'
              ? await ipcBridge.oplRuntime.runStartupMaintenance.invoke()
              : await ipcBridge.oplRuntime.runReconcileModules.invoke();
        assertBridgeResultOk(result);
        setActionResult(result);
        Message.success(t('settings.firstRun.actions.completed'));
        await refreshInitialize();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        Message.error(message);
      } finally {
        setActionLoading(null);
      }
    },
    [refreshInitialize, t]
  );

  const configureCodex = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      Message.error(t('settings.firstRun.codex.apiKeyRequired'));
      return;
    }
    setActionLoading('configure_codex');
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.configureCodex.invoke({ apiKey: trimmed });
      assertBridgeResultOk(result);
      setActionResult(result);
      setApiKey('');
      Message.success(t('settings.firstRun.codex.configured'));
      await refreshInitialize();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      Message.error(message);
    } finally {
      setActionLoading(null);
    }
  }, [apiKey, refreshInitialize, t]);

  useEffect(() => {
    document.title = 'One Person Lab App';
    void refreshInitialize();
    void checkFastAppState();
  }, [checkFastAppState, refreshInitialize]);

  const itemLabels = Object.fromEntries(
    FIRST_RUN_ITEM_IDS.map((itemId) => [itemId, t(ITEM_LABEL_KEYS[itemId])])
  ) as Record<FirstRunItemId, string>;
  const primaryItems = PRIMARY_FIRST_RUN_ITEM_IDS.map((itemId) => ({
    id: itemId,
    item: findChecklistItem(initialize, itemId),
    label: itemLabels[itemId],
  }));
  const primaryBlockerLabels = formatItemIds(blockingItems, t);
  const maintenanceLabels = formatItemIds(maintenanceItems, t);
  const beginnerSummary = initializeLoading
    ? t('settings.firstRun.beginner.summaryChecking')
    : readyToLaunch
      ? t('settings.firstRun.beginner.summaryReady')
      : hasBlockingItems
        ? t('settings.firstRun.beginner.summaryNeedsAction')
        : t('settings.firstRun.beginner.summaryPreparing');

  return (
    <main className={styles.firstRunPage} aria-label='opl-first-run-window' data-testid='opl-first-run-window'>
      <div className={styles.firstRunShell}>
        <header className={styles.firstRunHeader}>
          <div>
            <h1>{t('settings.firstRun.title')}</h1>
            <p>{t('settings.firstRun.description')}</p>
          </div>
        </header>

        {userFacingError && (
          <div className={styles.firstRunError} data-testid='opl-first-run-user-error'>
            {userFacingError}
          </div>
        )}

        <section className={styles.firstRunHeroPanel} data-testid='opl-first-run-progress' aria-label='opl-first-run-progress'>
          <div className={styles.firstRunHeroMain} data-testid='opl-first-run-beginner-primary'>
            <div className={styles.firstRunStatusHeading}>
              <span className={styles.firstRunHeroIcon}>
                <CheckOne />
              </span>
              <div>
                <h2>
                  {readyToLaunch ? t('settings.firstRun.beginner.readyTitle') : t('settings.firstRun.beginner.title')}
                </h2>
                <p data-testid='opl-first-run-beginner-summary'>{beginnerSummary}</p>
              </div>
              <Tag color={coreStatusColor}>{coreStatusLabel}</Tag>
            </div>

            <div className={styles.firstRunProgressHero}>
              <div className={styles.firstRunProgressPercent}>{progressPercent}%</div>
              <div className={styles.firstRunProgressStack}>
                <Progress percent={progressPercent} />
                <p data-testid='opl-first-run-core-progress'>
                  {t('settings.firstRun.coreProgress', { progress: progressText })}
                </p>
              </div>
            </div>

            <div className={styles.firstRunSimpleSteps}>
              {primaryItems.map(({ id, item, label }) => (
                <div className={styles.firstRunSimpleStep} key={id}>
                  <span className={styles.firstRunCardIcon}>
                    {STATUS_READY.has(item?.status ?? '') ? <CheckOne /> : <Config />}
                  </span>
                  <div>
                    <div className={styles.firstRunItemTitle}>{formatItemLabel(item, label, t)}</div>
                    <div className={styles.firstRunItemSummary}>
                      {formatItemSummary(item, t('settings.firstRun.status.pending'), t)}
                    </div>
                  </div>
                  <Tag size='small' color={itemStatusColor(item)}>
                    {formatItemStatus(item, t('settings.firstRun.status.unknown'), t)}
                  </Tag>
                </div>
              ))}
            </div>

            {codexConfigBlocked && (
              <div className={styles.firstRunApiKey} data-testid='opl-first-run-codex-card'>
                <p>{t('settings.firstRun.codex.prompt')}</p>
                <div className={styles.firstRunApiKeyControls}>
                  <Input.Password
                    value={apiKey}
                    onChange={setApiKey}
                    placeholder={t('settings.firstRun.codex.apiKeyPlaceholder')}
                    data-testid='opl-first-run-codex-api-key-input'
                    aria-label='opl-first-run-codex-api-key-input'
                  />
                  <Button
                    type='primary'
                    loading={actionLoading === 'configure_codex'}
                    onClick={() => void configureCodex()}
                    data-testid='opl-first-run-configure-codex-button'
                    aria-label='opl-first-run-configure-codex-button'
                  >
                    {t('settings.firstRun.codex.configure')}
                  </Button>
                </div>
              </div>
            )}

            <div className={styles.firstRunHeroActions}>
              <Button
                icon={<Right />}
                type='primary'
                size='large'
                disabled={!readyToLaunch}
                onClick={() => navigate('/guid')}
                data-testid='opl-first-run-primary-action'
                aria-label='opl-first-run-ready-entry'
              >
                <span data-testid='opl-first-run-ready-entry'>{t('settings.firstRun.enterGuid')}</span>
              </Button>
            </div>

            <div className={styles.firstRunStatusStrip}>
              <div>
                <div className={styles.firstRunStripLabel}>{t('settings.firstRun.blockers')}</div>
                <p data-testid='opl-first-run-blockers-list' aria-label='opl-first-run-blockers-list'>
                  {primaryBlockerLabels.length > 0
                    ? primaryBlockerLabels.join(', ')
                    : t('settings.firstRun.noCoreBlockers')}
                </p>
              </div>
              <div>
                <div className={styles.firstRunStripLabel}>{t('settings.firstRun.beginner.nextStep')}</div>
                <p data-testid='opl-first-run-next-step' aria-label='opl-first-run-next-step'>
                  {nextVisibleStep ?? t('settings.firstRun.noNextStep')}
                </p>
              </div>
            </div>
          </div>

        </section>

        <Collapse
          bordered={false}
          className={styles.firstRunDetailsCollapse}
          data-testid='opl-first-run-technical-details-toggle'
        >
          <Collapse.Item name='technical-details' header={t('settings.firstRun.technicalDetails')}>
            <section className={styles.firstRunDiagnostics} data-testid='opl-first-run-primary-troubleshooting'>
              <div className={styles.firstRunDiagnosticLine} data-testid='opl-first-run-stage'>
                <span>{t('settings.firstRun.stage', { phase: currentPhase })}</span>
              </div>
              <div
                className={styles.firstRunDiagnosticLine}
                data-testid='opl-first-run-background-maintenance-secondary'
              >
                <span>
                  {maintenanceItems.length > 0
                    ? t('settings.firstRun.beginner.backgroundMaintenanceWithCount', {
                        count: maintenanceItems.length,
                      })
                    : t('settings.firstRun.noMaintenance')}
                </span>
                {maintenanceLabels.length > 0 && (
                  <span className={styles.firstRunMeta}> {maintenanceLabels.join(', ')}</span>
                )}
              </div>
              {error && (
                <div className={styles.firstRunTechnicalError} data-testid='opl-first-run-technical-error'>
                  {error}
                </div>
              )}
              <div className={styles.firstRunSectionActions}>
                <Button
                  icon={<SettingTwo />}
                  onClick={() => navigate('/settings/runtime')}
                  data-testid='opl-settings-environment'
                  aria-label='opl-settings-environment'
                >
                  {t('settings.firstRun.openRuntimeSettings')}
                </Button>
                <Button
                  loading={initializeLoading}
                  onClick={() => void refreshInitialize()}
                  data-testid='opl-first-run-retry-button'
                  aria-label='opl-first-run-retry-button'
                >
                  {t('common.refresh')}
                </Button>
              </div>
            </section>
            <section className={styles.firstRunGrid}>
              <div className={styles.firstRunCard}>
                <div className={styles.firstRunCardHeader}>
                  <div className={styles.firstRunCardTitle}>
                    <span className={styles.firstRunCardIcon}>
                      <Workbench />
                    </span>
                    <h2>{t('settings.firstRun.readiness')}</h2>
                  </div>
                </div>
                <div className={styles.firstRunProgressDetails}>
                  <p data-testid='opl-first-run-full-readiness-progress'>
                    {t('settings.firstRun.fullReadinessProgress', { progress: fullReadinessProgressText })}
                  </p>
                  <p data-testid='opl-first-run-maintenance-progress'>
                    {t('settings.firstRun.maintenanceProgress', { progress: maintenanceProgressText })}
                  </p>
                </div>
                <div className={styles.firstRunList}>
                  {FIRST_RUN_ITEM_IDS.map((itemId) => (
                    <ReadinessItem
                      key={itemId}
                      item={findChecklistItem(initialize, itemId)}
                      fallbackLabel={itemLabels[itemId]}
                      fallbackSummary={t('settings.firstRun.status.pending')}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.firstRunCard}>
                <div className={styles.firstRunCardHeader}>
                  <div className={styles.firstRunCardTitle}>
                    <span className={styles.firstRunCardIcon}>
                      <Config />
                    </span>
                    <h2>{t('settings.firstRun.codex.title')}</h2>
                  </div>
                  <Tag color={codexConfigBlocked ? 'red' : 'green'}>
                    {codexConfigBlocked ? t('settings.firstRun.needsSetup') : t('settings.firstRun.ready')}
                  </Tag>
                </div>

                <div className={styles.firstRunApiKey}>
                  <p>
                    {t('settings.firstRun.codex.defaults', {
                      provider: codexProfile?.model_provider ?? 'gflab',
                      baseUrl: codexProfile?.base_url ?? 'https://gflabtoken.cn/v1',
                      model: codexProfile?.model ?? 'gpt-5.5',
                      reasoning: codexProfile?.model_reasoning_effort ?? 'xhigh',
                    })}
                  </p>
                </div>
              </div>
            </section>

            <section className={styles.firstRunCard}>
              <div className={styles.firstRunCardHeader}>
                <div className={styles.firstRunCardTitle}>
                  <span className={styles.firstRunCardIcon}>
                    <Tool />
                  </span>
                  <h2>{t('settings.firstRun.maintenance.title')}</h2>
                </div>
              </div>
              <p>{t('settings.firstRun.maintenance.description')}</p>
              <div className={styles.firstRunSectionActions}>
                <Button
                  loading={actionLoading === 'install_prep'}
                  onClick={() => void runMaintenanceAction('install_prep')}
                  data-testid='opl-first-run-install-button'
                  aria-label='opl-first-run-install-button'
                >
                  {t('settings.firstRun.maintenance.installPrep')}
                </Button>
                <Button
                  loading={actionLoading === 'startup_maintenance'}
                  onClick={() => void runMaintenanceAction('startup_maintenance')}
                  data-testid='opl-first-run-open-environment-button'
                  aria-label='opl-first-run-open-environment-button'
                >
                  {t('settings.firstRun.maintenance.startupMaintenance')}
                </Button>
                <Button
                  loading={actionLoading === 'reconcile_modules'}
                  onClick={() => void runMaintenanceAction('reconcile_modules')}
                  data-testid='opl-first-run-open-modules-button'
                  aria-label='opl-first-run-open-modules-button'
                >
                  {t('settings.firstRun.maintenance.reconcileModules')}
                </Button>
              </div>
            </section>

            {actionResult ? (
              <section className={styles.firstRunCard}>
                <div className={styles.firstRunCardHeader}>
                  <h2>{t('settings.firstRun.lastAction')}</h2>
                  <Tag>{actionResult.surface}</Tag>
                </div>
                <pre className={styles.firstRunResult}>{resultPreview(actionResult)}</pre>
              </section>
            ) : (
              <Empty className='py-20px' description={t('settings.firstRun.noActionYet')} />
            )}
          </Collapse.Item>
        </Collapse>
      </div>
    </main>
  );
};

export default FirstRun;
