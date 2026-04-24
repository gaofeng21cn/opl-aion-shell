/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
import { useCallback, useEffect, useState } from 'react';

export const OPL_DEFAULT_BRAND_NAME = 'One Person Lab';
export const OPL_BRAND_NAME_CHANGED_EVENT = 'opl-brand-name-changed';

const normalizeBrandName = (value: string | undefined | null): string => {
  const trimmed = value?.trim();
  return trimmed || OPL_DEFAULT_BRAND_NAME;
};

export function useOplBrandName() {
  const [brandName, setBrandName] = useState(OPL_DEFAULT_BRAND_NAME);

  const reloadBrandName = useCallback(() => {
    ConfigStorage.get('opl.brandName')
      .then((value) => setBrandName(normalizeBrandName(value)))
      .catch(() => setBrandName(OPL_DEFAULT_BRAND_NAME));
  }, []);

  useEffect(() => {
    reloadBrandName();
    window.addEventListener(OPL_BRAND_NAME_CHANGED_EVENT, reloadBrandName);
    return () => {
      window.removeEventListener(OPL_BRAND_NAME_CHANGED_EVENT, reloadBrandName);
    };
  }, [reloadBrandName]);

  return brandName;
}

export function dispatchOplBrandNameChanged() {
  window.dispatchEvent(new CustomEvent(OPL_BRAND_NAME_CHANGED_EVENT));
}

export function normalizeOplBrandName(value: string | undefined | null): string {
  return normalizeBrandName(value);
}
