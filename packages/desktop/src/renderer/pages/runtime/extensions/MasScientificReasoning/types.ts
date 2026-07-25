import type {
  DomainDetailViewAvailability,
  DomainDetailViewDescriptor,
  DomainDetailViewReadAvailability,
} from '../../types';

export type ScientificReasoningViewDescriptor = DomainDetailViewDescriptor & {
  viewId: 'scientific-reasoning';
  viewKind: 'scientific_reasoning_map';
  schemaVersion: ScientificReasoningMapSchema;
};

export type ScientificReasoningMapSchema = 'scientific-reasoning-map.v1' | 'scientific-reasoning-map.v2';

export type ScientificReasoningNodeKind =
  | 'hypothesis'
  | 'test'
  | 'finding'
  | 'decision'
  | 'route'
  | 'artifact'
  | 'human_gate';

export type ScientificReasoningEdgeKind =
  | 'tests'
  | 'supports'
  | 'does_not_support'
  | 'inconclusive'
  | 'revises'
  | 'supersedes'
  | 'routes_to'
  | 'requires'
  | 'produces';

export type ScientificReasoningMedicalNarrative = {
  researchQuestion: string | null;
  currentHypothesis: string | null;
  validationMethod: string | null;
  mainFindings: string | null;
  evidenceJudgment: string | null;
  routeAdjustment: string | null;
  nextResearchStep: string | null;
  limitations: string[];
  sourcesAndBasis: string[];
};

export type ScientificReasoningNode = {
  id: string;
  kind: ScientificReasoningNodeKind;
  label: string;
  status:
    | 'proposed'
    | 'planned'
    | 'active'
    | 'completed'
    | 'execution_failed'
    | 'not_assessed'
    | 'supported'
    | 'does_not_support'
    | 'inconclusive'
    | 'design_invalid'
    | 'refined'
    | 'superseded'
    | 'continued'
    | 'narrowed'
    | 'pivoted'
    | 'stopped'
    | 'human_review_required'
    | 'produced';
  summary: string;
  branchId: string | null;
  occurredAt: string;
  details: ScientificReasoningMedicalNarrative;
};

export type ScientificReasoningEdge = {
  id: string;
  source: string;
  target: string;
  kind: ScientificReasoningEdgeKind;
  label: string;
  status: 'active' | 'historical' | 'blocked';
};

export type ScientificReasoningMapPayload = {
  status:
    | 'empty'
    | 'active'
    | 'awaiting_evidence'
    | 'route_reconsideration'
    | 'human_review_required'
    | 'stopped'
    | 'completed';
  summary: {
    primaryHypothesis: string | null;
    latestFinding: string | null;
    currentJudgment: string | null;
    nextResearchStep: string | null;
    updatedAt: string | null;
  };
  currentFocus: { nodeId: string | null; primaryHypothesis: string | null };
  activeBranch: { branchId: string | null; label: string | null };
  currentFocusNodeRefs: string[];
  activeBranchNodeRefs: string[];
  nodes: ScientificReasoningNode[];
  edges: ScientificReasoningEdge[];
  medicalNarrative: ScientificReasoningMedicalNarrative | null;
};

export type ScientificReasoningViewEnvelope = {
  itemId: string;
  viewId: string;
  viewKind: 'scientific_reasoning_map';
  availability: DomainDetailViewReadAvailability;
  revision: number;
  digest: string | null;
  payloadSchema: ScientificReasoningMapSchema;
  notModified: boolean;
  payload: ScientificReasoningMapPayload | null;
};

export type { DomainDetailViewAvailability };
