import { describe, expect, it } from 'vitest';
import { sanitizeOplAppStatePayloadForCache } from '@/renderer/hooks/system/useOplAppState';

describe('OPL App state cache privacy boundary', () => {
  it('removes the complete Gateway account projection before persistence', () => {
    const sanitized = sanitizeOplAppStatePayloadForCache({
      app_state: {
        core: { status: 'ready' },
        settings_control_center: {
          app_settings_read_model: {
            opl_gateway_account: {
              surface_kind: 'opl_gateway_account_read_model.v1',
              account: { masked_email: 'u***@example.com' },
              usage: { today_tokens: 12 },
            },
            docker_webui: { status: 'ready' },
          },
        },
      },
    });

    const appState = sanitized.app_state as Record<string, unknown>;
    const settings = appState.settings_control_center as Record<string, unknown>;
    const readModel = settings.app_settings_read_model as Record<string, unknown>;
    expect(readModel.opl_gateway_account).toBeUndefined();
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
