import { describe, expect, it } from 'vitest';
import { sanitizeOplAppStatePayloadForCache } from '@/renderer/hooks/system/useOplAppState';

describe('OPL App state cache privacy boundary', () => {
  it('keeps the public Gateway account projection while removing undeclared and secret fields', () => {
    const sanitized = sanitizeOplAppStatePayloadForCache({
      app_state: {
        core: { status: 'ready' },
        settings_control_center: {
          app_settings_read_model: {
            opl_gateway_account: {
              surface_kind: 'opl_gateway_account_read_model.v1',
              status: 'connected',
              connection_mode: 'account',
              account_card_visible: true,
              account: {
                display_name: 'Feng Gao',
                email: 'feng@example.com',
                status: 'active',
                balance: { amount: 19.25, currency: 'USD', raw_response: 'private' },
                access_token: 'private',
              },
              usage: {
                today_tokens: 12,
                total_tokens: 34,
                today_actual_cost: 0.1,
                total_actual_cost: 0.2,
                currency: 'USD',
                day_timezone: 'Asia/Shanghai',
                raw_error: 'private',
              },
              managed_key: { name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app', key_id: 'private' },
              installation: { device_label: 'Mac', short_id: 'abcd', credential_path: 'private' },
              available_groups: [{ group_id: 'codex', label: 'Codex', api_key: 'private' }],
              freshness: {
                observed_at: '2026-07-13T12:00:00.000Z',
                stale_after: '2026-07-13T12:15:00.000Z',
                stale: false,
                last_error_code: null,
                raw_response: 'private',
              },
              capabilities: { account_login_supported: true, manual_key_supported: true, password: 'private' },
              actions: {
                complete_setup: 'gateway_account_complete_setup',
                refresh: 'gateway_account_refresh',
                repair: 'gateway_account_repair',
                use_for_model_access: 'gateway_account_use_for_model_access',
                disconnect: 'gateway_account_disconnect',
                login: 'gateway_account_login',
              },
              password: 'private',
            },
            docker_webui: { status: 'ready' },
          },
        },
      },
    });

    const appState = sanitized.app_state as Record<string, unknown>;
    const settings = appState.settings_control_center as Record<string, unknown>;
    const readModel = settings.app_settings_read_model as Record<string, unknown>;
    const gatewayAccount = readModel.opl_gateway_account as Record<string, unknown>;
    const account = gatewayAccount.account as Record<string, unknown>;
    const balance = account.balance as Record<string, unknown>;
    const usage = gatewayAccount.usage as Record<string, unknown>;
    const managedKey = gatewayAccount.managed_key as Record<string, unknown>;
    const group = (gatewayAccount.available_groups as Array<Record<string, unknown>>)[0];
    const actions = gatewayAccount.actions as Record<string, unknown>;

    expect(gatewayAccount.surface_kind).toBe('opl_gateway_account_read_model.v1');
    expect(account.email).toBe('feng@example.com');
    expect(balance).toEqual({ amount: 19.25, currency: 'USD' });
    expect(usage.today_tokens).toBe(12);
    expect(managedKey).toEqual({ name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app' });
    expect(group).toEqual({ group_id: 'codex', label: 'Codex' });
    expect(actions.login).toBeUndefined();
    expect(gatewayAccount.password).toBeUndefined();
    expect(account.access_token).toBeUndefined();
    expect(readModel.docker_webui).toEqual({ status: 'ready' });
    expect(appState.core).toEqual({ status: 'ready' });
  });

  it('does not mutate the live App state payload', () => {
    const payload = {
      settings_control_center: {
        app_settings_read_model: {
          opl_gateway_account: { account_card_visible: true },
        },
      },
    };

    sanitizeOplAppStatePayloadForCache(payload);

    expect(payload.settings_control_center.app_settings_read_model.opl_gateway_account).toEqual({
      account_card_visible: true,
    });
  });
});
