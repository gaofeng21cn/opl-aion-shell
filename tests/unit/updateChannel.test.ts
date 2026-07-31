import { describe, expect, it } from 'vitest';
import { resolveOplAppUpdateChannel, resolveUpdaterReleaseChannel } from '@/common/update/updateChannel';

describe('OPL App update channel projection', () => {
  it.each([
    { app_state: { release: { channel: 'preview' } } },
    { app_state: { update_channel: 'preview' } },
    { app_state: { managed_update_plane: { update_channel: 'preview' } } },
  ])('maps persisted Preview state to the updater superset channel', (payload) => {
    expect(resolveOplAppUpdateChannel(payload)).toBe('preview');
    expect(resolveUpdaterReleaseChannel(payload)).toBe('nightly');
  });

  it.each([
    { app_state: { release: { channel: 'stable' } } },
    { app_state: { update_channel: 'stable' } },
    { app_state: { managed_update_plane: { update_channel: 'stable' } } },
    { app_state: { release: { channel: 'unknown' } } },
    {},
  ])('defaults every non-Preview projection to Stable', (payload) => {
    expect(resolveOplAppUpdateChannel(payload)).toBe('stable');
    expect(resolveUpdaterReleaseChannel(payload)).toBe('stable');
  });
});
