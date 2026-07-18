import { Alert, Button, Collapse, Radio, Spin, Tooltip, Typography } from '@arco-design/web-react';
import { Back, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { ScientificReasoningMap } from './components/ScientificReasoningMap';
import { formatTimestamp, type RuntimeTranslate } from './formatters';
import { readRuntimeWorkItemProjectionV2 } from './projection';
import { isScientificReasoningViewDescriptor, readScientificReasoningView } from './scientificReasoning';
import type {
  DomainDetailViewAvailability,
  ScientificReasoningNode,
  ScientificReasoningViewDescriptor,
  ScientificReasoningViewEnvelope,
} from './types';
import styles from './RuntimePage.module.css';

type ResearchMapMode = 'map' | 'current_branch';
type ReadState = {
  loading: boolean;
  error: 'load_failed' | 'unsupported' | null;
  availability: ScientificReasoningViewEnvelope['availability'] | null;
  view: ScientificReasoningViewEnvelope | null;
};

const viewCache = new Map<string, ScientificReasoningViewEnvelope>();
const MAX_VIEW_CACHE_ENTRIES = 32;

function readCachedView(key: string): ScientificReasoningViewEnvelope | null {
  const cached = viewCache.get(key) ?? null;
  if (!cached) return null;
  viewCache.delete(key);
  viewCache.set(key, cached);
  return cached;
}

function writeCachedView(key: string, view: ScientificReasoningViewEnvelope): void {
  viewCache.delete(key);
  viewCache.set(key, view);
  while (viewCache.size > MAX_VIEW_CACHE_ENTRIES) {
    const oldestKey = viewCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    viewCache.delete(oldestKey);
  }
}

/** Clears the in-memory detail-view cache between isolated renderer tests. */
export function resetScientificReasoningCacheForTest(): void {
  viewCache.clear();
}

/** Exposes bounded cache behavior without leaking cached research content. */
export const __scientificReasoningPageTest = Object.freeze({
  maxCacheEntries: MAX_VIEW_CACHE_ENTRIES,
  readCachedView,
  writeCachedView,
  cacheKeys: () => [...viewCache.keys()],
});

function matchesDescriptorIdentity(
  view: ScientificReasoningViewEnvelope,
  descriptor: ScientificReasoningViewDescriptor
): boolean {
  return (
    descriptor.revision !== null &&
    view.revision === descriptor.revision &&
    (descriptor.digest === null || view.digest === descriptor.digest)
  );
}

function matchesReadIdentity(
  view: ScientificReasoningViewEnvelope,
  identity: Pick<ScientificReasoningViewEnvelope, 'revision' | 'digest'>
): boolean {
  return view.revision === identity.revision && (identity.digest === null || view.digest === identity.digest);
}

function isCurrentOrNewerThanDescriptor(
  view: ScientificReasoningViewEnvelope,
  descriptor: ScientificReasoningViewDescriptor
): boolean {
  if (descriptor.revision === null) return true;
  if (view.revision < descriptor.revision) return false;
  return view.revision > descriptor.revision || matchesDescriptorIdentity(view, descriptor);
}

function StatePanel({
  title,
  description,
  type = 'info',
  t,
  onRefresh,
}: {
  title: string;
  description: string;
  type?: 'info' | 'warning' | 'error';
  t: RuntimeTranslate;
  onRefresh?: () => void;
}) {
  return (
    <div className={styles.reasoningState} data-testid='runtime-research-map-state'>
      <Alert type={type} showIcon title={title} content={description} />
      {onRefresh && (
        <Button type='primary' icon={<Refresh theme='outline' />} onClick={onRefresh}>
          {t('common.runtime.researchTrajectory.refresh')}
        </Button>
      )}
    </div>
  );
}

function NarrativeField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reasoningInspectorField}>
      <Typography.Text className={styles.reasoningInspectorLabel}>{label}</Typography.Text>
      <Typography.Paragraph className={styles.reasoningInspectorValue}>{value}</Typography.Paragraph>
    </div>
  );
}

