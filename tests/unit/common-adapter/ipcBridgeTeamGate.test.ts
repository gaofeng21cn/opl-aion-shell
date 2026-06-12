/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ipcBridge Team mode gate', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'team-1', name: 'Disabled Team', agents: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects Team mutations without invoking HTTP when Team mode is disabled', async () => {
    const { team } = await import('@/common/adapter/ipcBridge');
    const agent = {
      agent_name: 'Leader',
      agent_type: 'codex',
      role: 'leader',
      conversation_type: 'acp',
      status: 'idle',
    };

    await expect(
      team.create.invoke({
        user_id: 'system_default_user',
        name: 'Disabled Team',
        workspace: '/tmp/opl',
        workspace_mode: 'shared',
        agents: [agent],
      })
    ).rejects.toThrow('Team mode is disabled');
    await expect(team.ensureSession.invoke({ team_id: 'team-1' })).rejects.toThrow('Team mode is disabled');
    await expect(
      team.addAgent.invoke({
        team_id: 'team-1',
        agent,
      })
    ).rejects.toThrow('Team mode is disabled');
    await expect(
      team.renameTeam.invoke({
        id: 'team-1',
        name: 'Renamed Team',
      })
    ).rejects.toThrow('Team mode is disabled');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
