/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tag, Typography } from '@arco-design/web-react';

export type RuntimeSettingsTone = 'green' | 'orange';

export type RuntimeReadinessCard = {
  key: string;
  title: string;
  value: string;
  detail: string;
  nextAction: string;
  tone: RuntimeSettingsTone;
};

export type RuntimeHealthSummaryItem = {
  key: string;
  label: string;
  value: string;
  tone: RuntimeSettingsTone;
};

export type RuntimeMaintenanceHubItem = {
  key: string;
  title: string;
  detail: string;
  status: string;
  tone: RuntimeSettingsTone;
  icon: React.ReactNode;
  actionLabel: string;
  actionHelp?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction: () => void;
};

type RuntimeSettingsPanelsTranslate = (key: string, options?: Record<string, string | number>) => string;

export function RuntimeReadinessGrid({
  cards,
  t,
}: {
  cards: RuntimeReadinessCard[];
  t: RuntimeSettingsPanelsTranslate;
}) {
  return (
    <div className='opl-settings-section bg-transparent' data-testid='opl-runtime-readiness-grid'>
      <div className='opl-settings-list'>
        {cards.map((card) => (
          <div key={`runtime-card-${card.key}`} className='opl-settings-row'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
              <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
              <Typography.Text className='text-12px text-t-secondary break-words'>
                {t('settings.oplEnvironmentPage.summary.nextAction', { action: card.nextAction })}
              </Typography.Text>
            </div>
            <div className='opl-settings-row__meta'>
              <Tag color={card.tone}>{card.value}</Tag>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RuntimeHealthSummary({ items }: { items: RuntimeHealthSummaryItem[] }) {
  return (
    <div className='opl-settings-list' data-testid='opl-runtime-health-summary'>
      {items.map((item) => (
        <div key={`runtime-health-${item.key}`} className='opl-settings-row'>
          <div className='opl-settings-row__main'>
            <Typography.Text className='font-500 text-t-primary'>{item.label}</Typography.Text>
          </div>
          <div className='opl-settings-row__meta'>
            <span
              className={`opl-settings-status ${item.tone === 'green' ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
            >
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
