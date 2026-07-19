/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionSelect from '@/renderer/components/base/AionSelect';
import { iconColors } from '@/renderer/styles/colors';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  buildSettingsModalMenuItems,
  BUILTIN_TAB_IDS,
  getSettingsSearchEntries,
  getSettingsTabIcon,
  getSettingsRenderSlot,
  isOplExtensionSettingsTabMountable,
  normalizeSearchText,
  resolveSettingsRenderTarget,
  focusSettingsAnchor,
  type SettingsModalMenuItem,
} from '@/renderer/pages/settings/registry/settingsRegistry';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { Button, Input } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExtensionSettingsTabContent from './contents/ExtensionSettingsTabContent';
import SettingsShellAdapterSlot from './SettingsShellAdapterSlot';
import { SettingsTabNavigateProvider } from './settingsViewContext';
import type { CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';
import type { SettingTab } from './index';

const SIDEBAR_WIDTH = 200;

type MobileSettingsGroupId = 'settingsAndAccess' | 'workCapabilities' | 'system' | 'extensions';

const MOBILE_SETTINGS_GROUPS: ReadonlyArray<{
  id: MobileSettingsGroupId;
  labelKey: string;
}> = [
  { id: 'settingsAndAccess', labelKey: 'settings.mobileNavigation.groups.settingsAndAccess' },
  { id: 'workCapabilities', labelKey: 'settings.mobileNavigation.groups.workCapabilities' },
  { id: 'system', labelKey: 'settings.mobileNavigation.groups.system' },
  { id: 'extensions', labelKey: 'settings.mobileNavigation.groups.extensions' },
];

const MOBILE_SETTINGS_GROUP_BY_TAB: Readonly<Record<string, MobileSettingsGroupId>> = {
  general: 'settingsAndAccess',
  gateway: 'settingsAndAccess',
  access: 'settingsAndAccess',
  workspace: 'settingsAndAccess',
  agents: 'workCapabilities',
  capabilities: 'workCapabilities',
  resources: 'workCapabilities',
  environment: 'system',
  storage: 'system',
  appearance: 'system',
};

type SettingsMenuItem = {
  id: string;
  key: SettingTab;
  label: string;
  icon: React.ReactNode;
  searchText: string;
  pageLabel: string;
  itemLabel: string;
  anchor?: string;
  isSearchResult?: boolean;
};

const toSettingsMenuItem = (item: SettingsModalMenuItem): SettingsMenuItem => ({
  id: item.id,
  key: item.id,
  label: item.label,
  icon: item.icon,
  searchText: item.searchText,
  pageLabel: item.label,
  itemLabel: item.label,
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
  const { t, i18n } = useTranslation();
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? 'en';
  const [activeTab, setActiveTab] = useState<SettingTab>(() => resolveSettingsRenderTarget(defaultTab).routeId);
  const [capabilitiesTab, setCapabilitiesTab] = useState<CapabilitiesTab>(
    () => resolveSettingsRenderTarget(defaultTab).capabilitiesTab
  );
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(
    () => resolveSettingsRenderTarget(defaultTab).anchor ?? null
  );
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const extensionTabMap = useMemo(() => {
    const map = new Map<string, IExtensionSettingsTab>();
    for (const tab of extensionTabs) {
      if (isOplExtensionSettingsTabMountable(tab.id)) map.set(tab.id, tab);
    }
    return map;
  }, [extensionTabs]);

  const menuItems = useMemo((): SettingsMenuItem[] => {
    return buildSettingsModalMenuItems({ extensionTabs, resolveExtTabName, t }).map(toSettingsMenuItem);
  }, [t, extensionTabs, resolveExtTabName]);

  const filteredMenuItems = useMemo(() => {
    const query = normalizeSearchText(menuSearchQuery);
    if (!query) return menuItems;
    const builtinKeys = new Set<string>(BUILTIN_TAB_IDS);
    const entryMatches = getSettingsSearchEntries(t, language)
      .filter((item) => item.searchText.includes(query))
      .map(
        (item): SettingsMenuItem => ({
          id: `search:${item.id}`,
          key: item.pageId,
          label: item.resultLabel,
          icon: getSettingsTabIcon(item.pageId, 'modal'),
          searchText: item.searchText,
          pageLabel: item.pageLabel,
          itemLabel: item.itemLabel,
          anchor: item.anchor,
          isSearchResult: true,
        })
      );
    const extensionMatches = menuItems
      .filter((item) => !builtinKeys.has(item.key) && item.searchText.includes(query))
      .map((item) => ({ ...item, isSearchResult: true }));
    return [...entryMatches, ...extensionMatches];
  }, [language, menuItems, menuSearchQuery, t]);

  const mobileMenuGroups = useMemo(() => {
    const itemsByGroup = new Map<MobileSettingsGroupId, SettingsMenuItem[]>();
    for (const item of menuItems) {
      const groupId = MOBILE_SETTINGS_GROUP_BY_TAB[item.key] ?? 'extensions';
      const items = itemsByGroup.get(groupId) ?? [];
      items.push(item);
      itemsByGroup.set(groupId, items);
    }
    return MOBILE_SETTINGS_GROUPS.flatMap((group) => {
      const items = itemsByGroup.get(group.id) ?? [];
      return items.length > 0 ? [{ ...group, items }] : [];
    });
  }, [menuItems]);

  useEffect(() => {
    const target = resolveSettingsRenderTarget(defaultTab);
    setActiveTab(target.routeId);
    setCapabilitiesTab(target.capabilitiesTab);
    setPendingAnchor(target.anchor ?? null);
  }, [defaultTab]);

  useEffect(() => {
    if (!visible || !pendingAnchor) return;
    const frame = requestAnimationFrame(() => {
      const contentRoot = hostRef.current?.querySelector<HTMLElement>('[data-settings-content-root]');
      if (contentRoot && focusSettingsAnchor(contentRoot, pendingAnchor)) setPendingAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, capabilitiesTab, pendingAnchor, visible]);

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
    const target = resolveSettingsRenderTarget(tab);
    setActiveTab(target.routeId);
    setCapabilitiesTab(target.capabilitiesTab);
    setPendingAnchor(target.anchor ?? null);
  }, []);

  const handleMenuItemSelect = useCallback(
    (item: SettingsMenuItem) => {
      handleTabChange(item.key);
      setMenuSearchQuery('');
      if (item.anchor) setPendingAnchor(item.anchor);
    },
    [handleTabChange]
  );

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
    <div className='mt-16px mb-20px'>
      <Input
        value={menuSearchQuery}
        onChange={setMenuSearchQuery}
        allowClear
        prefix={<Search theme='outline' size='15' fill={iconColors.secondary} />}
        placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings' })}
        className='mb-12px'
        data-testid='settings-search-input'
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !menuSearchQuery.trim() || filteredMenuItems.length === 0) return;
          event.preventDefault();
          handleMenuItemSelect(filteredMenuItems[0]);
        }}
      />
      {menuSearchQuery.trim() ? (
        <div className='settings-search-results' data-testid='settings-search-results'>
          {filteredMenuItems.map((item) => (
            <Button
              key={item.id}
              htmlType='button'
              className='settings-search-result'
              data-testid='settings-search-result'
              onClick={() => handleMenuItemSelect(item)}
            >
              <span className='settings-search-result__page'>{item.pageLabel}</span>
              {item.pageLabel !== item.itemLabel && (
                <span className='settings-search-result__item'>{item.itemLabel}</span>
              )}
            </Button>
          ))}
        </div>
      ) : (
        <div data-testid='settings-mobile-navigation'>
          <label id='settings-mobile-navigation-label' className='mb-6px block text-12px font-500 text-t-secondary'>
            {t('settings.mobileNavigation.label', { defaultValue: 'Settings section' })}
          </label>
          <AionSelect
            value={activeTab}
            onChange={(value) => handleTabChange(String(value))}
            className='w-full'
            aria-labelledby='settings-mobile-navigation-label'
            data-testid='settings-mobile-section-select'
          >
            {mobileMenuGroups.map((group) => (
              <AionSelect.OptGroup key={group.id} label={t(group.labelKey)}>
                {group.items.map((item) => (
                  <AionSelect.Option key={item.id} value={item.key}>
                    <span className='flex min-w-0 items-center gap-8px'>
                      {item.icon}
                      <span className='truncate'>{item.label}</span>
                    </span>
                  </AionSelect.Option>
                ))}
              </AionSelect.OptGroup>
            ))}
          </AionSelect>
        </div>
      )}
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
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !menuSearchQuery.trim() || filteredMenuItems.length === 0) return;
            event.preventDefault();
            handleMenuItemSelect(filteredMenuItems[0]);
          }}
        />
        <div className='flex flex-col gap-2px'>
          {filteredMenuItems.map((item) => (
            <button
              type='button'
              key={item.id}
              className={classNames(
                'flex w-full items-center border-0 bg-transparent px-14px py-10px text-left font-inherit rd-8px cursor-pointer transition-all duration-150 select-none',
                {
                  'bg-aou-2 text-t-primary': activeTab === item.key,
                  'text-t-secondary hover:bg-fill-1': activeTab !== item.key,
                }
              )}
              onClick={() => handleMenuItemSelect(item)}
              data-testid={item.isSearchResult ? 'settings-search-result' : undefined}
            >
              <span className='mr-12px text-16px line-height-[10px]'>{item.icon}</span>
              {item.isSearchResult ? (
                <span className='flex min-w-0 flex-1 flex-col leading-18px'>
                  <span className='truncate text-12px text-t-tertiary'>{item.pageLabel}</span>
                  <span className='truncate text-14px font-500 text-t-primary'>{item.itemLabel}</span>
                </span>
              ) : (
                <span className='text-14px font-500 flex-1 lh-22px'>{item.label}</span>
              )}
            </button>
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
    <SettingsTabNavigateProvider value={handleTabChange}>
      <div
        ref={hostRef}
        className={classNames('overflow-hidden gap-0', isMobile ? 'flex flex-col min-h-0' : 'flex mt-20px')}
        style={{ height: isMobile ? mobileContentHeight : `${desktopContentHeight}px` }}
        data-testid='settings-host'
      >
        {isMobile ? mobileMenu : desktopMenu}

        <AionScrollArea
          className={classNames('flex-1 min-h-0', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}
          data-settings-content-root=''
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
    </SettingsTabNavigateProvider>
  );
};

export default SettingsHost;
