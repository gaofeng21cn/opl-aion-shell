import { describe, expect, it } from 'vitest';
import {
  hasPackageContributionExecuteAction,
  readOplUiContributionsProjection,
  resolveOplUiContributionLabel,
} from '@/common/types/opl/uiContributions';

function entry(input: { packageId: string; contributionId: string; slot: string; sortOrder: number; kind?: string }) {
  return {
    contribution_key: `${input.packageId}:${input.contributionId}`,
    contribution_id: input.contributionId,
    package_id: input.packageId,
    slot: input.slot,
    contribution_kind: input.kind ?? 'view',
    trust_tier: 'declarative',
    scope: 'root',
    sort_order: input.sortOrder,
    view: {
      view_id: 'activity',
      view_type: 'activity_log',
      title_i18n: { 'zh-CN': '活动', 'en-US': 'Activity' },
      data_ref: 'example.activity.v1#current',
    },
    commands: [
      {
        command_id: 'refresh',
        label_i18n: { 'zh-CN': '刷新', 'en-US': 'Refresh' },
        action_ref: 'example.activity.v1#refresh',
        confirmation_required: false,
      },
    ],
    badges: [
      {
        badge_id: 'health',
        label_i18n: { 'zh-CN': '正常', 'en-US': 'Healthy' },
        data_ref: 'example.activity.v1#health',
        tone: 'success',
      },
    ],
  };
}

describe('OPL UI contribution projection', () => {
  it('accepts the exact projection, keeps all three slots, and applies stable ordering', () => {
    const projection = readOplUiContributionsProjection({
      ui_contributions: {
        surface_kind: 'opl_app_ui_contributions_projection.v1',
        entries: [
          entry({ packageId: 'z-package', contributionId: 'runtime', slot: 'runtime.detail', sortOrder: 20 }),
          entry({ packageId: 'a-package', contributionId: 'settings', slot: 'settings.section', sortOrder: 10 }),
          entry({ packageId: 'b-package', contributionId: 'composer', slot: 'composer.palette', sortOrder: 10 }),
        ],
      },
    });

    expect(projection.surfaceKind).toBe('opl_app_ui_contributions_projection.v1');
    expect(projection.entries.map((item) => item.slot)).toEqual([
      'settings.section',
      'composer.palette',
      'runtime.detail',
    ]);
    expect(projection.entries[0]?.commands[0]?.actionRef).toBe('example.activity.v1#refresh');
    expect(projection.entries[0]?.badges[0]?.badgeId).toBe('health');
  });

  it('drops one malformed entry without disabling valid or unknown-kind entries', () => {
    const malformed = entry({ packageId: 'broken', contributionId: 'wrong-key', slot: 'runtime.detail', sortOrder: 0 });
    malformed.contribution_key = 'different:key';
    const projection = readOplUiContributionsProjection({
      ui_contributions: {
        surface_kind: 'opl_app_ui_contributions_projection.v1',
        entries: [
          malformed,
          entry({ packageId: 'valid', contributionId: 'known', slot: 'runtime.detail', sortOrder: 1 }),
          entry({
            packageId: 'future',
            contributionId: 'future-kind',
            slot: 'runtime.detail',
            sortOrder: 2,
            kind: 'future_kind',
          }),
        ],
      },
    });

    expect(projection.entries.map((item) => item.contributionKey)).toEqual(['valid:known', 'future:future-kind']);
    expect(projection.entries[1]?.contributionKind).toBe('future_kind');
  });

  it('fails closed for other surface kinds and reads action availability from the exact catalog entry', () => {
    expect(readOplUiContributionsProjection({ ui_contributions: { surface_kind: 'other.v1' } }).entries).toEqual([]);
    expect(hasPackageContributionExecuteAction({ actions: [{ action_id: 'other' }] })).toBe(false);
    expect(hasPackageContributionExecuteAction({ actions: [{ action_id: 'package_contribution_execute' }] })).toBe(
      true
    );
  });

  it('resolves localized labels with deterministic fallback', () => {
    const label = { 'zh-CN': '活动', 'en-US': 'Activity' };
    expect(resolveOplUiContributionLabel(label, 'zh-CN', 'fallback')).toBe('活动');
    expect(resolveOplUiContributionLabel(label, 'fr-FR', 'fallback')).toBe('Activity');
    expect(resolveOplUiContributionLabel({}, 'en-US', 'fallback')).toBe('fallback');
  });
});
