/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('ipcBridge project file adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('gets the conversation project and sends the current copy target DTO', async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/projects/project%2Fone')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              project_id: 'project/one',
              name: 'Research',
              explorer: { workspace_pe_id: 'pe-workspace', entries: [] },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/api/fs/copy')) {
        return new Response(JSON.stringify({ success: true, data: { copied_files: ['/projects/data/input.csv'] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: false, error: 'Not found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { fs, project } = await import('@/common/adapter/ipcBridge');

    await expect(project.get.invoke({ project_id: 'project/one' })).resolves.toMatchObject({
      explorer: { workspace_pe_id: 'pe-workspace' },
    });
    await fs.copyFilesToWorkspace.invoke({
      file_paths: ['/tmp/upload.csv'],
      target: { pe_id: 'pe-workspace', relative_path: 'data' },
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/api\/projects\/project%2Fone$/), {
      method: 'GET',
      headers: {},
      body: undefined,
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/api\/fs\/copy$/), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_paths: ['/tmp/upload.csv'],
        target: { pe_id: 'pe-workspace', relative_path: 'data' },
      }),
    });
  });
});
