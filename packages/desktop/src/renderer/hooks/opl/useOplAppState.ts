import { ipcBridge } from '@/common';
import type { IOplAppStateProfile, IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { useRef } from 'react';
import useSWR from 'swr';

type JsonRecord = Record<string, unknown>;

export type OplAppState = {
  schema_version?: string;
  surface_kind?: string;
  core?: JsonRecord;
  developer_profile?: JsonRecord;
  developer_mode?: JsonRecord;
  modules?: JsonRecord;
  provider?: JsonRecord;
  assistants?: JsonRecord;
  release?: JsonRecord;
  operator?: JsonRecord;
  paths?: JsonRecord;
  actions?: unknown[];
  ui_defaults?: JsonRecord;
  opl_flow_context?: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readOplAppState(result: IOplRuntimeCommandResult | null | undefined): OplAppState | null {
  if (!isRecord(result?.parsed)) return null;
  const appState = isRecord(result.parsed.app_state) ? result.parsed.app_state : result.parsed;
  return appState.schema_version === 'opl_app_state.v1' ? (appState as OplAppState) : null;
}

export function readOplString(record: unknown, key: string): string | null {
  if (!isRecord(record)) return null;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readOplRecord(record: unknown, key: string): JsonRecord | null {
  if (!isRecord(record)) return null;
  const value = record[key];
  return isRecord(value) ? value : null;
}

export function shouldRefreshOplPackageState(result: IOplRuntimeCommandResult | null | undefined): boolean {
  const appState = readOplAppState(result);
  const agentPackages = readOplRecord(appState, 'agent_packages');
  const statusIndex = readOplRecord(agentPackages, 'status_index');
  const packages = statusIndex?.packages;
  const statuses = Array.isArray(packages) ? packages : Object.values(isRecord(packages) ? packages : {});
  return statuses.some((status) => readOplString(status, 'launch_blocked_reason') === 'package_not_installed');
}

export function useOplAppState(profile: IOplAppStateProfile = 'fast') {
  const blockedRefreshCount = useRef(0);
  const swr = useSWR(['opl-app-state', profile], () => ipcBridge.oplRuntime.getAppState.invoke({ profile }), {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    refreshInterval: (latest) => (shouldRefreshOplPackageState(latest) && blockedRefreshCount.current < 30 ? 2000 : 0),
    onSuccess: (latest) => {
      if (shouldRefreshOplPackageState(latest)) {
        blockedRefreshCount.current += 1;
      } else {
        blockedRefreshCount.current = 0;
      }
    },
  });

  return {
    ...swr,
    appState: readOplAppState(swr.data),
  };
}
