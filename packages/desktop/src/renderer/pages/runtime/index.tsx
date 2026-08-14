/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Message, Modal, Spin, Typography } from '@arco-design/web-react';
import { Copy, Refresh, Toolkit } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import OplUiContributionSlot from '@/renderer/components/opl/OplUiContributionSlot';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { RuntimeArchiveHeader } from './components/RuntimeArchiveHeader';
import { RuntimeDetailDrawer } from './components/RuntimeDetailDrawer';
import { ALL_RUNTIME_SCOPES, RuntimeScopeBar } from './components/RuntimeScopeBar';
import { RuntimeStatusBar } from './components/RuntimeStatusBar';
import { RuntimeWorkItemList } from './components/RuntimeWorkItemList';
import { matchesStatusView, type RuntimeTranslate } from './formatters';
import { readRuntimeWorkItemProjectionV2 } from './projection';
import type { RuntimeStatusView, RuntimeWorkItem } from './types';
import styles from './RuntimePage.module.css';

const RUNTIME_RUNNING_REFRESH_MS = 30_000;
const RUNTIME_DIAGNOSTIC_MAX_LENGTH = 4_096;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCodePoint(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
type RuntimePayload = Record<string, unknown>;
type RuntimePageState = 'loading' | 'ready' | 'empty' | 'error' | 'unavailable';
type RuntimeErrorKind = 'capability-catalog' | 'incompatible-configuration' | 'unavailable';

const RUNTIME_ERROR_COPY: Record<RuntimeErrorKind, { title: string; description: string }> = {
  'capability-catalog': {
    title: 'common.uiOptimization.runtime.errors.capabilityCatalogUnavailable.title',
    description: 'common.uiOptimization.runtime.errors.capabilityCatalogUnavailable.description',
  },
  'incompatible-configuration': {
    title: 'common.uiOptimization.runtime.errors.incompatibleConfiguration.title',
    description: 'common.uiOptimization.runtime.errors.incompatibleConfiguration.description',
  },
  unavailable: {
    title: 'common.uiOptimization.runtime.errors.unavailable.title',
    description: 'common.uiOptimization.runtime.errors.unavailable.description',
  },
};

function classifyRuntimeError(message: string): RuntimeErrorKind {
  const normalized = message.toLocaleLowerCase();
  if (
    /contract[_ -]?shape[_ -]?invalid|domain_detail_views|unknown (?:field|propert)|unsupported (?:field|propert)|schema (?:invalid|mismatch)|config(?:uration)? (?:format )?(?:invalid|incompatible)/i.test(
      normalized
    )
  ) {
    return 'incompatible-configuration';
  }
  if (/capabilit(?:y|ies)(?:[_ -](?:catalog|inventory))?|能力目录/i.test(normalized)) {
    return 'capability-catalog';
  }
  return 'unavailable';
}

function sanitizeRuntimeDiagnostic(message: string): string {
  const sanitized = message
    .replaceAll(ANSI_ESCAPE_PATTERN, '')
    .replaceAll(/\(node:\d+\)/gi, '(node)')
    .replaceAll(/(?:file:\/\/)?\/(?:Users|home|private|tmp|var|opt|etc|Applications|Volumes)\/[^\s"'<>]+/gi, '[path]')
    .replaceAll(/(^|[\s("'=:])\/(?:[A-Z0-9._~+-]+\/)*[A-Z0-9._~+-]+/gim, '$1[path]')
    .replaceAll(/[A-Z]:\\(?:[^\\\s"'<>]+\\?)+/gi, '[path]')
    .replaceAll(
      /((?:"|')?(?:api[_-]?key|(?:access[_-]?)?token|authorization)(?:"|')?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1[redacted]'
    )
    .replaceAll(/\bbearer\s+[A-Z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replaceAll(/\b(?:sk|sess|ghp|github_pat)-?[A-Z0-9_-]{12,}\b/gi, '[redacted]')
    .trim();
  return sanitized.slice(0, RUNTIME_DIAGNOSTIC_MAX_LENGTH);
}

type RuntimeRecoveryStateProps = {
  errorKind: RuntimeErrorKind;
  diagnostic: string;
  testId: 'runtime-error-state' | 'runtime-projection-unavailable';
  loading: boolean;
  t: RuntimeTranslate;
  onRetry: () => void;
  onOpenMaintenance: () => void;
  onCopyDiagnostic: (diagnostic: string) => void;
};

function RuntimeRecoveryState({
  errorKind,
  diagnostic,
  testId,
  loading,
  t,
  onRetry,
  onOpenMaintenance,
  onCopyDiagnostic,
}: RuntimeRecoveryStateProps): React.ReactElement {
  const copy = RUNTIME_ERROR_COPY[errorKind];
  return (
    <section className={styles.recoveryState} data-testid={testId} data-error-kind={errorKind}>
      <div className={styles.recoverySummary} data-testid='runtime-error-summary' role='status'>
        <Typography.Title heading={5}>{t(copy.title)}</Typography.Title>
        <Typography.Text>{t(copy.description)}</Typography.Text>
      </div>
      <div className={styles.recoveryActions}>
        <Button type='primary' icon={<Refresh />} loading={loading} onClick={onRetry}>
          {t('common.uiOptimization.runtime.actions.retry')}
        </Button>
        <Button icon={<Toolkit />} onClick={onOpenMaintenance}>
          {t('common.uiOptimization.runtime.actions.openMaintenance')}
        </Button>
      </div>
      <details className={styles.technicalDetails} data-testid='runtime-technical-details'>
        <summary>{t('common.uiOptimization.runtime.technicalDetails.label')}</summary>
        <div className={styles.technicalDetailsBody}>
          <pre className={styles.technicalDetailsContent}>{diagnostic}</pre>
          <Button size='small' icon={<Copy />} onClick={() => onCopyDiagnostic(diagnostic)}>
            {t('common.uiOptimization.runtime.technicalDetails.copy')}
          </Button>
        </div>
      </details>
    </section>
  );
}

type RuntimeSummaryProps = {
  availability: string;
  runningCount: number;
  attentionCount: number;
  t: RuntimeTranslate;
};

function RuntimeSummary({ availability, runningCount, attentionCount, t }: RuntimeSummaryProps): React.ReactElement {
  return (
    <dl className={styles.runtimeSummary} data-testid='runtime-summary'>
      <div className={styles.runtimeSummaryItem}>
        <dt>{t('common.uiOptimization.runtime.summary.availability')}</dt>
        <dd>{availability}</dd>
      </div>
      <div className={styles.runtimeSummaryItem}>
        <dt>{t('common.uiOptimization.runtime.summary.running')}</dt>
        <dd>{runningCount}</dd>
      </div>
      <div className={styles.runtimeSummaryItem}>
        <dt>{t('common.uiOptimization.runtime.summary.needsAttention')}</dt>
        <dd>{attentionCount}</dd>
      </div>
    </dl>
  );
}

function runtimeRecord(value: unknown): RuntimePayload | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RuntimePayload) : null;
}

function isWorkItemControlGenerationConflict(result: {
  parsed?: unknown;
  error?: { code?: string; message?: string };
}): boolean {
  const parsed = runtimeRecord(result.parsed);
  const parsedError = runtimeRecord(parsed?.error);
  const parsedDetails = runtimeRecord(parsed?.details) ?? runtimeRecord(parsedError?.details);
  const reasonCodes = [parsed?.reason_code, parsedError?.reason_code, parsedDetails?.reason_code];
  if (reasonCodes.includes('work_item_control_generation_conflict')) return true;
  return (
    result.error?.code === 'work_item_control_generation_conflict' ||
    result.error?.message === 'Work item control changed after it was read; refresh before retrying.'
  );
}

function findReadbackWorkItem(payload: unknown, selectedItem: RuntimeWorkItem): RuntimeWorkItem | null {
  const projection = readRuntimeWorkItemProjectionV2(payload).projection;
  return (
    projection?.items.find(
      (item) =>
        item.id === selectedItem.id &&
        item.agentId === selectedItem.agentId &&
        item.projectId === selectedItem.projectId &&
        item.workItemId === selectedItem.workItemId
    ) ?? null
  );
}

const RuntimePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const translate = t as RuntimeTranslate;
  const [message, messageContextHolder] = Message.useMessage();
  const appStateQuery = useOplAppState('fast');
  const projectionRead = useMemo(
    () => readRuntimeWorkItemProjectionV2(appStateQuery.appState),
    [appStateQuery.appState]
  );
  const projection = projectionRead.projection;
  const [selectedAgentId, setSelectedAgentId] = useState(ALL_RUNTIME_SCOPES);
  const [selectedProjectId, setSelectedProjectId] = useState(ALL_RUNTIME_SCOPES);
  const [selectedStatusView, setSelectedStatusView] = useState<RuntimeStatusView>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemSnapshot, setSelectedItemSnapshot] = useState<RuntimeWorkItem | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const messageRef = useRef(message);
  const tRef = useRef(t);

  const openItem = useCallback((item: RuntimeWorkItem) => {
    setSelectedItemId(item.id);
    setSelectedItemSnapshot(item);
  }, []);

  const closeItem = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemSnapshot(null);
  }, []);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const availableProjects = useMemo(() => {
    if (!projection || selectedAgentId === ALL_RUNTIME_SCOPES) return [];
    return projection.projects.filter((project) => project.agentId === selectedAgentId);
  }, [projection, selectedAgentId]);

  useEffect(() => {
    if (!projection) return;
    if (selectedAgentId !== ALL_RUNTIME_SCOPES && !projection.agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(ALL_RUNTIME_SCOPES);
      setSelectedProjectId(ALL_RUNTIME_SCOPES);
      return;
    }
    if (
      selectedProjectId !== ALL_RUNTIME_SCOPES &&
      !availableProjects.some((project) => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(ALL_RUNTIME_SCOPES);
    }
  }, [availableProjects, projection, selectedAgentId, selectedProjectId]);

  const scopedItems = useMemo(() => {
    if (!projection) return [];
    return projection.items.filter((item) => {
      if (selectedAgentId !== ALL_RUNTIME_SCOPES && item.agentId !== selectedAgentId) return false;
      if (selectedProjectId !== ALL_RUNTIME_SCOPES && item.projectId !== selectedProjectId) return false;
      return true;
    });
  }, [projection, selectedAgentId, selectedProjectId]);

  const scopedVisibleItems = useMemo(
    () => scopedItems.filter((item) => item.visibility.state === 'visible'),
    [scopedItems]
  );
  const scopedArchivedItems = useMemo(
    () => scopedItems.filter((item) => item.visibility.state === 'archived'),
    [scopedItems]
  );
  const statusFilteredItems = useMemo(
    () => scopedVisibleItems.filter((item) => matchesStatusView(item, selectedStatusView)),
    [scopedVisibleItems, selectedStatusView]
  );
  const agentsById = useMemo(() => new Map(projection?.agents.map((agent) => [agent.id, agent]) ?? []), [projection]);
  const projectsById = useMemo(
    () => new Map(projection?.projects.map((project) => [project.id, project]) ?? []),
    [projection]
  );
  const projectedSelectedItem = useMemo(
    () => projection?.items.find((item) => item.id === selectedItemId) ?? null,
    [projection, selectedItemId]
  );
  const selectedItem = projectedSelectedItem ?? (selectedItemId ? selectedItemSnapshot : null);

  useEffect(() => {
    if (projectedSelectedItem) setSelectedItemSnapshot(projectedSelectedItem);
  }, [projectedSelectedItem]);
  const refreshRuntime = useCallback(
    async (showToast = false, forceFresh = false) => {
      const nextPayload = await appStateQuery.load('fast', { showRefreshing: true, forceFresh });
      if (showToast) {
        if (nextPayload) messageRef.current.success(tRef.current('common.refreshSuccess'));
        else messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
      return nextPayload;
    },
    [appStateQuery.load]
  );

  const retryRuntime = useCallback(() => {
    void appStateQuery.load('fast', { forceFresh: true });
  }, [appStateQuery.load]);

  const openMaintenance = useCallback(() => {
    void navigate('/settings/environment?section=diagnostics');
  }, [navigate]);

  const copyRuntimeDiagnostic = useCallback((diagnostic: string) => {
    void copyText(diagnostic)
      .then(() => messageRef.current.success(tRef.current('common.uiOptimization.runtime.technicalDetails.copied')))
      .catch(() => messageRef.current.error(tRef.current('common.uiOptimization.runtime.technicalDetails.copyFailed')));
  }, []);

  useEffect(() => {
    if (!projection?.items.some((item) => item.execution.state === 'running')) return undefined;
    const timer = window.setInterval(() => {
      void appStateQuery.load('fast', { background: true });
    }, RUNTIME_RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [appStateQuery.load, projection]);

  const changeAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedProjectId(ALL_RUNTIME_SCOPES);
  };

  const openDomainDetailView = useCallback(
    (item: RuntimeWorkItem, viewId: string) => {
      void navigate(`/runtime/item/${encodeURIComponent(item.id)}/insights/${encodeURIComponent(viewId)}`);
    },
    [navigate]
  );

  const requestSelectedItemVisibility = useCallback(
    (visibilityState: 'visible' | 'archived') => {
      if (!selectedItem) return;
      const archive = visibilityState === 'archived';
      const payload: Record<string, unknown> = {
        agent_id: selectedItem.agentId,
        project_id: selectedItem.projectId,
        work_item_id: selectedItem.workItemId,
        visibility_state: visibilityState,
        reason: archive ? 'user_archived_from_runtime_overview' : 'user_restored_from_runtime_archive',
      };
      if (selectedItem.visibility.generation !== null) {
        payload.expected_generation = selectedItem.visibility.generation;
      }
      Modal.confirm({
        title: tRef.current(
          archive ? 'common.runtime.archivedTasks.archiveTitle' : 'common.runtime.archivedTasks.restoreTitle'
        ),
        content: tRef.current(
          archive
            ? 'common.runtime.archivedTasks.archiveDescription'
            : 'common.runtime.archivedTasks.restoreDescription',
          { task: selectedItem.displayName }
        ),
        okText: tRef.current(archive ? 'common.runtime.archivedTasks.archive' : 'common.runtime.archivedTasks.restore'),
        cancelText: tRef.current('common.cancel'),
        onOk: async () => {
          setRunningActionId(`visibility:${selectedItem.id}:${visibilityState}`);
          try {
            const result = await ipcBridge.oplRuntime.executeAction.invoke({
              actionId: 'work_item_visibility_set',
              payloadRefsOnlyJson: payload,
              dryRun: false,
            });
            if (result.ok === false) {
              if (isWorkItemControlGenerationConflict(result)) {
                const conflictReadback = await refreshRuntime(false, true);
                const conflictItem = findReadbackWorkItem(conflictReadback, selectedItem);
                messageRef.current.error(
                  tRef.current(
                    conflictItem
                      ? 'common.runtime.archivedTasks.generationConflict'
                      : 'common.runtime.archivedTasks.generationConflictRefreshFailed'
                  )
                );
                return;
              }
              throw new Error(result.error?.message || result.command);
            }
            const refreshedPayload = await refreshRuntime(false, true);
            const refreshedItem = findReadbackWorkItem(refreshedPayload, selectedItem);
            if (refreshedItem?.visibility.state !== visibilityState) {
              messageRef.current.error(tRef.current('common.runtime.archivedTasks.readbackFailed'));
              return;
            }
            closeItem();
            messageRef.current.success(
              tRef.current(
                archive ? 'common.runtime.archivedTasks.archiveSuccess' : 'common.runtime.archivedTasks.restoreSuccess'
              )
            );
          } catch (error) {
            messageRef.current.error(
              error instanceof Error
                ? error.message
                : tRef.current(
                    archive
                      ? 'common.runtime.archivedTasks.archiveFailed'
                      : 'common.runtime.archivedTasks.restoreFailed'
                  )
            );
          } finally {
            setRunningActionId(null);
          }
        },
      });
    },
    [closeItem, refreshRuntime, selectedItem]
  );

  const projectionMessage = (() => {
    if (projectionRead.state === 'invalid') return t('common.runtime.projection.invalidDescription');
    return t('common.runtime.projection.missingDescription');
  })();
  const pageState: RuntimePageState = appStateQuery.error
    ? 'error'
    : !projection && appStateQuery.loading
      ? 'loading'
      : !projection
        ? 'unavailable'
        : projection.items.length === 0
          ? 'empty'
          : 'ready';
  const runtimeErrorKind = classifyRuntimeError(appStateQuery.error ?? '');
  const projectionErrorKind: RuntimeErrorKind =
    projectionRead.state === 'invalid' ? 'incompatible-configuration' : 'unavailable';
  const runtimeDiagnostic = sanitizeRuntimeDiagnostic(
    appStateQuery.error ?? `projection_state=${projectionRead.state}\n${projectionMessage}`
  );
  const runningCount = scopedVisibleItems.filter((item) => item.execution.state === 'running').length;
  const attentionCount = scopedVisibleItems.filter((item) =>
    ['awaiting_user_decision', 'system_attention', 'sync_pending'].includes(item.primaryStatus)
  ).length;
  const summary = projection ? (
    <RuntimeSummary
      availability={t('common.runtime.agentAvailability.available')}
      runningCount={runningCount}
      attentionCount={attentionCount}
      t={translate}
    />
  ) : null;
  return (
    <main className={styles.page} data-testid='runtime-v2-page'>
      {messageContextHolder}
      <header className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <Typography.Title heading={3} className={styles.pageTitle}>
            {t('common.runtime.title')}
          </Typography.Title>
          <Typography.Text className={styles.description}>{t('common.runtime.descriptionV2')}</Typography.Text>
        </div>
        {projection && (pageState === 'ready' || pageState === 'empty') && (
          <RuntimeScopeBar
            agents={projection.agents}
            projects={availableProjects}
            selectedAgentId={selectedAgentId}
            selectedProjectId={selectedProjectId}
            loadedAt={appStateQuery.loadedAt}
            refreshing={appStateQuery.refreshing}
            t={translate}
            onAgentChange={changeAgent}
            onProjectChange={setSelectedProjectId}
            onRefresh={() => void refreshRuntime(false)}
          />
        )}
      </header>

      <OplUiContributionSlot slot='runtime.detail' />

      {pageState === 'loading' && (
        <div className={styles.loadingState} data-testid='runtime-loading-state'>
          <Spin tip={t('common.uiOptimization.runtime.states.loading')} />
        </div>
      )}

      {pageState === 'error' && (
        <RuntimeRecoveryState
          errorKind={runtimeErrorKind}
          diagnostic={runtimeDiagnostic}
          testId='runtime-error-state'
          loading={appStateQuery.loading || appStateQuery.refreshing}
          t={translate}
          onRetry={retryRuntime}
          onOpenMaintenance={openMaintenance}
          onCopyDiagnostic={copyRuntimeDiagnostic}
        />
      )}

      {pageState === 'unavailable' && (
        <RuntimeRecoveryState
          errorKind={projectionErrorKind}
          diagnostic={runtimeDiagnostic}
          testId='runtime-projection-unavailable'
          loading={appStateQuery.loading || appStateQuery.refreshing}
          t={translate}
          onRetry={retryRuntime}
          onOpenMaintenance={openMaintenance}
          onCopyDiagnostic={copyRuntimeDiagnostic}
        />
      )}

      {pageState === 'empty' && (
        <div className={styles.content} data-testid='runtime-empty-state'>
          {summary}
          <div className={styles.emptyPageState}>{t('common.uiOptimization.runtime.states.empty')}</div>
        </div>
      )}

      {pageState === 'ready' && (
        <div className={styles.content} data-testid='runtime-ready-state'>
          {summary}
          {showArchived ? (
            <>
              <RuntimeArchiveHeader
                count={scopedArchivedItems.length}
                t={translate}
                onBack={() => {
                  closeItem();
                  setShowArchived(false);
                }}
              />
              <RuntimeWorkItemList
                items={scopedArchivedItems}
                agentsById={agentsById}
                projectsById={projectsById}
                locale={i18n.resolvedLanguage ?? i18n.language}
                generatedAt={projection.generatedAt}
                t={translate}
                emptyDescription={t('common.runtime.archivedTasks.empty')}
                onOpen={openItem}
              />
            </>
          ) : (
            <>
              <RuntimeStatusBar
                items={scopedVisibleItems}
                archivedCount={scopedArchivedItems.length}
                selectedView={selectedStatusView}
                t={translate}
                onViewChange={setSelectedStatusView}
                onOpenArchived={() => {
                  closeItem();
                  setShowArchived(true);
                }}
              />
              <RuntimeWorkItemList
                items={statusFilteredItems}
                agentsById={agentsById}
                projectsById={projectsById}
                locale={i18n.resolvedLanguage ?? i18n.language}
                generatedAt={projection.generatedAt}
                t={translate}
                onOpen={openItem}
              />
            </>
          )}
        </div>
      )}

      <RuntimeDetailDrawer
        item={pageState === 'ready' ? selectedItem : null}
        locale={i18n.resolvedLanguage ?? i18n.language}
        t={translate}
        visibilityChanging={Boolean(selectedItem && runningActionId?.startsWith(`visibility:${selectedItem.id}:`))}
        onOpenDomainDetailView={openDomainDetailView}
        onVisibilityChange={requestSelectedItemVisibility}
        onClose={closeItem}
      />
    </main>
  );
};

export default RuntimePage;
