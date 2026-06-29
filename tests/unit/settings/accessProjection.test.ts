import { describe, expect, it, vi } from 'vitest';
import {
  buildAccessProjection,
  compactAccessDetail,
  normalizeAccessStatus,
} from '@/renderer/pages/settings/accessProjection';

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
}));

const t = (key: string, options?: Record<string, string>) => {
  if (key === 'settings.accessPage.cards.provider.summary') return `${options?.status}`;
  if (key === 'settings.accessPage.cards.provider.ready') return 'Model service is reachable.';
  if (key === 'settings.accessPage.cards.provider.needsAttention') return 'Model service needs setup or maintenance.';
  if (key === 'agentMode.full-access') return 'Full Access';
  return options?.defaultValue ?? key;
};

describe('buildAccessProjection', () => {
  it('normalizes equivalent attention statuses and compacts meaningful detail parts', () => {
    expect(normalizeAccessStatus(null, 'unknown')).toBe('unknown');
    expect(normalizeAccessStatus('attention_needed', 'unknown')).toBe('attention_required');
    expect(normalizeAccessStatus('needs_attention', 'unknown')).toBe('attention_required');
    expect(compactAccessDetail(['gpt-5.5', ' ', null, '0.125.0'], 'fallback')).toBe('gpt-5.5 · 0.125.0');
    expect(compactAccessDetail([null, undefined, ' '], 'fallback')).toBe('fallback');
  });

  it('keeps account readiness separate from local provider service details', () => {
    const projection = buildAccessProjection(
      {
        core: {
          codex: {
            status: 'ready',
            model: 'gpt-5.5',
            version: '0.125.0',
            config: {
              api_key_present: false,
            },
          },
          executor: {
            permission_mode: 'full-access',
          },
        },
        provider: {
          provider_kind: 'temporal',
          health_status: 'ready',
          temporal: {
            status: 'ready',
            details: {
              address: '127.0.0.1:7233',
            },
          },
        },
      },
      t
    );

    const accountCard = projection.cards.find((card) => card.key === 'account');
    const modelAccessCard = projection.cards.find((card) => card.key === 'modelAccess');

    expect(accountCard).toMatchObject({
      status: 'attention_required',
      tone: 'orange',
      detail: 'settings.accessPage.cards.account.missing',
    });
    expect(modelAccessCard).toMatchObject({
      status: 'attention_required',
      detail: 'Model service needs setup or maintenance.',
    });
    expect(JSON.stringify(projection)).not.toContain('127.0.0.1:7233');
    expect(JSON.stringify(projection)).not.toContain('temporal');
  });

  it('marks model access ready only when Codex, account, and provider are all ready', () => {
    const projection = buildAccessProjection(
      {
        core: {
          codex: {
            version: '0.125.0',
            config: {
              api_key_present: true,
            },
          },
        },
        provider: {
          status: 'ok',
        },
      },
      t
    );

    expect(projection.cards.find((card) => card.key === 'modelAccess')).toMatchObject({
      status: 'ready',
      tone: 'green',
    });
  });
});
