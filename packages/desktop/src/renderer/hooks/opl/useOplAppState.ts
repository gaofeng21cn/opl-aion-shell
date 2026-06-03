import { ipcBridge } from '@/common';
import type { IOplAppStateProfile, IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
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
  opl_agent_codex_context?: JsonRecord;
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

export function useOplAppState(profile: IOplAppStateProfile = 'fast') {
  const swr = useSWR(['opl-app-state', profile], () => ipcBridge.oplRuntime.getAppState.invoke({ profile }), {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  return {
    ...swr,
    appState: readOplAppState(swr.data),
  };
}
