import path from 'path';

function resolveMainOutDir(mainModuleDir: string): string {
  const mainOutDir = path.basename(mainModuleDir) === 'chunks' ? path.resolve(mainModuleDir, '..') : mainModuleDir;
  return mainOutDir;
}

export function resolveRendererOutDir(mainModuleDir: string): string {
  const mainOutDir = resolveMainOutDir(mainModuleDir);
  return path.resolve(mainOutDir, '../renderer');
}

export function resolveRendererIndexPath(mainModuleDir: string): string {
  return path.join(resolveRendererOutDir(mainModuleDir), 'index.html');
}

export function resolvePreloadOutDir(mainModuleDir: string): string {
  const mainOutDir = resolveMainOutDir(mainModuleDir);
  return path.resolve(mainOutDir, '../preload');
}

export function resolvePreloadScriptPath(mainModuleDir: string, preloadFile = 'index.js'): string {
  return path.join(resolvePreloadOutDir(mainModuleDir), preloadFile);
}
