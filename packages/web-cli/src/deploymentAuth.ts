import fs from 'node:fs';

export type DeploymentAuthMode = 'local_auto' | 'password';

export type DeploymentAuthConfig = {
  mode: DeploymentAuthMode;
  username: string;
  password: string | null;
  gatewayApiKey: string | null;
  reasons: string[];
};

export type DeploymentAuthDeps = {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
};

export type ConfigureGatewayApiKeyDeps = {
  fetch: typeof fetch;
  log: (msg: string) => void;
};

const DEFAULT_CLOUD_USERNAME = 'opl';

function readEnv(name: string, env: NodeJS.ProcessEnv): string | null {
  const value = env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSecret(name: string, fileName: string, env: NodeJS.ProcessEnv, deps: DeploymentAuthDeps): string | null {
  const file = readEnv(fileName, env);
  if (file) {
    const value = deps.readFileSync(file, 'utf8').trim();
    if (!value) throw new Error(`${fileName} is set but ${file} is empty.`);
    return value;
  }
  return readEnv(name, env);
}

function normalizeDeploymentMode(value: string | null): 'local' | 'cloud' | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (['local', 'local_auto', 'local-auto', 'auto'].includes(normalized)) return 'local';
  if (['cloud', 'server', 'remote'].includes(normalized)) return 'cloud';
  throw new Error(`Unsupported OPL_WEBUI_DEPLOYMENT_MODE: ${value}`);
}

function normalizeAuthMode(value: string | null): DeploymentAuthMode | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (['local_auto', 'local-auto', 'auto'].includes(normalized)) return 'local_auto';
  if (['password', 'required'].includes(normalized)) return 'password';
  throw new Error(`Unsupported OPL_WEBUI_AUTH_MODE: ${value}`);
}

export function resolveDeploymentAuth(
  env: NodeJS.ProcessEnv = process.env,
  deps: DeploymentAuthDeps = { readFileSync: (file, encoding) => fs.readFileSync(file, encoding) }
): DeploymentAuthConfig {
  const deploymentMode = normalizeDeploymentMode(readEnv('OPL_WEBUI_DEPLOYMENT_MODE', env));
  const authMode = normalizeAuthMode(readEnv('OPL_WEBUI_AUTH_MODE', env));
  const password = readSecret('OPL_WEBUI_PASSWORD', 'OPL_WEBUI_PASSWORD_FILE', env, deps);
  const gatewayApiKey = readSecret('OPL_GATEWAY_API_KEY', 'OPL_GATEWAY_API_KEY_FILE', env, deps);
  const reasons: string[] = [];

  if (deploymentMode === 'cloud') reasons.push('OPL_WEBUI_DEPLOYMENT_MODE=cloud');
  if (authMode === 'password') reasons.push('OPL_WEBUI_AUTH_MODE=password');
  if (password) reasons.push('OPL_WEBUI_PASSWORD');
  if (gatewayApiKey) reasons.push('OPL_GATEWAY_API_KEY');

  const requiresPassword = reasons.length > 0;
  if (!requiresPassword) {
    return {
      mode: 'local_auto',
      username: readEnv('OPL_WEBUI_USERNAME', env) ?? DEFAULT_CLOUD_USERNAME,
      password: null,
      gatewayApiKey: null,
      reasons: [],
    };
  }

  if (!password) {
    throw new Error(
      'Cloud WebUI deployment requires OPL_WEBUI_PASSWORD_FILE or OPL_WEBUI_PASSWORD. ' +
        'OPL Gateway API key does not replace the WebUI login password.'
    );
  }

  return {
    mode: 'password',
    username: readEnv('OPL_WEBUI_USERNAME', env) ?? DEFAULT_CLOUD_USERNAME,
    password,
    gatewayApiKey,
    reasons,
  };
}

export async function configureGatewayApiKey(
  opts: { localUrl: string; apiKey: string; sessionCookie: string },
  deps: ConfigureGatewayApiKeyDeps
): Promise<void> {
  if (!opts.sessionCookie) {
    throw new Error('Configured WebUI session is required to configure the OPL Gateway API key.');
  }
  const res = await deps.fetch(`${opts.localUrl}/api/opl-runtime/configure-codex`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: opts.sessionCookie },
    body: JSON.stringify({ apiKey: opts.apiKey }),
  });
  if (!res.ok) {
    throw new Error(`/api/opl-runtime/configure-codex returned ${res.status}`);
  }
  const payload = (await res.json()) as { success?: boolean; error?: string };
  if (payload.success !== true) {
    throw new Error(payload.error || 'OPL Gateway API key configuration failed.');
  }
  deps.log('[aionui-web] OPL Gateway API key configured from external secret.');
}
