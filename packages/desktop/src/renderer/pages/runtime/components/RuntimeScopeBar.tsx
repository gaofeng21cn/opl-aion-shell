import { Button, Select, Typography } from '@arco-design/web-react';
import { Refresh, Right } from '@icon-park/react';
import React from 'react';
import type { RuntimeTranslate } from '../formatters';
import type { RuntimeAgent, RuntimeProject } from '../types';
import styles from '../RuntimePage.module.css';

export const ALL_RUNTIME_SCOPES = '__all__';

type RuntimeScopeBarProps = {
  agents: RuntimeAgent[];
  projects: RuntimeProject[];
  selectedAgentId: string;
  selectedProjectId: string;
  loadedAt: string | null;
  refreshing: boolean;
  t: RuntimeTranslate;
  onAgentChange: (agentId: string) => void;
  onProjectChange: (projectId: string) => void;
  onRefresh: () => void;
};

export function RuntimeScopeBar({
  agents,
  projects,
  selectedAgentId,
  selectedProjectId,
  loadedAt,
  refreshing,
  t,
  onAgentChange,
  onProjectChange,
  onRefresh,
}: RuntimeScopeBarProps) {
  const agentOptions = [
    { label: t('common.runtime.scope.allAgents'), value: ALL_RUNTIME_SCOPES },
    ...agents.map((agent) => ({ label: agent.displayName, value: agent.id })),
  ];
  const projectOptions = [
    { label: t('common.runtime.scope.allProjects'), value: ALL_RUNTIME_SCOPES },
    ...projects.map((project) => ({ label: project.displayName, value: project.id })),
  ];

  return (
    <section className={styles.scopeBar} aria-label={t('common.runtime.scopeSelector')} data-testid='runtime-scope-bar'>
      <div className={styles.scopeGroup}>
        <Typography.Text className={styles.scopeHeading}>{t('common.runtime.scope.viewing')}</Typography.Text>
        <div className={styles.scopeControls}>
          <div className={styles.scopeField}>
            <Typography.Text className={styles.scopeLabel} id='runtime-agent-scope-label'>
              {t('common.runtime.scope.agent')}
            </Typography.Text>
            <Select
              data-testid='runtime-agent-selector'
              value={selectedAgentId}
              options={agentOptions}
              aria-labelledby='runtime-agent-scope-label'
              onChange={onAgentChange}
            />
          </div>
          <span className={styles.scopeConnector} aria-hidden='true'>
            <Right theme='outline' />
          </span>
          <div className={styles.scopeField}>
            <Typography.Text className={styles.scopeLabel} id='runtime-project-scope-label'>
              {t('common.runtime.scope.project')}
            </Typography.Text>
            <Select
              data-testid='runtime-project-selector'
              value={selectedProjectId}
              options={projectOptions}
              disabled={selectedAgentId === ALL_RUNTIME_SCOPES}
              aria-labelledby='runtime-project-scope-label'
              onChange={onProjectChange}
            />
          </div>
        </div>
      </div>
      <div className={styles.refreshArea}>
        <Typography.Text className={styles.loadedAt}>
          {loadedAt ? t('common.runtime.loadedAt', { time: loadedAt }) : t('common.runtime.refreshing')}
        </Typography.Text>
        <Button
          icon={<Refresh theme='outline' />}
          loading={refreshing}
          onClick={onRefresh}
          data-testid='runtime-refresh-button'
        >
          {t('common.refresh')}
        </Button>
      </div>
    </section>
  );
}
