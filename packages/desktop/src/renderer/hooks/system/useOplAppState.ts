/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import type { OplAppStatePayload, OplAppStateProfile, OplAppStateRecord } from '@/common/types/opl/appState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const APP_STATE_FAST_CACHE_KEY = 'opl.appState.fast.v1';

export type OplAppStateCache = {
  payload: OplAppStatePayload;
  loadedAt: string | null;
};

export type UseOplAppStateResult = {
  appState: OplAppStateRecord;
  payload: OplAppStatePayload | null;
  loadedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: (profile?: OplAppStateProfile, options?: OplAppStateLoadOptions) => Promise<OplAppStatePayload | null>;
};

export type OplAppStateLoadOptions = {
  showRefreshing?: boolean;
  background?: boolean;
};

export function isOplRecord(value: unknown): value is OplAppStateRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function oplRecord(value: unknown): OplAppStateRecord {
  return isOplRecord(value) ? value : {};
}

export function oplRecordList(value: unknown): OplAppStateRecord[] {
  return Array.isArray(value) ? value.filter(isOplRecord) : [];
}

export function oplString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function oplNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getAppState(payload: OplAppStatePayload | null | undefined): OplAppStateRecord {
  return oplRecord(payload?.app_state ?? payload);
}

function payloadFromBridgeResult(result: IOplRuntimeCommandResult | null | undefined): OplAppStatePayload | null {
  if (result?.ok === false) {
    throw new Error(result.error?.message || 'OPL App state command failed');
  }
  if (!isOplRecord(result?.parsed)) return null;
  const parsed = result.parsed;
  const payload = isOplRecord(parsed.app_state) ? { app_state: parsed.app_state } : parsed;
  return payload as OplAppStatePayload;
}

function readCachedFastState(): OplAppStateCache | null {
  try {
    const raw = localStorage.getItem(APP_STATE_FAST_CACHE_KEY);
    if (!raw) return null;
    const parsed = oplRecord(JSON.parse(raw) as unknown);
    const payload = oplRecord(parsed.payload) as OplAppStatePayload;
    if (Object.keys(getAppState(payload)).length === 0) return null;
    return {
      payload,
      loadedAt: oplString(parsed.loadedAt),
    };
  } catch {
    return null;
  }
}

function writeCachedFastState(payload: OplAppStatePayload, loadedAt: string): void {
  try {
    localStorage.setItem(APP_STATE_FAST_CACHE_KEY, JSON.stringify({ payload, loadedAt }));
  } catch {
    // The CLI-backed App state remains authoritative when localStorage is unavailable.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useOplAppState(initialProfile: OplAppStateProfile = 'fast'): UseOplAppStateResult {
  const cached = useMemo(() => (initialProfile === 'fast' ? readCachedFastState() : null), [initialProfile]);
  const [payload, setPayload] = useState<OplAppStatePayload | null>(cached?.payload ?? null);
  const [loadedAt, setLoadedAt] = useState<string | null>(cached?.loadedAt ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const initialHadCachedState = useRef(Boolean(cached));

  const load = useCallback(
    async (
      profile: OplAppStateProfile = initialProfile,
      options: OplAppStateLoadOptions = {}
    ): Promise<OplAppStatePayload | null> => {
      requestSeq.current += 1;
      const requestId = requestSeq.current;
      if (options.showRefreshing) {
        setRefreshing(true);
      } else if (!options.background) {
        setLoading(true);
      }
      setError(null);
      try {
        const nextPayload = payloadFromBridgeResult(await ipcBridge.oplRuntime.getAppState.invoke({ profile }));
        if (requestSeq.current !== requestId) return null;
        if (!nextPayload) {
          throw new Error('Invalid OPL App state payload');
        }
        const nextLoadedAt = new Date().toLocaleTimeString();
        setPayload(nextPayload);
        setLoadedAt(nextLoadedAt);
        if (profile === 'fast') writeCachedFastState(nextPayload, nextLoadedAt);
        return nextPayload;
      } catch (caughtError) {
        if (requestSeq.current === requestId) setError(errorMessage(caughtError));
        return null;
      } finally {
        if (requestSeq.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [initialProfile]
  );

  useEffect(() => {
    void load(initialProfile, { background: initialHadCachedState.current });
  }, [initialProfile, load]);

  return {
    appState: getAppState(payload),
    payload,
    loadedAt,
    loading,
    refreshing,
    error,
    load,
  };
}
