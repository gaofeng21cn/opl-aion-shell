import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emit, provider } = vi.hoisted(() => ({ emit: vi.fn(), provider: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    deepLink: {
      received: { emit },
      takePending: { provider },
    },
  },
}));

import {
  MAX_DEEP_LINK_URL_LENGTH,
  PROTOCOL_SCHEME,
  activateDeepLinkConsumer,
  clearPendingDeepLinkPayloads,
  extractDeepLinkPayloadFromArgv,
  extractSecondInstanceDeepLinkPayload,
  getPendingDeepLinkPayloads,
  handleDeepLinkPayload,
  handleDeepLinkUrl,
  parseDeepLinkUrl,
  registerDeepLinkBridge,
  setDeepLinkMainWindow,
  takePendingDeepLinkPayloads,
  validateDeepLinkPayload,
} from '@/process/utils/deepLink';

const payload = (route: string) => ({ action: 'navigate' as const, params: { route } });

describe('OPL deep-link protocol', () => {
  beforeEach(() => {
    emit.mockReset();
    provider.mockReset();
    setDeepLinkMainWindow(null);
    clearPendingDeepLinkPayloads();
  });

  it('accepts only exact App-owned routes', () => {
    const allowedRoutes = [
      '/guid',
      '/archived',
      '/scheduled',
      '/settings/general',
      '/settings/gateway',
      '/settings/access',
      '/settings/workspace',
      '/settings/agents',
      '/settings/capabilities',
      '/settings/resources',
      '/settings/environment',
      '/settings/storage',
      '/settings/appearance',
      '/settings/about',
    ];

    expect(PROTOCOL_SCHEME).toBe('opl');
    for (const route of allowedRoutes) {
      expect(parseDeepLinkUrl(`opl://navigate?route=${encodeURIComponent(route)}`)).toEqual({
        valid: true,
        payload: payload(route),
      });
    }
  });

  it.each([
    '/first-run',
    '/login',
    '/runtime',
    '/runtime/item',
    '/scheduled/job-1',
    '/team/team-1',
    '/settings',
    '/settings/ext/example',
    '/settings/runtime',
    '/test/components',
    '/conversation/thread-123',
    '/conversation/one/two',
    '/conversation/../settings',
    '/settings/access?tab=models',
    '/guid#section',
  ])('rejects non-registry route %s', (route) => {
    expect(parseDeepLinkUrl(`opl://navigate?route=${encodeURIComponent(route)}`)).toEqual({
      valid: false,
      reason: 'route_not_allowed',
    });
  });

  it.each([
    ['aionui://navigate?route=%2Fguid', 'invalid_scheme'],
    ['opl://add-provider?route=%2Fguid', 'unknown_action'],
    ['opl://provider/add?route=%2Fguid', 'unknown_action'],
    ['opl://navigate/path?route=%2Fguid', 'unknown_action'],
    ['opl://navigate', 'missing_route'],
    ['opl://navigate?route=', 'missing_route'],
    ['opl://navigate?route=%2Fguid&route=%2Fsettings', 'duplicate_parameter'],
    ['opl://navigate?route=%2Fguid&extra=1', 'unknown_parameter'],
    ['opl://navigate?route=%2Fguid&data=e30%3D', 'unknown_parameter'],
    ['opl://navigate?route=%2Fguid&value=sk-x', 'sensitive_data'],
    ['opl://navigate?route=%2Fguid&sk-x=1', 'sensitive_data'],
    ['opl://navigate?route=%2Fguid&data=eyJhbGciOiJIUzI1NiJ9', 'sensitive_data'],
    ['opl://navigate?route=%2Fguid&value=ghp_1234567890', 'sensitive_data'],
    ['opl://navigate?route=%2Fguid&value=github_pat_1234567890', 'sensitive_data'],
    ['opl://navigate?route=%2Fguid#fragment', 'fragment_not_allowed'],
    ['opl://user@navigate?route=%2Fguid', 'forbidden_authority'],
    ['opl://navigate:42?route=%2Fguid', 'forbidden_authority'],
    ['opl://navigate?api_key=sk-example', 'sensitive_data'],
    ['opl://navigate?route=%2Fconversation%2Ftoken', 'sensitive_data'],
    ['not a url', 'invalid_url'],
  ] as const)('rejects malformed or sensitive input without decoding legacy payloads', (url, reason) => {
    expect(parseDeepLinkUrl(url)).toEqual({ valid: false, reason });
  });

  it('rejects overlong URLs before parsing', () => {
    expect(parseDeepLinkUrl(`opl://navigate?route=/conversation/${'a'.repeat(MAX_DEEP_LINK_URL_LENGTH)}`)).toEqual({
      valid: false,
      reason: 'url_too_long',
    });
  });

  it('extracts validated cold-start argv and ignores the legacy scheme', () => {
    expect(extractDeepLinkPayloadFromArgv(['app', '--flag', 'opl://navigate?route=%2Fguid'])).toEqual(payload('/guid'));
    expect(extractDeepLinkPayloadFromArgv(['app', 'aionui://navigate?route=%2Fguid'])).toBeNull();
    expect(extractDeepLinkPayloadFromArgv(['app', 'opl://add-provider?api_key=secret'])).toBeNull();
  });

  it('validates secret-free second-instance data and falls back to argv', () => {
    expect(
      extractSecondInstanceDeepLinkPayload(['app', 'opl://navigate?route=%2Fguid'], {
        deepLinkPayload: payload('/settings/about'),
      })
    ).toEqual(payload('/settings/about'));
    expect(
      extractSecondInstanceDeepLinkPayload(['app', 'opl://navigate?route=%2Fguid'], {
        deepLinkPayload: { action: 'add-provider', params: { api_key: 'secret' } },
      })
    ).toEqual(payload('/guid'));
    expect(
      extractSecondInstanceDeepLinkPayload([], {
        deepLinkUrl: 'opl://navigate?route=%2Fguid',
      })
    ).toBeNull();
  });

  it('rejects malformed structured payloads before second-instance dispatch', () => {
    expect(validateDeepLinkPayload({ action: 'navigate', params: { route: '/guid', extra: 'value' } })).toEqual({
      valid: false,
      reason: 'invalid_payload',
    });
    expect(validateDeepLinkPayload({ action: 'navigate', params: { route: '/conversation/api_key' } })).toEqual({
      valid: false,
      reason: 'sensitive_data',
    });
  });

  it('queues only validated payloads until a window exists', () => {
    expect(handleDeepLinkUrl('opl://navigate?route=%2Fguid').valid).toBe(true);
    expect(handleDeepLinkUrl('opl://add-provider?api_key=secret').valid).toBe(false);
    expect(getPendingDeepLinkPayloads()).toEqual([payload('/guid')]);
    expect(takePendingDeepLinkPayloads()).toEqual([payload('/guid')]);
    expect(getPendingDeepLinkPayloads()).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('logs only a redacted rejection reason for invalid input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secretUrl = 'opl://add-provider?api_key=sk-do-not-log-this-value';

    handleDeepLinkUrl(secretUrl);

    expect(warn).toHaveBeenCalledWith('[DeepLink] rejected: unknown_action');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secretUrl);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sk-do-not-log-this-value');
    warn.mockRestore();
  });

  it('dispatches a warm or open-url payload without retaining the original URL', () => {
    setDeepLinkMainWindow({ isDestroyed: () => false } as never);
    activateDeepLinkConsumer();
    const result = handleDeepLinkUrl('opl://navigate?route=%2Farchived');

    expect(result.valid).toBe(true);
    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(payload('/archived'));
    expect(getPendingDeepLinkPayloads()).toEqual([]);
  });

  it('queues a structured second-instance payload when the window is unavailable', () => {
    handleDeepLinkPayload(payload('/settings/general'));
    expect(getPendingDeepLinkPayloads()).toEqual([payload('/settings/general')]);
  });

  it('keeps payloads queued until the renderer consumer activates', () => {
    setDeepLinkMainWindow({ isDestroyed: () => false } as never);
    handleDeepLinkPayload(payload('/scheduled'));
    expect(emit).not.toHaveBeenCalled();

    expect(activateDeepLinkConsumer()).toEqual([payload('/scheduled')]);
    handleDeepLinkPayload(payload('/archived'));
    expect(emit).toHaveBeenCalledWith(payload('/archived'));
  });

  it('registers one renderer-ready pull provider and activates on first pull', async () => {
    handleDeepLinkPayload(payload('/scheduled'));

    registerDeepLinkBridge();
    registerDeepLinkBridge();

    expect(provider).toHaveBeenCalledOnce();
    const pull = provider.mock.calls[0]?.[0] as (() => Promise<unknown>) | undefined;
    expect(pull).toBeTypeOf('function');
    await expect(pull?.()).resolves.toEqual([payload('/scheduled')]);

    setDeepLinkMainWindow({ isDestroyed: () => false } as never);
    handleDeepLinkPayload(payload('/archived'));
    expect(emit).not.toHaveBeenCalled();
    activateDeepLinkConsumer();
    handleDeepLinkPayload(payload('/guid'));
    expect(emit).toHaveBeenCalledWith(payload('/guid'));
  });

  it('registers only the opl scheme in every desktop packaging path', () => {
    const electronBuilder = readFileSync(resolve(__dirname, '../../../packages/desktop/electron-builder.yml'), 'utf8');
    const ubuntuInstaller = readFileSync(resolve(__dirname, '../../../scripts/install-ubuntu.sh'), 'utf8');

    expect(electronBuilder).toMatch(/schemes:\s*\n\s*- opl\b/);
    expect(electronBuilder).toContain('MimeType: x-scheme-handler/opl;');
    expect(ubuntuInstaller).toContain('MimeType=x-scheme-handler/opl;');
    expect(electronBuilder).not.toContain('x-scheme-handler/aionui');
    expect(ubuntuInstaller).not.toContain('x-scheme-handler/aionui');
  });
});
