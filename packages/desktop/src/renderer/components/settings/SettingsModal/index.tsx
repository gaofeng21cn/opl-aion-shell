/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/styles/colors';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  getOplGuiLegacySettingsRouteRedirects,
  getOplGuiSettingsSecondaryPageIds,
  getOplGuiSettingsVisibleTabs,
} from '@/common/config/oplProductProfile';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { Input, Tabs } from '@arco-design/web-react';
import {
  Computer,
  Earth,
  FolderOpen,
  Lightning,
  Puzzle,
  Search,
  SettingConfig,
  SwitchThemes,
  Toolkit,
} from '@icon-park/react';
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
import { LEGACY_ANCHOR_REMAP } from '@/renderer/pages/settings/sections/settingsNav';
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

const OPL_SETTINGS_TAB_LABEL_KEYS: Record<string, string> = {
  general: 'settings.overview',
  workspace: 'settings.workspace',
  'local-services': 'settings.localServices',
  environment: 'settings.maintenance',
  storage: 'settings.storage',
  capabilities: 'settings.capabilities',
  access: 'settings.onboarding',
  appearance: 'settings.preferences',
  advanced: 'settings.advanced',
};

const OPL_SETTINGS_TAB_DEFAULT_LABELS: Record<string, string> = {
  general: 'Overview',
  workspace: 'Workspace',
  'local-services': 'Local Services',
  environment: 'Maintenance',
  storage: 'Storage',
  capabilities: 'Capabilities',
  access: 'Get Started',
  appearance: 'Preferences',
  advanced: 'Advanced',
};

const OPL_SETTINGS_TAB_ICONS: Record<string, React.ReactNode> = {
  general: <Computer theme='outline' size='20' fill={iconColors.secondary} />,
  workspace: <FolderOpen theme='outline' size='20' fill={iconColors.secondary} />,
  'local-services': <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
  environment: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
  storage: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
  capabilities: <Lightning theme='outline' size='20' fill={iconColors.secondary} />,
  access: <Earth theme='outline' size='20' fill={iconColors.secondary} />,
  appearance: <SwitchThemes theme='outline' size='20' fill={iconColors.secondary} />,
  advanced: <SettingConfig theme='outline' size='20' fill={iconColors.secondary} />,
};

const OPL_SETTINGS_SEARCH_TERMS: Record<string, string[]> = {
  general: ['overview', 'status', 'next step', 'workspace', 'model', 'maintenance', 'capabilities', 'remote access'],
  access: ['setup', 'access', 'model', 'account', 'api key', 'workspace', 'web', 'docker', 'remote'],
  workspace: ['workspace', 'work directory', 'project folder', 'logs', 'modules root', 'paths', 'permission'],
  'local-services': ['local services', 'health', 'codex', 'temporal', 'background', 'modules', 'capability packs'],
  capabilities: ['capabilities', 'agents', 'skills', 'tools', 'voice', 'mas', 'mag', 'rca', 'oma', 'bookforge'],
  environment: ['maintenance', 'updates', 'runtime', 'toolchain', 'packages', 'repair', 'rollback', 'health'],
  storage: ['data', 'storage', 'cleanup', 'archive', 'restore', 'logs', 'cache', 'runtime roots'],
  appearance: ['preferences', 'appearance', 'theme', 'language', 'startup'],
  advanced: ['advanced', 'developer', 'diagnostics', 'about', 'version', 'logs', 'raw refs'],
};

const OPL_SETTINGS_ORDINARY_TAB_IDS = [
  'general',
  'access',
  'capabilities',
  'environment',
  'storage',
  'appearance',
  'advanced',
];
const OPL_SETTINGS_SECONDARY_SEARCH_IDS = ['workspace', 'local-services'];
const OPL_VISIBLE_MODAL_TAB_IDS = OPL_SETTINGS_ORDINARY_TAB_IDS.filter((id) =>
  getOplGuiSettingsVisibleTabs().includes(id)
);
const OPL_SEARCHABLE_SECONDARY_TAB_IDS = OPL_SETTINGS_SECONDARY_SEARCH_IDS.filter((id) =>
  getOplGuiSettingsSecondaryPageIds().includes(id)
);

