/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AutoUpdateStatus } from '@/common/update/updateTypes';

export type DesktopAutoUpdateTone = 'green' | 'orange' | 'gray';

export type DesktopAutoUpdateProjection = {
  supported: boolean;
  status: AutoUpdateStatus | null;
  label: string;
  tone: DesktopAutoUpdateTone;
  updateAvailable: boolean;
  needsAttention: boolean;
};

type DesktopAutoUpdateTranslate = (key: string, options?: Record<string, string>) => string;

/** Maps the desktop updater snapshot into one shared user-facing status. */
export function projectDesktopAutoUpdateStatus(
  supported: boolean,
  status: AutoUpdateStatus | null,
  t: DesktopAutoUpdateTranslate
): DesktopAutoUpdateProjection {
  if (!supported) {
    return {
      supported: false,
      status: null,
      label: t('settings.aboutUpdateNotChecked'),
      tone: 'gray',
      updateAvailable: false,
      needsAttention: false,
    };
  }

  if (!status) {
    return {
      supported: true,
      status: null,
      label: t('settings.aboutUpdateNotChecked'),
      tone: 'gray',
      updateAvailable: false,
      needsAttention: false,
    };
  }

  switch (status.status) {
    case 'checking':
      return {
        supported: true,
        status,
        label: t('settings.aboutUpdateChecking'),
        tone: 'gray',
        updateAvailable: false,
        needsAttention: false,
      };
    case 'not-available':
      return {
        supported: true,
        status,
        label: t('settings.aboutUpdateCurrent'),
        tone: 'green',
        updateAvailable: false,
        needsAttention: false,
      };
    case 'available':
      return {
        supported: true,
        status,
        label: status.version
          ? t('settings.aboutUpdateAvailable', { version: status.version })
          : t('settings.aboutUpdateAvailableGeneric'),
        tone: 'orange',
        updateAvailable: true,
        needsAttention: true,
      };
    case 'downloading':
      return {
        supported: true,
        status,
        label: t('settings.aboutUpdateDownloading'),
        tone: 'orange',
        updateAvailable: true,
        needsAttention: true,
      };
    case 'downloaded':
      return {
        supported: true,
        status,
        label: t('settings.aboutUpdateDownloaded'),
        tone: 'orange',
        updateAvailable: true,
        needsAttention: true,
      };
    case 'error':
      return {
        supported: true,
        status,
        label: t('settings.aboutUpdateUnknown'),
        tone: 'orange',
        updateAvailable: false,
        needsAttention: true,
      };
    case 'cancelled':
      return {
        supported: true,
        status,
        label: t('settings.aboutUpdateCancelled'),
        tone: 'gray',
        updateAvailable: false,
        needsAttention: false,
      };
  }
}
