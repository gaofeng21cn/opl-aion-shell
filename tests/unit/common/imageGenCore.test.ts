import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { executeImageGeneration, processImageUri, saveGeneratedImage } from '@/common/chat/imageGenCore';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1.toString('base64')}`;
const cleanupDirs: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'aionui-image-gen-test-'));
  cleanupDirs.push(workspace);
  return workspace;
}

afterEach(() => {
  for (const directory of cleanupDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('image generation workspace boundary', () => {
  it('does not expose a model-controlled workspace root in the MCP schema', () => {
    const serverSource = readFileSync(
      resolve(import.meta.dirname, '../../../packages/desktop/src/process/resources/builtinMcp/imageGenServer.ts'),
      'utf8'
    );

    expect(serverSource).not.toContain('workspace_dir');
    expect(serverSource).toContain('const workspaceDir = process.cwd();');
  });

  it('loads relative images from inside the workspace', async () => {
    const workspace = createWorkspace();
    writeFileSync(join(workspace, 'input.png'), PNG_1X1);

    const result = await processImageUri('input.png', workspace);

    expect(result?.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('blocks relative and absolute paths outside the workspace', async () => {
    const workspace = createWorkspace();

    await expect(processImageUri('../outside.png', workspace)).rejects.toThrow('Path traversal blocked');
    await expect(processImageUri('/etc/passwd', workspace)).rejects.toThrow('Path traversal blocked');
  });

  it('blocks an in-workspace symlink that resolves outside', async () => {
    if (process.platform === 'win32') return;

    const workspace = createWorkspace();
    const outside = createWorkspace();
    const secret = join(outside, 'secret.png');
    writeFileSync(secret, PNG_1X1);
    symlinkSync(secret, join(workspace, 'linked.png'));

    await expect(processImageUri('linked.png', workspace)).rejects.toThrow('Path traversal blocked');
  });

  it('saves generated output inside the resolved workspace', async () => {
    const workspace = createWorkspace();

    const savedPath = await saveGeneratedImage(PNG_DATA_URL, workspace);

    expect(savedPath.startsWith(workspace)).toBe(true);
  });

  it('fails before provider access when the workspace is missing', async () => {
    const result = await executeImageGeneration(
      { prompt: 'test' },
      { id: 'test', name: 'test', platform: 'openai', base_url: '', api_key: 'test', use_model: 'test' },
      join(createWorkspace(), 'missing')
    );

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not found') });
  });
});
