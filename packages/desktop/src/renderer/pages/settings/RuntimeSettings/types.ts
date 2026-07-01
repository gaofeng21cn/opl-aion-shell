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
  state?: string;
  status?: string;
  stage?: string;
  progressLabel?: string;
  nextStep?: string;
  nextOwner?: string;
  lastProgressAt?: string;
  activeStageId?: string;
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
};

export type RuntimeTaskRunProjectionV2 = {
  projectionKind?: string;
  schemaVersion?: number;
  tasks: RuntimeTaskDrilldown[];
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
