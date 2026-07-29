/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type BrowserOpenReason =
  | 'default'
  | 'explicit-open'
  | 'env-enabled'
  | 'remote'
  | 'explicit-no-open'
  | 'env-disabled'
  | 'headless'
  | 'development';

export type PackagedWebuiBrowserPolicy = {
  openBrowser: boolean;
  reason: BrowserOpenReason;
};

export type PackagedWebuiBrowserPolicyInput = {
  allowRemote: boolean;
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  noOpenFlag: boolean;
  openFlag: boolean;
  platform: NodeJS.Platform;
};

export type PresentPackagedWebuiDeps = {
  openExternal: (url: string) => Promise<void>;
  log: (message: string) => void;
  warn: (message: string) => void;
};

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export function hasGraphicalBrowserSession(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  if (parseBoolean(env.CI) === true) return false;

  if (platform === 'darwin') {
    return !env.SSH_TTY && !env.SSH_CONNECTION;
  }

  if (platform === 'win32') {
    return env.SESSIONNAME?.trim().toLowerCase() !== 'services';
  }

  if (['linux', 'freebsd', 'openbsd', 'netbsd'].includes(platform)) {
    return Boolean(env.DISPLAY?.trim() || env.WAYLAND_DISPLAY?.trim() || env.MIR_SOCKET?.trim());
  }

  return true;
}

export function resolvePackagedWebuiBrowserPolicy(input: PackagedWebuiBrowserPolicyInput): PackagedWebuiBrowserPolicy {
  if (input.allowRemote) return { openBrowser: false, reason: 'remote' };
  if (input.noOpenFlag) return { openBrowser: false, reason: 'explicit-no-open' };
  if (!hasGraphicalBrowserSession(input.platform, input.env)) {
    return { openBrowser: false, reason: 'headless' };
  }
  if (input.openFlag) return { openBrowser: true, reason: 'explicit-open' };

  const envOverride = parseBoolean(input.env.AIONUI_OPEN_BROWSER);
  if (envOverride === false) return { openBrowser: false, reason: 'env-disabled' };
  if (envOverride === true) return { openBrowser: true, reason: 'env-enabled' };
  if (!input.isPackaged) return { openBrowser: false, reason: 'development' };

  return { openBrowser: true, reason: 'default' };
}

export async function presentPackagedWebui(
  url: string,
  policyInput: PackagedWebuiBrowserPolicyInput,
  deps: PresentPackagedWebuiDeps
): Promise<{ opened: boolean; reason: BrowserOpenReason | 'open-failed' }> {
  const policy = resolvePackagedWebuiBrowserPolicy(policyInput);
  deps.log(`[WebUI] URL: ${url}`);

  if (!policy.openBrowser) {
    deps.log(`[WebUI] Browser auto-open skipped (${policy.reason})`);
    return { opened: false, reason: policy.reason };
  }

  try {
    await deps.openExternal(url);
    deps.log(`[WebUI] Opened ${url} in the system browser`);
    return { opened: true, reason: policy.reason };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.warn(`[WebUI] Could not open the system browser automatically: ${message}`);
    return { opened: false, reason: 'open-failed' };
  }
}
