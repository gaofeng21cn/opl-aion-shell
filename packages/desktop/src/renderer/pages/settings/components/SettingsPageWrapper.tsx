import classNames from 'classnames';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@arco-design/web-react';
import { ArrowLeft, Right, Search } from '@icon-park/react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import {
  SettingsActiveAnchorProvider,
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
import {
  focusSettingsAnchor,
  getSettingsAboutNavigationItem,
  getSettingsNavigationGroups,
  getSettingsNavigationSelection,
  normalizeSearchText,
  type SettingsNavigationGroup,
} from '../registry/settingsRegistry';
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
  const activeAnchor = useMemo(() => new URLSearchParams(search).get('section'), [search]);
  const isDesktop = isElectronDesktop();
  const [searchQuery, setSearchQuery] = useState('');
  const [anchorFocusFailed, setAnchorFocusFailed] = useState(false);
  const [mobileGroupId, setMobileGroupId] = useState<SettingsNavigationGroup['id'] | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const extensionTabs = useExtensionSettingsTabs();

  const { resolveExtTabName } = useExtI18n();

  const menuItems = useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t, language);
    return buildSettingsNavItems({
      builtinItems: builtins,
      extensionTabs,
      resolveExtTabName,
      extensionIconClassName: 'w-16px h-16px object-contain',
    });
  }, [isDesktop, language, t, extensionTabs, resolveExtTabName]);
  const navigationGroups = useMemo(
    () => getSettingsNavigationGroups(t, language, isDesktop ? 'siderDesktop' : 'siderMobile'),
    [isDesktop, language, t]
  );
  const navigationSelection = useMemo(() => getSettingsNavigationSelection(pathname, search), [pathname, search]);
  const navigationSelectionKey = navigationSelection
    ? `${navigationSelection.groupId}:${navigationSelection.destinationId}`
    : null;
  const previousNavigationSelectionKeyRef = useRef(navigationSelectionKey);
  const aboutItem = useMemo(
    () => getSettingsAboutNavigationItem(t, language, isDesktop ? 'siderDesktop' : 'siderMobile'),
    [isDesktop, language, t]
  );
  const mobileGroup = navigationGroups.find((group) => group.id === mobileGroupId) ?? null;

  useEffect(() => {
    const selectionChanged = previousNavigationSelectionKeyRef.current !== navigationSelectionKey;
    previousNavigationSelectionKeyRef.current = navigationSelectionKey;
    if (!isMobile || !selectionChanged || mobileGroupId === null) return;
    setMobileGroupId(navigationSelection?.groupId ?? null);
  }, [isMobile, mobileGroupId, navigationSelection?.groupId, navigationSelectionKey]);

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
    const anchor = activeAnchor ?? '';
    setAnchorFocusFailed(false);
    if (!anchor) return undefined;

    let cancelled = false;
    let attempts = 0;
    let retryTimer: number | undefined;
    const tryFocus = () => {
      if (cancelled) return;
      const contentRoot = contentRef.current;
      if (contentRoot && focusSettingsAnchor(contentRoot, anchor)) return;
      attempts += 1;
      if (attempts < 4) {
        retryTimer = window.setTimeout(tryFocus, 80);
        return;
      }

      const fallback = contentRef.current;
      if (fallback) {
        fallback.scrollIntoView({ block: 'start' });
        fallback.focus({ preventScroll: true });
      }
      setAnchorFocusFailed(true);
    };
    const frame = requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [activeAnchor, pathname]);

  const selectSearchResult = React.useCallback(
    (path: string) => {
      setSearchQuery('');
      void navigate(`/settings/${path}`, { replace: true });
    },
    [navigate]
  );

  const globalSearch = (
    <div
      className='settings-global-search flex flex-col gap-8px mb-16px'
      data-testid='settings-global-search'
      role='search'
    >
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
      {anchorFocusFailed && (
        <div
          className='px-10px py-9px rd-8px text-13px text-t-secondary bg-fill-1'
          data-testid='settings-search-anchor-fallback'
          role='status'
          aria-live='polite'
        >
          {t('settings.searchAnchorUnavailable', {
            defaultValue: 'That setting could not be located. Showing the page from the beginning.',
          })}
        </div>
      )}
    </div>
  );

  const containerClass = classNames(
    'settings-page-wrapper w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-32px',
    className
  );

  const contentClass = classNames('settings-page-content mx-auto w-full', contentClassName);

  const navigateToSettingsTab = React.useCallback(
    (tabId: string) => {
      void navigate(resolveLegacySettingsRoute(tabId), { replace: true });
    },
    [navigate]
  );

  return (
    <SettingsViewModeProvider value='page'>
      <SettingsActiveAnchorProvider value={activeAnchor}>
        <SettingsTabNavigateProvider value={navigateToSettingsTab}>
          <div className={containerClass}>
            {globalSearch}
            {isMobile && (
              <nav
                className='settings-mobile-navigation'
                data-testid='settings-mobile-navigation'
                aria-label={t('settings.uiOptimization.navigation.mobileCategories')}
              >
                {mobileGroup ? (
                  <>
                    <div className='settings-mobile-navigation__header'>
                      <Button
                        type='text'
                        htmlType='button'
                        icon={<ArrowLeft theme='outline' size='16' />}
                        aria-label={t('settings.uiOptimization.navigation.mobileBack')}
                        className='settings-mobile-navigation__back'
                        onClick={() => setMobileGroupId(null)}
                      />
                      <span className='settings-mobile-navigation__title'>{mobileGroup.label}</span>
                    </div>
                    <div className='settings-mobile-navigation__list'>
                      {mobileGroup.destinations.map((destination) => {
                        const active = navigationSelection?.destinationId === destination.id;
                        return (
                          <Button
                            key={destination.id}
                            type='text'
                            htmlType='button'
                            aria-current={active ? 'page' : undefined}
                            data-settings-destination-id={destination.id}
                            className={classNames('settings-mobile-navigation__row', {
                              'settings-mobile-navigation__row--active': active,
                            })}
                            onClick={() => void navigate(`/settings/${destination.path}`, { replace: true })}
                          >
                            <span className='settings-mobile-navigation__row-icon'>{destination.icon}</span>
                            <span className='settings-mobile-navigation__row-label'>{destination.label}</span>
                            <Right theme='outline' size='14' aria-hidden='true' />
                          </Button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className='settings-mobile-navigation__list'>
                    {navigationGroups.map((group) => {
                      const active = navigationSelection?.groupId === group.id;
                      return (
                        <Button
                          key={group.id}
                          type='text'
                          htmlType='button'
                          aria-current={active ? 'page' : undefined}
                          data-settings-group-id={group.id}
                          className={classNames('settings-mobile-navigation__row', {
                            'settings-mobile-navigation__row--active': active,
                          })}
                          onClick={() => setMobileGroupId(group.id)}
                        >
                          <span className='settings-mobile-navigation__row-icon'>{group.icon}</span>
                          <span className='settings-mobile-navigation__row-label'>{group.label}</span>
                          <Right theme='outline' size='14' aria-hidden='true' />
                        </Button>
                      );
                    })}
                    {aboutItem ? (
                      <Button
                        type='text'
                        htmlType='button'
                        data-settings-id='about'
                        className='settings-mobile-navigation__row settings-mobile-navigation__row--auxiliary'
                        onClick={() => void navigate(`/settings/${aboutItem.path}`, { replace: true })}
                      >
                        <span className='settings-mobile-navigation__row-icon'>{aboutItem.icon}</span>
                        <span className='settings-mobile-navigation__row-label'>{aboutItem.label}</span>
                        <Right theme='outline' size='14' aria-hidden='true' />
                      </Button>
                    ) : null}
                  </div>
                )}
              </nav>
            )}
            <div ref={contentRef} className={contentClass} tabIndex={-1} data-testid='settings-page-focus-fallback'>
              {children}
            </div>
          </div>
        </SettingsTabNavigateProvider>
      </SettingsActiveAnchorProvider>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
