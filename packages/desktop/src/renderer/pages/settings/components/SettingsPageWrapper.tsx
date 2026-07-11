import classNames from 'classnames';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import {
  SettingsTabNavigateProvider,
  SettingsViewModeProvider,
} from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import {
  buildSettingsNavItems,
  BUILTIN_TAB_IDS,
  getBuiltinSettingsNavItems,
  getSettingsSearchEntries,
  resolveLegacySettingsRoute,
} from '../sections/settingsNav';
import { iconColors } from '@/renderer/styles/colors';
import { focusSettingsAnchor, normalizeSearchText } from '../registry/settingsRegistry';
import './settings.css';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { t, i18n } = useTranslation();
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? 'en';
  const isDesktop = isElectronDesktop();
  const [searchQuery, setSearchQuery] = useState('');
  const activeMobileNavItemRef = useRef<HTMLButtonElement | null>(null);

  const extensionTabs = useExtensionSettingsTabs();

  const { resolveExtTabName } = useExtI18n();

  const menuItems = useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t);
    return buildSettingsNavItems({
      builtinItems: builtins,
      extensionTabs,
      resolveExtTabName,
      extensionIconClassName: 'w-16px h-16px object-contain',
    });
  }, [isDesktop, t, extensionTabs, resolveExtTabName]);

  const searchResults = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return [];
    const itemMatches = getSettingsSearchEntries(t, language).filter((item) => item.searchText.includes(query));
    const builtinIds = new Set<string>(BUILTIN_TAB_IDS);
    const extensionMatches = menuItems
      .filter((item) => !builtinIds.has(item.id) && item.searchText.includes(query))
      .map((item) => ({
        id: item.id,
        pageId: item.id,
        pageLabel: item.label,
        itemLabel: item.label,
        resultLabel: item.label,
        path: item.path,
        anchor: '',
        searchText: item.searchText,
      }));
    return [...itemMatches, ...extensionMatches];
  }, [language, menuItems, searchQuery, t]);

  useEffect(() => {
    const anchor = new URLSearchParams(search).get('section') ?? '';
    if (!anchor) return;
    const frame = requestAnimationFrame(() => {
      focusSettingsAnchor(anchor);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, search]);

  useEffect(() => {
    if (!isMobile) return;
    const activeItem = activeMobileNavItemRef.current;
    const nav = activeItem?.parentElement;
    if (!activeItem || !nav) return;
    nav.scrollTo({
      left: Math.max(0, activeItem.offsetLeft - (nav.clientWidth - activeItem.offsetWidth) / 2),
    });
  }, [isMobile, menuItems, pathname]);

  const selectSearchResult = React.useCallback(
    (path: string) => {
      setSearchQuery('');
      void navigate(`/settings/${path}`, { replace: true });
    },
    [navigate]
  );

  const routeSearch = (
    <div className='settings-mobile-top-search flex flex-col gap-8px mb-16px'>
      <Input
        value={searchQuery}
        onChange={setSearchQuery}
        allowClear
        prefix={<Search theme='outline' size='15' fill={iconColors.secondary} />}
        placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings' })}
        data-testid='settings-search-input'
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || searchResults.length === 0) return;
          event.preventDefault();
          selectSearchResult(searchResults[0].path);
        }}
      />
      {searchQuery.trim().length > 0 && searchResults.length === 0 && (
        <div className='px-10px py-9px rd-8px text-13px text-t-secondary bg-fill-1' data-testid='settings-search-empty'>
          {t('settings.searchEmpty', { defaultValue: 'No matching settings' })}
        </div>
      )}
      {searchQuery.trim().length > 0 && searchResults.length > 0 && (
        <div className='settings-search-results' data-testid='settings-search-results'>
          {searchResults.map((item) => (
            <Button
              key={item.id}
              htmlType='button'
              className='settings-search-result'
              data-testid='settings-search-result'
              onClick={() => selectSearchResult(item.path)}
            >
              <span className='settings-search-result__page'>{item.pageLabel}</span>
              {item.pageLabel !== item.itemLabel && (
                <span className='settings-search-result__item'>{item.itemLabel}</span>
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  );

  const containerClass = classNames(
    'settings-page-wrapper w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-32px',
    className
  );

  const contentClass = classNames('settings-page-content mx-auto w-full md:max-w-1024px', contentClassName);

  const navigateToSettingsTab = React.useCallback(
    (tabId: string) => {
      void navigate(resolveLegacySettingsRoute(tabId), { replace: true });
    },
    [navigate]
  );

  return (
    <SettingsViewModeProvider value='page'>
      <SettingsTabNavigateProvider value={navigateToSettingsTab}>
        <div className={containerClass}>
          {isMobile && (
            <>
              {routeSearch}
              <div className='settings-mobile-top-nav'>
                {menuItems.map((item) => {
                  const active = pathname.includes(`/settings/${item.path}`);
                  return (
                    <Button
                      key={item.path}
                      ref={active ? activeMobileNavItemRef : undefined}
                      data-settings-path={item.path}
                      htmlType='button'
                      aria-current={active ? 'page' : undefined}
                      className={classNames('settings-mobile-top-nav__item', {
                        'settings-mobile-top-nav__item--active': active,
                      })}
                      onClick={() => {
                        void navigate(`/settings/${item.path}`, { replace: true });
                      }}
                    >
                      <span className='settings-mobile-top-nav__icon'>{item.icon}</span>
                      <span className='settings-mobile-top-nav__label'>{item.label}</span>
                    </Button>
                  );
                })}
              </div>
            </>
          )}
          <div className={contentClass}>{children}</div>
        </div>
      </SettingsTabNavigateProvider>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
