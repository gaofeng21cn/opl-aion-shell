import { describe, expect, it } from 'vitest';
import { __oplRuntimeBridgeTest } from '@/process/bridge/oplRuntimeBridge';

describe('OPL runtime bridge command whitelist', () => {
  it('declares the shell bridge as a replaceable adapter for the App-owned runtime bridge contract', () => {
    expect(__oplRuntimeBridgeTest.OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT).toEqual({
      adapterId: 'aionui',
      adapterRole: 'replaceable_gui_shell_adapter',
      appContractOwner: 'one-person-lab-app',
      protocolOwner: 'one-person-lab',
      implementationRepo: 'opl-aion-shell',
      contractRef: 'one-person-lab-app/contracts/app-runtime-bridge.json',
      guiProductContractRef: 'one-person-lab-app/contracts/app-gui-product-contract.json',
      ownsRuntimeTruth: false,
      ownsDomainTruth: false,
      readsArtifactBody: false,
      readsMemoryBody: false,
      allowedSurfaces: [
        'opl app state --profile fast --json',
        'opl app state --profile full --json',
        'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
        'opl runtime app-operator-drilldown --detail full --json',
      ],
      forbiddenTruthSources: [
        'direct_domain_repo_reads',
        'direct_runtime_state_file_reads',
        'direct_opl_modules_page_aggregation',
        'direct_opl_system_developer_supervisor_page_aggregation',
        'direct_family_runtime_worker_status_page_aggregation',
        'domain_artifact_body_reads',
        'domain_memory_body_reads',
        'shell_private_runtime_status',
      ],
    });
  });

  it('builds the declared App state summary and refresh commands', () => {
    expect(__oplRuntimeBridgeTest.buildAppStateCommand('fast')).toEqual({
      surface: 'app_state_fast',
      args: ['app', 'state', '--profile', 'fast', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildAppStateCommand('full')).toEqual({
      surface: 'app_state_full',
      args: ['app', 'state', '--profile', 'full', '--json'],
    });
  });

  it('keeps full drilldown as an explicit diagnostic command only', () => {
    expect(__oplRuntimeBridgeTest.buildDrilldownCommand('full')).toEqual({
      surface: 'runtime_diagnostic_full',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    });
  });

  it('does not allow raw runtime summary or action surfaces in the production bridge contract', () => {
    const allowedSurfaces = __oplRuntimeBridgeTest.OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT.allowedSurfaces;
    expect(allowedSurfaces).not.toContain('opl runtime app-operator-drilldown --json');
    expect(allowedSurfaces.some((surface) => surface.startsWith('opl runtime action execute'))).toBe(false);
  });

  it('rejects unsafe action identifiers before spawning opl', () => {
    expect(() => __oplRuntimeBridgeTest.assertActionId('stage-production:mas/analysis_campaign')).not.toThrow();
    expect(() => __oplRuntimeBridgeTest.assertActionId('stage-production;rm -rf /')).toThrow(
      /Invalid OPL runtime action id/
    );
  });

  it('keeps action execution on the refs-only action route surface', () => {
    expect(
      __oplRuntimeBridgeTest.buildActionCommand({
        actionId: 'stage-production:mas/analysis_campaign',
        dryRun: true,
        payloadRefsOnlyJson: { receipt_ref: 'receipt://one' },
      })
    ).toEqual({
      surface: 'app_action',
      args: [
        'app',
        'action',
        'execute',
        '--action',
        'stage-production:mas/analysis_campaign',
        '--payload',
        '{"receipt_ref":"receipt://one"}',
        '--dry-run',
        '--json',
      ],
    });
  });
});
