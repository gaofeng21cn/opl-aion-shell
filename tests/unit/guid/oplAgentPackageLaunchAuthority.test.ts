import { describe, expect, it } from 'vitest';
import { parseOplAgentPackageLaunchResult } from '@/renderer/pages/guid/utils/oplAgentPackageLaunchAuthority';
import type { OplAgentPackageLaunchError } from '@/renderer/pages/guid/utils/oplAgentPackageLaunchAuthority';

type JsonRecord = Record<string, unknown>;

const expected = {
  packageId: 'med-autoscience',
  targetWorkspace: '/Users/example/Research',
};

function useBinding(): JsonRecord {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'use-boundary:med-autoscience:workspace:1',
    use_receipt_ref: 'opl://agent-package-use/med-autoscience/workspace/1',
    root_package: {
      package_id: expected.packageId,
      package_version: '0.2.9',
    },
    scope: 'workspace',
    target_root: expected.targetWorkspace,
  };
}

function activationEnvelope(): JsonRecord {
  return {
    app_action_execution: {
      action_id: 'agent_package_activate',
      result: {
        opl_agent_package_activation: {
          status: 'activated',
          package_id: expected.packageId,
          operational_ready: true,
          launch_allowed: true,
          launch_blocked_reason: null,
          package_lock: {
            package_id: expected.packageId,
            package_version: '0.2.9',
          },
          materialization_readiness: {
            status: 'current',
            scope: 'workspace',
            target_root: expected.targetWorkspace,
          },
          scope_materializations: [
            {
              scope: 'workspace',
              target_root: expected.targetWorkspace,
            },
          ],
          use_boundary_id: 'use-boundary:med-autoscience:workspace:1',
          use_receipt_ref: 'opl://agent-package-use/med-autoscience/workspace/1',
          package_use_binding: useBinding(),
        },
      },
    },
  };
}

function activationFromEnvelope(envelope: JsonRecord): JsonRecord {
  const execution = envelope.app_action_execution as JsonRecord;
  const result = execution.result as JsonRecord;
  return result.opl_agent_package_activation as JsonRecord;
}

function bindingFromEnvelope(envelope: JsonRecord): JsonRecord {
  return activationFromEnvelope(envelope).package_use_binding as JsonRecord;
}

function parse(envelope: JsonRecord = activationEnvelope()) {
  return parseOplAgentPackageLaunchResult({ parsed: envelope, ...expected });
}

function expectFailure(envelope: JsonRecord, code: OplAgentPackageLaunchError['code']): void {
  expect(() => parse(envelope)).toThrowError(expect.objectContaining<OplAgentPackageLaunchError>({ code }));
}

describe('OPL agent package launch validation', () => {
  it('accepts the current Framework alias and persists only the minimal package binding', () => {
    const envelope = activationEnvelope();
    bindingFromEnvelope(envelope).target_root = '/Users/example/Research/.';

    expect(
      parseOplAgentPackageLaunchResult({
        parsed: envelope,
        ...expected,
        targetWorkspace: '/Users/example/Research/',
      })
    ).toEqual({
      action_id: 'agent_package_activate',
      package_id: expected.packageId,
      package_version: '0.2.9',
      scope: 'workspace',
      target_workspace: expected.targetWorkspace,
      use_boundary_id: 'use-boundary:med-autoscience:workspace:1',
      launch_allowed: true,
      use_receipt_ref: 'opl://agent-package-use/med-autoscience/workspace/1',
      use_binding: {
        surface_kind: 'opl_agent_package_use_binding.v1',
        root_package: {
          package_id: expected.packageId,
          package_version: '0.2.9',
        },
        scope: 'workspace',
        target_root: expected.targetWorkspace,
      },
    });
  });

  it('accepts canonical use_binding with the same minimal package selection', () => {
    const envelope = activationEnvelope();
    const activation = activationFromEnvelope(envelope);
    activation.use_binding = activation.package_use_binding;
    delete activation.package_use_binding;

    expect(parse(envelope).package_version).toBe('0.2.9');
  });

  it.each([
    {
      caseId: 'activation package',
      mutate: (envelope: JsonRecord) => {
        activationFromEnvelope(envelope).package_id = 'foreign-package';
      },
    },
    {
      caseId: 'installed package',
      mutate: (envelope: JsonRecord) => {
        (activationFromEnvelope(envelope).package_lock as JsonRecord).package_id = 'foreign-package';
      },
    },
    {
      caseId: 'active binding package',
      mutate: (envelope: JsonRecord) => {
        (bindingFromEnvelope(envelope).root_package as JsonRecord).package_id = 'foreign-package';
      },
    },
  ])('rejects $caseId drift from the current selection', ({ mutate }) => {
    const envelope = activationEnvelope();
    mutate(envelope);
    expectFailure(envelope, 'agent_package_selection_mismatch');
  });

  it.each([
    {
      caseId: 'missing installed version',
      mutate: (envelope: JsonRecord) => {
        delete (activationFromEnvelope(envelope).package_lock as JsonRecord).package_version;
      },
    },
    {
      caseId: 'selected version drift',
      mutate: (envelope: JsonRecord) => {
        (bindingFromEnvelope(envelope).root_package as JsonRecord).package_version = '9.9.9';
      },
    },
  ])('rejects $caseId', ({ mutate }) => {
    const envelope = activationEnvelope();
    mutate(envelope);
    expectFailure(envelope, 'agent_package_version_mismatch');
  });

  it.each([
    {
      caseId: 'binding target',
      mutate: (envelope: JsonRecord) => {
        bindingFromEnvelope(envelope).target_root = '/Users/example/Foreign';
      },
    },
    {
      caseId: 'readiness target',
      mutate: (envelope: JsonRecord) => {
        const activation = activationFromEnvelope(envelope);
        (activation.materialization_readiness as JsonRecord).target_root = '/Users/example/Foreign';
      },
    },
    {
      caseId: 'materialized target',
      mutate: (envelope: JsonRecord) => {
        const activation = activationFromEnvelope(envelope);
        ((activation.scope_materializations as JsonRecord[])[0] as JsonRecord).target_root = '/Users/example/Foreign';
      },
    },
  ])('rejects $caseId drift from the managed workspace', ({ mutate }) => {
    const envelope = activationEnvelope();
    mutate(envelope);
    expectFailure(envelope, 'agent_package_target_mismatch');
  });

  it('surfaces a blocked package reason directly', () => {
    const envelope = activationEnvelope();
    const activation = activationFromEnvelope(envelope);
    activation.status = 'blocked';
    activation.operational_ready = false;
    activation.launch_allowed = false;
    activation.launch_blocked_reason = 'package_disabled';

    expectFailure(envelope, 'agent_package_launch_blocked');
    expect(() => parse(envelope)).toThrow('OPL package launch blocked: package_disabled');
  });

  it('reports malformed activation as an explicit invalid result', () => {
    const envelope = activationEnvelope();
    delete activationFromEnvelope(envelope).package_lock;

    expectFailure(envelope, 'agent_package_activation_invalid');
    expect(() => parse(envelope)).toThrow('OPL package activation returned an invalid result.');
  });
});
