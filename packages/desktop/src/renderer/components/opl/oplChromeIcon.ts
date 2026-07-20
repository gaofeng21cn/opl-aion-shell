/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IIconBase } from '@icon-park/react/es/runtime';

export const OPL_CHROME_ICON_SIZE = 16;
export const OPL_CHROME_ICON_STROKE_WIDTH = 4.5;

export const OPL_CHROME_ICON_PROPS = {
  size: OPL_CHROME_ICON_SIZE,
  strokeWidth: OPL_CHROME_ICON_STROKE_WIDTH,
  theme: 'outline',
  fill: 'currentColor',
} as const satisfies IIconBase;
