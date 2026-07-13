/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Message, Modal, Spin, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import type { RuntimeSafeActionRoute, RuntimeTaskDrilldown } from '@/renderer/pages/settings/RuntimeSettings/types';
import {
  canArchiveRuntimeItem,
  matchRuntimeTaskDetail,
  parseRuntimeCommandResult,
  readActionResultSummary,
  readRuntimeArchivedAttempts,
  readRuntimeCockpitSummary,
  readRuntimeSafeActions,
  readRuntimeTaskDetails,
  runtimeAttemptId,
  type RuntimeArchivedAttempt,
} from './cockpit';
import { AgentAvailability } from './components/AgentAvailability';
import { RuntimeCockpitPanel } from './components/RuntimeCockpitPanel';
import { RuntimeDetailDrawer } from './components/RuntimeDetailDrawer';
import { ALL_RUNTIME_SCOPES, RuntimeScopeBar } from './components/RuntimeScopeBar';
import { RuntimeStatusBar } from './components/RuntimeStatusBar';
import { RuntimeWorkItemList } from './components/RuntimeWorkItemList';
import { matchesStatusView, type RuntimeTranslate } from './formatters';
import { readRuntimeWorkItemProjectionV2 } from './projection';
import type { RuntimeStatusView } from './types';
import styles from './RuntimePage.module.css';

const RUNTIME_RUNNING_REFRESH_MS = 30_000;
type RuntimePayload = Record<string, unknown>;

