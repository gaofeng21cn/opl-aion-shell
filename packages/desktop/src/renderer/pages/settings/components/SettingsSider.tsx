import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { resolveSettingsReturnPath } from '@/renderer/utils/ui/settingsReturnPath';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';
import { ArrowLeft } from '@icon-park/react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { buildSettingsNavItems, getBuiltinSettingsNavItems, getSettingsTabIcon } from '../sections/settingsNav';
import {
  getSettingsTabLabel,
  getSettingsTabSearchText,
  OPL_SEARCHABLE_SECONDARY_TAB_IDS,
  SETTINGS_ROUTE_PATHS,
} from '../registry/settingsRegistry';

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? 'en';
  const { pathname } = useLocation();
  const layout = useLayoutContext();
  const isDesktop = isElectronDesktop();

  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const { menus, secondaryMenus } = useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t, language);
    const result = buildSettingsNavItems({
      builtinItems: builtins,
      extensionTabs,
      resolveExtTabName,
      extensionIconClassName: 'w-full h-full object-contain',
    });
    const secondaryItems = OPL_SEARCHABLE_SECONDARY_TAB_IDS.map((id) => {
      const label = getSettingsTabLabel(id, t, language);
      return {
        id,
        label,
        icon: getSettingsTabIcon(id, isDesktop ? 'siderDesktop' : 'siderMobile'),
        isImageIcon: false,
        path: SETTINGS_ROUTE_PATHS[id].replace(/^\/settings\/?/, ''),
        searchText: getSettingsTabSearchText(id, label),
      };
    });

    return {
      menus: result,
      secondaryMenus: secondaryItems,
    };
  }, [t, language, isDesktop, extensionTabs, resolveExtTabName]);

  const selectMenuItem = React.useCallback(
    (path: string) => {
      Promise.resolve(navigate(`/settings/${path}`, { replace: true })).catch((error) => {
        console.error('Navigation failed:', error);
      });
    },
    [navigate]
  );

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const backTooltipProps = getSiderTooltipProps(collapsed || tooltipEnabled);
  const menuGroups = secondaryMenus.length > 0 ? [menus, secondaryMenus] : [menus];
  return (
    <div
      className={classNames('h-full settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {!layout?.isMobile && (
        <>
          <Tooltip {...backTooltipProps} content={t('settings.backToApp')} position='right'>
            <button
              type='button'
              aria-label={t('settings.backToApp')}
              data-testid='settings-back-to-app'
              className={classNames(
                'settings-sider__item w-full border-0 bg-transparent text-left font-inherit rd-8px flex h-34px shrink-0 cursor-pointer items-center gap-8px overflow-hidden transition-colors hover:bg-fill-3',
                collapsed ? 'justify-center px-0' : 'justify-start px-10px'
              )}
              onClick={() => void navigate(resolveSettingsReturnPath())}
            >
              <span className='size-22px flex shrink-0 items-center justify-center line-height-0'>
                <ArrowLeft theme='outline' size='16' strokeWidth={2} className='block leading-none text-t-secondary' />
              </span>
              {!collapsed && (
                <span className='min-w-0 truncate text-13px font-[500] text-t-primary'>{t('settings.backToApp')}</span>
              )}
            </button>
          </Tooltip>
          <div className='settings-sider__secondary-divider' role='separator' />
        </>
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
                      'h-34px',
                      collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                      {
                        'hover:bg-fill-3': !isSelected,
                        '!bg-fill-3': isSelected,
                      }
                    )}
                    onClick={() => selectMenuItem(item.path)}
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
                            strokeWidth: 2,
                            className: 'block leading-none text-t-secondary',
                          }
                        )
                      )}
                    </span>
                    <FlexFullContainer className='h-24px collapsed-hidden'>
                      <div className='settings-sider__item-label overflow-hidden w-full text-13px font-[500] text-t-primary'>
                        <span className='block lh-24px whitespace-nowrap truncate'>{item.label}</span>
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
