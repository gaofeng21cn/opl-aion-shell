/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * On first tarball launch, the aioncore's SQLite `users` table holds the
 * seeded `system_default_user` row with an empty password_hash. We probe
 * /api/auth/status; if `needs_setup === true`, ask the backend to generate and
 * persist a random password via POST /api/webui/reset-password and print it to
 * stdout so the user can log in.
 *
 * Mirrors Electron's maybeSeedInitialPassword in
 * packages/desktop/src/process/bridge/webuiBridge.ts:52-77 and the Bun dev
 * helper in scripts/webui.ts — when either changes, keep this in sync.
 *
 * The printed format is load-bearing: scripts/smoke-test-web-cli.sh greps for
 * "Generated initial admin password: <pw>". Do not change it without updating
 * that script.
 */

export type EnsureAdminPasswordDeps = {
  fetch: typeof fetch;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type EnsureAdminPasswordOptions = {
  /** 127.0.0.1 port where aioncore listens (from WebHostHandle.backendPort). */
  backendPort: number;
  /** Total wait budget for /api/auth/status coming up. Default: 15s. */
  statusTimeoutMs?: number;
  /** Poll interval between /api/auth/status attempts. Default: 500ms. */
  statusPollIntervalMs?: number;
  /**
   * Command to show in fallback hints ("Forgot the password? Run ..."). Varies
   * by launch context — packaged tarball = `aionui-web resetpass`, in-repo dev
   * = `bun run resetpass`. Defaults to the packaged form.
   */
  resetCommand?: string;
  /**
   * Reset the admin password even when credentials already exist, returning a
   * fresh startup credential that standalone WebUI can use to create browser
   * sessions without asking new Docker users to type a password.
   */
  resetExisting?: boolean;
};

type AuthStatus = {
  needs_setup?: boolean;
  data?: { needs_setup?: boolean };
};

type ResetPasswordResponse = {
  data?: { new_password?: string };
  new_password?: string;
};

type SystemUserResponse = {
  data?: { username?: string } | null;
};

export type ProvisionConfiguredAdminOptions = {
  /** 127.0.0.1 port where aioncore listens (from WebHostHandle.backendPort). */
  backendPort: number;
  username: string;
  password: string;
  statusTimeoutMs?: number;
  statusPollIntervalMs?: number;
};

export type ConfiguredAdminSession = {
  cookie: string;
};

async function waitForStatus(
  deps: EnsureAdminPasswordDeps,
  url: string,
  budgetMs: number,
  intervalMs: number
): Promise<AuthStatus> {
  const deadline = deps.now() + budgetMs;
  let lastErr: unknown = undefined;
  while (deps.now() < deadline) {
    try {
      const res = await deps.fetch(url);
      if (res.ok) {
        return (await res.json()) as AuthStatus;
      }
      lastErr = new Error(`/api/auth/status returned ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await deps.sleep(intervalMs);
  }
  throw lastErr instanceof Error ? lastErr : new Error('/api/auth/status did not come up in time');
}

async function fetchAdminUsername(deps: EnsureAdminPasswordDeps, backendPort: number): Promise<string> {
  try {
    const res = await deps.fetch(`http://127.0.0.1:${backendPort}/api/auth/internal/users/system`);
    if (!res.ok) return 'admin';
    const json = (await res.json()) as SystemUserResponse;
    return json.data?.username || 'admin';
  } catch {
    return 'admin';
  }
}

function setCookiesFrom(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = withGetSetCookie.getSetCookie?.();
  if (setCookies && setCookies.length > 0) return setCookies;
  const cookie = headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

async function postJson(
  deps: EnsureAdminPasswordDeps,
  url: string,
  body: unknown,
  cookieHeader?: string
): Promise<Response> {
  return deps.fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Probe backend auth state. On fresh install, POST reset-password and print the
 * generated credentials. In standalone Docker/WebUI mode callers may also pass
 * resetExisting=true so the current launch owns a known startup credential for
 * automatic browser login. Never throws — any failure is warned and the caller
 * continues starting the server.
 */
export async function ensureAdminPassword(
  opts: EnsureAdminPasswordOptions,
  deps: EnsureAdminPasswordDeps
): Promise<{ username: string; password: string } | null> {
  const timeoutMs = opts.statusTimeoutMs ?? 15_000;
  const intervalMs = opts.statusPollIntervalMs ?? 500;
  const resetCmd = opts.resetCommand ?? 'aionui-web resetpass';
  const base = `http://127.0.0.1:${opts.backendPort}`;

  let status: AuthStatus;
  try {
    status = await waitForStatus(deps, `${base}/api/auth/status`, timeoutMs, intervalMs);
  } catch (err) {
    deps.warn(`[aionui-web] could not verify admin credentials: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const needsSetup = status.needs_setup ?? status.data?.needs_setup ?? false;

  if (!needsSetup && opts.resetExisting !== true) {
    const username = await fetchAdminUsername(deps, opts.backendPort);
    deps.log(`[aionui-web] Log in with username "${username}". Forgot the password? Run \`${resetCmd}\`.`);
    return null;
  }

  try {
    const resetRes = await deps.fetch(`${base}/api/webui/reset-password`, { method: 'POST' });
    if (!resetRes.ok) {
      deps.warn(`[aionui-web] /api/webui/reset-password returned ${resetRes.status} — run \`${resetCmd}\``);
      return null;
    }
    const payload = (await resetRes.json()) as ResetPasswordResponse;
    const newPassword = payload.data?.new_password ?? payload.new_password;
    if (!newPassword) {
      deps.warn(`[aionui-web] /api/webui/reset-password returned no new_password — run \`${resetCmd}\``);
      return null;
    }
    const username = await fetchAdminUsername(deps, opts.backendPort);
    if (needsSetup && opts.resetExisting !== true) {
      deps.log(`[aionui-web] Generated initial admin password: ${newPassword}`);
    } else {
      deps.log('[aionui-web] Refreshed startup admin password for browser auto-login.');
    }
    deps.log(`[aionui-web] Browser login is configured automatically for username "${username}".`);
    return { username, password: newPassword };
  } catch (err) {
    deps.warn(
      `[aionui-web] failed to seed initial admin password: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Cloud/server bootstrap: set the backend's admin username/password from
 * external Docker secrets, without enabling browser auto-login or printing the
 * configured password. Throws on failure so remote deployments fail closed.
 */
export async function provisionConfiguredAdmin(
  opts: ProvisionConfiguredAdminOptions,
  deps: EnsureAdminPasswordDeps
): Promise<ConfiguredAdminSession> {
  const timeoutMs = opts.statusTimeoutMs ?? 15_000;
  const intervalMs = opts.statusPollIntervalMs ?? 500;
  const base = `http://127.0.0.1:${opts.backendPort}`;

  await waitForStatus(deps, `${base}/api/auth/status`, timeoutMs, intervalMs);

  const resetRes = await deps.fetch(`${base}/api/webui/reset-password`, { method: 'POST' });
  if (!resetRes.ok) {
    throw new Error(`/api/webui/reset-password returned ${resetRes.status}`);
  }
  const resetPayload = (await resetRes.json()) as ResetPasswordResponse;
  const temporaryPassword = resetPayload.data?.new_password ?? resetPayload.new_password;
  if (!temporaryPassword) {
    throw new Error('/api/webui/reset-password returned no new_password');
  }

  const currentUsername = await fetchAdminUsername(deps, opts.backendPort);
  const loginRes = await postJson(deps, `${base}/login`, {
    username: currentUsername,
    password: temporaryPassword,
    remember: true,
  });
  if (!loginRes.ok) {
    throw new Error(`/login returned ${loginRes.status}`);
  }
  const cookieHeader = cookieHeaderFromSetCookies(setCookiesFrom(loginRes.headers));
  if (!cookieHeader) {
    throw new Error('/login returned no session cookie');
  }

  if (currentUsername !== opts.username) {
    const usernameRes = await postJson(
      deps,
      `${base}/api/webui/change-username`,
      { new_username: opts.username },
      cookieHeader
    );
    if (!usernameRes.ok) {
      throw new Error(`/api/webui/change-username returned ${usernameRes.status}`);
    }
  }

  const passwordRes = await postJson(
    deps,
    `${base}/api/webui/change-password`,
    { new_password: opts.password },
    cookieHeader
  );
  if (!passwordRes.ok) {
    throw new Error(`/api/webui/change-password returned ${passwordRes.status}`);
  }

  // Password changes may invalidate the bootstrap session. Re-authenticate
  // with the configured credentials before calling any protected runtime route.
  const configuredLoginRes = await postJson(deps, `${base}/login`, {
    username: opts.username,
    password: opts.password,
    remember: true,
  });
  if (!configuredLoginRes.ok) {
    throw new Error(`/login after credential provisioning returned ${configuredLoginRes.status}`);
  }
  const configuredCookie = cookieHeaderFromSetCookies(setCookiesFrom(configuredLoginRes.headers));
  if (!configuredCookie) {
    throw new Error('/login after credential provisioning returned no session cookie');
  }

  deps.log(`[aionui-web] WebUI password login configured for username "${opts.username}".`);
  return { cookie: configuredCookie };
}
