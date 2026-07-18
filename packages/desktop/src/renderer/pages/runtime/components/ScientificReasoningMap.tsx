import { Button, Spin, Tooltip, Typography } from '@arco-design/web-react';
import { FullScreenOne, ZoomIn, ZoomOut } from '@icon-park/react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type AriaLabelConfig,
  type Node,
  type OnNodesChange,
  type OnSelectionChangeFunc,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RuntimeTranslate } from '../formatters';
import type {
  ScientificReasoningEdge,
  ScientificReasoningNode as ScientificReasoningNodeModel,
  ScientificReasoningNodeKind,
} from '../types';
import styles from '../RuntimePage.module.css';

const NODE_WIDTH = 276;
const NODE_HEIGHT = 152;
const COMPACT_NODE_WIDTH = 184;
const COMPACT_NODE_HEIGHT = 172;
const MIN_ZOOM = 0.05;
const DETAIL_ZOOM_THRESHOLD = 0.65;
const OVERVIEW_ZOOM_THRESHOLD = 0.28;
const DEFAULT_FIT_PADDING = 0.18;
const COMPACT_FIT_PADDING = 0.02;
const elk = new ELK();
type ResearchMapLayout = 'horizontal' | 'vertical' | 'compact';
type ResearchMapSemanticZoom = 'detail' | 'overview' | 'topology';

type ReasoningNodeData = {
  label: string;
  summary: string;
  kind: ScientificReasoningNodeKind;
  kindLabel: string;
  current: boolean;
  currentLabel: string;
  vertical: boolean;
};

type ReasoningFlowNode = Node<ReasoningNodeData, 'scientificReasoning'>;

type ScientificReasoningMapProps = {
  nodes: ScientificReasoningNodeModel[];
  edges: ScientificReasoningEdge[];
  currentFocusNodeId: string | null;
  selectedNodeId: string | null;
  t: RuntimeTranslate;
  onSelectNode: (nodeId: string | null) => void;
};

