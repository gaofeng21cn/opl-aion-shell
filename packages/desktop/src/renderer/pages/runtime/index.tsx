/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Message, Modal, Spin, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
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
type RuntimePayload = Record<string, unknown>;

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
    async (showToast = false) => {
      const nextPayload = await appStateQuery.load('fast', { showRefreshing: true });
      if (showToast) {
        if (nextPayload) messageRef.current.success(tRef.current('common.refreshSuccess'));
        else messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
      return nextPayload;
    },
    [appStateQuery.load]
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
                const conflictReadback = await refreshRuntime(false);
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
            const refreshedPayload = await refreshRuntime(false);
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
    if (projectionRead.state === 'legacy') return t('common.runtime.projection.legacyDescription');
    if (projectionRead.state === 'invalid') return t('common.runtime.projection.invalidDescription');
    return t('common.runtime.projection.missingDescription');
  })();
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
        item={selectedItem}
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
