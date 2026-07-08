/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type RuntimeGraphNode = {
  id: string;
  label: string;
  kind?: string;
  state?: string;
  owner?: string;
  domainId?: string;
  stageId?: string;
  stageAttemptId?: string;
  ref?: string;
};

export type RuntimeGraphEdge = {
  id?: string;
  from: string;
  to: string;
  label?: string;
  kind?: string;
  ref?: string;
};

export type RuntimeTimelineItem = {
  id: string;
  label: string;
  kind?: string;
  state?: string;
  timestamp?: string;
  domainId?: string;
  stageId?: string;
  stageAttemptId?: string;
  ref?: string;
};

export type RuntimeSafeActionRoute = {
  id: string;
  label: string;
  owner?: string;
  route?: string;
  payloadRefsOnlyJson?: Record<string, unknown>;
  dryRunRequired?: boolean;
};

export type RuntimeSummaryCard = {
  id: string;
  label: string;
  value: string;
  tone?: string;
};

export type RuntimeActionQueueItem = {
  id: string;
  taskId: string;
  title: string;
  subtitle?: string;
  domainId?: string;
  domainLabel?: string;
  state?: string;
  priorityBucket?: string;
  safeActionRefCount: number;
  blockerRefCount: number;
  paperRouteLensRefCount: number;
};

export type RuntimeLaneTask = {
  taskId: string;
  label: string;
  state?: string;
  priorityBucket?: string;
  activeStageId?: string;
  activePathNodeIds: string[];
  paperRouteLensRefCount: number;
};

export type RuntimeDomainLane = {
  domainId: string;
  label: string;
  activeTaskCount: number;
  blockedTaskCount: number;
  paperRouteLensRefCount: number;
  tasks: RuntimeLaneTask[];
};

export type RuntimeTaskDrilldown = {
  taskId: string;
  title: string;
  domainId?: string;
  domainLabel?: string;
  agentDisplayName?: string;
  workspaceId?: string;
  workspaceLabel?: string;
  projectId?: string;
  projectDisplayName?: string;
  studyId?: string;
  workItemDisplayName?: string;
  executionRunLabel?: string;
  state?: string;
  status?: string;
  primaryState?: RuntimeTaskPrimaryState;
  primaryStateLabel?: string;
  primaryStateReason?: string;
  automationState?: RuntimeTaskAutomationState;
  automationStateLabel?: string;
  automationStateReason?: string;
  stage?: string;
  progressLabel?: string;
  nextStep?: string;
  nextOwner?: string;
  lastProgressAt?: string;
  activeStageId?: string;
  activeRunId?: string;
  elapsedSeconds?: number;
  lastHeartbeatAt?: string;
  runningProofRef?: string;
  stageUsage?: string;
  taskTotalUsage?: string;
  typedBlockerSummary?: string;
  typedBlockerOwner?: string;
  typedBlockerResolutionRef?: string;
  runtimeCloseoutObserved?: boolean;
  runtimeCloseoutRef?: string;
  masOwnerConsumptionStatus?: string;
  masOwnerConsumptionRef?: string;
  masOwnerConsumedStageAttemptId?: string;
  masOwnerConsumedCloseoutRef?: string;
  masOwnerConsumptionMatchesRuntimeCloseout?: boolean;
  stageAttemptIds: string[];
  paperRouteLensRefCount: number;
  safeActionRefCount: number;
  blockerRefCount: number;
  activePath: RuntimeGraphNode[];
  conditions: RuntimeTaskCondition[];
  evidenceCards: RuntimeTaskRefCard[];
  actionCards: RuntimeTaskRefCard[];
  resourceRefs: RuntimeTaskRefCard[];
  diagnosticsRefs: RuntimeTaskRefCard[];
  artifactProvenanceDrawer?: ArtifactProvenanceDrawer;
};

export type ArtifactProvenanceRef = {
  artifactId?: string;
  artifactRef?: string;
  bundleRef?: string;
  ledgerRecordRef?: string;
  contentHashRef?: string;
};

export type ArtifactProvenanceTraceRef = {
  traceKind?: string;
  traceRef?: string;
  access?: string;
};

export type ArtifactProvenanceReviewRef = {
  reviewKind?: string;
  reviewRef?: string;
  reviewerOwner?: string;
};

export type ArtifactProvenanceTypedIssue = {
  issueType?: string;
  severity?: string;
  ref?: string;
  owner?: string;
};

export type ArtifactProvenanceOpenAction = {
  actionId?: string;
  actionRef?: string;
  route?: string;
  requiredMode?: string;
};

