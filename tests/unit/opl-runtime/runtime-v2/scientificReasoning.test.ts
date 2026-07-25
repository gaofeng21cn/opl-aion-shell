import { describe, expect, it } from 'vitest';
import { readScientificReasoningView } from '@/renderer/pages/runtime/extensions/MasScientificReasoning/scientificReasoning';
import { createScientificReasoningViewResponse } from './fixture';

function requirePayload(response: ReturnType<typeof createScientificReasoningViewResponse>) {
  if (!response.payload) throw new Error('fixture payload is required');
  return response.payload;
}

describe('scientific reasoning detail-view parser', () => {
  it('accepts the exact v2 snapshot and strips every machine-only binding from the renderer model', () => {
    const result = readScientificReasoningView(createScientificReasoningViewResponse(), '001');

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.view).toMatchObject({
      itemId: 'diabetes:001',
      viewId: 'scientific-reasoning',
      availability: 'available',
      revision: 7,
      payloadSchema: 'scientific-reasoning-map.v2',
      notModified: false,
    });
    expect(result.view).not.toHaveProperty('generation');
    expect(result.view.payload?.currentFocusNodeRefs).toEqual(['finding-1']);
    expect(result.view.payload?.activeBranchNodeRefs).toEqual(['hypothesis-1', 'test-1', 'finding-1']);
    expect(result.view.payload?.nodes).toHaveLength(4);
    expect(result.view.payload?.edges).toHaveLength(3);

    const rendererPayload = result.view.payload;
    expect(rendererPayload).not.toHaveProperty('studyId');
    expect(rendererPayload).not.toHaveProperty('studyRef');
    expect(rendererPayload).not.toHaveProperty('revision');
    expect(rendererPayload).not.toHaveProperty('sourceRefs');
    expect(rendererPayload).not.toHaveProperty('conditions');
    expect(rendererPayload?.nodes[0]).not.toHaveProperty('sourceRefs');
    expect(rendererPayload?.edges[0]).not.toHaveProperty('sourceRefs');
  });

  it('retains v1 read compatibility and derives route membership only from v1 branch ids', () => {
    const result = readScientificReasoningView(
      createScientificReasoningViewResponse({ schemaVersion: 'scientific-reasoning-map.v1' }),
      '001'
    );

    expect(result).toMatchObject({
      state: 'ready',
      view: {
        payloadSchema: 'scientific-reasoning-map.v1',
        payload: {
          currentFocusNodeRefs: ['finding-1'],
          activeBranchNodeRefs: ['hypothesis-1', 'test-1', 'finding-1'],
          medicalNarrative: null,
        },
      },
    });
  });

  it('accepts an exact not-modified response with or without the deprecated generation alias', () => {
    const withAlias = createScientificReasoningViewResponse({ notModified: true });
    expect(readScientificReasoningView(withAlias)).toMatchObject({
      state: 'ready',
      view: { notModified: true, revision: 7, payload: null },
    });

    const withoutAlias = createScientificReasoningViewResponse({ notModified: true });
    delete (withoutAlias as { generation?: unknown }).generation;
    expect(readScientificReasoningView(withoutAlias)).toMatchObject({
      state: 'ready',
      view: { notModified: true, revision: 7, payload: null },
    });

    const mismatchedAlias = createScientificReasoningViewResponse({ notModified: true });
    mismatchedAlias.generation = 6;
    expect(readScientificReasoningView(mismatchedAlias)).toEqual({ state: 'invalid', view: null });
  });

  it('fails closed when any v2 top-level field is missing or an obsolete field is added', () => {
    const baseline = requirePayload(createScientificReasoningViewResponse());
    for (const field of Object.keys(baseline)) {
      const response = createScientificReasoningViewResponse();
      const payload = requirePayload(response) as unknown as Record<string, unknown>;
      delete payload[field];
      expect(readScientificReasoningView(response), field).toEqual({ state: 'invalid', view: null });
    }

    const obsolete = createScientificReasoningViewResponse();
    (requirePayload(obsolete) as unknown as Record<string, unknown>).working_checkpoints = [];
    expect(readScientificReasoningView(obsolete)).toEqual({ state: 'invalid', view: null });
  });

  it('rejects zero, unsafe, or envelope-mismatched v2 revisions', () => {
    for (const revision of [0, Number.MAX_SAFE_INTEGER + 1]) {
      const response = createScientificReasoningViewResponse();
      requirePayload(response).revision = revision;
      expect(readScientificReasoningView(response)).toEqual({ state: 'invalid', view: null });
    }

    const mismatched = createScientificReasoningViewResponse();
    mismatched.revision = 8;
    mismatched.generation = 8;
    expect(readScientificReasoningView(mismatched)).toEqual({ state: 'invalid', view: null });
  });

  it('rejects empty or unknown v2 route references without inferring membership', () => {
    for (const refs of [[], ['unknown-node'], ['finding-1', 'finding-1']]) {
      const response = createScientificReasoningViewResponse();
      requirePayload(response).active_branch_node_refs = refs;
      expect(readScientificReasoningView(response)).toEqual({ state: 'invalid', view: null });
    }

    const missingFocusRefs = createScientificReasoningViewResponse();
    requirePayload(missingFocusRefs).current_focus_node_refs = [];
    expect(readScientificReasoningView(missingFocusRefs)).toEqual({ state: 'invalid', view: null });
  });

  it('rejects duplicate graph identities and edges whose endpoints do not exist', () => {
    const duplicateNode = createScientificReasoningViewResponse();
    const duplicateNodePayload = requirePayload(duplicateNode);
    duplicateNodePayload.nodes.push({ ...duplicateNodePayload.nodes[0]! });

    const duplicateEdge = createScientificReasoningViewResponse();
    const duplicateEdgePayload = requirePayload(duplicateEdge);
    duplicateEdgePayload.edges.push({ ...duplicateEdgePayload.edges[0]! });

    const missingEndpoint = createScientificReasoningViewResponse();
    requirePayload(missingEndpoint).edges[0]!.target = 'unknown-node';

    for (const response of [duplicateNode, duplicateEdge, missingEndpoint]) {
      expect(readScientificReasoningView(response)).toEqual({ state: 'invalid', view: null });
    }
  });

  it('preserves every MAS-authored medical string exactly, including intentional spacing and line breaks', () => {
    const response = createScientificReasoningViewResponse();
    const payload = requirePayload(response);
    const node = payload.nodes[0]!;
    const exact = {
      summary: '  主要假设保留前后空格。\n第二行保持原样。  ',
      focus: '  当前假设保持原样。  ',
      branch: '  当前研究路线保持原样。  ',
      nodeLabel: '  提出主要研究假设。  ',
      nodeSummary: '  节点摘要保持原样。  ',
      question: '  研究问题保持原样？  ',
      limitation: '  研究局限保持原样。  ',
      basis: '  来源说明保持原样。  ',
      edgeLabel: '  按预设方案验证。  ',
      overview: '  总体判断保持原样。\n不增加解释。  ',
    };
    payload.summary.primary_hypothesis = exact.summary;
    payload.current_focus.primary_hypothesis = exact.focus;
    payload.active_branch.label = exact.branch;
    node.label = exact.nodeLabel;
    node.summary = exact.nodeSummary;
    node.details.research_question = exact.question;
    node.details.limitations = [exact.limitation];
    node.details.sources_and_basis = [exact.basis];
    payload.edges[0]!.label = exact.edgeLabel;
    payload.medical_narrative.evidence_judgment = exact.overview;

    const result = readScientificReasoningView(response);
    expect(result.state).toBe('ready');
    if (result.state !== 'ready' || !result.view.payload) return;
    expect(result.view.payload.summary.primaryHypothesis).toBe(exact.summary);
    expect(result.view.payload.currentFocus.primaryHypothesis).toBe(exact.focus);
    expect(result.view.payload.activeBranch.label).toBe(exact.branch);
    expect(result.view.payload.nodes[0]).toMatchObject({
      label: exact.nodeLabel,
      summary: exact.nodeSummary,
      details: {
        researchQuestion: exact.question,
        limitations: [exact.limitation],
        sourcesAndBasis: [exact.basis],
      },
    });
    expect(result.view.payload.edges[0]?.label).toBe(exact.edgeLabel);
    expect(result.view.payload.medicalNarrative?.evidenceJudgment).toBe(exact.overview);
  });

  it('rejects malformed nested fields, invalid statuses, machine-ref extensions, and malformed digests', () => {
    const invalidNodeStatus = createScientificReasoningViewResponse();
    requirePayload(invalidNodeStatus).nodes[0]!.status = 'historical';

    const extraNodeField = createScientificReasoningViewResponse();
    (requirePayload(extraNodeField).nodes[0] as unknown as Record<string, unknown>).attempt_id = 'private';

    const extendedSourceRef = createScientificReasoningViewResponse();
    (requirePayload(extendedSourceRef).source_refs[0] as unknown as Record<string, unknown>).sha256 =
      `sha256:${'a'.repeat(64)}`;

    const invalidDigest = createScientificReasoningViewResponse();
    invalidDigest.digest = `sha256:${'A'.repeat(64)}`;

    for (const response of [invalidNodeStatus, extraNodeField, extendedSourceRef, invalidDigest]) {
      expect(readScientificReasoningView(response)).toEqual({ state: 'invalid', view: null });
    }
  });

  it('binds v2 study identity when the selected work item supplies an expected study id', () => {
    expect(readScientificReasoningView(createScientificReasoningViewResponse(), '001').state).toBe('ready');
    expect(readScientificReasoningView(createScientificReasoningViewResponse(), '002')).toEqual({
      state: 'invalid',
      view: null,
    });

    const wrongRef = createScientificReasoningViewResponse();
    requirePayload(wrongRef).study_ref.ref = 'mas-study:002';
    expect(readScientificReasoningView(wrongRef)).toEqual({ state: 'invalid', view: null });
  });
});
