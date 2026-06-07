/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
export { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';

import oplCodexCss from './presets/opl-codex.css?raw';
import { LIGHT_THEME_ID } from '@/common/theme/constants';

export const DEFAULT_THEME_ID = LIGHT_THEME_ID;
export const CODEX_THEME_ID = 'codex';
export const OPL_CODEX_THEME_CSS = oplCodexCss;
