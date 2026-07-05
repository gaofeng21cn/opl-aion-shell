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
  GROUP_HEADER_BEFORE,
  buildSettingsNavItems,
  getBuiltinSettingsNavItems,
  getSearchableSecondarySettingsModalItems,
} from '../sections/settingsNav';
import { iconColors } from '@/renderer/styles/colors';
import { normalizeSearchText } from '../registry/settingsRegistry';

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();
  const [searchQuery, setSearchQuery] = useState('');

  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const { menus, groupHeaderAt, searchMatches } = useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t);
    const result = buildSettingsNavItems({
      builtinItems: builtins,
      extensionTabs,
      resolveExtTabName,
      extensionIconClassName: 'w-full h-full object-contain',
    });
    const query = normalizeSearchText(searchQuery);
    const visibleMatches = query ? result.filter((item) => item.searchText.includes(query)) : result;
    const visibleIds = new Set(visibleMatches.map((item) => item.id));
    const secondaryMatches = query
      ? getSearchableSecondarySettingsModalItems(t)
          .filter((item) => item.searchText.includes(query) && !visibleIds.has(item.id))
          .map((item) => ({ ...item, path: item.id, isImageIcon: false }))
      : [];
    const searchResult = [...visibleMatches, ...secondaryMatches];

    // Compute group header render positions.
    //
    // A header must appear before the first *visible* item of its group, which may
    // be an extension tab anchored with placement='before' to the group's first
    // builtin — not the builtin itself. Otherwise such an extension would render
    // above the header and visually belong to the previous group.
    const headerAt = new Map<number, string>();
    for (const [builtinId, headerKey] of Object.entries(GROUP_HEADER_BEFORE)) {
      if (!headerKey) continue;
      const builtinIdx = searchResult.findIndex((item) => item.id === builtinId);
      if (builtinIdx < 0) continue;
      headerAt.set(builtinIdx, headerKey);
    }

    return { menus: query ? searchResult : result, groupHeaderAt: headerAt, searchMatches: searchResult.length };
  }, [t, isDesktop, extensionTabs, resolveExtTabName, searchQuery]);

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
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
            data-testid='settings-sider-search-input'
          />
        </div>
      )}
      {!collapsed && searchMatches === 0 && (
        <div
          className='mx-2px px-10px py-9px rd-8px text-13px text-t-secondary bg-fill-1'
          data-testid='settings-sider-search-empty'
        >
          {t('settings.searchEmpty', { defaultValue: 'No matching settings' })}
        </div>
      )}
      {menus.map((item, index) => {
        const isSelected = pathname.includes(item.path);
        const groupHeaderKey = groupHeaderAt.get(index);
        const groupHeader =
          groupHeaderKey && !collapsed ? (
            <div className='settings-sider__group-header px-12px mt-8px h-28px flex items-center text-14px font-[500] text-t-tertiary select-none'>
              {t(groupHeaderKey)}
            </div>
          ) : null;
        return (
          <React.Fragment key={item.id}>
            {groupHeader}
            <Tooltip {...siderTooltipProps} content={item.label} position='right'>
              <div
                data-settings-id={item.id}
                data-settings-path={item.path}
                className={classNames(
                  'settings-sider__item h-34px rd-8px flex items-center gap-8px group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px transition-colors',
                  collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                  {
                    'hover:bg-fill-3': !isSelected,
                    '!bg-fill-3': isSelected,
                  }
                )}
                onClick={() => {
                  Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                    console.error('Navigation failed:', error);
                  });
                }}
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
                  <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px font-[500] lh-24px whitespace-nowrap text-t-primary'>
                    {item.label}
                  </div>
                </FlexFullContainer>
              </div>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SettingsSider;
