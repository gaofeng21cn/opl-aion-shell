/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ChannelDingTalkLogo from '@/renderer/assets/channel-logos/dingtalk.svg';
import ChannelDiscordLogo from '@/renderer/assets/channel-logos/discord.svg';
import ChannelLarkLogo from '@/renderer/assets/channel-logos/lark.svg';
import ChannelSlackLogo from '@/renderer/assets/channel-logos/slack.svg';
import ChannelTelegramLogo from '@/renderer/assets/channel-logos/telegram.svg';
import ChannelWecomLogo from '@/renderer/assets/channel-logos/wecom.svg';
import ChannelWeixinLogo from '@/renderer/assets/channel-logos/weixin.svg';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelConfig } from './types';

interface ChannelHeaderProps {
  channel: ChannelConfig;
}

const ChannelHeader: React.FC<ChannelHeaderProps> = ({ channel }) => {
  const { t } = useTranslation();
  const channelLogoMap: Record<string, { src: string; alt: string }> = {
    telegram: { src: ChannelTelegramLogo, alt: 'Telegram' },
    lark: { src: ChannelLarkLogo, alt: 'Lark' },
    dingtalk: { src: ChannelDingTalkLogo, alt: 'DingTalk' },
    slack: { src: ChannelSlackLogo, alt: 'Slack' },
    discord: { src: ChannelDiscordLogo, alt: 'Discord' },
    weixin: { src: ChannelWeixinLogo, alt: 'WeChat' },
    wecom: { src: ChannelWecomLogo, alt: 'WeCom' },
  };
  const builtinLogo = channelLogoMap[channel.id];
  // Extension channels may provide a custom icon via ChannelConfig
  const logoSrc = builtinLogo?.src || resolveExtensionAssetUrl(channel.icon);

  return (
    <div className='flex min-w-0 flex-1 items-center gap-8px' data-channel-header={channel.id}>
      {logoSrc && <img src={logoSrc} alt='' aria-hidden='true' className='h-14px w-14px shrink-0 object-contain' />}
      <span className='min-w-0 truncate text-14px text-t-primary'>{channel.title}</span>
      {channel.status === 'coming_soon' && (
        <Tag size='small' color='gray'>
          {t('settings.channels.comingSoon', 'Coming Soon')}
        </Tag>
      )}
    </div>
  );
};

export default ChannelHeader;