const RuntimePage: React.FC = () => {
  const { t, i18n } = useTranslation();
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [summaryDrilldown, setSummaryDrilldown] = useState<RuntimePayload | null>(null);
  const [fullDrilldown, setFullDrilldown] = useState<RuntimePayload | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [approvedActionId, setApprovedActionId] = useState<string | null>(null);
  const [actionResultPayload, setActionResultPayload] = useState<RuntimePayload | null>(null);
  const requestSeq = useRef({ summary: 0, full: 0, latest: 0 });
  const approvedActionIdRef = useRef<string | null>(null);
  const messageRef = useRef(message);
  const tRef = useRef(t);

  const updateApprovedAction = useCallback((actionId: string | null) => {
    approvedActionIdRef.current = actionId;
    setApprovedActionId(actionId);
  }, []);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const loadSummaryDrilldown = useCallback(
    async (showToast = false) => {
      requestSeq.current.summary += 1;
      requestSeq.current.latest += 1;
      const requestId = requestSeq.current.summary;
      const requestOrder = requestSeq.current.latest;
      setSummaryLoading(true);
      try {
        const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'summary' });
        if (requestSeq.current.summary !== requestId) return;
        const parsed = parseRuntimeCommandResult(result);
        if (!parsed) throw new Error(result.error?.message || result.command);
        setSummaryDrilldown(parsed);
        if (requestSeq.current.latest === requestOrder) {
          setFullDrilldown(null);
          updateApprovedAction(null);
        }
        if (showToast) messageRef.current.success(tRef.current('common.refreshSuccess'));
      } catch (error) {
        if (showToast) {
          messageRef.current.error(
            error instanceof Error ? error.message : tRef.current('settings.oplEnvironmentPage.messages.commandFailed')
          );
        }
      } finally {
        if (requestSeq.current.summary === requestId) setSummaryLoading(false);
      }
    },
    [updateApprovedAction]
  );

  const loadFullDrilldown = useCallback(
    async (showToast = false) => {
      requestSeq.current.full += 1;
      requestSeq.current.latest += 1;
      const requestId = requestSeq.current.full;
      const requestOrder = requestSeq.current.latest;
      setFullLoading(true);
      try {
        const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'full' });
        if (requestSeq.current.full !== requestId || requestSeq.current.latest !== requestOrder) return;
        const parsed = parseRuntimeCommandResult(result);
        if (!parsed) throw new Error(result.error?.message || result.command);
        setFullDrilldown(parsed);
        updateApprovedAction(null);
        if (showToast) messageRef.current.success(tRef.current('common.runtime.detailFullLoaded'));
      } catch (error) {
        if (showToast) {
          messageRef.current.error(
            error instanceof Error ? error.message : tRef.current('settings.oplEnvironmentPage.messages.commandFailed')
          );
        }
      } finally {
        if (requestSeq.current.full === requestId) setFullLoading(false);
      }
    },
    [updateApprovedAction]
  );

  useEffect(() => {
    void loadSummaryDrilldown();
  }, [loadSummaryDrilldown]);

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

  const visibleItems = useMemo(
    () => scopedItems.filter((item) => matchesStatusView(item, selectedStatusView)),
    [scopedItems, selectedStatusView]
  );
  const agentsById = useMemo(() => new Map(projection?.agents.map((agent) => [agent.id, agent]) ?? []), [projection]);
  const projectsById = useMemo(
    () => new Map(projection?.projects.map((project) => [project.id, project]) ?? []),
    [projection]
  );
  const selectedItem = useMemo(
    () => projection?.items.find((item) => item.id === selectedItemId) ?? null,
    [projection, selectedItemId]
  );
  const taskDetails = useMemo(
    () => readRuntimeTaskDetails(fullDrilldown, summaryDrilldown, appStateQuery.appState),
    [appStateQuery.appState, fullDrilldown, summaryDrilldown]
  );
  const taskDetailsByItemId = useMemo(() => {
    const result = new Map<string, RuntimeTaskDrilldown>();
    for (const item of projection?.items ?? []) {
      const detail = matchRuntimeTaskDetail(item, taskDetails);
      if (detail) result.set(item.id, detail);
    }
    return result;
  }, [projection, taskDetails]);
  const selectedTaskDetail = selectedItem ? (taskDetailsByItemId.get(selectedItem.id) ?? null) : null;
  const cockpitSummary = useMemo(
    () => readRuntimeCockpitSummary(fullDrilldown ?? summaryDrilldown),
    [fullDrilldown, summaryDrilldown]
  );
  const safeActions = useMemo(
    () => readRuntimeSafeActions(fullDrilldown, summaryDrilldown, appStateQuery.appState),
    [appStateQuery.appState, fullDrilldown, summaryDrilldown]
  );
  const archivedAttempts = useMemo(
    () => readRuntimeArchivedAttempts(fullDrilldown, summaryDrilldown, appStateQuery.appState),
    [appStateQuery.appState, fullDrilldown, summaryDrilldown]
  );
  const actionResult = useMemo(
    () => (actionResultPayload ? readActionResultSummary(actionResultPayload) : null),
    [actionResultPayload]
  );

  useEffect(() => {
    if (!approvedActionId || safeActions.some((action) => action.id === approvedActionId)) return;
    updateApprovedAction(null);
  }, [approvedActionId, safeActions, updateApprovedAction]);

  const refreshRuntime = useCallback(
    async (showToast = false) => {
      const nextPayload = await appStateQuery.load('fast', { showRefreshing: true });
      await loadSummaryDrilldown(false);
      if (!showToast) return;
      if (nextPayload) messageRef.current.success(tRef.current('common.refreshSuccess'));
      else messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
    },
    [appStateQuery.load, loadSummaryDrilldown]
  );

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

  const executeSafeAction = useCallback(
    async (action: RuntimeSafeActionRoute, dryRun: boolean) => {
      if (!dryRun && approvedActionIdRef.current !== action.id) {
        messageRef.current.error(tRef.current('common.runtime.executeFailed'));
        return;
      }
      const actionToken = `${dryRun ? 'dry-run' : 'execute'}:${action.id}`;
      setRunningActionId(actionToken);
      setActionResultPayload(null);
      updateApprovedAction(null);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({ actionId: action.id, dryRun });
        if (result.ok === false) throw new Error(result.error?.message || result.command);
        setActionResultPayload(parseRuntimeCommandResult(result) ?? {});
        if (dryRun) {
          updateApprovedAction(action.id);
          messageRef.current.success(tRef.current('common.runtime.dryRunSuccess'));
        } else {
          await refreshRuntime(false);
          messageRef.current.success(tRef.current('common.runtime.executeSuccess'));
        }
      } catch (error) {
        messageRef.current.error(
          error instanceof Error
            ? error.message
            : tRef.current(dryRun ? 'common.runtime.dryRunFailed' : 'common.runtime.executeFailed')
        );
      } finally {
        setRunningActionId(null);
      }
    },
    [refreshRuntime, updateApprovedAction]
  );

  const requestExecuteSafeAction = useCallback(
    (action: RuntimeSafeActionRoute) => {
      Modal.confirm({
        title: tRef.current('common.runtime.executeConfirmTitle', { action: action.label }),
        content: tRef.current('common.runtime.executeConfirmDescription', { action: action.label }),
        okText: tRef.current('common.runtime.execute'),
        cancelText: tRef.current('common.cancel'),
        onOk: () => executeSafeAction(action, false),
      });
    },
    [executeSafeAction]
  );

  const requestArchiveSelectedItem = useCallback(() => {
    if (!selectedItem) return;
    const stageAttemptId = runtimeAttemptId(selectedItem, selectedTaskDetail);
    if (!stageAttemptId) return;
    Modal.confirm({
      title: tRef.current('common.runtime.archiveTask.title'),
      content: tRef.current('common.runtime.archiveTask.description', { task: selectedItem.displayName }),
      okText: tRef.current('common.runtime.archiveTask.confirm'),
      cancelText: tRef.current('common.cancel'),
      onOk: async () => {
        setRunningActionId(`archive:${stageAttemptId}`);
        try {
          const result = await ipcBridge.oplRuntime.executeAction.invoke({
            actionId: 'runtime_archive_attempt',
            payloadRefsOnlyJson: {
              stage_attempt_id: stageAttemptId,
              reason: 'user_archived_from_runtime_overview',
            },
            dryRun: false,
          });
          if (result.ok === false) throw new Error(result.error?.message || result.command);
          setSelectedItemId(null);
          await refreshRuntime(false);
          messageRef.current.success(tRef.current('common.runtime.archiveTask.success'));
        } catch (error) {
          messageRef.current.error(
            error instanceof Error ? error.message : tRef.current('common.runtime.archiveTask.failed')
          );
        } finally {
          setRunningActionId(null);
        }
      },
    });
  }, [refreshRuntime, selectedItem, selectedTaskDetail]);

  const restoreArchivedAttempt = useCallback(
    async (attempt: RuntimeArchivedAttempt) => {
      setRunningActionId(`restore:${attempt.stageAttemptId}`);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'runtime_restore_attempt',
          payloadRefsOnlyJson: {
            stage_attempt_id: attempt.stageAttemptId,
            reason: 'user_restored_from_runtime_overview',
          },
          dryRun: false,
        });
        if (result.ok === false) throw new Error(result.error?.message || result.command);
        await refreshRuntime(false);
        messageRef.current.success(tRef.current('common.runtime.archiveTask.restoreSuccess'));
      } catch (error) {
        messageRef.current.error(
          error instanceof Error ? error.message : tRef.current('common.runtime.archiveTask.restoreFailed')
        );
      } finally {
        setRunningActionId(null);
      }
    },
    [refreshRuntime]
  );

  const projectionMessage = (() => {
    if (projectionRead.state === 'legacy') return t('common.runtime.projection.legacyDescription');
    if (projectionRead.state === 'invalid') return t('common.runtime.projection.invalidDescription');
    return t('common.runtime.projection.missingDescription');
  })();
  const selectedAttemptId = selectedItem ? runtimeAttemptId(selectedItem, selectedTaskDetail) : null;

  return (
    <main className={styles.page} data-testid='runtime-v2-page'>
      {messageContextHolder}
      <header className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <Typography.Title heading={3}>{t('common.runtime.title')}</Typography.Title>
          <Typography.Text className={styles.description}>{t('common.runtime.descriptionV2')}</Typography.Text>
        </div>
        {projection && (
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

      {appStateQuery.error && (
        <Alert type='warning' showIcon title={t('common.runtime.refreshFailed')} content={appStateQuery.error} />
      )}

      {!projection && appStateQuery.loading ? (
        <div className={styles.loadingState}>
          <Spin tip={t('common.runtime.refreshing')} />
        </div>
      ) : !projection ? (
        <Alert
          type='warning'
          showIcon
          title={t('common.runtime.projection.unavailableTitle')}
          content={projectionMessage}
          data-testid='runtime-projection-unavailable'
        />
      ) : (
        <div className={styles.content}>
          <RuntimeStatusBar
            items={scopedItems}
            selectedView={selectedStatusView}
            t={translate}
            onViewChange={setSelectedStatusView}
          />
          <RuntimeCockpitPanel
            summary={cockpitSummary}
            safeActions={safeActions}
            archivedAttempts={archivedAttempts}
            actionResult={actionResult}
            approvedActionId={approvedActionId}
            runningActionId={runningActionId}
            summaryLoading={summaryLoading}
            fullLoading={fullLoading}
            fullLoaded={Boolean(fullDrilldown)}
            t={translate}
            onLoadSummary={() => void loadSummaryDrilldown(true)}
            onLoadFull={() => void loadFullDrilldown(true)}
            onDryRun={(action) => void executeSafeAction(action, true)}
            onExecute={requestExecuteSafeAction}
            onRestore={(attempt) => void restoreArchivedAttempt(attempt)}
          />
          <div className={styles.workspaceGrid}>
            <RuntimeWorkItemList
              items={visibleItems}
              agentsById={agentsById}
              projectsById={projectsById}
              locale={i18n.resolvedLanguage ?? i18n.language}
              generatedAt={projection.generatedAt}
              t={translate}
              onOpen={(item) => setSelectedItemId(item.id)}
            />
            <AgentAvailability agents={projection.agents} t={translate} />
          </div>
        </div>
      )}

      <RuntimeDetailDrawer
        item={selectedItem}
        agent={selectedItem ? (agentsById.get(selectedItem.agentId) ?? null) : null}
        project={selectedItem ? (projectsById.get(selectedItem.projectId) ?? null) : null}
        locale={i18n.resolvedLanguage ?? i18n.language}
        generatedAt={projection?.generatedAt ?? null}
        t={translate}
        canArchive={selectedItem ? canArchiveRuntimeItem(selectedItem, selectedTaskDetail) : false}
        archiving={Boolean(selectedAttemptId && runningActionId === `archive:${selectedAttemptId}`)}
        onArchive={requestArchiveSelectedItem}
        onClose={() => setSelectedItemId(null)}
      />
    </main>
  );
};

export default RuntimePage;
