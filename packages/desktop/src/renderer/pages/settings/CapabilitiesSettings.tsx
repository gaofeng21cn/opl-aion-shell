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
import { Experiment, FilePpt, FileWord, SettingConfig } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SkillsHubSettings from './SkillsHubSettings';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

export type CapabilitiesTab = 'skills' | 'tools';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab => value === 'skills' || value === 'tools';

type CapabilitiesSettingsContentProps = {
  activeTab: CapabilitiesTab;
  onTabChange: (tab: CapabilitiesTab) => void;
};

export const CapabilitiesSettingsContent: React.FC<CapabilitiesSettingsContentProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();

  const purposeCapabilities = [
    {
      key: 'research',
      icon: <Experiment theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.research.title'),
      description: t('settings.capabilitiesPage.purposes.research.description'),
      tags: ['MAS', 'PDF', 'DOCX'],
    },
    {
      key: 'grant',
      icon: <FileWord theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.grant.title'),
      description: t('settings.capabilitiesPage.purposes.grant.description'),
      tags: ['MAG', 'DOCX', 'XLSX'],
    },
    {
      key: 'presentation',
      icon: <FilePpt theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.presentation.title'),
      description: t('settings.capabilitiesPage.purposes.presentation.description'),
      tags: ['RCA', 'PPTX', 'Figures'],
    },
    {
      key: 'automation',
      icon: <SettingConfig theme='outline' />,
      title: t('settings.capabilitiesPage.purposes.automation.title'),
      description: t('settings.capabilitiesPage.purposes.automation.description'),
      tags: ['OMA', 'Skills', 'Tools'],
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
          {purposeCapabilities.map((item) => (
            <Card key={item.key} bordered className='rd-8px'>
              <div className='flex items-start gap-12px'>
                <span className='w-32px h-32px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  {item.icon}
                </span>
                <div className='min-w-0 flex-1'>
                  <Typography.Text className='block font-600 text-t-primary mb-4px'>{item.title}</Typography.Text>
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
          ))}
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
        <Tabs.TabPane key='tools' title={t('settings.capabilitiesTab.tools', { defaultValue: 'MCP & Voice' })}>
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
