/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Spin, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { AgentAvailability } from './components/AgentAvailability';
import { RuntimeDetailDrawer } from './components/RuntimeDetailDrawer';
import { ALL_RUNTIME_SCOPES, RuntimeScopeBar } from './components/RuntimeScopeBar';
import { RuntimeStatusBar } from './components/RuntimeStatusBar';
import { RuntimeWorkItemList } from './components/RuntimeWorkItemList';
import { matchesStatusView, type RuntimeTranslate } from './formatters';
import { readRuntimeWorkItemProjectionV2 } from './projection';
import type { RuntimeStatusView } from './types';
import styles from './RuntimePage.module.css';

const RUNTIME_RUNNING_REFRESH_MS = 30_000;

const RuntimePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const translate = t as RuntimeTranslate;
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

  const projectionMessage = (() => {
    if (projectionRead.state === 'legacy') return t('common.runtime.projection.legacyDescription');
    if (projectionRead.state === 'invalid') return t('common.runtime.projection.invalidDescription');
    return t('common.runtime.projection.missingDescription');
  })();

  return (
    <main className={styles.page} data-testid='runtime-v2-page'>
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
            onRefresh={() => void appStateQuery.load('fast', { showRefreshing: true })}
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
      )}

      <RuntimeDetailDrawer
        item={selectedItem}
        agent={selectedItem ? (agentsById.get(selectedItem.agentId) ?? null) : null}
        project={selectedItem ? (projectsById.get(selectedItem.projectId) ?? null) : null}
        locale={i18n.resolvedLanguage ?? i18n.language}
        generatedAt={projection?.generatedAt ?? null}
        t={translate}
        onClose={() => setSelectedItemId(null)}
      />
    </main>
  );
};

export default RuntimePage;
