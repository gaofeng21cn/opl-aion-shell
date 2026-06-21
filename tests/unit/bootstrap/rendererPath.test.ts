import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  resolvePreloadScriptPath,
  resolveRendererIndexPath,
  resolveRendererOutDir,
} from '@/process/utils/rendererPath';

describe('rendererPath', () => {
  it('resolves renderer assets beside the bundled main output', () => {
    const mainDir = path.join('/app/Contents/Resources/app.asar/out/main');

    expect(resolveRendererOutDir(mainDir)).toBe('/app/Contents/Resources/app.asar/out/renderer');
    expect(resolveRendererIndexPath(mainDir)).toBe('/app/Contents/Resources/app.asar/out/renderer/index.html');
  });

  it('resolves renderer assets when the caller is code-split under out/main/chunks', () => {
    const chunkDir = path.join('/app/Contents/Resources/app.asar/out/main/chunks');

    expect(resolveRendererOutDir(chunkDir)).toBe('/app/Contents/Resources/app.asar/out/renderer');
    expect(resolveRendererIndexPath(chunkDir)).toBe('/app/Contents/Resources/app.asar/out/renderer/index.html');
  });

  it('does not resolve the main window to the missing out/main/renderer path', () => {
    expect(resolveRendererIndexPath('/app/Contents/Resources/app.asar/out/main')).not.toContain('/out/main/renderer/');
  });

  it('resolves preload assets beside the bundled main output', () => {
    const mainDir = path.join('/app/Contents/Resources/app.asar/out/main');

    expect(resolvePreloadScriptPath(mainDir)).toBe('/app/Contents/Resources/app.asar/out/preload/index.js');
  });

  it('resolves preload assets when the caller is code-split under out/main/chunks', () => {
    const chunkDir = path.join('/app/Contents/Resources/app.asar/out/main/chunks');

    expect(resolvePreloadScriptPath(chunkDir)).toBe('/app/Contents/Resources/app.asar/out/preload/index.js');
  });

  it('does not resolve the preload script to the missing out/main/preload path', () => {
    expect(resolvePreloadScriptPath('/app/Contents/Resources/app.asar/out/main/chunks')).not.toContain(
      '/out/main/preload/'
    );
  });
});
