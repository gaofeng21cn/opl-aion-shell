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

export type OplGatewayAccountStatus =
  | 'not_connected'
  | 'setup_required'
  | 'connected'
  | 'reauth_required'
  | 'attention_needed'
  | 'disconnect_pending';

export type OplGatewayAccountActionId =
  | 'gateway_account_complete_setup'
  | 'gateway_account_refresh'
  | 'gateway_account_repair'
  | 'gateway_account_use_for_model_access'
  | 'gateway_account_disconnect';

export type OplGatewayAccountReadModel = {
  surface_kind: 'opl_gateway_account_read_model.v1';
  status: OplGatewayAccountStatus;
  connection_mode: 'none' | 'manual_key' | 'account';
  account_card_visible: boolean;
  account: {
    display_name: string;
    masked_email: string;
    status: string;
    balance: { amount: number | null; currency: string };
  } | null;
  usage: {
    today_tokens: number | null;
    total_tokens: number | null;
    today_actual_cost: number | null;
    total_actual_cost: number | null;
    currency: string;
    day_timezone: string;
  } | null;
  managed_key: { name: string; status: string; ownership: string } | null;
  installation: { device_label: string; short_id: string } | null;
  available_groups: Array<{ group_id: string; label: string }>;
  freshness: {
    observed_at: string | null;
    stale_after: string | null;
    stale: boolean;
    last_error_code: string | null;
  };
  capabilities: {
    account_login_supported: boolean;
    manual_key_supported: boolean;
  };
  actions: {
    complete_setup: 'gateway_account_complete_setup' | null;
    refresh: 'gateway_account_refresh' | null;
    repair: 'gateway_account_repair' | null;
    use_for_model_access: 'gateway_account_use_for_model_access' | null;
    disconnect: 'gateway_account_disconnect' | null;
  };
};
