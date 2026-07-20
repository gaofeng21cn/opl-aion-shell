import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { resolveSettingsReturnPath } from '@/renderer/utils/ui/settingsReturnPath';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { Button, Tooltip } from '@arco-design/web-react';
import { ArrowLeft, Down, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getSettingsAboutNavigationItem,
  getSettingsNavigationGroups,
  getSettingsNavigationSelection,
  type SettingsNavigationDestination,
} from '../registry/settingsRegistry';

type SettingsSiderProps = {
  collapsed?: boolean;
  tooltipEnabled?: boolean;
};

const SettingsSider: React.FC<SettingsSiderProps> = ({ collapsed = false, tooltipEnabled = false }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? 'en';
  const { pathname, search } = useLocation();
  const layout = useLayoutContext();
  const groups = useMemo(() => getSettingsNavigationGroups(t, language, 'siderDesktop'), [language, t]);
  const selection = useMemo(() => getSettingsNavigationSelection(pathname, search), [pathname, search]);
  const aboutItem = useMemo(() => getSettingsAboutNavigationItem(t, language, 'siderDesktop'), [language, t]);

  const selectPath = React.useCallback(
    (path: string) => {
      void navigate(`/settings/${path}`, { replace: true });
    },
    [navigate]
  );

  const renderDestination = (destination: SettingsNavigationDestination) => {
    const active = selection?.destinationId === destination.id;
    return (
      <Button
        key={destination.id}
        type='text'
        htmlType='button'
        aria-current={active ? 'page' : undefined}
        data-settings-destination-id={destination.id}
        data-settings-path={destination.path}
        className={classNames('settings-sider__destination', {
          'settings-sider__destination--active': active,
        })}
        onClick={() => selectPath(destination.path)}
      >
        <span className='settings-sider__destination-rail' aria-hidden='true' />
        <span className='settings-sider__destination-label'>{destination.label}</span>
      </Button>
    );
  };

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const backTooltipProps = getSiderTooltipProps(collapsed || tooltipEnabled);

  return (
    <div
      className={classNames('settings-sider h-full flex min-h-0 flex-col overflow-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {!layout?.isMobile ? (
        <>
          <Tooltip {...backTooltipProps} content={t('settings.backToApp')} position='right'>
            <Button
              type='text'
              htmlType='button'
              aria-label={t('settings.backToApp')}
              data-testid='settings-back-to-app'
              className={classNames(
                'settings-sider__item',
                collapsed ? 'justify-center px-0' : 'justify-start px-10px'
              )}
              onClick={() => void navigate(resolveSettingsReturnPath())}
            >
              <span className='settings-sider__icon-slot'>
                <ArrowLeft aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
              </span>
              {!collapsed ? (
                <FlexFullContainer className='h-24px'>
                  <span className='settings-sider__item-label'>{t('settings.backToApp')}</span>
                </FlexFullContainer>
              ) : null}
            </Button>
          </Tooltip>
          <div className='settings-sider__secondary-divider' role='separator' />
        </>
      ) : null}

      <nav className='settings-sider__groups' aria-label={t('settings.uiOptimization.navigation.mobileCategories')}>
        {groups.map((group) => {
          const active = selection?.groupId === group.id;
          const defaultDestination =
            group.destinations.find((destination) => destination.id === group.defaultDestinationId) ??
            group.destinations[0];
          const expandable = group.destinations.length > 1;
          return (
            <div key={group.id} className='settings-sider__group'>
              <Tooltip {...siderTooltipProps} content={group.label} position='right'>
                <Button
                  type='text'
                  htmlType='button'
                  aria-current={active && !expandable ? 'page' : undefined}
                  aria-expanded={expandable ? active : undefined}
                  data-settings-group-id={group.id}
                  className={classNames(
                    'settings-sider__item',
                    collapsed ? 'justify-center px-0' : 'justify-start px-10px',
                    {
                      'settings-sider__item--active': active,
                    }
                  )}
                  onClick={() => defaultDestination && selectPath(defaultDestination.path)}
                >
                  <span className='settings-sider__icon-slot'>{group.icon}</span>
                  {!collapsed ? (
                    <>
                      <FlexFullContainer className='h-24px'>
                        <span className='settings-sider__item-label'>{group.label}</span>
                      </FlexFullContainer>
                      {expandable ? (
                        active ? (
                          <Down aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
                        ) : (
                          <Right aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />
                        )
                      ) : null}
                    </>
                  ) : null}
                </Button>
              </Tooltip>
              {active && expandable && !collapsed ? (
                <div className='settings-sider__destinations' role='group' aria-label={group.label}>
                  {group.destinations.map(renderDestination)}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {aboutItem ? (
        <div className='settings-sider__auxiliary'>
          <div
            className='settings-sider__secondary-divider'
            data-testid='settings-sider-secondary-divider'
            role='separator'
          />
          <Tooltip {...siderTooltipProps} content={aboutItem.label} position='right'>
            <Button
              type='text'
              htmlType='button'
              aria-current={pathname.includes(`/settings/${aboutItem.path}`) ? 'page' : undefined}
              data-settings-id={aboutItem.id}
              className={classNames(
                'settings-sider__item',
                collapsed ? 'justify-center px-0' : 'justify-start px-10px'
              )}
              onClick={() => selectPath(aboutItem.path)}
            >
              <span className='settings-sider__icon-slot'>{aboutItem.icon}</span>
              {!collapsed ? (
                <FlexFullContainer className='h-24px'>
                  <span className='settings-sider__item-label'>{aboutItem.label}</span>
                </FlexFullContainer>
              ) : null}
            </Button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
};

export default SettingsSider;
