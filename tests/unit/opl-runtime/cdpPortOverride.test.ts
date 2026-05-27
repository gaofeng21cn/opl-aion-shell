import { describe, expect, it } from 'vitest';

import { resolveCdpPortStartupOverride } from '../../../packages/desktop/src/process/utils/cdpPortOverride';

describe('CDP startup port override', () => {
  it('prefers the packaged-app CLI argument over the inherited environment', () => {
    expect(
      resolveCdpPortStartupOverride(['One Person Lab', '--aionui-cdp-port=9239'], { AIONUI_CDP_PORT: '9230' })
    ).toEqual({ source: 'argv', enabled: true, port: 9239 });
  });

  it('accepts split CLI argument syntax from Electron open --args', () => {
    expect(resolveCdpPortStartupOverride(['One Person Lab', '--aionui-cdp-port', '9240'], {})).toEqual({
      source: 'argv',
      enabled: true,
      port: 9240,
    });
  });

  it('allows CLI arguments to explicitly disable CDP', () => {
    expect(
      resolveCdpPortStartupOverride(['One Person Lab', '--aionui-cdp-port=0'], { AIONUI_CDP_PORT: '9230' })
    ).toEqual({ source: 'argv', enabled: false, port: undefined });
    expect(resolveCdpPortStartupOverride(['One Person Lab', '--aionui-cdp-port=false'], {})).toEqual({
      source: 'argv',
      enabled: false,
      port: undefined,
    });
  });

  it('falls back to AIONUI_CDP_PORT when no CLI argument is present', () => {
    expect(resolveCdpPortStartupOverride(['One Person Lab'], { AIONUI_CDP_PORT: '9238' })).toEqual({
      source: 'env',
      enabled: true,
      port: 9238,
    });
  });

  it('leaves startup policy unset when no override is present', () => {
    expect(resolveCdpPortStartupOverride(['One Person Lab'], {})).toEqual({
      source: null,
      enabled: undefined,
      port: undefined,
    });
  });
});
