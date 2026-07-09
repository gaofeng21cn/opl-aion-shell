import { describe, expect, it } from 'vitest';
import {
  configureGatewayApiKey,
  resolveDeploymentAuth,
  type DeploymentAuthDeps,
} from '../../../packages/web-cli/src/deploymentAuth.js';

function deps(files: Record<string, string> = {}): DeploymentAuthDeps {
  return {
    readFileSync: (file) => {
      if (!(file in files)) throw new Error(`missing file: ${file}`);
      return files[file];
    },
  };
}

describe('resolveDeploymentAuth', () => {
  it('keeps local auto-login when no cloud inputs are provided', () => {
    expect(resolveDeploymentAuth({}, deps())).toEqual({
      mode: 'local_auto',
      username: 'opl',
      password: null,
      gatewayApiKey: null,
      reasons: [],
    });
  });

  it('requires password login when cloud mode is explicit', () => {
    expect(
      resolveDeploymentAuth(
        {
          OPL_WEBUI_DEPLOYMENT_MODE: 'cloud',
          OPL_WEBUI_USERNAME: 'research-admin',
          OPL_WEBUI_PASSWORD: 'ConfiguredPassword123',
        },
        deps()
      )
    ).toEqual({
      mode: 'password',
      username: 'research-admin',
      password: 'ConfiguredPassword123',
      gatewayApiKey: null,
      reasons: ['OPL_WEBUI_DEPLOYMENT_MODE=cloud', 'OPL_WEBUI_PASSWORD'],
    });
  });

  it('prefers Docker secret files over plaintext env values', () => {
    const config = resolveDeploymentAuth(
      {
        OPL_WEBUI_PASSWORD: 'env-password',
        OPL_WEBUI_PASSWORD_FILE: '/run/secrets/webui_password',
        OPL_GATEWAY_API_KEY: 'env-key',
        OPL_GATEWAY_API_KEY_FILE: '/run/secrets/gateway_api_key',
      },
      deps({
        '/run/secrets/webui_password': 'file-password\n',
        '/run/secrets/gateway_api_key': 'file-key\n',
      })
    );

    expect(config.mode).toBe('password');
    expect(config.password).toBe('file-password');
    expect(config.gatewayApiKey).toBe('file-key');
  });

  it('fails closed when only a Gateway API key is configured', () => {
    expect(() => resolveDeploymentAuth({ OPL_GATEWAY_API_KEY: 'sk-test' }, deps())).toThrow(
      'Cloud WebUI deployment requires OPL_WEBUI_PASSWORD_FILE or OPL_WEBUI_PASSWORD'
    );
  });

  it('rejects empty secret files', () => {
    expect(() =>
      resolveDeploymentAuth(
        { OPL_WEBUI_PASSWORD_FILE: '/run/secrets/webui_password' },
        deps({ '/run/secrets/webui_password': '\n' })
      )
    ).toThrow('/run/secrets/webui_password is empty');
  });
});

describe('configureGatewayApiKey', () => {
  it('posts the API key to the local runtime proxy and logs only completion', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const logs: string[] = [];

    await configureGatewayApiKey(
      { localUrl: 'http://127.0.0.1:3000', apiKey: 'sk-test-secret' },
      {
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          calls.push({ url: String(input), init });
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }) as typeof fetch,
        log: (msg) => logs.push(msg),
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:3000/api/opl-runtime/configure-codex');
    expect(calls[0].init?.body).toBe(JSON.stringify({ apiKey: 'sk-test-secret' }));
    expect(logs).toEqual(['[aionui-web] OPL Gateway API key configured from external secret.']);
    expect(JSON.stringify(logs)).not.toContain('sk-test-secret');
  });
});
