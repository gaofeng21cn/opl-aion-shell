/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IOplAppStateProfile } from '@/common/adapter/ipcBridge';

export type OplAppStateProfile = IOplAppStateProfile;

export type OplAppStateRecord = Record<string, unknown>;

export type OplAppStatePayload = {
  app_state?: OplAppStateRecord;
} & OplAppStateRecord;
