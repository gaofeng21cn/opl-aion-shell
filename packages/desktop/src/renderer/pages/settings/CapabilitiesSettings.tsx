/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CapabilitiesSettings — Combined page for Skills Hub and MCP/Tools.
 *
 * This page merges the previously separate "Skills Hub" (skill packs) and
 * "Tools" (MCP servers + speech-to-text) pages into a single "Capabilities"
 * entry, accessible via /settings/capabilities.
 *
 * Old routes (/settings/skills-hub and /settings/tools) are redirected here
 * with a ?tab= query parameter to select the appropriate tab.
 */

import { Card, Tag, Tabs, Typography } from '@arco-design/web-react';
import { Experiment, FilePpt, FileWord, Robot, SettingConfig, Tool } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SkillsHubSettings from './SkillsHubSettings';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';

export type CapabilitiesTab = 'skills' | 'tools';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab => value === 'skills' || value === 'tools';

type RuntimeModuleItem = Record<string, unknown>;

type CapabilityStatus = 'available' | 'needsUpdate' | 'needsRepair' | 'notConfigured';

type PurposeCapability = {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tags: string[];
  moduleIds: string[];
};

function normalizeCapabilityModuleId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function capabilityModuleId(module: RuntimeModuleItem): string {
  return normalizeCapabilityModuleId(
    oplString(module.module_id) ??
      oplString(module.id) ??
      oplString(module.name) ??
      oplString(module.display_name) ??
      ''
  );
}

function capabilityModuleRecords(value: unknown): RuntimeModuleItem[] {
  if (Array.isArray(value)) return oplRecordList(value);
  const record = oplRecord(value);
  return Object.entries(record)
    .filter(([, module]) => Object.keys(oplRecord(module)).length > 0)
    .map(([id, module]) => Object.assign({}, oplRecord(module), { module_id: id }));
}

