/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import OplUiContributionSlot from '@/renderer/components/opl/OplUiContributionSlot';
import { iconColors } from '@/renderer/styles/colors';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  buildSettingsModalMenuItems,
  BUILTIN_TAB_IDS,
  getSettingsSearchEntries,
  getSettingsTabIcon,
  getSettingsRenderSlot,
  getSettingsAboutNavigationItem,
  getSettingsNavigationGroups,
  getSettingsNavigationSelection,
  isOplExtensionSettingsTabMountable,
  normalizeSearchText,
  resolveSettingsRenderTarget,
  focusSettingsAnchor,
  SETTINGS_ROUTE_PATHS,
  type SettingsNavigationGroup,
  type SettingsModalMenuItem,
} from '@/renderer/pages/settings/registry/settingsRegistry';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { Button, Input } from '@arco-design/web-react';
import { ArrowLeft, Down, Right, Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExtensionSettingsTabContent from './contents/ExtensionSettingsTabContent';
import SettingsShellAdapterSlot from './SettingsShellAdapterSlot';
import { SettingsActiveAnchorProvider, SettingsTabNavigateProvider } from './settingsViewContext';
import type { CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';
import {
  InstructionsContextSettingsContent,
  LogDirectorySettingsContent,
} from '@/renderer/pages/settings/sections/WorkspaceSettings';
import type { SettingTab } from './index';
import '@/renderer/pages/settings/components/settings.css';

const SIDEBAR_WIDTH = 200;

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
  const [activeAnchor, setActiveAnchor] = useState<string | null>(
    () => resolveSettingsRenderTarget(defaultTab).anchor ?? null
  );
  const [mobileGroupId, setMobileGroupId] = useState<SettingsNavigationGroup['id'] | null>(null);
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

  const navigationGroups = useMemo(
    () => getSettingsNavigationGroups(t, language, isMobile ? 'siderMobile' : 'modal'),
    [isMobile, language, t]
  );
  const navigationSelection = useMemo(() => {
    const routePath = SETTINGS_ROUTE_PATHS[activeTab] ?? `/settings/${activeTab}`;
    const query = activeAnchor ? `?section=${encodeURIComponent(activeAnchor)}` : '';
    return getSettingsNavigationSelection(routePath, query);
  }, [activeAnchor, activeTab]);
  const navigationSelectionKey = navigationSelection
    ? `${navigationSelection.groupId}:${navigationSelection.destinationId}`
    : null;
  const previousNavigationSelectionKeyRef = useRef(navigationSelectionKey);
  const aboutItem = useMemo(
    () => getSettingsAboutNavigationItem(t, language, isMobile ? 'siderMobile' : 'modal'),
    [isMobile, language, t]
  );
  const mobileGroup = navigationGroups.find((group) => group.id === mobileGroupId) ?? null;

  useEffect(() => {
    const selectionChanged = previousNavigationSelectionKeyRef.current !== navigationSelectionKey;
    previousNavigationSelectionKeyRef.current = navigationSelectionKey;
    if (!isMobile || !selectionChanged || mobileGroupId === null) return;
    setMobileGroupId(navigationSelection?.groupId ?? null);
  }, [isMobile, mobileGroupId, navigationSelection?.groupId, navigationSelectionKey]);

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

  useEffect(() => {
    const target = resolveSettingsRenderTarget(defaultTab);
    setActiveTab(target.routeId);
    setCapabilitiesTab(target.capabilitiesTab);
    setPendingAnchor(target.anchor ?? null);
    setActiveAnchor(target.anchor ?? null);
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
    setActiveAnchor(target.anchor ?? null);
  }, []);

  const handleMenuItemSelect = useCallback(
    (item: SettingsMenuItem) => {
      handleTabChange(item.key);
      setMenuSearchQuery('');
      if (item.anchor) {
        setPendingAnchor(item.anchor);
        setActiveAnchor(item.anchor);
      }
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
    <div className='settings-host-mobile-navigation mt-16px mb-20px'>
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
        <nav
          className='settings-modal-navigation settings-modal-navigation--mobile'
          data-testid='settings-mobile-navigation'
          aria-label={t('settings.uiOptimization.navigation.mobileCategories')}
        >
          {mobileGroup ? (
            <>
              <div className='settings-modal-navigation__mobile-header'>
                <Button
                  type='text'
                  htmlType='button'
                  icon={<ArrowLeft theme='outline' size='16' />}
                  aria-label={t('settings.uiOptimization.navigation.mobileBack')}
                  className='settings-modal-navigation__back'
                  onClick={() => setMobileGroupId(null)}
                />
                <span className='settings-modal-navigation__mobile-title'>{mobileGroup.label}</span>
              </div>
              <div className='settings-modal-navigation__destinations'>
                {mobileGroup.destinations.map((destination) => {
                  const active = navigationSelection?.destinationId === destination.id;
                  return (
                    <Button
                      key={destination.id}
                      type='text'
                      htmlType='button'
                      aria-current={active ? 'page' : undefined}
                      data-settings-destination-id={destination.id}
                      className={classNames('settings-modal-navigation__mobile-row', {
                        'settings-modal-navigation__mobile-row--active': active,
                      })}
                      onClick={() =>
                        handleTabChange(
                          destination.anchor ? `${destination.routeId}#${destination.anchor}` : destination.routeId
                        )
                      }
                    >
                      <span className='settings-modal-navigation__icon'>{destination.icon}</span>
                      <span className='settings-modal-navigation__label'>{destination.label}</span>
                      <Right theme='outline' size='14' aria-hidden='true' />
                    </Button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className='settings-modal-navigation__groups'>
              {navigationGroups.map((group) => {
                const active = navigationSelection?.groupId === group.id;
                return (
                  <Button
                    key={group.id}
                    type='text'
                    htmlType='button'
                    aria-current={active ? 'page' : undefined}
                    data-settings-group-id={group.id}
                    className={classNames('settings-modal-navigation__mobile-row', {
                      'settings-modal-navigation__mobile-row--active': active,
                    })}
                    onClick={() => setMobileGroupId(group.id)}
                  >
                    <span className='settings-modal-navigation__icon'>{group.icon}</span>
                    <span className='settings-modal-navigation__label'>{group.label}</span>
                    <Right theme='outline' size='14' aria-hidden='true' />
                  </Button>
                );
              })}
              {aboutItem ? (
                <Button
                  type='text'
                  htmlType='button'
                  className='settings-modal-navigation__mobile-row settings-modal-navigation__mobile-row--auxiliary'
                  onClick={() => handleTabChange(aboutItem.id)}
                >
                  <span className='settings-modal-navigation__icon'>{aboutItem.icon}</span>
                  <span className='settings-modal-navigation__label'>{aboutItem.label}</span>
                  <Right theme='outline' size='14' aria-hidden='true' />
                </Button>
              ) : null}
            </div>
          )}
        </nav>
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
        {menuSearchQuery.trim() ? (
          <div className='flex flex-col gap-2px'>
            {filteredMenuItems.map((item) => (
              <Button
                type='text'
                htmlType='button'
                key={item.id}
                className='settings-modal-navigation__search-result'
                onClick={() => handleMenuItemSelect(item)}
                data-testid='settings-search-result'
              >
                <span className='settings-modal-navigation__icon'>{item.icon}</span>
                <span className='flex min-w-0 flex-1 flex-col leading-18px'>
                  <span className='truncate text-12px text-t-tertiary'>{item.pageLabel}</span>
                  <span className='truncate text-14px font-500 text-t-primary'>{item.itemLabel}</span>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <nav
            className='settings-modal-navigation'
            aria-label={t('settings.uiOptimization.navigation.mobileCategories')}
          >
            <div className='settings-modal-navigation__groups'>
              {navigationGroups.map((group) => {
                const active = navigationSelection?.groupId === group.id;
                const defaultDestination =
                  group.destinations.find((destination) => destination.id === group.defaultDestinationId) ??
                  group.destinations[0];
                const expandable = group.destinations.length > 1;
                return (
                  <div key={group.id} className='settings-modal-navigation__group'>
                    <Button
                      type='text'
                      htmlType='button'
                      aria-current={active && !expandable ? 'page' : undefined}
                      aria-expanded={expandable ? active : undefined}
                      data-settings-group-id={group.id}
                      className={classNames('settings-modal-navigation__group-row', {
                        'settings-modal-navigation__group-row--active': active,
                      })}
                      onClick={() =>
                        defaultDestination &&
                        handleTabChange(
                          defaultDestination.anchor
                            ? `${defaultDestination.routeId}#${defaultDestination.anchor}`
                            : defaultDestination.routeId
                        )
                      }
                    >
                      <span className='settings-modal-navigation__icon'>{group.icon}</span>
                      <span className='settings-modal-navigation__label'>{group.label}</span>
                      {expandable ? (
                        active ? (
                          <Down theme='outline' size='13' />
                        ) : (
                          <Right theme='outline' size='13' />
                        )
                      ) : null}
                    </Button>
                    {active && expandable ? (
                      <div className='settings-modal-navigation__destinations' role='group' aria-label={group.label}>
                        {group.destinations.map((destination) => {
                          const destinationActive = navigationSelection?.destinationId === destination.id;
                          return (
                            <Button
                              key={destination.id}
                              type='text'
                              htmlType='button'
                              aria-current={destinationActive ? 'page' : undefined}
                              data-settings-destination-id={destination.id}
                              className={classNames('settings-modal-navigation__destination-row', {
                                'settings-modal-navigation__destination-row--active': destinationActive,
                              })}
                              onClick={() =>
                                handleTabChange(
                                  destination.anchor
                                    ? `${destination.routeId}#${destination.anchor}`
                                    : destination.routeId
                                )
                              }
                            >
                              {destination.label}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {aboutItem ? (
              <div className='settings-modal-navigation__auxiliary'>
                <Button
                  type='text'
                  htmlType='button'
                  className='settings-modal-navigation__group-row'
                  aria-current={activeTab === aboutItem.id ? 'page' : undefined}
                  onClick={() => handleTabChange(aboutItem.id)}
                >
                  <span className='settings-modal-navigation__icon'>{aboutItem.icon}</span>
                  <span className='settings-modal-navigation__label'>{aboutItem.label}</span>
                </Button>
              </div>
            ) : null}
          </nav>
        )}
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
  const workspaceSecondarySurface =
    activeTab === 'workspace' &&
    ['personalization', 'system-agents', 'additional-instructions', 'opl-app-context'].includes(activeAnchor ?? '')
      ? 'instructions'
      : activeTab === 'workspace' && activeAnchor === 'logs'
        ? 'logs'
        : null;

  return (
    <SettingsActiveAnchorProvider value={activeAnchor}>
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
            {!extensionTabMap.has(activeTab) &&
              (workspaceSecondarySurface === 'instructions' ? (
                <InstructionsContextSettingsContent />
              ) : workspaceSecondarySurface === 'logs' ? (
                <LogDirectorySettingsContent />
              ) : (
                <SettingsShellAdapterSlot
                  slot={renderSlot}
                  capabilitiesTab={capabilitiesTab}
                  onCapabilitiesTabChange={setCapabilitiesTab}
                />
              ))}
            {activeTab === 'capabilities' && (
              <OplUiContributionSlot slot='settings.section' excludeViewTypes={['activity_log', 'service_status']} />
            )}
            {renderExtensionTabs()}
          </AionScrollArea>
        </div>
      </SettingsTabNavigateProvider>
    </SettingsActiveAnchorProvider>
  );
};

export default SettingsHost;
