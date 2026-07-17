import { describe, expect, it } from 'vitest';
import type { AutoUpdateStatus } from '@/common/update/updateTypes';
import { projectDesktopAutoUpdateStatus } from '@/renderer/services/desktopAutoUpdateProjection';

const t = (key: string, options?: Record<string, string>): string =>
  options?.version ? `${key}:${options.version}` : key;

describe('projectDesktopAutoUpdateStatus', () => {
  it.each([
    ['checking', false, false, 'gray'],
    ['not-available', false, false, 'green'],
    ['available', true, true, 'orange'],
    ['downloading', true, true, 'orange'],
    ['downloaded', true, true, 'orange'],
    ['error', false, true, 'orange'],
    ['cancelled', false, false, 'gray'],
  ] as const)(
    'projects %s without conflating update availability and attention',
    (status, available, attention, tone) => {
      const projection = projectDesktopAutoUpdateStatus(true, { status }, t);

      expect(projection.updateAvailable).toBe(available);
      expect(projection.needsAttention).toBe(attention);
      expect(projection.tone).toBe(tone);
    }
  );

  it('includes the release version for an available update', () => {
    const status: AutoUpdateStatus = { status: 'available', version: '26.7.18' };

    expect(projectDesktopAutoUpdateStatus(true, status, t).label).toBe('settings.aboutUpdateAvailable:26.7.18');
  });

  it('stays quiet before the desktop updater has a snapshot', () => {
    expect(projectDesktopAutoUpdateStatus(true, null, t)).toMatchObject({
      updateAvailable: false,
      needsAttention: false,
      tone: 'gray',
    });
    expect(projectDesktopAutoUpdateStatus(false, { status: 'available' }, t)).toMatchObject({
      supported: false,
      updateAvailable: false,
      needsAttention: false,
    });
  });
});