const normalizeOplSettingsTab = (tab: SettingTab): string => {
  const legacyRedirects: Record<string, string> = {
    ...getOplGuiLegacySettingsRouteRedirects(),
    about: 'advanced',
  };
  return legacyRedirects[tab] ?? tab;
};

const capabilityDetailTabFor = (tab: SettingTab): CapabilitiesTab => {
  if (tab === 'tools') return 'tools';
  return 'skills';
};

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

const normalizeSearchText = (value: string): string => value.trim().toLowerCase();

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
    const builtinItems: SettingsMenuItem[] = OPL_VISIBLE_MODAL_TAB_IDS.map((key) => {
      const label = t(OPL_SETTINGS_TAB_LABEL_KEYS[key] ?? `settings.${key}`, {
        defaultValue: OPL_SETTINGS_TAB_DEFAULT_LABELS[key] ?? key,
      });
      return {
        key,
        label,
        icon: OPL_SETTINGS_TAB_ICONS[key] ?? <Puzzle theme='outline' size='20' fill={iconColors.secondary} />,
        searchText: normalizeSearchText([key, label, ...(OPL_SETTINGS_SEARCH_TERMS[key] ?? [])].join(' ')),
      };
    });

    // Extension tabs — position anchoring
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();
    const unanchored: IExtensionSettingsTab[] = [];

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const { relativeTo: rawAnchor, placement } = tab.position;
      const anchor = LEGACY_ANCHOR_REMAP[rawAnchor] ?? rawAnchor;
      if (!builtinItems.some((item) => item.key === anchor)) {
        unanchored.push(tab);
        continue;
      }
      const map = placement === 'before' ? beforeMap : afterMap;
      let list = map.get(anchor);
      if (!list) {
        list = [];
        map.set(anchor, list);
      }
      list.push(tab);
    }

    const toMenuItem = (tab: IExtensionSettingsTab): SettingsMenuItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      const label = resolveExtTabName(tab);
      return {
        key: tab.id,
        label,
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-20px h-20px object-contain' />
        ) : (
          <Puzzle theme='outline' size='20' fill={iconColors.secondary} />
        ),
        searchText: normalizeSearchText([tab.id, label, tab.extensionName ?? ''].join(' ')),
      };
    };

    // Insert anchored tabs
    for (let i = builtinItems.length - 1; i >= 0; i--) {
      const id = builtinItems[i].key;
      const afters = afterMap.get(id);
      if (afters) builtinItems.splice(i + 1, 0, ...afters.map(toMenuItem));
      const befores = beforeMap.get(id);
      if (befores) builtinItems.splice(i, 0, ...befores.map(toMenuItem));
    }

    // Append unanchored before Advanced so extension diagnostics stay out of the daily setup flow.
    if (unanchored.length > 0) {
      const advancedIdx = builtinItems.findIndex((item) => item.key === 'advanced');
      const idx = advancedIdx >= 0 ? advancedIdx : builtinItems.length;
      builtinItems.splice(idx, 0, ...unanchored.map(toMenuItem));
    }

    return builtinItems;
  }, [t, extensionTabs, resolveExtTabName]);

  const filteredMenuItems = useMemo(() => {
    const query = normalizeSearchText(menuSearchQuery);
    if (!query) return menuItems;
    const visibleMatches = menuItems.filter((item) => item.searchText.includes(query));
    const visibleKeys = new Set(visibleMatches.map((item) => item.key));
    const secondaryMatches = OPL_SEARCHABLE_SECONDARY_TAB_IDS.flatMap((key) => {
      const label = t(OPL_SETTINGS_TAB_LABEL_KEYS[key] ?? `settings.${key}`, {
        defaultValue: OPL_SETTINGS_TAB_DEFAULT_LABELS[key] ?? key,
      });
      const searchText = normalizeSearchText([key, label, ...(OPL_SETTINGS_SEARCH_TERMS[key] ?? [])].join(' '));
      if (!searchText.includes(query) || visibleKeys.has(key)) return [];
      return [
        {
          key,
          label,
          icon: OPL_SETTINGS_TAB_ICONS[key] ?? <Puzzle theme='outline' size='20' fill={iconColors.secondary} />,
          searchText,
        },
      ];
    });
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
          <div className='px-14px py-12px rd-8px text-13px text-t-secondary bg-fill-1' data-testid='settings-search-empty'>
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