function ResearchObjectInspector({
  node,
  relatedEdges,
  t,
}: {
  node: ScientificReasoningNode | null;
  relatedEdges: Array<{ id: string; label: string }>;
  t: RuntimeTranslate;
}) {
  if (!node) {
    return (
      <aside className={styles.reasoningInspector} data-testid='runtime-research-map-inspector'>
        <Typography.Title heading={5}>{t('common.runtime.researchTrajectory.details')}</Typography.Title>
        <Typography.Text>{t('common.runtime.researchTrajectory.selectPrompt')}</Typography.Text>
      </aside>
    );
  }

  const details = node.details;
  const narrativeFields = [
    { label: t('common.runtime.researchTrajectory.researchQuestion'), value: details.researchQuestion },
    { label: t('common.runtime.researchTrajectory.currentHypothesis'), value: details.currentHypothesis },
    { label: t('common.runtime.researchTrajectory.validationMethod'), value: details.validationMethod },
    { label: t('common.runtime.researchTrajectory.mainFindings'), value: details.mainFindings },
    { label: t('common.runtime.researchTrajectory.evidenceJudgment'), value: details.evidenceJudgment },
    { label: t('common.runtime.researchTrajectory.routeAdjustment'), value: details.routeAdjustment },
    { label: t('common.runtime.researchTrajectory.nextResearchStep'), value: details.nextResearchStep },
  ].filter((field): field is { label: string; value: string } => field.value !== null);
  return (
    <aside className={styles.reasoningInspector} data-testid='runtime-research-map-inspector'>
      <div className={styles.reasoningInspectorHeading}>
        <Typography.Title heading={5}>{node.label}</Typography.Title>
        <Typography.Paragraph>{node.summary}</Typography.Paragraph>
      </div>
      <div className={styles.reasoningInspectorFields}>
        {narrativeFields.map((field) => (
          <NarrativeField key={field.label} {...field} />
        ))}
        {details.limitations.length > 0 && (
          <div className={styles.reasoningInspectorField}>
            <Typography.Text className={styles.reasoningInspectorLabel}>
              {t('common.runtime.researchTrajectory.limitations')}
            </Typography.Text>
            <ul className={styles.reasoningNarrativeList}>
              {details.limitations.map((limitation, index) => (
                <li key={`limitation-${index}`}>{limitation}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {details.sourcesAndBasis.length > 0 && (
        <Collapse bordered={false} className={styles.reasoningSources}>
          <Collapse.Item name='sources-and-basis' header={t('common.runtime.researchTrajectory.sourcesAndBasis')}>
            <ul className={styles.reasoningNarrativeList}>
              {details.sourcesAndBasis.map((source, index) => (
                <li key={`source-${index}`}>{source}</li>
              ))}
            </ul>
          </Collapse.Item>
        </Collapse>
      )}
      {relatedEdges.length > 0 && (
        <div className={styles.reasoningInspectorField} data-testid='runtime-research-related-edges'>
          <Typography.Text className={styles.reasoningInspectorLabel}>
            {t('common.runtime.researchTrajectory.relatedConnections')}
          </Typography.Text>
          <ul className={styles.reasoningNarrativeList}>
            {relatedEdges.map((edge) => (
              <li key={edge.id}>{edge.label}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function unavailableCopy(availability: DomainDetailViewAvailability, t: RuntimeTranslate) {
  if (availability === 'invalid') {
    return {
      title: t('common.runtime.researchTrajectory.unsupportedTitle'),
      description: t('common.runtime.researchTrajectory.unsupportedDescription'),
      type: 'info' as const,
    };
  }
  if (availability === 'read_error') {
    return {
      title: t('common.runtime.researchTrajectory.loadFailedTitle'),
      description: t('common.runtime.researchTrajectory.loadFailedDescription'),
      type: 'error' as const,
    };
  }
  return {
    title: t('common.runtime.researchTrajectory.missingTitle'),
    description: t('common.runtime.researchTrajectory.missingDescription'),
    type: 'info' as const,
  };
}

const ScientificReasoningPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const translate = t as RuntimeTranslate;
  const navigate = useNavigate();
  const { itemId: routeItemId = '', viewId: routeViewId = '' } = useParams();
  const appStateQuery = useOplAppState('fast');
  const projectionRead = useMemo(
    () => readRuntimeWorkItemProjectionV2(appStateQuery.appState),
    [appStateQuery.appState]
  );
  const item = useMemo(
    () =>
      projectionRead.projection?.items.find(
        (candidate) => candidate.id === routeItemId || encodeURIComponent(candidate.id) === routeItemId
      ) ?? null,
    [projectionRead.projection, routeItemId]
  );
  const routeDescriptor = useMemo(
    () => item?.domainDetailViews.find((candidate) => candidate.viewId === routeViewId) ?? null,
    [item, routeViewId]
  );
  const descriptor = routeDescriptor && isScientificReasoningViewDescriptor(routeDescriptor) ? routeDescriptor : null;
  const [readVersion, setReadVersion] = useState(0);
  const [readState, setReadState] = useState<ReadState>({
    loading: false,
    error: null,
    availability: null,
    view: null,
  });
  const [mode, setMode] = useState<ResearchMapMode>('map');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const targetItemId = item?.id ?? routeItemId;
    if (
      !targetItemId ||
      routeViewId !== 'scientific-reasoning' ||
      appStateQuery.error ||
      (routeDescriptor !== null && descriptor === null)
    ) {
      setReadState({
        loading: false,
        error: routeDescriptor !== null && descriptor === null ? 'unsupported' : null,
        availability: null,
        view: null,
      });
      return;
    }
    const cacheKey = `${targetItemId}\u0000${routeViewId}`;
    const cached = readCachedView(cacheKey);
    const currentCached = cached && descriptor && matchesDescriptorIdentity(cached, descriptor) ? cached : null;
    setReadState({ loading: true, error: null, availability: null, view: currentCached });
    if (descriptor?.availability === 'invalid' || descriptor?.availability === 'read_error') {
      setReadState({ loading: false, error: null, availability: descriptor.availability, view: null });
      return;
    }

    let cancelled = false;
    void ipcBridge.oplRuntime.readDomainDetailView
      .invoke({
        itemId: targetItemId,
        viewId: routeViewId,
        ...(cached ? { ifRevision: cached.revision } : {}),
      })
      .then((result) => {
        if (cancelled) return;
        if (result.ok === false) {
          setReadState({ loading: false, error: 'load_failed', availability: null, view: currentCached });
          return;
        }
        const parsed = readScientificReasoningView(result.parsed, item?.workItemId);
        if (
          parsed.state !== 'ready' ||
          parsed.view.itemId !== targetItemId ||
          parsed.view.viewId !== routeViewId ||
          (descriptor !== null && parsed.view.payloadSchema !== descriptor.schemaVersion)
        ) {
          setReadState({ loading: false, error: 'unsupported', availability: null, view: null });
          return;
        }
        if (parsed.view.notModified) {
          const exactNotModified = cached && matchesReadIdentity(cached, parsed.view);
          setReadState(
            exactNotModified
              ? { loading: false, error: null, availability: parsed.view.availability, view: cached }
              : { loading: false, error: 'unsupported', availability: parsed.view.availability, view: null }
          );
          return;
        }
        if (descriptor && !isCurrentOrNewerThanDescriptor(parsed.view, descriptor)) {
          setReadState({
            loading: false,
            error: currentCached ? 'load_failed' : 'unsupported',
            availability: parsed.view.availability,
            view: currentCached,
          });
          return;
        }
        if (parsed.view.payload) {
          writeCachedView(cacheKey, parsed.view);
          setReadState({
            loading: false,
            error: null,
            availability: parsed.view.availability,
            view: parsed.view,
          });
          return;
        }
        const confirmedStaleCache =
          parsed.view.availability === 'stale' && cached && matchesReadIdentity(cached, parsed.view) ? cached : null;
        setReadState({
          loading: false,
          error: null,
          availability: parsed.view.availability,
          view: confirmedStaleCache,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setReadState({ loading: false, error: 'load_failed', availability: null, view: currentCached });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appStateQuery.error, descriptor, item, readVersion, routeDescriptor, routeItemId, routeViewId]);

  const refresh = useCallback(() => {
    void appStateQuery.load('fast', { showRefreshing: true }).finally(() => setReadVersion((value) => value + 1));
  }, [appStateQuery.load]);

  const activeView =
    readState.view &&
    readState.view.itemId === (item?.id ?? routeItemId) &&
    readState.view.viewId === routeViewId &&
    (descriptor === null || readState.view.payloadSchema === descriptor.schemaVersion)
      ? readState.view
      : null;
  const payload = activeView?.payload ?? null;
  const activeBranchNodeRefs = payload?.activeBranchNodeRefs ?? [];
  const currentFocusNodeId = payload?.currentFocus.nodeId ?? null;
  const visibleNodes = useMemo(() => {
    if (!payload) return [];
    if (mode === 'map') return payload.nodes;
    const activeBranchNodeIds = new Set(activeBranchNodeRefs);
    return payload.nodes.filter((node) => activeBranchNodeIds.has(node.id));
  }, [activeBranchNodeRefs, mode, payload]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => payload?.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) ?? [],
    [payload, visibleNodeIds]
  );

  useEffect(() => {
    if (mode === 'current_branch' && payload && activeBranchNodeRefs.length === 0) setMode('map');
  }, [activeBranchNodeRefs.length, mode, payload]);

  useEffect(() => {
    setSelectedNodeId(undefined);
  }, [routeItemId, routeViewId]);

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (current === null || (current !== undefined && visibleNodeIds.has(current))) return current;
      if (visibleNodes.length === 0) return undefined;
      return (
        (currentFocusNodeId && visibleNodeIds.has(currentFocusNodeId) ? currentFocusNodeId : visibleNodes[0]?.id) ??
        null
      );
    });
  }, [currentFocusNodeId, visibleNodeIds, visibleNodes]);

  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedNodeId(null);
    };
    window.addEventListener('keydown', clearSelection);
    return () => window.removeEventListener('keydown', clearSelection);
  }, []);

  const selectedNode = visibleNodes.find((node) => node.id === selectedNodeId) ?? null;
  const relatedEdges = useMemo(
    () =>
      selectedNode
        ? visibleEdges
            .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
            .map((edge) => ({ id: edge.id, label: edge.label }))
        : [],
    [selectedNode, visibleEdges]
  );
  const availability = readState.availability ?? activeView?.availability ?? descriptor?.availability ?? 'missing';
  const locale = i18n.resolvedLanguage ?? i18n.language;

  let content: React.ReactNode;
  if (appStateQuery.loading || readState.loading) {
    content = (
      <div className={styles.reasoningState} data-testid='runtime-research-map-loading'>
        <Spin tip={t('common.runtime.researchTrajectory.loading')} />
      </div>
    );
  } else if (appStateQuery.error) {
    content = (
      <StatePanel
        title={t('common.runtime.researchTrajectory.loadFailedTitle')}
        description={t('common.runtime.researchTrajectory.loadFailedDescription')}
        type='error'
        t={translate}
        onRefresh={refresh}
      />
    );
  } else if (readState.error === 'unsupported') {
    content = (
      <StatePanel
        title={t('common.runtime.researchTrajectory.unsupportedTitle')}
        description={t('common.runtime.researchTrajectory.unsupportedDescription')}
        t={translate}
        onRefresh={refresh}
      />
    );
  } else if (readState.error === 'load_failed' && !payload) {
    content = (
      <StatePanel
        title={t('common.runtime.researchTrajectory.loadFailedTitle')}
        description={t('common.runtime.researchTrajectory.loadFailedDescription')}
        type='error'
        t={translate}
        onRefresh={refresh}
      />
    );
  } else if (availability !== 'available' && availability !== 'stale') {
    const copy = unavailableCopy(availability, translate);
    content = <StatePanel {...copy} t={translate} onRefresh={refresh} />;
  } else if (!payload) {
    content = (
      <StatePanel
        title={t('common.runtime.researchTrajectory.emptyTitle')}
        description={t('common.runtime.researchTrajectory.emptyDescription')}
        t={translate}
        onRefresh={refresh}
      />
    );
  } else if (visibleNodes.length === 0) {
    content = (
      <>
        <StatePanel
          title={t('common.runtime.researchTrajectory.emptyTitle')}
          description={t('common.runtime.researchTrajectory.emptyDescription')}
          t={translate}
          onRefresh={refresh}
        />
      </>
    );
  } else {
    content = (
      <>
        {(availability === 'stale' || readState.error === 'load_failed') && (
          <Alert
            type='warning'
            showIcon
            title={t('common.runtime.researchTrajectory.staleTitle')}
            content={t('common.runtime.researchTrajectory.staleDescription')}
            data-testid='runtime-research-map-stale'
          />
        )}
        <div className={styles.reasoningWorkspace} data-testid='runtime-research-map-workspace'>
          <ScientificReasoningMap
            nodes={visibleNodes}
            edges={visibleEdges}
            currentFocusNodeId={currentFocusNodeId}
            selectedNodeId={selectedNodeId ?? null}
            t={translate}
            onSelectNode={setSelectedNodeId}
          />
          <ResearchObjectInspector node={selectedNode} relatedEdges={relatedEdges} t={translate} />
        </div>
      </>
    );
  }

  return (
    <main className={styles.reasoningPage} data-testid='runtime-research-map-page'>
      <header className={styles.reasoningHeader}>
        <div className={styles.reasoningHeaderTitle}>
          <Tooltip content={t('common.runtime.researchTrajectory.back')}>
            <Button
              type='text'
              icon={<Back theme='outline' />}
              aria-label={t('common.runtime.researchTrajectory.back')}
              onClick={() => void navigate('/runtime')}
            />
          </Tooltip>
          <div>
            <Typography.Title heading={4}>{t('common.runtime.researchTrajectory.title')}</Typography.Title>
            {item && <Typography.Text>{item.displayName}</Typography.Text>}
          </div>
        </div>
        <div className={styles.reasoningHeaderActions}>
          {payload && (
            <Radio.Group
              type='button'
              value={mode}
              onChange={(value) => setMode(value as ResearchMapMode)}
              data-testid='runtime-research-map-mode'
            >
              <Radio value='map'>{t('common.runtime.researchTrajectory.mapMode')}</Radio>
              <Radio value='current_branch' disabled={activeBranchNodeRefs.length === 0}>
                {t('common.runtime.researchTrajectory.currentBranchMode')}
              </Radio>
            </Radio.Group>
          )}
          <Tooltip content={t('common.runtime.researchTrajectory.refresh')}>
            <Button
              type='secondary'
              icon={<Refresh theme='outline' />}
              loading={appStateQuery.refreshing}
              aria-label={t('common.runtime.researchTrajectory.refresh')}
              onClick={refresh}
            />
          </Tooltip>
        </div>
      </header>
      {payload?.summary.updatedAt && (
        <Typography.Text className={styles.reasoningUpdated}>
          {t('common.runtime.researchTrajectory.updated')}:{' '}
          {formatTimestamp(payload.summary.updatedAt, locale, translate)}
        </Typography.Text>
      )}
      <div className={styles.reasoningContent}>{content}</div>
    </main>
  );
};

export default ScientificReasoningPage;
