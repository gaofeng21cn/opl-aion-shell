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

export type RuntimeVisualizationModel = {
  sourceSurface: string;
  state: string;
  summary: Array<{ label: string; value: string }>;
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
};
