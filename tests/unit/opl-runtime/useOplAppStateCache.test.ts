import { describe, expect, it } from 'vitest';
import { sanitizeOplAppStatePayloadForCache } from '@/renderer/hooks/system/useOplAppState';

describe('OPL App state cache privacy boundary', () => {
  it('keeps only bounded startup read models and the public Gateway projection', () => {
    const sanitized = sanitizeOplAppStatePayloadForCache({
      app_state: {
        schema_version: 'opl_app_state.v1',
        core: {
          codex: {
            installed: true,
            version_status: 'compatible',
            model_access_ready: true,
            binary_path: '/private/bin/codex',
            candidates: [{ path: '/private/bin/codex' }],
          },
        },
        paths: {
          workspace_root_path: '/Users/example/OPL',
          workspace_root: {
            selected_path: '/Users/example/OPL',
            exists: true,
            writable: true,
            secret: 'private',
          },
          logs_dir: '/private/logs',
        },
        release: {
          version: '26.7.14',
          channel: 'stable',
          repo: 'gaofeng21cn/one-person-lab-app',
          stable_release_api: 'https://private.example/api',
        },
        agent_packages: {
          directory: {
            entries: [
              {
                package_id: 'private-agent',
                package_role: 'standard_agent',
                capability_metadata: {
                  source: 'private-owner-manifest',
                  required_skill_ids: ['private-skill'],
                  optional_skill_refs: ['private-optional-skill'],
                },
              },
            ],
          },
          status_index: { packages: { 'private-agent': { launch_allowed: true } } },
          storage_inventory: {
            status: 'available',
            observed_at: '2026-07-13T12:00:00.000Z',
            stale: false,
            bytes: 2048,
            reclaimable_bytes: 1024,
            owner_route: '/settings/agents',
            reason_code: null,
            projected_action: { kind: 'navigate', action_id: null, private_detail: 'private' },
            packages: [{ package_id: 'private.package' }],
            raw_path: '/private/package-store',
          },
          private_manifest: 'private',
        },
        settings_control_center: {
          app_settings_read_model: {
            opl_gateway_account: {
              surface_kind: 'opl_gateway_account_read_model.v1',
              status: 'connected',
              connection_mode: 'account',
              account_card_visible: true,
              account: {
                display_name: 'Feng Gao',
                email: 'feng@example.com',
                status: 'active',
                balance: { amount: 19.25, currency: 'USD', raw_response: 'private' },
                access_token: 'private',
              },
              usage: {
                today_tokens: 12,
                total_tokens: 34,
                today_actual_cost: 0.1,
                total_actual_cost: 0.2,
                currency: 'USD',
                day_timezone: 'Asia/Shanghai',
                raw_error: 'private',
              },
              managed_key: { name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app', key_id: 'private' },
              installation: { device_label: 'Mac', short_id: 'abcd', credential_path: 'private' },
              available_groups: [{ group_id: 'codex', label: 'Codex', api_key: 'private' }],
              freshness: {
                observed_at: '2026-07-13T12:00:00.000Z',
                stale_after: '2026-07-13T12:15:00.000Z',
                stale: false,
                last_error_code: null,
                raw_response: 'private',
              },
              capabilities: { account_login_supported: true, manual_key_supported: true, password: 'private' },
              actions: {
                complete_setup: 'gateway_account_complete_setup',
                refresh: 'gateway_account_refresh',
                repair: 'gateway_account_repair',
                use_for_model_access: 'gateway_account_use_for_model_access',
                disconnect: 'gateway_account_disconnect',
                login: 'gateway_account_login',
              },
              password: 'private',
            },
            codex_model_policy: {
              source_ref: 'app_state.core.codex',
              model: 'gpt-5.6-sol',
              reasoning_effort: 'max',
              model_provider: 'oplgateway',
              provider_name: 'OPL Gateway',
              provider_base_url: 'https://gateway.medopl.com/v1',
              config_path: '/private/config.toml',
              api_key_present: true,
              model_access_ready: true,
              access_status: 'ready',
            },
            workspace_services: {
              workspace_root: {
                source_ref: 'app_state.paths.workspace_root',
                selected_path: '/Users/example/OPL',
                exists: true,
                writable: true,
                health_status: 'ready',
                secret: 'private',
              },
              runtime_source_carriers: {
                source_mode: 'developer_workspace',
                default_carriers_count: 5,
                healthy_default_carriers_count: 5,
                capability_health_refs: [
                  { id: 'mas', title: 'MAS', status: 'ready', ref: 'app_state.runtime_source_carriers.items.mas' },
                ],
                private_manifest: 'private',
              },
              local_services: {
                temporal_provider: 'ready',
                service_action_ids: ['settings_sync_capabilities'],
                token: 'private',
              },
            },
            local_environment: {
              state_dir: '/Users/example/Library/Application Support/OPL/state',
              logs_dir: '/Users/example/Library/Application Support/OPL/state/logs',
              release_channel: 'stable',
              temporal_provider: 'ready',
              private_key: 'private',
            },
            docker_webui: { status: 'ready' },
            storage_lifecycle: {
              snapshot_updated_at: '2026-07-13T12:00:00.000Z',
              agent_package_store: {
                status: 'available',
                observed_at: '2026-07-13T12:00:00.000Z',
                stale: false,
                bytes: 2048,
                reclaimable_bytes: 1024,
                owner_route: '/settings/agents',
                reason_code: null,
                projected_action: { kind: 'navigate', action_id: null },
                packages: [{ package_id: 'private.package' }],
              },
              webui_data_volume: {
                status: 'unavailable',
                observed_at: null,
                stale: true,
                bytes: null,
                reclaimable_bytes: null,
                owner_route: '/settings/storage#webui-data',
                reason_code: 'inventory_cache_missing_or_invalid',
                projected_action: {
                  kind: 'host_action_required',
                  action_id: null,
                  execution_owner: 'carrier_host',
                  command: 'docker system prune',
                },
                raw_path: '/private/webui-data',
                diagnostic_body: 'private',
              },
            },
          },
          status_summary: {
            model_access: 'ready',
            codex_version: '0.144.3',
            runtime_source_carrier_health: '5/5',
            temporal_provider: 'ready',
            release_channel: 'stable',
            issue_count: 1,
            private_detail: 'private',
          },
          issue_queue: [
            {
              issue_id: 'developer_profile_active',
              severity: 'info',
              recommended_action_id: 'settings_repair_model_access',
              user_message: 'Developer Mode is active.',
              authority_flags: { can_write_domain_truth: false },
            },
          ],
        },
      },
    });

    const appState = sanitized.app_state as Record<string, unknown>;
    const settings = appState.settings_control_center as Record<string, unknown>;
    const readModel = settings.app_settings_read_model as Record<string, unknown>;
    const gatewayAccount = readModel.opl_gateway_account as Record<string, unknown>;
    const account = gatewayAccount.account as Record<string, unknown>;
    const balance = account.balance as Record<string, unknown>;
    const usage = gatewayAccount.usage as Record<string, unknown>;
    const managedKey = gatewayAccount.managed_key as Record<string, unknown>;
    const group = (gatewayAccount.available_groups as Array<Record<string, unknown>>)[0];
    const actions = gatewayAccount.actions as Record<string, unknown>;
    const agentPackages = appState.agent_packages as Record<string, unknown>;
    const agentPackageStorage = agentPackages.storage_inventory as Record<string, unknown>;
    const storageLifecycle = readModel.storage_lifecycle as Record<string, Record<string, unknown>>;

    expect(gatewayAccount.surface_kind).toBe('opl_gateway_account_read_model.v1');
    expect(account.email).toBe('feng@example.com');
    expect(balance).toEqual({ amount: 19.25, currency: 'USD' });
    expect(usage.today_tokens).toBe(12);
    expect(managedKey).toEqual({ name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app' });
    expect(group).toEqual({ group_id: 'codex', label: 'Codex' });
    expect(actions.login).toBeUndefined();
    expect(gatewayAccount.password).toBeUndefined();
    expect(account.access_token).toBeUndefined();
    expect(readModel.docker_webui).toBeUndefined();
    expect(agentPackageStorage).toEqual({
      status: 'available',
      observed_at: '2026-07-13T12:00:00.000Z',
      stale: false,
      bytes: 2048,
      reclaimable_bytes: 1024,
      owner_route: '/settings/agents',
      reason_code: null,
      projected_action: { kind: 'navigate', action_id: null },
    });
    expect(agentPackages.directory).toBeUndefined();
    expect(agentPackages.status_index).toBeUndefined();
    expect(storageLifecycle.webui_data_volume).toEqual({
      status: 'unavailable',
      observed_at: null,
      stale: true,
      bytes: null,
      reclaimable_bytes: null,
      owner_route: '/settings/storage#webui-data',
      reason_code: 'inventory_cache_missing_or_invalid',
      projected_action: {
        kind: 'host_action_required',
        action_id: null,
        execution_owner: 'carrier_host',
      },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(
      /private\.package|private-agent|private-skill|private-optional-skill|private\/package-store|private\/webui-data|docker system prune/
    );
    expect(readModel.codex_model_policy).toEqual({
      source_ref: 'app_state.core.codex',
      model: 'gpt-5.6-sol',
      reasoning_effort: 'max',
      model_provider: 'oplgateway',
      provider_name: 'OPL Gateway',
      provider_base_url: 'https://gateway.medopl.com/v1',
      api_key_present: true,
      model_access_ready: true,
      access_status: 'ready',
    });
    expect(readModel.workspace_services).toMatchObject({
      workspace_root: { selected_path: '/Users/example/OPL', writable: true },
      runtime_source_carriers: {
        default_carriers_count: 5,
        capability_health_refs: [{ id: 'mas', title: 'MAS', status: 'ready' }],
      },
      local_services: { temporal_provider: 'ready', service_action_ids: ['settings_sync_capabilities'] },
    });
    expect(readModel.local_environment).toEqual({
      state_dir: '/Users/example/Library/Application Support/OPL/state',
      logs_dir: '/Users/example/Library/Application Support/OPL/state/logs',
      release_channel: 'stable',
      temporal_provider: 'ready',
    });
    expect(settings.status_summary).toEqual({
      model_access: 'ready',
      codex_version: '0.144.3',
      runtime_source_carrier_health: '5/5',
      temporal_provider: 'ready',
      release_channel: 'stable',
      issue_count: 1,
    });
    expect(settings.issue_queue).toEqual([
      {
        issue_id: 'developer_profile_active',
        severity: 'info',
        recommended_action_id: 'settings_repair_model_access',
        user_message: 'Developer Mode is active.',
      },
    ]);
    expect(appState.core).toEqual({
      codex: { installed: true, version_status: 'compatible', model_access_ready: true },
    });
    expect(appState.paths).toEqual({
      workspace_root_path: '/Users/example/OPL',
      workspace_root: { selected_path: '/Users/example/OPL', exists: true, writable: true },
    });
    expect(appState.release).toEqual({
      version: '26.7.14',
      channel: 'stable',
      repo: 'gaofeng21cn/one-person-lab-app',
    });
    expect(agentPackages.private_manifest).toBeUndefined();
  });

  it('keeps the persistent projection below the 256 KiB budget when live state is large', () => {
    const sanitized = sanitizeOplAppStatePayloadForCache({
      app_state: {
        schema_version: 'opl_app_state.v1',
        core: { codex: { installed: true, model_access_ready: true } },
        release: { version: '26.7.14', channel: 'stable' },
        work_items: Array.from({ length: 2_000 }, (_, index) => ({ index, body: 'x'.repeat(512) })),
      },
    });

    expect(new TextEncoder().encode(JSON.stringify(sanitized)).byteLength).toBeLessThanOrEqual(262_144);
    expect((sanitized.app_state as Record<string, unknown>).work_items).toBeUndefined();
  });

  it('does not mutate the live App state payload', () => {
    const payload = {
      settings_control_center: {
        app_settings_read_model: {
          opl_gateway_account: { account_card_visible: true },
        },
      },
    };

    sanitizeOplAppStatePayloadForCache(payload);

    expect(payload.settings_control_center.app_settings_read_model.opl_gateway_account).toEqual({
      account_card_visible: true,
    });
  });
});
