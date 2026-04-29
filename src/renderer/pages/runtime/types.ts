export const RUNTIME_TRAY_ITEM_STORAGE_KEY = 'opl.runtimeTrayItem';

export type RuntimeTrayOpenPayload = {
  projectId: string;
  projectLabel: string;
  itemId: string;
  title: string;
  statusLabel: string;
  summary: string | null;
  updatedAt: string | null;
  command: string | null;
  workspacePath: string | null;
  sourceRefs: Array<Record<string, unknown>>;
};
