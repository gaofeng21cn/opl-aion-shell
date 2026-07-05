/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/styles/colors';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  buildSettingsModalMenuItems,
  capabilityDetailTabFor,
  getSearchableSecondarySettingsModalItems,
  getSettingsRenderSlot,
  normalizeOplSettingsTab,
  normalizeSearchText,
  type SettingsModalMenuItem,
} from '@/renderer/pages/settings/registry/settingsRegistry';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { Input, Tabs } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExtensionSettingsTabContent from './contents/ExtensionSettingsTabContent';
import SettingsShellAdapterSlot from './SettingsShellAdapterSlot';
import type { CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';
import type { SettingTab } from './index';

const SIDEBAR_WIDTH = 200;

type SettingsMenuItem = {
  key: SettingTab;
  label: string;
  icon: React.ReactNode;
  searchText: string;
};

const toSettingsMenuItem = (item: SettingsModalMenuItem): SettingsMenuItem => ({
  key: item.id,
  label: item.label,
  icon: item.icon,
  searchText: item.searchText,
});

type SettingsHostProps = {
  visible: boolean;
  defaultTab: SettingTab;
  isMobile: boolean;
  mobileContentHeight: string;
  desktopContentHeight: number;
};

const SettingsHost: React.FC<SettingsHostProps> = ({
  visible,
  defaultTab,
  isMobile,
  mobileContentHeight,
  desktopContentHeight,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingTab>(() => normalizeOplSettingsTab(defaultTab));
  const [capabilitiesTab, setCapabilitiesTab] = useState<CapabilitiesTab>(() => capabilityDetailTabFor(defaultTab));
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const extensionTabMap = useMemo(() => {
    const map = new Map<string, IExtensionSettingsTab>();
    for (const tab of extensionTabs) {
      map.set(tab.id, tab);
    }
    return map;
  }, [extensionTabs]);

  const menuItems = useMemo((): SettingsMenuItem[] => {
    return buildSettingsModalMenuItems({ extensionTabs, resolveExtTabName, t }).map(toSettingsMenuItem);
  }, [t, extensionTabs, resolveExtTabName]);

  const filteredMenuItems = useMemo(() => {
    const query = normalizeSearchText(menuSearchQuery);
    if (!query) return menuItems;
    const visibleMatches = menuItems.filter((item) => item.searchText.includes(query));
    const visibleKeys = new Set(visibleMatches.map((item) => item.key));
    const secondaryMatches = getSearchableSecondarySettingsModalItems(t)
      .filter((item) => item.searchText.includes(query) && !visibleKeys.has(item.id))
      .map(toSettingsMenuItem);
    return [...visibleMatches, ...secondaryMatches];
  }, [menuItems, menuSearchQuery, t]);

  useEffect(() => {
    setActiveTab(normalizeOplSettingsTab(defaultTab));
    setCapabilitiesTab(capabilityDetailTabFor(defaultTab));
  }, [defaultTab]);

  const [mountedExtTabs, setMountedExtTabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (extensionTabMap.has(activeTab)) {
      setMountedExtTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab, extensionTabMap]);

  useEffect(() => {
    if (!visible) {
      setMountedExtTabs(new Set());
    }
  }, [visible]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(normalizeOplSettingsTab(tab));
    setCapabilitiesTab(capabilityDetailTabFor(tab));
  }, []);

  const renderExtensionTabs = () => {
    return Array.from(mountedExtTabs).map((tabKey) => {
      const extTab = extensionTabMap.get(tabKey);
      if (!extTab) return null;
      const isActive = activeTab === tabKey;
      return (
        <div key={tabKey} className='w-full h-full' style={{ display: isActive ? 'block' : 'none' }}>
          <ExtensionSettingsTabContent tabId={extTab.id} url={extTab.url} extensionName={extTab.extensionName} />
        </div>
      );
    });
  };

  const mobileMenu = (
    <div className='mt-16px mb-20px overflow-x-auto'>
      <Input
        value={menuSearchQuery}
        onChange={setMenuSearchQuery}
        allowClear
        prefix={<Search theme='outline' size='15' fill={iconColors.secondary} />}
        placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings' })}
        className='mb-12px'
        data-testid='settings-search-input'
      />
      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        type='line'
        size='default'
        className='settings-mobile-tabs [&_.arco-tabs-nav]:border-b-0'
      >
        {filteredMenuItems.map((item) => (
          <Tabs.TabPane key={item.key} title={item.label} />
        ))}
      </Tabs>
      {filteredMenuItems.length === 0 && (
        <div className='px-8px py-12px text-13px text-t-secondary' data-testid='settings-search-empty'>
          {t('settings.searchEmpty', { defaultValue: 'No matching settings' })}
        </div>
      )}
    </div>
  );

  const desktopMenu = (
    <AionScrollArea className='flex-shrink-0 b-color-border-2 scrollbar-hide' style={{ width: `${SIDEBAR_WIDTH}px` }}>
      <div className='flex flex-col gap-8px pr-12px'>
        <Input
          value={menuSearchQuery}
          onChange={setMenuSearchQuery}
          allowClear
          prefix={<Search theme='outline' size='15' fill={iconColors.secondary} />}
          placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings' })}
          data-testid='settings-search-input'
        />
        <div className='flex flex-col gap-2px'>
          {filteredMenuItems.map((item) => (
            <div
              key={item.key}
              className={classNames(
                'flex items-center px-14px py-10px rd-8px cursor-pointer transition-all duration-150 select-none',
                {
                  'bg-aou-2 text-t-primary': activeTab === item.key,
                  'text-t-secondary hover:bg-fill-1': activeTab !== item.key,
                }
              )}
              onClick={() => handleTabChange(item.key)}
            >
              <span className='mr-12px text-16px line-height-[10px]'>{item.icon}</span>
              <span className='text-14px font-500 flex-1 lh-22px'>{item.label}</span>
            </div>
          ))}
        </div>
        {filteredMenuItems.length === 0 && (
          <div
            className='px-14px py-12px rd-8px text-13px text-t-secondary bg-fill-1'
            data-testid='settings-search-empty'
          >
            {t('settings.searchEmpty', { defaultValue: 'No matching settings' })}
          </div>
        )}
      </div>
    </AionScrollArea>
  );

  const renderSlot = getSettingsRenderSlot(activeTab);

  return (
    <div
      className={classNames('overflow-hidden gap-0', isMobile ? 'flex flex-col min-h-0' : 'flex mt-20px')}
      style={{ height: isMobile ? mobileContentHeight : `${desktopContentHeight}px` }}
      data-testid='settings-host'
    >
      {isMobile ? mobileMenu : desktopMenu}

      <AionScrollArea
        className={classNames('flex-1 min-h-0', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}
      >
        {!extensionTabMap.has(activeTab) && (
          <SettingsShellAdapterSlot
            slot={renderSlot}
            capabilitiesTab={capabilitiesTab}
            onCapabilitiesTabChange={setCapabilitiesTab}
          />
        )}
        {renderExtensionTabs()}
      </AionScrollArea>
    </div>
  );
};

export default SettingsHost;
