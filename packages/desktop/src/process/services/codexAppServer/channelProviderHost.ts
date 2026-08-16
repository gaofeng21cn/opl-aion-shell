import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CodexAppServerChannelTurnCallback } from './adapter';

export type ChannelProviderHostDisposable = Readonly<{
  dispose(): void | Promise<void>;
}>;

export type ChannelProviderHostHandle = ChannelProviderHostDisposable &
  Readonly<{
    appStatePatch(): Readonly<Record<string, unknown>>;
    readChannelAccess(input: ChannelProviderAccessRequest): Promise<Readonly<Record<string, unknown>>>;
    executeChannelAccessAction(input: ChannelProviderAccessRequest): Promise<Readonly<Record<string, unknown>>>;
  }>;

export type ChannelProviderAccessRequest = Readonly<{
  package_id: string;
  ref: string;
  input?: Readonly<Record<string, unknown>>;
  confirmed?: boolean;
}>;

let activeChannelProviderHost: Promise<ChannelProviderHostHandle | null> | null = null;

type FrameworkChannelProviderBootstrap = (options: {
  callback: CodexAppServerChannelTurnCallback;
}) => Promise<ChannelProviderHostHandle>;

type ChannelProviderHostOptions = Readonly<{
  frameworkPackageRoot: string;
  callback: CodexAppServerChannelTurnCallback;
  loadBootstrap?: (frameworkPackageRoot: string) => Promise<FrameworkChannelProviderBootstrap>;
}>;

async function loadFrameworkBootstrap(frameworkPackageRoot: string): Promise<FrameworkChannelProviderBootstrap> {
  const packageRoot = path.resolve(frameworkPackageRoot);
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    name?: unknown;
    exports?: Record<string, unknown>;
  };
  if (packageJson.name !== 'opl-framework') {
    throw new Error('Selected channel-provider Host carrier is not opl-framework.');
  }
  const exportPath = packageJson.exports?.['./cordis-profiles'];
  if (typeof exportPath !== 'string' || !exportPath.startsWith('./')) {
    throw new Error('Selected OPL Framework carrier has no public Cordis profiles export.');
  }
  const modulePath = path.resolve(packageRoot, exportPath);
  if (
    !modulePath.startsWith(`${packageRoot}${path.sep}`) ||
    !fs.existsSync(modulePath) ||
    !fs.statSync(modulePath).isFile()
  ) {
    throw new Error('Selected OPL Framework Cordis profiles export is unavailable.');
  }
  const module = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as {
    startCordisChannelProviderHost?: unknown;
  };
  if (typeof module.startCordisChannelProviderHost !== 'function') {
    throw new Error('Selected OPL Framework carrier lacks the channel-provider Host bootstrap.');
  }
  return module.startCordisChannelProviderHost as FrameworkChannelProviderBootstrap;
}

export async function startChannelProviderHost(
  options: ChannelProviderHostOptions
): Promise<ChannelProviderHostHandle> {
  const bootstrap = await (options.loadBootstrap ?? loadFrameworkBootstrap)(options.frameworkPackageRoot);
  const disposable = await bootstrap({ callback: options.callback });
  if (
    !disposable ||
    typeof disposable.dispose !== 'function' ||
    typeof disposable.appStatePatch !== 'function' ||
    typeof disposable.readChannelAccess !== 'function' ||
    typeof disposable.executeChannelAccessAction !== 'function'
  ) {
    throw new Error('OPL Framework channel-provider Host bootstrap returned an invalid handle.');
  }
  return disposable;
}

export function setActiveChannelProviderHost(host: Promise<ChannelProviderHostHandle | null> | null): void {
  activeChannelProviderHost = host;
}

export async function readActiveChannelProviderAppStatePatch(): Promise<Readonly<Record<string, unknown>> | undefined> {
  try {
    return (await activeChannelProviderHost)?.appStatePatch();
  } catch {
    return undefined;
  }
}

function contributionEntries(host: ChannelProviderHostHandle): Readonly<Record<string, unknown>>[] {
  const patch = host.appStatePatch();
  const projection = patch.ui_contributions;
  if (!projection || typeof projection !== 'object') return [];
  const entries = (projection as Record<string, unknown>).entries;
  return Array.isArray(entries)
    ? entries.filter(
        (entry): entry is Readonly<Record<string, unknown>> =>
          entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      )
    : [];
}

function hostOwnsRequest(
  host: ChannelProviderHostHandle,
  request: ChannelProviderAccessRequest,
  operation: 'read' | 'execute'
): boolean {
  return contributionEntries(host).some((entry) => {
    if (entry.package_id !== request.package_id) return false;
    const view = entry.view;
    if (!view || typeof view !== 'object' || Array.isArray(view)) return false;
    if ((view as Record<string, unknown>).view_type !== 'channel_access') return false;
    if (operation === 'read') return (view as Record<string, unknown>).data_ref === request.ref;
    const commands = entry.commands;
    return (
      Array.isArray(commands) &&
      commands.some(
        (command) =>
          command !== null &&
          typeof command === 'object' &&
          !Array.isArray(command) &&
          (command as Record<string, unknown>).action_ref === request.ref
      )
    );
  });
}

export async function runActiveChannelProviderAccess(
  request: ChannelProviderAccessRequest,
  operation: 'read' | 'execute'
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const host = await activeChannelProviderHost;
  if (!host || !hostOwnsRequest(host, request, operation)) return undefined;
  return operation === 'read' ? host.readChannelAccess(request) : host.executeChannelAccessAction(request);
}

export const __channelProviderHostTest = {
  loadFrameworkBootstrap,
  hostOwnsRequest,
};