function capabilityModuleStatus(module: RuntimeModuleItem | undefined): string {
  if (!module) return 'not_configured';
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

function capabilityStatus(module: RuntimeModuleItem | undefined): CapabilityStatus {
  const status = capabilityModuleStatus(module);
  const action = oplString(module?.recommended_action);
  if (!module || status === 'missing' || status === 'not_installed' || status === 'notInstalled')
    return 'notConfigured';
  if (['update', 'install', 'reinstall'].includes(action ?? '') || ['update_available', 'staged'].includes(status)) {
    return 'needsUpdate';
  }
  if (
    [
      'dirty',
      'manual_required',
      'skipped_manual_required',
      'failed',
      'failed_with_repair',
      'degraded',
      'blocking',
      'attention_required',
    ].includes(status)
  ) {
    return 'needsRepair';
  }
  if (['ready', 'compatible', 'ok', 'installed', 'current'].includes(status)) return 'available';
  return 'needsRepair';
}

function capabilityStatusColor(status: CapabilityStatus): 'green' | 'orange' | 'red' | 'gray' {
  if (status === 'available') return 'green';
  if (status === 'needsUpdate') return 'orange';
  if (status === 'needsRepair') return 'red';
  return 'gray';
}

type CapabilitiesSettingsContentProps = {
  activeTab: CapabilitiesTab;
  onTabChange: (tab: CapabilitiesTab) => void;
};

export const CapabilitiesSettingsContent: React.FC<CapabilitiesSettingsContentProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const modulesPayload = oplRecord(appStateQuery.appState.modules);
  const modules = React.useMemo(() => {
    const byId = new Map<string, RuntimeModuleItem>();
    for (const module of capabilityModuleRecords(modulesPayload.items ?? modulesPayload.modules ?? modulesPayload)) {
      byId.set(capabilityModuleId(module), module);
    }
    return byId;
  }, [modulesPayload]);

  const purposeCapabilities: PurposeCapability[] = [
    {
      key: 'research',
      icon: <Experiment theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.research.title'),
      description: t('settings.capabilitiesPage.purposes.research.description'),
      tags: ['MAS', 'PDF', 'DOCX'],
      moduleIds: ['medautoscience', 'mas'],
    },
    {
      key: 'grant',
      icon: <FileWord theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.grant.title'),
      description: t('settings.capabilitiesPage.purposes.grant.description'),
      tags: ['MAG', 'DOCX', 'XLSX'],
      moduleIds: ['medautogrant', 'mag'],
    },
    {
      key: 'presentation',
      icon: <FilePpt theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.presentation.title'),
      description: t('settings.capabilitiesPage.purposes.presentation.description'),
      tags: ['RCA', 'PPTX', 'Figures'],
      moduleIds: ['redcube', 'rca'],
    },
    {
      key: 'writing',
      icon: <FileWord theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.writing.title'),
      description: t('settings.capabilitiesPage.purposes.writing.description'),
      tags: ['BookForge', 'DOCX', 'Manuscript'],
      moduleIds: ['oplbookforge', 'bookforge'],
    },
    {
      key: 'automation',
      icon: <SettingConfig theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.automation.title'),
      description: t('settings.capabilitiesPage.purposes.automation.description'),
      tags: ['OMA', 'Skills', 'Tools'],
      moduleIds: ['oplmetaagent', 'oma'],
    },
  ];

  return (
    <>
      <div className='flex flex-col gap-16px mb-18px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.capabilitiesPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.capabilitiesPage.description')}</Typography.Text>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
          {purposeCapabilities.map((item) => {
            const module = item.moduleIds.map((id) => modules.get(id)).find(Boolean);
            const status = capabilityStatus(module);
            return (
              <Card key={item.key} bordered className='rd-8px' data-testid={`capability-purpose-${item.key}`}>
                <div className='flex items-start gap-12px'>
                  <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                    {item.icon}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-8px mb-4px'>
                      <Typography.Text className='font-600 text-t-primary'>{item.title}</Typography.Text>
                      <Tag color={capabilityStatusColor(status)}>{t(`settings.capabilitiesPage.status.${status}`)}</Tag>
                    </div>
                    <Typography.Text className='block text-13px text-t-secondary mb-10px break-words'>
                      {item.description}
                    </Typography.Text>
                    <div className='flex flex-wrap gap-6px'>
                      {item.tags.map((tag) => (
                        <Tag key={`${item.key}-${tag}`} color='arcoblue'>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
          <Card bordered className='rd-8px' data-testid='capability-entry-external-tools'>
            <div className='flex items-start gap-12px'>
              <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                <Tool theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.capabilitiesPage.entries.externalTools.title')}
                </Typography.Text>
                <Typography.Text className='block text-13px text-t-secondary break-words'>
                  {t('settings.capabilitiesPage.entries.externalTools.description')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary break-words mt-6px'>
                  {t('settings.capabilitiesPage.entries.externalTools.technical')}
                </Typography.Text>
              </div>
            </div>
          </Card>
          <Card bordered className='rd-8px' data-testid='capability-entry-custom-assistants'>
            <div className='flex items-start gap-12px'>
              <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                <Robot theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.capabilitiesPage.entries.customAssistants.title')}
                </Typography.Text>
                <Typography.Text className='block text-13px text-t-secondary break-words'>
                  {t('settings.capabilitiesPage.entries.customAssistants.description')}
                </Typography.Text>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Tabs
        activeTab={activeTab}
        onChange={(key) => {
          if (isCapabilitiesTab(key)) onTabChange(key);
        }}
        type='line'
        className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'
      >
        <Tabs.TabPane key='skills' title={t('settings.capabilitiesTab.skills', { defaultValue: 'Skills' })}>
          <SkillsHubSettings withWrapper={false} />
        </Tabs.TabPane>
        <Tabs.TabPane
          key='tools'
          title={t('settings.capabilitiesTab.tools', { defaultValue: 'External tools & voice' })}
        >
          <ToolsModalContent />
        </Tabs.TabPane>
      </Tabs>
    </>
  );
};

const CapabilitiesSettings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Initialize from URL synchronously to avoid a flash of the default tab.
  const [activeTab, setActiveTab] = useState<CapabilitiesTab>(() => {
    const tabParam = searchParams.get('tab');
    return isCapabilitiesTab(tabParam) ? tabParam : 'skills';
  });

  // Re-sync if the URL changes externally (e.g. browser back/forward).
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (isCapabilitiesTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (key: CapabilitiesTab) => {
    setActiveTab(key);
    // Preserve any other query params the embedded content may rely on.
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <CapabilitiesSettingsContent activeTab={activeTab} onTabChange={handleTabChange} />
    </SettingsPageWrapper>
  );
};

export default CapabilitiesSettings;