function ReasoningNode({ data, selected }: NodeProps<ReasoningFlowNode>) {
  const targetPosition = data.vertical ? Position.Top : Position.Left;
  const sourcePosition = data.vertical ? Position.Bottom : Position.Right;
  return (
    <div
      className={styles.reasoningNode}
      data-current={data.current ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-kind={data.kind}
    >
      <Handle type='target' position={targetPosition} className={styles.reasoningHandle} isConnectable={false} />
      <div className={styles.reasoningNodeMeta}>
        <span className={styles.reasoningNodeKind}>{data.kindLabel}</span>
        {data.current && <span className={styles.reasoningNodeCurrent}>{data.currentLabel}</span>}
      </div>
      <Typography.Text className={styles.reasoningNodeLabel}>{data.label}</Typography.Text>
      <Typography.Paragraph className={styles.reasoningNodeSummary}>{data.summary}</Typography.Paragraph>
      <Handle type='source' position={sourcePosition} className={styles.reasoningHandle} isConnectable={false} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { scientificReasoning: ReasoningNode };

const NODE_KIND_KEYS: Readonly<Record<ScientificReasoningNodeKind, string>> = {
  hypothesis: 'common.runtime.researchTrajectory.kindHypothesis',
  test: 'common.runtime.researchTrajectory.kindTest',
  finding: 'common.runtime.researchTrajectory.kindFinding',
  decision: 'common.runtime.researchTrajectory.kindDecision',
  route: 'common.runtime.researchTrajectory.kindRoute',
  artifact: 'common.runtime.researchTrajectory.kindArtifact',
  human_gate: 'common.runtime.researchTrajectory.kindHumanGate',
};

const EDGE_STATUS_KEYS: Readonly<Record<ScientificReasoningEdge['status'], string>> = {
  active: 'common.runtime.researchTrajectory.edgeActive',
  historical: 'common.runtime.researchTrajectory.edgeHistorical',
  blocked: 'common.runtime.researchTrajectory.edgeBlocked',
};

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

async function layoutGraph(
  nodes: ReasoningFlowNode[],
  edges: Edge[],
  vertical: boolean,
  compact: boolean
): Promise<ReasoningFlowNode[]> {
  const graph = await elk.layout({
    id: 'scientific-reasoning-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': vertical ? 'DOWN' : 'RIGHT',
      'elk.spacing.nodeNode': compact ? '24' : '44',
      'elk.layered.spacing.nodeNodeBetweenLayers': compact ? '68' : '84',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: typeof node.width === 'number' ? node.width : NODE_WIDTH,
      height: typeof node.height === 'number' ? node.height : NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions = new Map((graph.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
}

/** Interactive, read-only graph over the domain-authored labels and summaries. */
export function ScientificReasoningMap({
  nodes,
  edges,
  currentFocusNodeId,
  selectedNodeId,
  t,
  onSelectNode,
}: ScientificReasoningMapProps) {
  const [layoutNodes, setLayoutNodes] = useState<ReasoningFlowNode[] | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<ReasoningFlowNode, Edge> | null>(null);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [layoutMode, setLayoutMode] = useState<ResearchMapLayout>('horizontal');
  const [semanticZoom, setSemanticZoom] = useState<ResearchMapSemanticZoom>('detail');
  const verticalLayout = layoutMode !== 'horizontal';
  const compactLayout = layoutMode === 'compact';
  const fitPadding = compactLayout ? COMPACT_FIT_PADDING : DEFAULT_FIT_PADDING;
  const ariaLabelConfig = useMemo<Partial<AriaLabelConfig>>(
    () => ({
      'node.a11yDescription.default': t('common.runtime.researchTrajectory.nodeA11yDescription'),
      'node.a11yDescription.keyboardDisabled': t('common.runtime.researchTrajectory.nodeA11yDescription'),
      'node.a11yDescription.ariaLiveMessage': () => t('common.runtime.researchTrajectory.nodeSelectionChanged'),
      'edge.a11yDescription.default': t('common.runtime.researchTrajectory.edgeA11yDescription'),
      'controls.ariaLabel': t('common.runtime.researchTrajectory.mapControls'),
      'controls.zoomIn.ariaLabel': t('common.runtime.researchTrajectory.zoomIn'),
      'controls.zoomOut.ariaLabel': t('common.runtime.researchTrajectory.zoomOut'),
      'controls.fitView.ariaLabel': t('common.runtime.researchTrajectory.fit'),
      'controls.interactive.ariaLabel': t('common.runtime.researchTrajectory.mapControls'),
      'minimap.ariaLabel': t('common.runtime.researchTrajectory.mapAriaLabel'),
      'handle.ariaLabel': t('common.runtime.researchTrajectory.mapHandle'),
    }),
    [t]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = (width: number) => {
      if (width <= 0) return;
      const nextMode: ResearchMapLayout = width <= 560 ? 'compact' : width <= 760 ? 'vertical' : 'horizontal';
      setLayoutMode((current) => (current === nextMode ? current : nextMode));
    };
    update(canvas.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => update(entries[0]?.contentRect.width ?? 0));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: `${edge.label} · ${t(EDGE_STATUS_KEYS[edge.status])}`,
        type: 'smoothstep',
        animated: edge.status === 'active' && !reducedMotion,
        className:
          edge.status === 'active'
            ? styles.reasoningEdgeActive
            : edge.status === 'blocked'
              ? styles.reasoningEdgeBlocked
              : styles.reasoningEdgeHistorical,
        markerEnd: { type: MarkerType.ArrowClosed },
        ariaLabel: `${edge.label}. ${t(EDGE_STATUS_KEYS[edge.status])}`,
        deletable: false,
        selectable: false,
      })),
    [edges, reducedMotion, t]
  );

  useEffect(() => {
    let cancelled = false;
    setLayoutNodes(null);
    const nodeWidth = compactLayout ? COMPACT_NODE_WIDTH : NODE_WIDTH;
    const nodeHeight = compactLayout ? COMPACT_NODE_HEIGHT : NODE_HEIGHT;
    const nextNodes: ReasoningFlowNode[] = nodes.map((node) => ({
      id: node.id,
      type: 'scientificReasoning',
      position: { x: 0, y: 0 },
      width: nodeWidth,
      height: nodeHeight,
      selected: false,
      deletable: false,
      draggable: false,
      ariaRole: 'button',
      ariaLabel: `${node.label}. ${node.summary}${
        node.id === currentFocusNodeId ? `. ${t('common.runtime.researchTrajectory.currentFocus')}` : ''
      }`,
      data: {
        label: node.label,
        summary: node.summary,
        kind: node.kind,
        kindLabel: t(NODE_KIND_KEYS[node.kind]),
        current: node.id === currentFocusNodeId,
        currentLabel: t('common.runtime.researchTrajectory.currentFocus'),
        vertical: verticalLayout,
      },
    }));
    void layoutGraph(nextNodes, flowEdges, verticalLayout, compactLayout).then((result) => {
      if (!cancelled) {
        setLayoutNodes(result.map((node) => ({ ...node, selected: node.id === selectedNodeIdRef.current })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [compactLayout, currentFocusNodeId, flowEdges, nodes, t, verticalLayout]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    setLayoutNodes((current) => {
      if (!current) return current;
      let changed = false;
      const next = current.map((node) => {
        const selected = node.id === selectedNodeId;
        if (node.selected === selected) return node;
        changed = true;
        return { ...node, selected };
      });
      return changed ? next : current;
    });
  }, [selectedNodeId]);

  const handleNodesChange = useCallback<OnNodesChange<ReasoningFlowNode>>((changes) => {
    const readOnlyChanges = changes.filter((change) => change.type !== 'remove');
    setLayoutNodes((current) => (current ? applyNodeChanges(readOnlyChanges, current) : current));
  }, []);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<ReasoningFlowNode, Edge>>(
    ({ nodes: selectedNodes }) => {
      const nextSelectedNodeId = selectedNodes[0]?.id ?? null;
      if (nextSelectedNodeId === selectedNodeIdRef.current) return;
      selectedNodeIdRef.current = nextSelectedNodeId;
      onSelectNode(nextSelectedNodeId);
    },
    [onSelectNode]
  );

  const handleViewportChange = useCallback((viewport: { zoom: number }) => {
    const nextSemanticZoom: ResearchMapSemanticZoom =
      viewport.zoom >= DETAIL_ZOOM_THRESHOLD
        ? 'detail'
        : viewport.zoom >= OVERVIEW_ZOOM_THRESHOLD
          ? 'overview'
          : 'topology';
    setSemanticZoom((current) => (current === nextSemanticZoom ? current : nextSemanticZoom));
  }, []);

  const layoutSignature = useMemo(
    () =>
      layoutNodes
        ?.map((node) => `${node.id}:${node.position.x}:${node.position.y}:${node.width ?? ''}:${node.height ?? ''}`)
        .join('|') ?? '',
    [layoutNodes]
  );

  useEffect(() => {
    if (!instance || !layoutSignature) return;
    const frame = window.requestAnimationFrame(() => {
      void instance.fitView({ padding: fitPadding, minZoom: MIN_ZOOM, duration: reducedMotion ? 0 : 240 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitPadding, instance, layoutSignature, reducedMotion]);

  return (
    <div
      ref={canvasRef}
      className={styles.reasoningCanvas}
      data-testid='runtime-research-map-canvas'
      data-compact={compactLayout ? 'true' : 'false'}
      data-layout={layoutMode}
      data-semantic-zoom={semanticZoom}
      aria-label={t('common.runtime.researchTrajectory.mapAriaLabel')}
    >
      {!layoutNodes ? (
        <div className={styles.reasoningCanvasLoading} data-testid='runtime-research-map-layout-loading'>
          <Spin tip={t('common.runtime.researchTrajectory.loading')} />
        </div>
      ) : (
        <ReactFlow<ReasoningFlowNode, Edge>
          nodes={layoutNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable
          edgesFocusable={false}
          elementsSelectable
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          minZoom={MIN_ZOOM}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: fitPadding, minZoom: MIN_ZOOM }}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={ariaLabelConfig}
          onInit={setInstance}
          onNodesChange={handleNodesChange}
          onSelectionChange={handleSelectionChange}
          onViewportChange={handleViewportChange}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color='var(--color-border-2)' />
        </ReactFlow>
      )}
      {layoutNodes && (
        <div className={styles.reasoningCanvasTools}>
          <Button.Group>
            <Tooltip content={t('common.runtime.researchTrajectory.zoomOut')}>
              <Button
                type='secondary'
                icon={<ZoomOut theme='outline' />}
                aria-label={t('common.runtime.researchTrajectory.zoomOut')}
                onClick={() => void instance?.zoomOut({ duration: reducedMotion ? 0 : 160 })}
              />
            </Tooltip>
            <Tooltip content={t('common.runtime.researchTrajectory.fit')}>
              <Button
                type='secondary'
                icon={<FullScreenOne theme='outline' />}
                aria-label={t('common.runtime.researchTrajectory.fit')}
                onClick={() =>
                  void instance?.fitView({
                    padding: fitPadding,
                    minZoom: MIN_ZOOM,
                    duration: reducedMotion ? 0 : 200,
                  })
                }
              />
            </Tooltip>
            <Tooltip content={t('common.runtime.researchTrajectory.zoomIn')}>
              <Button
                type='secondary'
                icon={<ZoomIn theme='outline' />}
                aria-label={t('common.runtime.researchTrajectory.zoomIn')}
                onClick={() => void instance?.zoomIn({ duration: reducedMotion ? 0 : 160 })}
              />
            </Tooltip>
          </Button.Group>
        </div>
      )}
    </div>
  );
}
