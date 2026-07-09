import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
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
  getBuiltinSettingsNavItems,
  getSearchableSecondarySettingsModalItems,
  resolveLegacySettingsRoute,
} from '../sections/settingsNav';
import { iconColors } from '@/renderer/styles/colors';
import { normalizeSearchText } from '../registry/settingsRegistry';
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
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const [searchQuery, setSearchQuery] = useState('');

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

  const mobileMenuItems = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return menuItems;
    const visibleMatches = menuItems.filter((item) => item.searchText.includes(query));
    const visibleIds = new Set(visibleMatches.map((item) => item.id));
    const secondaryMatches = getSearchableSecondarySettingsModalItems(t)
      .filter((item) => item.searchText.includes(query) && !visibleIds.has(item.id))
      .map((item) => ({ ...item, path: item.id }));
    return [...visibleMatches, ...secondaryMatches];
  }, [menuItems, searchQuery, t]);

  const routeSearch = (
    <div className='flex flex-col gap-8px mb-16px' data-testid='settings-route-search'>
      <Input
        value={searchQuery}
        onChange={setSearchQuery}
        allowClear
        prefix={<Search theme='outline' size='15' fill={iconColors.secondary} />}
        placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings' })}
        data-testid='settings-search-input'
      />
      {searchQuery.trim().length > 0 && mobileMenuItems.length === 0 && (
        <div className='px-10px py-9px rd-8px text-13px text-t-secondary bg-fill-1' data-testid='settings-search-empty'>
          {t('settings.searchEmpty', { defaultValue: 'No matching settings' })}
        </div>
      )}
      {searchQuery.trim().length > 0 && mobileMenuItems.length > 0 && (
        <div className='flex flex-wrap gap-8px' data-testid='settings-search-results'>
          {mobileMenuItems.map((item) => (
            <Button
              key={item.path}
              size='small'
              htmlType='button'
              onClick={() => {
                void navigate(`/settings/${item.path}`, { replace: true });
              }}
            >
              {item.label}
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
            <div className='settings-mobile-top-nav'>
              {mobileMenuItems.map((item) => {
                const active = pathname.includes(`/settings/${item.path}`);
                return (
                  <Button
                    key={item.path}
                    htmlType='button'
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
          )}
          <div className={contentClass}>
            {routeSearch}
            {children}
          </div>
        </div>
      </SettingsTabNavigateProvider>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
