import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input, Tooltip } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import {
  buildSettingsNavItems,
  getBuiltinSettingsNavItems,
  getSettingsSearchEntries,
  getSettingsTabIcon,
} from '../sections/settingsNav';
import {
  getSettingsTabLabel,
  getSettingsTabSearchText,
  OPL_SEARCHABLE_SECONDARY_TAB_IDS,
  SETTINGS_ROUTE_PATHS,
} from '../registry/settingsRegistry';
import { iconColors } from '@/renderer/styles/colors';
import { normalizeSearchText } from '../registry/settingsRegistry';

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? 'en';
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();
  const [searchQuery, setSearchQuery] = useState('');

  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const { menus, secondaryMenus, searchMatches } = useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t, language);
    const result = buildSettingsNavItems({
      builtinItems: builtins,
      extensionTabs,
      resolveExtTabName,
      extensionIconClassName: 'w-full h-full object-contain',
    });
    const query = normalizeSearchText(searchQuery);
    const builtinIds = new Set(builtins.map((item) => item.id));
    const itemMatches = query
      ? getSettingsSearchEntries(t, language)
          .filter((item) => item.searchText.includes(query))
          .map((item) => {
            const page = result.find((candidate) => candidate.id === item.pageId);
            return {
              id: `search:${item.id}`,
              label: item.resultLabel,
              pageLabel: item.pageLabel,
              itemLabel: item.itemLabel,
              icon: page?.icon ?? getSettingsTabIcon(item.pageId, isDesktop ? 'siderDesktop' : 'siderMobile'),
              isImageIcon: page?.isImageIcon ?? false,
              path: item.path,
              searchText: item.searchText,
              isSearchResult: true,
            };
          })
      : [];
    const extensionMatches = query
      ? result
          .filter((item) => !builtinIds.has(item.id) && item.searchText.includes(query))
          .map((item) => ({ ...item, isSearchResult: true, pageLabel: item.label, itemLabel: '' }))
      : [];
    const searchResult = [...itemMatches, ...extensionMatches];
    const secondaryItems = OPL_SEARCHABLE_SECONDARY_TAB_IDS.map((id) => {
      const label = getSettingsTabLabel(id, t, language);
      return {
        id,
        label,
        icon: getSettingsTabIcon(id, isDesktop ? 'siderDesktop' : 'siderMobile'),
        isImageIcon: false,
        path: SETTINGS_ROUTE_PATHS[id].replace(/^\/settings\/?/, ''),
        searchText: getSettingsTabSearchText(id, label),
        isSearchResult: false,
        pageLabel: label,
        itemLabel: label,
      };
    });

    return {
      menus: query
        ? searchResult
        : result.map((item) => ({
            ...item,
            isSearchResult: false,
            pageLabel: item.label,
            itemLabel: item.label,
          })),
      secondaryMenus: query ? [] : secondaryItems,
      searchMatches: query ? searchResult.length : result.length,
    };
  }, [t, language, isDesktop, extensionTabs, resolveExtTabName, searchQuery]);

  const selectMenuItem = React.useCallback(
    (path: string) => {
      setSearchQuery('');
      Promise.resolve(navigate(`/settings/${path}`, { replace: true })).catch((error) => {
        console.error('Navigation failed:', error);
      });
    },
    [navigate]
  );

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const menuGroups = secondaryMenus.length > 0 ? [menus, secondaryMenus] : [menus];
  return (
    <div
      className={classNames('h-full settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {!collapsed && (
        <div className='px-2px pb-8px'>
          <Input
            value={searchQuery}
            onChange={setSearchQuery}
            allowClear
            prefix={<Search theme='outline' size='15' fill={iconColors.secondary} />}
            placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings' })}
            data-testid='settings-search-input'
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !searchQuery.trim() || menus.length === 0) return;
              event.preventDefault();
              selectMenuItem(menus[0].path);
            }}
          />
        </div>
      )}
      {!collapsed && searchMatches === 0 && (
        <div
          className='mx-2px px-10px py-9px rd-8px text-13px text-t-secondary bg-fill-1'
          data-testid='settings-search-empty'
        >
          {t('settings.searchEmpty', { defaultValue: 'No matching settings' })}
        </div>
      )}
      {menuGroups.map((group, groupIndex) => (
        <React.Fragment key={groupIndex === 0 ? 'primary' : 'secondary'}>
          {groupIndex > 0 && (
            <div
              className='settings-sider__secondary-divider'
              data-testid='settings-sider-secondary-divider'
              role='separator'
            />
          )}
          {group.map((item) => {
            const isSelected = pathname.includes(item.path);
            return (
              <React.Fragment key={item.id}>
                <Tooltip {...siderTooltipProps} content={item.label} position='right'>
                  <button
                    type='button'
                    data-settings-id={item.id}
                    data-settings-path={item.path}
                    aria-current={isSelected ? 'page' : undefined}
                    className={classNames(
                      'settings-sider__item w-full border-0 bg-transparent text-left font-inherit rd-8px flex items-center gap-8px group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px transition-colors',
                      item.isSearchResult ? 'min-h-44px py-6px' : 'h-34px',
                      collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                      {
                        'hover:bg-fill-3': !isSelected,
                        '!bg-fill-3': isSelected,
                      }
                    )}
                    onClick={() => selectMenuItem(item.path)}
                    data-testid={item.isSearchResult ? 'settings-search-result' : undefined}
                  >
                    {/* Leading icon — 22px slot to align with main sider rows */}
                    <span className='size-22px flex items-center justify-center shrink-0 line-height-0'>
                      {item.isImageIcon ? (
                        <span className='w-16px h-16px flex items-center justify-center'>{item.icon}</span>
                      ) : (
                        React.cloneElement(
                          item.icon as React.ReactElement<{
                            theme?: string;
                            size?: string | number;
                            className?: string;
                            strokeWidth?: number;
                          }>,
                          {
                            theme: 'outline',
                            size: '16',
                            strokeWidth: 3,
                            className: 'block leading-none text-t-secondary',
                          }
                        )
                      )}
                    </span>
                    <FlexFullContainer className='h-24px collapsed-hidden'>
                      <div className='settings-sider__item-label overflow-hidden w-full text-14px font-[500] text-t-primary'>
                        {item.isSearchResult ? (
                          <div className='flex flex-col min-w-0 leading-18px'>
                            <span className='truncate text-12px text-t-tertiary'>{item.pageLabel}</span>
                            <span className='truncate'>{item.itemLabel || item.label}</span>
                          </div>
                        ) : (
                          <span className='block lh-24px whitespace-nowrap truncate'>{item.label}</span>
                        )}
                      </div>
                    </FlexFullContainer>
                  </button>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

export default SettingsSider;
