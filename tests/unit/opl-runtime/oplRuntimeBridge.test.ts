import { describe, expect, it } from 'vitest';
import { __oplRuntimeBridgeTest } from '@/process/bridge/oplRuntimeBridge';

describe('OPL runtime bridge command whitelist', () => {
  it('builds only the declared summary and full drilldown commands', () => {
    expect(__oplRuntimeBridgeTest.buildDrilldownCommand('summary')).toEqual({
      surface: 'runtime_summary',
      args: ['runtime', 'app-operator-drilldown', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildDrilldownCommand('full')).toEqual({
      surface: 'runtime_full',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    });
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
      surface: 'runtime_action',
      args: [
        'runtime',
        'action',
        'execute',
        '--action',
        'stage-production:mas/analysis_campaign',
        '--dry-run',
        '--payload',
        '{"receipt_ref":"receipt://one"}',
      ],
    });
  });
});
