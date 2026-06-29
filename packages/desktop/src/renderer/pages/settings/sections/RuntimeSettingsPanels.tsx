/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Tag, Typography } from '@arco-design/web-react';

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

export type RuntimeMaintenanceHubPrimaryAction = {
  label: string;
  help: string;
  loading?: boolean;
  disabled?: boolean;
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
    <div className='grid grid-cols-1 md:grid-cols-4 gap-14px' data-testid='opl-runtime-readiness-grid'>
      {cards.map((card) => (
        <Card key={`runtime-card-${card.key}`} bordered className='rd-8px'>
          <div className='flex flex-col gap-8px min-w-0'>
            <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
            <Tag color={card.tone}>{card.value}</Tag>
            <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
            <Typography.Text className='text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.summary.nextAction', { action: card.nextAction })}
            </Typography.Text>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function RuntimeHealthSummary({ items }: { items: RuntimeHealthSummaryItem[] }) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-4 gap-12px' data-testid='opl-runtime-health-summary'>
      {items.map((item) => (
        <Card key={`runtime-health-${item.key}`} bordered className='rd-8px'>
          <div className='flex flex-col gap-6px min-w-0'>
            <Typography.Text className='text-12px text-t-secondary'>{item.label}</Typography.Text>
            <Tag color={item.tone}>{item.value}</Tag>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function RuntimeMaintenanceHub({
  items,
  primaryAction,
  t,
}: {
  items: RuntimeMaintenanceHubItem[];
  primaryAction?: RuntimeMaintenanceHubPrimaryAction;
  t: RuntimeSettingsPanelsTranslate;
}) {
  return (
    <Card bordered className='rd-8px' data-testid='opl-maintenance-hub'>
      <div className='flex flex-col gap-14px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.maintenanceHub.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('settings.oplEnvironmentPage.maintenanceHub.description')}
            </Typography.Text>
          </div>
          {primaryAction && (
            <Button
              type='primary'
              data-testid='opl-maintenance-hub-make-usable'
              title={primaryAction.help}
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onAction}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12px'>
          {items.map((item) => (
            <div
              key={`maintenance-hub-${item.key}`}
              className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'
              data-testid={`opl-maintenance-hub-${item.key}`}
            >
              <div className='flex flex-col gap-10px min-w-0'>
                <div className='flex items-start gap-10px'>
                  <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                    {item.icon}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <Typography.Text className='block font-600 text-t-primary break-words'>
                      {item.title}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {item.detail}
                    </Typography.Text>
                  </div>
                  <Tag color={item.tone}>{item.status}</Tag>
                </div>
                <Button
                  size='small'
                  title={item.actionHelp}
                  loading={item.actionLoading}
                  disabled={item.actionDisabled}
                  onClick={item.onAction}
                >
                  {item.actionLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
