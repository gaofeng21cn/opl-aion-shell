import React, { useEffect, useState } from 'react';
import { CloseSmall, Copy, Minus, SquareSmall } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';

const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [available, setAvailable] = useState(true);

  // 初始化时同步窗口状态并订阅最大化事件 / Sync current window state and subscribe to maximize events
  useEffect(() => {
    let isMounted = true;

    // 获取初始窗口状态 / Get initial window state
    ipcBridge.windowControls.isMaximized
      .invoke()
      .then((state) => {
        if (isMounted) {
          setIsMaximized(state);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAvailable(false);
        }
      });

    // 订阅窗口最大化状态变化 / Subscribe to window maximize state changes
    const unsubscribe = ipcBridge.windowControls.maximizedChanged.on(({ is_maximized }) => {
      if (isMounted) {
        setIsMaximized(is_maximized);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 桌面环境缺少控制接口时直接不渲染 / Hide when window controls are not available (non-desktop)
  if (!available) {
    return null;
  }

  // 以下处理三种窗口按钮点击事件 / Handle minimize, maximize/restore, and close button events
  const handleMinimize = () => {
    void ipcBridge.windowControls.minimize.invoke();
  };

  const handleClose = () => {
    void ipcBridge.windowControls.close.invoke();
  };

  const handleToggleMaximize = () => {
    if (isMaximized) {
      void ipcBridge.windowControls.unmaximize.invoke();
    } else {
      void ipcBridge.windowControls.maximize.invoke();
    }
  };

  return (
    <div className='app-window-controls'>
      <button type='button' className='app-window-controls__button' onClick={handleMinimize} aria-label='Minimize'>
        <Minus {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' />
      </button>
      <button
        type='button'
        className='app-window-controls__button'
        onClick={handleToggleMaximize}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <Copy {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' />
        ) : (
          <SquareSmall {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' />
        )}
      </button>
      <button
        type='button'
        className='app-window-controls__button app-window-controls__button--close'
        onClick={handleClose}
        aria-label='Close'
      >
        <CloseSmall {...OPL_CHROME_ICON_PROPS} aria-hidden='true' />
      </button>
    </div>
  );
};

export default WindowControls;
