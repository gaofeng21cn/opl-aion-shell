/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { AgentSource } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '../types';
import { Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveLegacySettingsRoute } from '@/renderer/pages/settings/registry/settingsRegistry';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import styles from '../index.module.css';

type AgentPillBarProps = {
  availableAgents: AvailableAgent[];
  selectedAgentKey: string;
  getAgentKey: (agent: {
    agent_type: string;
    agent_source?: AgentSource;
    backend?: string;
    id?: string;
    custom_agent_id?: string;
  }) => string;
  onSelectAgent: (key: string) => void;
  suppressSelectionAnimation?: boolean;
};

const AgentPillBar: React.FC<AgentPillBarProps> = ({
  availableAgents,
  selectedAgentKey,
  getAgentKey,
  onSelectAgent,
  suppressSelectionAnimation = false,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const agentSettingsRoute = resolveLegacySettingsRoute('agent');
  const visibleAgents = availableAgents.filter((agent) => !agent.is_preset);

  if (visibleAgents.length <= 1 && visibleAgents[0]?.backend === 'codex') {
    return null;
  }

  return (
    <div className='w-full flex justify-center'>
      <div
        className={classNames(styles.agentPillBar, isMobile && styles.agentPillBarMobile)}
        data-opl-visual-source='deepseek-harness'
        data-opl-visual-pattern='pill'
      >
        {visibleAgents.map((agent) => {
          const isSelected = selectedAgentKey === getAgentKey(agent);
          const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
          // Remote and user-defined custom agents store emoji strings in
          // `avatar` — treat those as glyphs, not URLs. Builtin rows
          // store a logo URL in `icon` and fall through to
          // `resolveAgentLogo` below.
          const usesEmojiAvatar =
            (agent.agent_type === 'remote' || agent.agent_source === 'custom') && Boolean(agent.avatar);
          const emojiAvatar = usesEmojiAvatar ? agent.avatar : undefined;
          const logoSrc =
            extensionAvatar ||
            (!emojiAvatar
              ? resolveAgentLogo({
                  icon: agent.icon,
                  backend: agent.backend || agent.agent_type,
                  custom_agent_id: agent.custom_agent_id,
                  isExtension: agent.isExtension,
                })
              : undefined);

          return (
            <div
              key={getAgentKey(agent)}
              data-testid={`agent-pill-${agent.backend}`}
              data-agent-pill='true'
              data-agent-key={getAgentKey(agent)}
              data-agent-type={agent.agent_type}
              data-agent-selected={isSelected ? 'true' : 'false'}
              className={classNames(
                styles.agentPill,
                isSelected ? [styles.agentPillSelected, styles.agentItemSelected] : styles.agentPillIdle
              )}
              style={isSelected && (isMobile || suppressSelectionAnimation) ? { animation: 'none' } : undefined}
              onClick={() => onSelectAgent(getAgentKey(agent))}
            >
              {emojiAvatar ? (
                <span className={styles.agentPillAvatar}>{emojiAvatar}</span>
              ) : logoSrc ? (
                <img
                  src={logoSrc}
                  alt={`${agent.backend || agent.agent_type} logo`}
                  width={16}
                  height={16}
                  className={styles.agentPillAvatar}
                />
              ) : (
                <OplIcon name='agent' size={16} className={styles.agentPillAvatar} />
              )}
              <span className={classNames(styles.agentPillLabel, isSelected && styles.agentPillLabelSelected)}>
                {agent.name}
              </span>
            </div>
          );
        })}
        <Tooltip content={t('settings.agentManagement.discoverMoreAgents', { defaultValue: '发现更多 Agent' })}>
          <div
            data-testid='guid-agent-settings-shortcut'
            className={styles.agentPillSettings}
            onClick={() => navigate(agentSettingsRoute)}
          >
            <OplIcon name='plus' size={16} className='shrink-0' />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default AgentPillBar;
