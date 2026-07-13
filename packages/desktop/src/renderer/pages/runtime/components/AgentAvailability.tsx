import { Collapse, Tag, Typography } from '@arco-design/web-react';
import { Attention, CheckOne } from '@icon-park/react';
import React from 'react';
import { availabilityLabel, type RuntimeTranslate } from '../formatters';
import type { RuntimeAgent } from '../types';
import styles from '../RuntimePage.module.css';

type AgentAvailabilityProps = {
  agents: RuntimeAgent[];
  t: RuntimeTranslate;
};

export function AgentAvailability({ agents, t }: AgentAvailabilityProps) {
  const attentionCount = agents.filter((agent) => agent.availability.state !== 'available').length;
  const allAvailable = attentionCount === 0;
  const summary = allAvailable
    ? t('common.runtime.agentAvailability.allAvailable', { count: agents.length })
    : t('common.runtime.agentAvailability.attentionSummary', { count: attentionCount });

  return (
    <section className={styles.agentAvailability} data-testid='runtime-agent-availability'>
      <Collapse bordered={false} defaultActiveKey={allAvailable ? [] : ['availability']}>
        <Collapse.Item
          name='availability'
          header={
            <div className={styles.agentAvailabilityHeader}>
              <span className={styles.agentAvailabilityIcon}>
                {allAvailable ? <CheckOne theme='outline' /> : <Attention theme='outline' />}
              </span>
              <Typography.Text className={styles.agentAvailabilitySummary}>{summary}</Typography.Text>
            </div>
          }
        >
          <div className={styles.agentAvailabilityList}>
            {agents.map((agent) => (
              <div className={styles.agentAvailabilityRow} key={agent.id}>
                <div className={styles.agentAvailabilityCopy}>
                  <Typography.Text className={styles.agentName}>{agent.displayName}</Typography.Text>
                  {agent.availability.state !== 'available' && (
                    <Typography.Text className={styles.agentMessage}>
                      {t(`common.runtime.agentAvailability.description.${agent.availability.state}`)}
                    </Typography.Text>
                  )}
                </div>
                <Tag>{availabilityLabel(agent.availability.state, t)}</Tag>
              </div>
            ))}
          </div>
        </Collapse.Item>
      </Collapse>
    </section>
  );
}
