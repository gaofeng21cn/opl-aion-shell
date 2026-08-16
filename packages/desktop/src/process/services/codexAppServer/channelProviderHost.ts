import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CodexAppServerChannelTurnCallback } from './adapter';

export type ChannelProviderHostDisposable = Readonly<{
  dispose(): void | Promise<void>;
}>;

type FrameworkChannelProviderBootstrap = (options: {
  callback: CodexAppServerChannelTurnCallback;
}) => Promise<ChannelProviderHostDisposable>;

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
): Promise<ChannelProviderHostDisposable> {
  const bootstrap = await (options.loadBootstrap ?? loadFrameworkBootstrap)(options.frameworkPackageRoot);
  const disposable = await bootstrap({ callback: options.callback });
  if (!disposable || typeof disposable.dispose !== 'function') {
    throw new Error('OPL Framework channel-provider Host bootstrap returned no disposable.');
  }
  return disposable;
}

export const __channelProviderHostTest = {
  loadFrameworkBootstrap,
};
