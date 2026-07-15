/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeAppearance = 'light' | 'dark';
export type ThemeAppearanceMode = 'system' | ThemeAppearance;

/**
 * Unified theme. `appearance` drives data-theme + arco-theme. Legacy `css` and
 * `tokens` remain readable for config migration but are not applied by OPL App.
 */
export type Theme = {
  id: string;
  name: string;
  cover?: string;
  appearance: ThemeAppearance;
  tokens?: Record<string, string>;
  css?: string;
  builtin: boolean;
  created_at: number;
  updated_at: number;
};
