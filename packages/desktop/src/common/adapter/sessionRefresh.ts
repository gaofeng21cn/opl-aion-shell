/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const WS_CLOSE_POLICY_VIOLATION = 1008;

let inFlight: Promise<boolean> | null = null;

// HTTP and both realtime channels share the same cookie refresh request.
export function refreshSession(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    window.electronAPI ||
    typeof window.__backendPort === 'number'
  ) {
    return Promise.resolve(false);
  }
  if (inFlight) return inFlight;
  inFlight = fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    signal: AbortSignal.timeout(10000),
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
