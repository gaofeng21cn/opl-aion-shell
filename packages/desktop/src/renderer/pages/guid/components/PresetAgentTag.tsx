/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import type { AvailableAgent } from '../types';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { CheckOne, CloseSmall, Down, Robot } from '@icon-park/react';
import React from 'react';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { Dropdown, Menu } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

export type AgentSwitcherItem = {
  key: string;
  label: string;
  isCurrent: boolean;
};

type PresetAgentTagProps = {
  agentInfo: AvailableAgent;
  /** Backend-merged preset catalog used to resolve a localized name. */
  assistants: Assistant[];
  localeKey: string;
  onClose: () => void;
  agentLogo?: string | null;
  agentSwitcherItems?: AgentSwitcherItem[];
  onAgentSwitch?: (key: string) => void;
};

const PresetAgentTag: React.FC<PresetAgentTagProps> = ({
  agentInfo,
  assistants,
  localeKey,
  onClose,
  agentLogo,
  agentSwitcherItems,
  onAgentSwitch,
}) => {
  const { t } = useTranslation();
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const avatarValue = agentInfo.avatar?.trim();
  const mappedAvatar = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
  const resolvedAvatar = avatarValue ? resolveExtensionAssetUrl(avatarValue) : undefined;
  const avatarImage = mappedAvatar || resolvedAvatar;
  const isImageAvatar = Boolean(
    avatarImage &&
    (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) || /^(https?:|file:\/\/|data:|\/)/i.test(avatarImage))
  );
  const assistant = assistants.find((a) => a.id === agentInfo.custom_agent_id);
  const name = assistant?.name_i18n?.[localeKey] || assistant?.name || agentInfo.name;

  const hasSwitcher = Boolean(agentSwitcherItems && agentSwitcherItems.length > 0 && onAgentSwitch);

  const droplist = hasSwitcher ? (
    <Menu
      onClickMenuItem={(key) => {
        onAgentSwitch?.(key);
        setSwitcherOpen(false);
      }}
    >
      {agentSwitcherItems!.map((item) => (
        <Menu.Item key={item.key}>
          <div className='flex items-center justify-between gap-12px min-w-120px'>
            <span>{item.label}</span>
            {item.isCurrent ? <CheckOne theme='outline' size='14' fill='currentColor' aria-hidden='true' /> : null}
          </div>
        </Menu.Item>
      ))}
    </Menu>
  ) : null;

  const mainBodyContent = (
    <>
      {agentLogo ? (
        <>
          <img src={agentLogo} alt='' width={15} height={15} className={styles.presetAgentTagAgentLogo} />
          {hasSwitcher ? (
            <span className={styles.presetAgentTagChevron} aria-hidden='true'>
              <Down theme='outline' size={12} fill='currentColor' />
            </span>
          ) : null}
        </>
      ) : hasSwitcher ? (
        <span className={styles.presetAgentTagChevron} aria-hidden='true'>
          <Down theme='outline' size={12} fill='currentColor' />
        </span>
      ) : null}
      <span className={styles.presetAgentTagAt} aria-hidden='true'>
        @
      </span>
      {isImageAvatar ? (
        <img src={avatarImage} alt='' width={15} height={15} style={{ objectFit: 'contain', flexShrink: 0 }} />
      ) : avatarValue ? (
        <span style={{ fontSize: 14, lineHeight: '15px', flexShrink: 0 }}>{avatarValue}</span>
      ) : (
        <Robot theme='outline' size={15} style={{ flexShrink: 0 }} />
      )}
      <span className={styles.presetAgentTagName}>{name}</span>
    </>
  );

  const mainBody = hasSwitcher ? (
    <button
      type='button'
      className={`${styles.presetAgentTagMain} border-0 bg-transparent font-inherit text-inherit text-left cursor-pointer appearance-none`}
      aria-haspopup='menu'
      aria-expanded={switcherOpen}
      data-testid='preset-agent-switcher-trigger'
    >
      {mainBodyContent}
    </button>
  ) : (
    <div className={styles.presetAgentTagMain}>{mainBodyContent}</div>
  );

  return (
    <div className={styles.presetAgentTag}>
      {/* Left: agent logo | avatar + name + ▾ — whole area triggers agent switcher dropdown */}
      {hasSwitcher ? (
        <Dropdown
          trigger='click'
          position='bl'
          droplist={droplist}
          popupVisible={switcherOpen}
          onVisibleChange={setSwitcherOpen}
        >
          {mainBody}
        </Dropdown>
      ) : (
        mainBody
      )}

      <button
        type='button'
        className={styles.presetAgentTagClose}
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CloseSmall theme='outline' size='14' fill='currentColor' />
      </button>
    </div>
  );
};

export default PresetAgentTag;