export type ArtifactProvenanceDrawer = {
  provenanceProjectionKind?: string;
  provenanceProjectionRef?: string;
  provenanceIndexRef?: string;
  provenanceBundleRefs: ArtifactProvenanceRef[];
  roCrateMetadataRef?: string;
  replayStatusRef?: string;
  agentTraceRefs: ArtifactProvenanceTraceRef[];
  reviewRefs: ArtifactProvenanceReviewRef[];
  typedIssues: ArtifactProvenanceTypedIssue[];
  drawerSurfaceKind?: string;
  drawerRoute?: string;
  drawerProjectionRef?: string;
  openAction?: ArtifactProvenanceOpenAction;
};

export type RuntimeTaskRunProjectionV2 = {
  projectionKind?: string;
  schemaVersion?: number;
  summary: RuntimeTaskRunSummary;
  tasks: RuntimeTaskDrilldown[];
};

export type RuntimeScopeOptionKind = 'all_projects' | 'agent' | 'workspace' | 'project' | 'task';

export type RuntimeScopeSource = 'default_global' | 'user_selected' | 'inferred';

export type RuntimeTaskPrimaryState =
  | 'in_progress'
  | 'delivered_auto_paused'
  | 'paused_waiting_for_direction'
  | 'owner_decision_required'
  | 'system_attention_required';

export type RuntimeTaskAutomationState =
  | 'automation_running'
  | 'automation_idle'
  | 'result_pending_terminalization'
  | 'automation_failed';

export type RuntimeScopeOption = {
  id: string;
  kind: RuntimeScopeOptionKind;
  label: string;
  value?: string;
  workspacePath?: string;
  workspaceBindingId?: string;
  projectId?: string;
};

export type RuntimeScopeProjection = {
  options: RuntimeScopeOption[];
  current: RuntimeScopeOption;
  source: RuntimeScopeSource;
  inferredHint?: string;
  frameworkBacked: boolean;
};

export type RuntimeTaskRunSummary = {
  running: number;
  waiting: number;
  attention: number;
  completed: number;
  failed: number;
  available: number;
};

export type RuntimeTaskCondition = {
  id: string;
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
};

export type RuntimeTaskRefCard = {
  id: string;
  label: string;
  value?: string;
  ref?: string;
  kind?: string;
  details: RuntimeTaskRefDetail[];
};

export type RuntimeTaskRefDetail = {
  key: string;
  value: string;
};

export type RuntimeRefreshPolicy = {
  summaryPollIntervalSeconds: number;
  fullDetailAutoPoll: boolean;
  perTokenStreaming: boolean;
};

export type RuntimePerformancePolicy = {
  globalMapRenderer?: string;
  graphLayoutRecompute?: string;
};

export type RuntimeDefaultReadSurfacePolicy = {
  defaultProjection?: string;
  normalStateSurface?: string;
  fullRuntimeDrilldownSurface?: string;
  rawRuntimeProjectionPolicy?: string;
  firstScreenAnswers: string[];
  forbiddenDefaultStateFields: string[];
  fullDetailAutoPoll?: boolean;
  shellMustNotUseFullDrilldownAsNormalState?: boolean;
  shellMustNotDeriveLayoutFromRawRuntimeProjection?: boolean;
};

export type RuntimeVisualizationModel = {
  sourceSurface: string;
  state: string;
  summary: Array<{ label: string; value: string }>;
  summaryCards: RuntimeSummaryCard[];
  scope: RuntimeScopeProjection;
  actionQueue: RuntimeActionQueueItem[];
  domainLaneMap: RuntimeDomainLane[];
  taskDrilldowns: RuntimeTaskDrilldown[];
  defaultReadSurfacePolicy?: RuntimeDefaultReadSurfacePolicy;
  refreshPolicy?: RuntimeRefreshPolicy;
  performancePolicy: RuntimePerformancePolicy;
  stageGraph: {
    nodes: RuntimeGraphNode[];
    edges: RuntimeGraphEdge[];
  };
  routeGraph: {
    nodes: RuntimeGraphNode[];
    edges: RuntimeGraphEdge[];
  };
  decisionMap: RuntimeGraphNode[];
  timeline: RuntimeTimelineItem[];
  researchPaperLensRefs: RuntimeGraphNode[];
  ownerBoundary: string[];
  safeActionRoutes: RuntimeSafeActionRoute[];
  refs: RuntimeGraphNode[];
  taskRunProjectionV2: RuntimeTaskRunProjectionV2;
};
