import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { Button } from '@arco-design/web-react';
import { buildSettingsNavItems, getBuiltinSettingsNavItems, type SettingsNavItem } from '../sections/settingsNav';
import './settings.css';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export { getBuiltinSettingsNavItems };

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();

  const [extensionTabs, setExtensionTabs] = useState<IExtensionSettingsTab[]>([]);

  useEffect(() => {
    void extensionsIpc.getSettingsTabs
      .invoke()
      .then((tabs) => setExtensionTabs(tabs ?? []))
      .catch((err) => console.error('[SettingsPageWrapper] Failed to load extension tabs:', err));
  }, []);

  const { resolveExtTabName } = useExtI18n();

  const menuItems = React.useMemo(() => {
    const withSizedBuiltinIcons: SettingsNavItem[] = getBuiltinSettingsNavItems(isDesktop, t).map((item) => ({
      ...item,
      icon: React.cloneElement(item.icon as React.ReactElement<{ theme?: string; size?: string }>, {
        theme: 'outline',
        size: '16',
      }),
    }));

    return buildSettingsNavItems({
      builtinItems: withSizedBuiltinIcons,
      extensionTabs,
      resolveExtTabName,
      extensionIconClassName: 'w-16px h-16px object-contain',
    });
  }, [isDesktop, t, extensionTabs, resolveExtTabName]);

  const containerClass = classNames(
    'settings-page-wrapper w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-32px',
    className
  );

  const contentClass = classNames('settings-page-content mx-auto w-full md:max-w-1024px', contentClassName);

  return (
    <SettingsViewModeProvider value='page'>
      <div className={containerClass}>
        {isMobile && (
          <div className='settings-mobile-top-nav'>
            {menuItems.map((item) => {
              const active = pathname === `/settings/${item.path}` || pathname.startsWith(`/settings/${item.path}/`);
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
        <div className={contentClass}>{children}</div>
      </div>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
