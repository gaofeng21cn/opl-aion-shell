import { describe, expect, it } from 'vitest';
import { resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';
import { resolveOplFlowCodexModelRecommendation } from '@/common/types/opl/appState';

const overridePrecedence = [
  'explicit_user_override',
  'opl_flow_recommendation',
  'fresh_codex_model_catalog',
  'app_fallback_when_flow_unavailable',
];

function projectedAppState(flow: Record<string, unknown>) {
  return {
    app_state: {
      agent_packages: {
        status_index: {
          packages: {
            'opl-flow': flow,
          },
        },
      },
    },
  };
}

function validFlowProjection() {
  return {
    presence: { installed: true },
    model_projection: {
      surface_kind: 'opl_codex_model_policy_projection.v1',
      authority: 'opl-flow',
      mode_default: 'auto',
      role: 'package_recommendation_consumed_from_framework_projection',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: overridePrecedence,
      catalog_policy: { source: 'codex_cli_model_list' },
    },
  };
}

describe('OPL Flow Codex model projection', () => {
  it('accepts only the installed Framework projection with the exact authority contract', () => {
    expect(resolveOplFlowCodexModelRecommendation(projectedAppState(validFlowProjection()))).toEqual({
      modelId: 'gpt-5.6-sol',
      reasoningEffort: 'max',
    });

    expect(
      resolveOplFlowCodexModelRecommendation(
        projectedAppState({
          ...validFlowProjection(),
          presence: { installed: false },
        })
      )
    ).toBeNull();

    expect(
      resolveOplFlowCodexModelRecommendation(
        projectedAppState({
          ...validFlowProjection(),
          model_projection: {
            ...validFlowProjection().model_projection,
            authority: 'caller-local-policy',
          },
        })
      )
    ).toBeNull();
  });

  it('uses a recommendation only when its model exists in the fresh catalog', () => {
    const catalog = {
      current_model_id: 'gpt-5.6-terra',
      current_model_label: 'GPT-5.6-Terra',
      available_models: [
        {
          id: 'gpt-5.6-terra',
          label: 'GPT-5.6-Terra',
          isDefault: true,
          supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'ultra' }],
          defaultReasoningEffort: 'high',
        },
      ],
    };

    expect(
      resolveOplCodexAutoSelection(catalog, {
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'max',
      })
    ).toEqual({ modelId: 'gpt-5.6-terra', reasoningEffort: 'high' });
  });
});
