// Core types for @aionui/web-host (M3 interface contract, locked for M4-M8)

/**
 * App metadata injected by host environment (Electron or Node)
 */
export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
};

/**
 * Backend binary resolver function injected by host environment
 */
export type BackendBinaryResolver = () => string;

/**
 * System dirs exported to the backend via AIONUI_{CACHE,WORK,LOG}_DIR env.
 * Backend surfaces these on `/api/system/info`. Omit and the backend inherits
 * process.env, which may carry stale values from the parent shell — better to
 * be explicit.
 */
export type BackendSystemDirs = {
  cacheDir: string;
  workDir: string;
  logDir: string;
};

export type WebAutoLoginCredentials = {
  username: string;
  password: string;
};

export type WebAutoLoginBootstrap = {
  getCredentials: () => WebAutoLoginCredentials | null | Promise<WebAutoLoginCredentials | null>;
};

export type WebOplRuntimeProxyConfig = {
  dataDir: string;
  resourcesPath: string;
  projectsDir?: string;
  imageManifestPath?: string;
  imageSeedDir?: string;
  inheritUserOplEnvironment?: boolean;
};

export type WebuiDataLifecycleManagedRoot = {
  id: string;
  kind: 'cache' | 'temporary' | 'rotated_log';
  path: string;
};

export type WebuiDataLifecycleHostConfig = {
  dataDir: string;
  projectsDir?: string;
  recoveryRoot: string;
  managedRoots: WebuiDataLifecycleManagedRoot[];
  planTtlMs?: number;
  maxEntries?: number;
  maxScannedBytes?: number;
  scanDeadlineMs?: number;
  now?: () => Date;
};

/**
 * Options for starting WebHost
 */
export type WebHostOptions = {
  app: AppMetadata;
  staticDir: string;
  port?: number;
  allowRemote?: boolean;
  dataDir?: string;
  logDir?: string;
  dirs?: BackendSystemDirs;
  webAutoLogin?: WebAutoLoginBootstrap;
  oplRuntimeProxy?: WebOplRuntimeProxyConfig;
  webuiDataLifecycle?: WebuiDataLifecycleHostConfig;
  backend: { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver } | { kind: 'useExistingBackend'; port: number };
};

/**
 * Handle returned by startWebHost
 */
export type WebHostHandle = {
  port: number;
  backendPort: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};
