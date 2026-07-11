/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('ipcBridge builtin auto skills adapter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('derives builtin auto skills from the skills catalog', async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/skills')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                name: 'auto-skill',
                description: 'Injected automatically',
                location: '/builtin/auto-skill',
                is_auto_inject: true,
                source: 'builtin',
              },
              {
                name: 'manual-skill',
                description: 'Selected manually',
                location: '/builtin/manual-skill',
                is_auto_inject: false,
                source: 'builtin',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { fs } = await import('@/common/adapter/ipcBridge');

    const result = await fs.listBuiltinAutoSkills.invoke();

    expect(result).toEqual([
      {
        name: 'auto-skill',
        description: 'Injected automatically',
        location: '/builtin/auto-skill',
      },
    ]);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/\/api\/skills$/);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', body: undefined });
  });

  it('preserves the backend error when the skills catalog cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Skills unavailable', code: 'SKILLS_UNAVAILABLE' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const { fs } = await import('@/common/adapter/ipcBridge');

    await expect(fs.listBuiltinAutoSkills.invoke()).rejects.toMatchObject({
      name: 'BackendHttpError',
      status: 500,
      code: 'SKILLS_UNAVAILABLE',
    });
  });
});
