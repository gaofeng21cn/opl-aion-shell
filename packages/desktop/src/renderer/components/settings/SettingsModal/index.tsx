/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/styles/colors';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  buildSettingsModalMenuItems,
  capabilityDetailTabFor,
  getSearchableSecondarySettingsModalItems,
  normalizeOplSettingsTab,
  normalizeSearchText,
  type SettingsModalMenuItem,
} from '@/renderer/pages/settings/registry/settingsRegistry';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { Input, Tabs } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppearanceModalContent from './contents/AppearanceModalContent';
import ExtensionSettingsTabContent from './contents/ExtensionSettingsTabContent';
import SystemModalContent from './contents/SystemModalContent';
import { SettingsViewModeProvider } from './settingsViewContext';
import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import WorkspaceSettings from '@/renderer/pages/settings/sections/WorkspaceSettings';
import LocalServicesSettings from '@/renderer/pages/settings/sections/LocalServicesSettings';
import StorageSettings from '@/renderer/pages/settings/StorageSettings';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';
import { CapabilitiesSettingsContent, type CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';

// ==================== 常量定义 / Constants ====================

/** 移动端断点（px）/ Mobile breakpoint (px) */
const MOBILE_BREAKPOINT = 768;

/** 侧边栏宽度（px）/ Sidebar width (px) */
const SIDEBAR_WIDTH = 200;

/** Modal 宽度配置 / Modal width configuration */
const MODAL_WIDTH = {
  mobile: 560,
  desktop: 880,
} as const;

/** Modal 高度配置 / Modal height configuration */
const MODAL_HEIGHT = {
  mobile: '90vh',
  mobileContent: 'calc(90vh - 80px)',
  desktop: 459,
} as const;

/** Resize 事件防抖延迟（ms）/ Resize event debounce delay (ms) */
const RESIZE_DEBOUNCE_DELAY = 150;

// ==================== 类型定义 / Type Definitions ====================

/**
 * 内置设置标签页类型 / Built-in settings tab type
 */
export type BuiltinSettingTab =
  | 'general'
  | 'workspace'
  | 'local-services'
  | 'environment'
  | 'capabilities'
  | 'access'
  | 'appearance'
  | 'advanced'
  | 'about'
  | 'storage'
  | 'overview'
  | 'runtime'
  | 'system'
  | 'model'
  | 'agent'
  | 'tools'
  | 'webui'
  | 'display'
  | 'pet';

/**
 * 设置标签页类型（内置 + 扩展）/ Settings tab type (built-in + extension)
 */
export type SettingTab = BuiltinSettingTab | (string & {});

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

/**
 * 设置弹窗组件属性 / Settings modal component props
 */
interface SettingsModalProps {
  /** 弹窗显示状态 / Modal visibility state */
  visible: boolean;
  /** 关闭回调 / Close callback */
  onCancel: () => void;
  /** 默认选中的标签页 / Default selected tab */
  defaultTab?: SettingTab;
}

/**
 * 二级弹窗组件属性 / Secondary modal component props
 */
interface SubModalProps {
  /** 弹窗显示状态 / Modal visibility state */
  visible: boolean;
  /** 关闭回调 / Close callback */
  onCancel: () => void;
  /** 弹窗标题 / Modal title */
  title?: string;
  /** 子元素 / Children elements */
  children: React.ReactNode;
}

/**
 * 二级弹窗组件 / Secondary modal component
 * 用于设置页面中的次级对话框 / Used for secondary dialogs in settings page
 *
 * @example
 * ```tsx
 * <SubModal visible={showModal} onCancel={handleClose} title="详情">
 *   <div>弹窗内容</div>
 * </SubModal>
 * ```
 */
export const SubModal: React.FC<SubModalProps> = ({ visible, onCancel, title, children }) => {
  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      className='settings-sub-modal'
      size='medium'
      title={title}
    >
      <AionScrollArea className='h-full px-20px pb-16px text-14px text-t-primary'>{children}</AionScrollArea>
    </AionModal>
  );
};

