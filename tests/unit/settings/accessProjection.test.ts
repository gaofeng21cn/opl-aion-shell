import { describe, expect, it, vi } from 'vitest';
import {
  buildDockerWebuiProjection,
  buildAccessProjection,
  compactAccessDetail,
  gatewayAccountInitials,
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

describe('gatewayAccountInitials', () => {
  it('uses only the first Han character for a Chinese display name', () => {
    expect(gatewayAccountInitials('高峰', 'gf@fenggaolab.org')).toBe('高');
    expect(gatewayAccountInitials('高 峰', 'gf@fenggaolab.org')).toBe('高');
  });

  it('uses the first letters of the first two words for a non-Han display name', () => {
    expect(gatewayAccountInitials('Feng Gao', 'gf@fenggaolab.org')).toBe('FG');
    expect(gatewayAccountInitials('feng', 'gf@fenggaolab.org')).toBe('FE');
  });

  it('falls back to the email local part and then the App identity', () => {
    expect(gatewayAccountInitials(null, 'gf@fenggaolab.org')).toBe('GF');
    expect(gatewayAccountInitials(null, null)).toBe('OP');
  });
});

describe('buildAccessProjection', () => {
  it('normalizes equivalent attention statuses and compacts meaningful detail parts', () => {
    expect(normalizeAccessStatus(null, 'unknown')).toBe('unknown');
    expect(normalizeAccessStatus('attention_needed', 'unknown')).toBe('attention_required');
    expect(normalizeAccessStatus('needs_attention', 'unknown')).toBe('attention_required');
    expect(compactAccessDetail(['gpt-5.5', ' ', null, '0.125.0'], 'fallback')).toBe('gpt-5.5 · 0.125.0');
    expect(compactAccessDetail([null, undefined, ' '], 'fallback')).toBe('fallback');
  });

  it('keeps OPL Gateway readiness separate from local background service details', () => {
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
    expect(accountCard).toMatchObject({
      status: 'attention_required',
      tone: 'orange',
      statusLabel: 'settings.accessPage.cards.account.missing',
      detail: '',
    });
    expect(JSON.stringify(projection)).not.toContain('127.0.0.1:7233');
    expect(JSON.stringify(projection)).not.toContain('temporal');
  });

  it('marks the background service card ready from provider readiness', () => {
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
                key_status_ref: 'opl://gateway/key/oplgateway',
                provider_policy_ref: 'opl://gateway/policy/provider-routing',
              },
              docker_webui: {
                status: 'ready',
                resource_source_ref: 'opl://resource-source/docker-webui',
                user_provided: true,
              },
              user_hpc: {
                status: 'available',
                resource_source_ref: 'opl://resource-source/ssh-hpc/lab',
                user_provided: true,
              },
              cloud_compute: {
                status: 'available',
                resource_source_ref: 'opl://resource-source/opl-cloud/managed-compute',
                console_managed: true,
                console_policy_ref: 'opl://console/policy/compute',
                quota_ref: 'opl://console/quota/compute',
                billing_ref: 'opl://console/billing/project',
                permission_ref: 'opl://console/permission/workspace',
                environment_template_ref: 'opl://environment-template/python-r-quarto',
                environment_version_ref: 'opl://environment-version/python-r-quarto/2026-07',
                task_applicability_ref: 'opl://task-applicability/mas',
              },
            },
          },
        },
      },
      t
    );

    expect(projection.cards.map((card) => card.key)).toEqual(['model', 'account']);
    expect(projection.resourceSources).toEqual([
      {
        key: 'cloud_remote_access',
        title: 'settings.accessPage.resourceSources.cloudRemoteAccess',
        status: 'ready',
        category: 'remote',
        management: null,
        refs: ['opl://resource-source/cloud'],
        environmentRefs: [],
        managementRefs: [],
      },
      {
        key: 'docker_webui',
        title: 'settings.accessPage.resourceSources.categories.dockerWebui',
        status: 'ready',
        category: 'dockerWebui',
        management: 'selfManaged',
        refs: ['opl://resource-source/docker-webui'],
        environmentRefs: [],
        managementRefs: [],
      },
      {
        key: 'user_hpc',
        title: 'settings.accessPage.resourceSources.categories.sshHpc',
        status: 'available',
        category: 'sshHpc',
        management: 'selfManaged',
        refs: ['opl://resource-source/ssh-hpc/lab'],
        environmentRefs: [],
        managementRefs: [],
      },
      {
        key: 'cloud_compute',
        title: 'settings.accessPage.resourceSources.categories.oplCloudCompute',
        status: 'available',
        category: 'oplCloudCompute',
        management: 'consoleManaged',
        refs: ['opl://resource-source/opl-cloud/managed-compute'],
        environmentRefs: [
          'opl://environment-template/python-r-quarto',
          'opl://environment-version/python-r-quarto/2026-07',
          'opl://task-applicability/mas',
        ],
        managementRefs: [
          'opl://console/policy/compute',
          'opl://console/quota/compute',
          'opl://console/billing/project',
          'opl://console/permission/workspace',
        ],
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain('must not render');
  });

  it('requires canonical eligibility refs and excludes the built-in Gateway from Resources', () => {
    const projection = buildAccessProjection(
      {
        settings_control_center: {
          app_settings_read_model: {
            resource_sources: {
              opl_workspace: { status: 'available' },
              opl_fabric: {
                status: 'ready',
                owner_ref: 'opl://owner/fabric',
              },
              opl_gateway: {
                status: 'available',
                resource_source_ref: 'opl://resource-source/gateway',
                owner_ref: 'opl://owner/gateway',
                gateway_status_ref: 'opl://gateway/status',
              },
              gateway: {
                status: 'available',
                resource_source_ref: 'opl://resource-source/gateway-alias',
              },
              user_hpc: {
                status: 'available',
                resource_source_ref: 'opl://resource-source/ssh-hpc/lab',
              },
              projected_action_only: {
                status: 'available',
                projected_action_refs: ['opl://action/resource/open'],
              },
              status_only: {
                status: 'ready',
                status_ref: 'opl://status/resource/status-only',
              },
              compute_only: {
                status: 'ready',
                compute_ref: 'opl://compute/unowned',
              },
              storage_only: {
                status: 'ready',
                storage_ref: 'opl://storage/unowned',
              },
              environment_only: {
                status: 'ready',
                environment_ref: 'opl://environment/unowned',
              },
              management_only: {
                status: 'ready',
                console_policy_ref: 'opl://console/policy/unowned',
              },
            },
          },
        },
      },
      t
    );

    expect(projection.resourceSources.map((source) => source.key)).toEqual([
      'opl_fabric',
      'user_hpc',
      'projected_action_only',
    ]);
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
