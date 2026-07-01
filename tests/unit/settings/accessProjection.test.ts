import { describe, expect, it, vi } from 'vitest';
import {
  buildDockerWebuiProjection,
  buildAccessProjection,
  compactAccessDetail,
  normalizeAccessStatus,
} from '@/renderer/pages/settings/accessProjection';

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [],
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
        settings_control_center: {
          app_settings_read_model: {
            resource_sources: {
              cloud_remote_access: {
                status: 'ready',
                resource_source_refs: ['opl://resource-source/cloud'],
                body: 'must not render',
              },
              opl_gateway: {
                status: 'available',
                gateway_status_ref: 'opl://gateway/status',
              },
            },
          },
        },
      },
      t
    );

    expect(projection.cards.find((card) => card.key === 'modelAccess')).toMatchObject({
      status: 'ready',
      tone: 'green',
    });
    expect(projection.resourceSources).toEqual([
      {
        key: 'cloudRemoteAccess',
        title: 'settings.accessPage.resourceSources.cloudRemoteAccess',
        status: 'ready',
        refs: ['opl://resource-source/cloud'],
      },
      {
        key: 'oplGateway',
        title: 'settings.accessPage.resourceSources.oplGateway',
        status: 'available',
        refs: ['opl://gateway/status'],
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain('must not render');
  });

  it('reads Docker WebUI ordinary actions from the App settings control center read model', () => {
    const projection = buildDockerWebuiProjection({
      settings_control_center: {
        app_settings_read_model: {
          docker_webui: {
            ordinary_status: 'action_available',
            runtime_proxy: {
              status: 'diagnose_with_doctor',
            },
            failure_recovery: {
              status: 'available',
            },
            ordinary_next_actions: [
              {
                action_id: 'settings_install_docker_webui',
                label: 'Install Docker WebUI',
                state: 'ready',
                route: 'opl app action execute --action settings_install_docker_webui',
                dry_run_route: 'opl app action execute --action settings_install_docker_webui --dry-run',
                payload_required: false,
                confirmation_required: true,
                danger_level: 'medium',
              },
              {
                action_id: 'settings_select_webui_seed',
                label: 'Select WebUI image seed',
                state: 'ready',
                route: 'opl app action execute --action settings_select_webui_seed',
                dry_run_route: 'opl app action execute --action settings_select_webui_seed --dry-run',
                payload_required: true,
                confirmation_required: true,
                danger_level: 'medium',
              },
            ],
          },
        },
      },
    });

    expect(projection).toMatchObject({
      status: 'action_available',
      runtimeStatus: 'diagnose_with_doctor',
      recoveryStatus: 'available',
      actions: [
        {
          actionId: 'settings_install_docker_webui',
          label: 'Install Docker WebUI',
          payloadRequired: false,
          confirmationRequired: true,
          dangerLevel: 'medium',
        },
        {
          actionId: 'settings_select_webui_seed',
          label: 'Select WebUI image seed',
          payloadRequired: true,
          confirmationRequired: true,
          dangerLevel: 'medium',
        },
      ],
    });
  });
});