/**
 * 主设置弹窗组件 / Main settings modal component
 *
 * 提供 One Person Lab App 普通设置界面，并把上游旧设置入口映射到 App-owned 设置页
 * Provides the ordinary One Person Lab App settings surface and redirects legacy upstream tabs to App-owned pages.
 *
 * @features
 * - 响应式设计，移动端使用下拉菜单，桌面端使用侧边栏 / Responsive design with dropdown on mobile and sidebar on desktop
 * - 防抖优化的窗口尺寸监听 / Debounced window resize listener
 * - 标签页状态管理 / Tab state management
 *
 * @example
 * ```tsx
 * const { openSettings, settingsModal } = useSettingsModal();
 * // 打开设置弹窗并跳转到高级设置 / Open settings modal and navigate to Advanced
 * openSettings('advanced');
 * ```
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onCancel, defaultTab = 'general' }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingTab>(() => normalizeOplSettingsTab(defaultTab));
  const [capabilitiesTab, setCapabilitiesTab] = useState<CapabilitiesTab>(() => capabilityDetailTabFor(defaultTab));
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const resizeTimerRef = useRef<number | undefined>(undefined);
  const extensionTabs = useExtensionSettingsTabs();

  /**
   * 处理窗口尺寸变化，更新移动端状态
   * Handle window resize and update mobile state
   */
  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
  }, []);

  // 监听窗口尺寸变化（带防抖）/ Listen to window resize (with debounce)
  useEffect(() => {
    // 初始化移动端状态 / Initialize mobile state
    handleResize();

    // 带防抖的 resize 处理器 / Debounced resize handler
    const debouncedResize = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(handleResize, RESIZE_DEBOUNCE_DELAY);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, [handleResize]);

  const { resolveExtTabName } = useExtI18n();

  // Extension tab lookup map for renderContent
  const extensionTabMap = useMemo(() => {
    const map = new Map<string, IExtensionSettingsTab>();
    for (const tab of extensionTabs) {
      map.set(tab.id, tab);
    }
    return map;
  }, [extensionTabs]);

  // 菜单项配置 / Menu items configuration
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
  }, [defaultTab, visible]);

  // Track which extension tabs have been visited (lazy mount + keep-alive)
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

  // Reset mounted tabs when modal closes to free memory
  useEffect(() => {
    if (!visible) {
      setMountedExtTabs(new Set());
    }
  }, [visible]);

  // Render built-in tab content (conditional)
  const renderBuiltinContent = () => {
    switch (activeTab) {
      case 'general':
      case 'overview':
        return <OverviewSettings withWrapper={false} />;
      case 'workspace':
        return <WorkspaceSettings withWrapper={false} />;
      case 'local-services':
        return <LocalServicesSettings withWrapper={false} />;
      case 'environment':
      case 'runtime':
      case 'model':
        return <RuntimeSettings withWrapper={false} />;
      case 'capabilities':
      case 'agent':
      case 'tools':
        return <CapabilitiesSettingsContent activeTab={capabilitiesTab} onTabChange={setCapabilitiesTab} />;
      case 'access':
      case 'webui':
        return <AccessSettingsContent />;
      case 'appearance':
      case 'display':
      case 'pet':
        return <AppearanceModalContent />;
      case 'advanced':
      case 'system':
        return <SystemModalContent />;
      case 'storage':
        return <StorageSettings withWrapper={false} />;
      default:
        // If no built-in match and not an extension tab, return null
        if (!extensionTabMap.has(activeTab)) return null;
        return null;
    }
  };

  // Render keep-alive extension tabs (always mounted once visited, hidden via CSS)
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

  /**
   * 切换标签页 / Switch tab
   * @param tab - 目标标签页 / Target tab
   */
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(normalizeOplSettingsTab(tab));
    setCapabilitiesTab(capabilityDetailTabFor(tab));
  }, []);

  // 移动端菜单（Tabs切换）/ Mobile menu (Tabs)
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

  // 桌面端菜单（侧边栏）/ Desktop menu (sidebar)
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

  return (
    <SettingsViewModeProvider value='modal'>
      <AionModal
        visible={visible}
        onCancel={onCancel}
        footer={null}
        className='settings-modal'
        style={{
          width: isMobile
            ? `min(calc(100vw - 32px), ${MODAL_WIDTH.mobile}px)`
            : `clamp(var(--app-min-width, 360px), 100vw, ${MODAL_WIDTH.desktop}px)`,
          maxHeight: isMobile ? MODAL_HEIGHT.mobile : undefined,
          borderRadius: '16px',
        }}
        contentStyle={{ padding: isMobile ? '16px' : '24px 24px 32px' }}
        title={t('settings.title')}
      >
        <div
          className={classNames('overflow-hidden gap-0', isMobile ? 'flex flex-col min-h-0' : 'flex mt-20px')}
          style={{
            height: isMobile ? MODAL_HEIGHT.mobileContent : `${MODAL_HEIGHT.desktop}px`,
          }}
        >
          {isMobile ? mobileMenu : desktopMenu}

          <AionScrollArea
            className={classNames('flex-1 min-h-0', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}
          >
            {renderBuiltinContent()}
            {renderExtensionTabs()}
          </AionScrollArea>
        </div>
      </AionModal>
    </SettingsViewModeProvider>
  );
};

export default SettingsModal;
