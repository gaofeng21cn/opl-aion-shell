import type {
  DomainDetailViewAvailability,
  DomainDetailViewDescriptor,
  DomainDetailViewReadAvailability,
  ScientificReasoningEdge,
  ScientificReasoningEdgeKind,
  ScientificReasoningMapPayload,
  ScientificReasoningMapSchema,
  ScientificReasoningMedicalNarrative,
  ScientificReasoningNode,
  ScientificReasoningNodeKind,
  ScientificReasoningViewDescriptor,
  ScientificReasoningViewEnvelope,
} from './types';

type JsonRecord = Record<string, unknown>;
type ValidatedSourceRef = { kind: string; ref: string; sha256: string | null };

const LOCATOR_AVAILABILITY = new Set<DomainDetailViewAvailability>([
  'unread',
  'available',
  'missing',
  'stale',
  'invalid',
  'read_error',
]);
const READ_AVAILABILITY = new Set<DomainDetailViewReadAvailability>([
  'available',
  'missing',
  'stale',
  'invalid',
  'read_error',
]);
const MAP_STATUSES = new Set<ScientificReasoningMapPayload['status']>([
  'empty',
  'active',
  'awaiting_evidence',
  'route_reconsideration',
  'human_review_required',
  'stopped',
  'completed',
]);
const NODE_KINDS = new Set<ScientificReasoningNodeKind>([
  'hypothesis',
  'test',
  'finding',
  'decision',
  'route',
  'artifact',
  'human_gate',
]);
const NODE_STATUSES = new Set<ScientificReasoningNode['status']>([
  'proposed',
  'planned',
  'active',
  'completed',
  'execution_failed',
  'not_assessed',
  'supported',
  'does_not_support',
  'inconclusive',
  'design_invalid',
  'refined',
  'superseded',
  'continued',
  'narrowed',
  'pivoted',
  'stopped',
  'human_review_required',
  'produced',
]);
const EDGE_KINDS = new Set<ScientificReasoningEdgeKind>([
  'tests',
  'supports',
  'does_not_support',
  'inconclusive',
  'revises',
  'supersedes',
  'routes_to',
  'requires',
  'produces',
]);
const EDGE_STATES = new Set<ScientificReasoningEdge['status']>(['active', 'historical', 'blocked']);
const MAP_SCHEMAS = new Set<ScientificReasoningMapSchema>([
  'scientific-reasoning-map.v1',
  'scientific-reasoning-map.v2',
]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const V2_PAYLOAD_FIELDS = [
  'surface_kind',
  'version',
  'study_id',
  'study_ref',
  'revision',
  'status',
  'summary',
  'current_focus',
  'active_branch',
  'current_focus_node_refs',
  'active_branch_node_refs',
  'nodes',
  'edges',
  'medical_narrative',
  'source_refs',
  'conditions',
] as const;
const SUMMARY_FIELDS = [
  'primary_hypothesis',
  'latest_finding',
  'current_judgment',
  'next_research_step',
  'updated_at',
] as const;
const FOCUS_FIELDS = ['node_id', 'primary_hypothesis'] as const;
const BRANCH_FIELDS = ['branch_id', 'label'] as const;
const NODE_FIELDS = [
  'id',
  'kind',
  'label',
  'status',
  'summary',
  'branch_id',
  'occurred_at',
  'details',
  'source_refs',
] as const;
const EDGE_FIELDS = ['id', 'source', 'target', 'kind', 'label', 'status', 'source_refs'] as const;
const CONDITION_FIELDS = ['type', 'status', 'reason', 'message', 'source_refs'] as const;
const MEDICAL_NARRATIVE_FIELDS = [
  'surface_kind',
  'version',
  'audience',
  'style',
  'language',
  'title',
  'research_question',
  'current_hypothesis',
  'validation_method',
  'main_findings',
  'evidence_judgment',
  'route_adjustment',
  'next_research_step',
  'limitations',
  'sources_and_basis',
] as const;
const ENVELOPE_REQUIRED_FIELDS = [
  'schema_version',
  'surface_kind',
  'item_id',
  'view_id',
  'view_kind',
  'availability',
  'revision',
  'not_modified',
  'payload_schema',
  'payload',
  'conditions',
] as const;
const ENVELOPE_FIELDS = new Set<string>([...ENVELOPE_REQUIRED_FIELDS, 'digest', 'generation']);

/** Narrows a domain detail descriptor to the registered scientific map contract. */
export function isScientificReasoningViewDescriptor(
  descriptor: DomainDetailViewDescriptor
): descriptor is ScientificReasoningViewDescriptor {
  return (
    descriptor.viewId === 'scientific-reasoning' &&
    descriptor.viewKind === 'scientific_reasoning_map' &&
    MAP_SCHEMAS.has(descriptor.schemaVersion as ScientificReasoningMapSchema) &&
    LOCATOR_AVAILABILITY.has(descriptor.availability)
  );
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function records(value: unknown): JsonRecord[] | null {
  return Array.isArray(value) && value.every((entry) => record(entry)) ? (value as JsonRecord[]) : null;
}

function hasExactFields(source: JsonRecord, fields: readonly string[]): boolean {
  const keys = Object.keys(source);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(source, field));
}

function hasEnvelopeFields(source: JsonRecord): boolean {
  return (
    ENVELOPE_REQUIRED_FIELDS.every((field) => Object.hasOwn(source, field)) &&
    Object.keys(source).every((field) => ENVELOPE_FIELDS.has(field))
  );
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function medicalProse(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableTextField(source: JsonRecord, key: string, preserveMedicalProse = false): string | null | false {
  if (!Object.hasOwn(source, key)) return false;
  if (source[key] === null) return null;
  return (preserveMedicalProse ? medicalProse(source[key]) : text(source[key])) ?? false;
}

function safeRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validTimestamp(value: unknown): string | null {
  const candidate = text(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function uniqueStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(text);
  return values.some((entry) => !entry) || new Set(values).size !== values.length ? null : (values as string[]);
}

function medicalProseList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(medicalProse);
  return values.some((entry) => !entry) ? null : (values as string[]);
}

function parseSourceRefs(value: unknown, exactLightweight: boolean): ValidatedSourceRef[] | null {
  const source = records(value);
  if (!source) return null;
  const refs: ValidatedSourceRef[] = [];
  for (const entry of source) {
    if (exactLightweight && !hasExactFields(entry, ['kind', 'ref'])) return null;
    const kind = text(entry.kind);
    const ref = text(entry.ref);
    const sha256 = optionalText(entry.sha256);
    if (!kind || !ref) return null;
    if (entry.sha256 !== null && entry.sha256 !== undefined && (!sha256 || !SHA256_PATTERN.test(sha256))) {
      return null;
    }
    refs.push({ kind, ref, sha256 });
  }
  const identities = refs.map((entry) => `${entry.kind}\u0000${entry.ref}\u0000${entry.sha256 ?? ''}`);
  return new Set(identities).size === identities.length ? refs : null;
}

function parseResearchConditions(value: unknown, exactLightweight: boolean): boolean {
  const source = records(value);
  if (!source) return false;
  if (!exactLightweight) return true;
  const identities = new Set<string>();
  for (const entry of source) {
    if (!hasExactFields(entry, CONDITION_FIELDS)) return false;
    const type = text(entry.type);
    const status = text(entry.status);
    const reason = medicalProse(entry.reason);
    const message = medicalProse(entry.message);
    const sourceRefs = parseSourceRefs(entry.source_refs, true);
    if (!type || !status || !['True', 'False', 'Unknown'].includes(status) || !reason || !message || !sourceRefs) {
      return false;
    }
    const identity = JSON.stringify(entry);
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}

function parseMedicalNarrative(value: unknown, exactLightweight: boolean): ScientificReasoningMedicalNarrative | null {
  const source = record(value);
  if (!source) return null;
  if (
    exactLightweight &&
    (!hasExactFields(source, MEDICAL_NARRATIVE_FIELDS) ||
      source.surface_kind !== 'mas_medical_research_narrative' ||
      source.version !== 'mas-medical-narrative.v1' ||
      source.audience !== 'clinical_and_scientific_readers' ||
      source.style !== 'medical_manuscript' ||
      (source.language !== 'zh-CN' && source.language !== 'en-US') ||
      !medicalProse(source.title))
  ) {
    return null;
  }
  const researchQuestion = nullableTextField(source, 'research_question', true);
  const currentHypothesis = nullableTextField(source, 'current_hypothesis', true);
  const validationMethod = nullableTextField(source, 'validation_method', true);
  const mainFindings = nullableTextField(source, 'main_findings', true);
  const evidenceJudgment = nullableTextField(source, 'evidence_judgment', true);
  const routeAdjustment = nullableTextField(source, 'route_adjustment', true);
  const nextResearchStep = nullableTextField(source, 'next_research_step', true);
  const limitations = medicalProseList(source.limitations);
  const sourcesAndBasis = medicalProseList(source.sources_and_basis);
  if (
    researchQuestion === false ||
    currentHypothesis === false ||
    validationMethod === false ||
    mainFindings === false ||
    evidenceJudgment === false ||
    routeAdjustment === false ||
    nextResearchStep === false ||
    !limitations ||
    !sourcesAndBasis
  ) {
    return null;
  }
  return {
    researchQuestion,
    currentHypothesis,
    validationMethod,
    mainFindings,
    evidenceJudgment,
    routeAdjustment,
    nextResearchStep,
    limitations,
    sourcesAndBasis,
  };
}

function parseNode(value: unknown, schema: ScientificReasoningMapSchema): ScientificReasoningNode | null {
  const source = record(value);
  const exactLightweight = schema === 'scientific-reasoning-map.v2';
  if (!source || !Object.hasOwn(source, 'branch_id') || (exactLightweight && !hasExactFields(source, NODE_FIELDS))) {
    return null;
  }
  const id = text(source.id);
  const kind = text(source.kind);
  const label = medicalProse(source.label);
  const status = text(source.status);
  const summary = medicalProse(source.summary);
  const branchId = exactLightweight ? text(source.branch_id) : optionalText(source.branch_id);
  const occurredAt = validTimestamp(source.occurred_at);
  const details = parseMedicalNarrative(source.details, exactLightweight);
  const sourceRefs = parseSourceRefs(source.source_refs, exactLightweight);
  if (
    !id ||
    !kind ||
    !NODE_KINDS.has(kind as ScientificReasoningNodeKind) ||
    !label ||
    !status ||
    !NODE_STATUSES.has(status as ScientificReasoningNode['status']) ||
    !summary ||
    !occurredAt ||
    !details ||
    !sourceRefs ||
    (exactLightweight && (!branchId || sourceRefs.length === 0))
  ) {
    return null;
  }
  if (source.branch_id !== null && !branchId) return null;
  return {
    id,
    kind: kind as ScientificReasoningNodeKind,
    label,
    status: status as ScientificReasoningNode['status'],
    summary,
    branchId,
    occurredAt,
    details,
  };
}

function parseEdge(value: unknown, schema: ScientificReasoningMapSchema): ScientificReasoningEdge | null {
  const source = record(value);
  const exactLightweight = schema === 'scientific-reasoning-map.v2';
  if (!source || (exactLightweight && !hasExactFields(source, EDGE_FIELDS))) return null;
  const id = text(source.id);
  const sourceId = text(source.source);
  const target = text(source.target);
  const kind = text(source.kind);
  const label = medicalProse(source.label);
  const status = text(source.status);
  const sourceRefs = parseSourceRefs(source.source_refs, exactLightweight);
  if (
    !id ||
    !sourceId ||
    !target ||
    !kind ||
    !EDGE_KINDS.has(kind as ScientificReasoningEdgeKind) ||
    !label ||
    !status ||
    !EDGE_STATES.has(status as ScientificReasoningEdge['status']) ||
    !sourceRefs ||
    (exactLightweight && sourceRefs.length === 0)
  ) {
    return null;
  }
  return {
    id,
    source: sourceId,
    target,
    kind: kind as ScientificReasoningEdgeKind,
    label,
    status: status as ScientificReasoningEdge['status'],
  };
}

function parseSummary(value: unknown, exactLightweight: boolean): ScientificReasoningMapPayload['summary'] | null {
  const source = record(value);
  if (!source || (exactLightweight && !hasExactFields(source, SUMMARY_FIELDS))) return null;
  const primaryHypothesis = nullableTextField(source, 'primary_hypothesis', true);
  const latestFinding = nullableTextField(source, 'latest_finding', true);
  const currentJudgment = nullableTextField(source, 'current_judgment', true);
  const nextResearchStep = nullableTextField(source, 'next_research_step', true);
  const updatedAt = exactLightweight ? validTimestamp(source.updated_at) : nullableTextField(source, 'updated_at');
  if (
    primaryHypothesis === false ||
    latestFinding === false ||
    currentJudgment === false ||
    nextResearchStep === false ||
    updatedAt === false ||
    (exactLightweight && updatedAt === null)
  ) {
    return null;
  }
  return { primaryHypothesis, latestFinding, currentJudgment, nextResearchStep, updatedAt };
}

function parseFocus(value: unknown, exactLightweight: boolean): ScientificReasoningMapPayload['currentFocus'] | null {
  const source = record(value);
  if (!source || (exactLightweight && !hasExactFields(source, FOCUS_FIELDS))) return null;
  const nodeId = nullableTextField(source, 'node_id');
  const primaryHypothesis = nullableTextField(source, 'primary_hypothesis', true);
  if (nodeId === false || primaryHypothesis === false || (exactLightweight && (!nodeId || !primaryHypothesis)))
    return null;
  return { nodeId, primaryHypothesis };
}

function parseBranch(value: unknown, exactLightweight: boolean): ScientificReasoningMapPayload['activeBranch'] | null {
  const source = record(value);
  if (!source || (exactLightweight && !hasExactFields(source, BRANCH_FIELDS))) return null;
  const branchId = nullableTextField(source, 'branch_id');
  const label = nullableTextField(source, 'label', true);
  if (branchId === false || label === false || (exactLightweight && (!branchId || !label))) return null;
  return { branchId, label };
}

function parsePayload(
  value: unknown,
  schema: ScientificReasoningMapSchema,
  envelopeRevision: number,
  expectedStudyId?: string
): ScientificReasoningMapPayload | null {
  const source = record(value);
  const exactLightweight = schema === 'scientific-reasoning-map.v2';
  if (
    !source ||
    (exactLightweight &&
      (!hasExactFields(source, V2_PAYLOAD_FIELDS) ||
        source.surface_kind !== 'mas_research_trajectory_snapshot' ||
        source.version !== 'mas-research-trajectory-snapshot.v2'))
  ) {
    return null;
  }

  const studyId = text(source.study_id);
  const status = text(source.status);
  const summary = parseSummary(source.summary, exactLightweight);
  const currentFocus = parseFocus(source.current_focus, exactLightweight);
  const activeBranch = parseBranch(source.active_branch, exactLightweight);
  const nodes = Array.isArray(source.nodes) ? source.nodes.map((entry) => parseNode(entry, schema)) : null;
  const edges = Array.isArray(source.edges) ? source.edges.map((entry) => parseEdge(entry, schema)) : null;
  const sourceRefs = parseSourceRefs(source.source_refs, exactLightweight);
  const conditionsValid = parseResearchConditions(source.conditions, exactLightweight);
  const medicalNarrative = exactLightweight ? parseMedicalNarrative(source.medical_narrative, true) : null;
  const payloadRevision = exactLightweight ? safeRevision(source.revision) : 0;
  const studyRef = exactLightweight ? (parseSourceRefs([source.study_ref], true)?.[0] ?? null) : null;
  const currentFocusNodeRefs = exactLightweight ? uniqueStringList(source.current_focus_node_refs) : null;
  const activeBranchNodeRefs = exactLightweight ? uniqueStringList(source.active_branch_node_refs) : null;
  if (
    !studyId ||
    (expectedStudyId !== undefined && studyId !== expectedStudyId) ||
    !status ||
    !MAP_STATUSES.has(status as ScientificReasoningMapPayload['status']) ||
    (exactLightweight && status === 'empty') ||
    !summary ||
    !currentFocus ||
    !activeBranch ||
    !nodes ||
    nodes.some((node) => !node) ||
    !edges ||
    edges.some((edge) => !edge) ||
    !sourceRefs ||
    !conditionsValid ||
    (exactLightweight &&
      (!medicalNarrative ||
        payloadRevision === null ||
        payloadRevision < 1 ||
        payloadRevision !== envelopeRevision ||
        !studyRef ||
        studyRef.kind !== 'mas_study' ||
        studyRef.ref !== `mas-study:${studyId}` ||
        !currentFocusNodeRefs ||
        currentFocusNodeRefs.length === 0 ||
        !activeBranchNodeRefs ||
        activeBranchNodeRefs.length === 0 ||
        nodes.length === 0 ||
        sourceRefs.length === 0))
  ) {
    return null;
  }

  const typedNodes = nodes as ScientificReasoningNode[];
  const typedEdges = edges as ScientificReasoningEdge[];
  const nodeIds = new Set(typedNodes.map((node) => node.id));
  const edgeIds = new Set(typedEdges.map((edge) => edge.id));
  const resolvedCurrentFocusNodeRefs = currentFocusNodeRefs ?? (currentFocus.nodeId ? [currentFocus.nodeId] : []);
  const resolvedActiveBranchNodeRefs =
    activeBranchNodeRefs ??
    (activeBranch.branchId
      ? typedNodes
          .filter((node) => node.branchId === activeBranch.branchId || node.id === currentFocus.nodeId)
          .map((node) => node.id)
      : []);
  if (
    nodeIds.size !== typedNodes.length ||
    edgeIds.size !== typedEdges.length ||
    typedEdges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) ||
    (currentFocus.nodeId !== null && !nodeIds.has(currentFocus.nodeId)) ||
    resolvedCurrentFocusNodeRefs.some((nodeId) => !nodeIds.has(nodeId)) ||
    resolvedActiveBranchNodeRefs.some((nodeId) => !nodeIds.has(nodeId))
  ) {
    return null;
  }

  return {
    status: status as ScientificReasoningMapPayload['status'],
    summary,
    currentFocus,
    activeBranch,
    currentFocusNodeRefs: resolvedCurrentFocusNodeRefs,
    activeBranchNodeRefs: resolvedActiveBranchNodeRefs,
    nodes: typedNodes,
    edges: typedEdges,
    medicalNarrative,
  };
}

export type ScientificReasoningReadResult =
  | { state: 'ready'; view: ScientificReasoningViewEnvelope }
  | { state: 'invalid'; view: null };

/** Parses the item-scoped view envelope without interpreting scientific meaning. */
export function readScientificReasoningView(value: unknown, expectedStudyId?: string): ScientificReasoningReadResult {
  const source = record(value);
  const payloadSchema = text(source?.payload_schema);
  if (
    !source ||
    !hasEnvelopeFields(source) ||
    source.schema_version !== 'opl_domain_detail_view.v1' ||
    source.surface_kind !== 'opl_domain_detail_view' ||
    source.view_kind !== 'scientific_reasoning_map' ||
    !payloadSchema ||
    !MAP_SCHEMAS.has(payloadSchema as ScientificReasoningMapSchema)
  ) {
    return { state: 'invalid', view: null };
  }
  const itemId = text(source.item_id);
  const viewId = text(source.view_id);
  const availability = text(source.availability);
  const revision = safeRevision(source.revision);
  const generation = source.generation === undefined ? null : safeRevision(source.generation);
  const digest = source.digest === undefined ? null : text(source.digest);
  const envelopeConditions = records(source.conditions);
  if (
    !itemId ||
    viewId !== 'scientific-reasoning' ||
    !availability ||
    !READ_AVAILABILITY.has(availability as DomainDetailViewReadAvailability) ||
    revision === null ||
    (source.generation !== undefined && (generation === null || generation !== revision)) ||
    (source.digest !== undefined && (!digest || !SHA256_PATTERN.test(digest))) ||
    typeof source.not_modified !== 'boolean' ||
    !envelopeConditions
  ) {
    return { state: 'invalid', view: null };
  }

  const notModified = source.not_modified;
  const payload =
    source.payload === null
      ? null
      : parsePayload(source.payload, payloadSchema as ScientificReasoningMapSchema, revision, expectedStudyId);
  if (
    (source.payload !== null && !payload) ||
    (notModified && (availability !== 'available' || source.payload !== null)) ||
    (!notModified && availability === 'available' && !payload) ||
    (availability !== 'available' && (notModified || payload))
  ) {
    return { state: 'invalid', view: null };
  }
  return {
    state: 'ready',
    view: {
      itemId,
      viewId,
      viewKind: 'scientific_reasoning_map',
      availability: availability as DomainDetailViewReadAvailability,
      revision,
      digest,
      payloadSchema: payloadSchema as ScientificReasoningMapSchema,
      notModified,
      payload,
    },
  };
}
