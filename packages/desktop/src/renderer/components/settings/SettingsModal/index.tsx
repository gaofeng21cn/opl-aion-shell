/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsHost from './SettingsHost';
import { SettingsViewModeProvider } from './settingsViewContext';

const MOBILE_BREAKPOINT = 768;

const MODAL_WIDTH = {
  mobile: 560,
  desktop: 880,
} as const;

const MODAL_HEIGHT = {
  mobile: '90vh',
  mobileContent: 'calc(90vh - 80px)',
  desktop: 459,
} as const;

const RESIZE_DEBOUNCE_DELAY = 150;

export type BuiltinSettingTab =
  | 'general'
  | 'workspace'
  | 'local-services'
  | 'environment'
  | 'capabilities'
  | 'resources'
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

export type SettingTab = BuiltinSettingTab | (string & {});

interface SettingsModalProps {
  visible: boolean;
  onCancel: () => void;
  defaultTab?: SettingTab;
}

interface SubModalProps {
  visible: boolean;
  onCancel: () => void;
  title?: string;
  children: React.ReactNode;
}

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

const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onCancel, defaultTab = 'general' }) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  const resizeTimerRef = useRef<number | undefined>(undefined);

  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
  }, []);

  useEffect(() => {
    handleResize();

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
        <SettingsHost
          visible={visible}
          defaultTab={defaultTab}
          isMobile={isMobile}
          mobileContentHeight={MODAL_HEIGHT.mobileContent}
          desktopContentHeight={MODAL_HEIGHT.desktop}
        />
      </AionModal>
    </SettingsViewModeProvider>
  );
};

export default SettingsModal;
