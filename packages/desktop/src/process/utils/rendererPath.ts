import path from 'path';

export function resolveRendererOutDir(mainModuleDir: string): string {
  const mainOutDir = path.basename(mainModuleDir) === 'chunks' ? path.resolve(mainModuleDir, '..') : mainModuleDir;
  return path.resolve(mainOutDir, '../renderer');
}

export function resolveRendererIndexPath(mainModuleDir: string): string {
  return path.join(resolveRendererOutDir(mainModuleDir), 'index.html');
}
