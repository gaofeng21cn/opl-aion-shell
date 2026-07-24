import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DomainDetailViewPage from '@/renderer/pages/runtime/DomainDetailViewPage';
import ScientificReasoningPage, {
  __scientificReasoningPageTest,
  resetScientificReasoningCacheForTest,
} from '@/renderer/pages/runtime/ScientificReasoningPage';
import { readScientificReasoningView } from '@/renderer/pages/runtime/scientificReasoning';
import { createRuntimeV2AppState, createScientificReasoningViewResponse } from './fixture';

const bridgeMocks = vi.hoisted(() => ({ readDomainDetailView: vi.fn() }));
const appStateMocks = vi.hoisted(() => ({
  appState: {} as Record<string, unknown>,
  error: null as string | null,
  load: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      readDomainDetailView: { invoke: bridgeMocks.readDomainDetailView },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({
    appState: appStateMocks.appState,
    payload: null,
    loadedAt: null,
    loading: false,
    refreshing: false,
    error: appStateMocks.error,
    load: appStateMocks.load,
  }),
}));

vi.mock('@/renderer/pages/runtime/components/ScientificReasoningMap', () => ({
  ScientificReasoningMap: ({
    nodes,
    edges,
    onSelectNode,
  }: {
    nodes: Array<{ id: string; label: string; summary: string }>;
    edges: Array<{ id: string; label: string }>;
    onSelectNode: (nodeId: string) => void;
  }) => (
    <div data-testid='runtime-research-map-canvas'>
      {nodes.map((node) => (
        <button type='button' key={node.id} onClick={() => onSelectNode(node.id)}>
          {node.label} {node.summary}
        </button>
      ))}
      {edges.map((edge) => (
        <span key={edge.id}>{edge.label}</span>
      ))}
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const labels: Record<string, string> = {
      'common.runtime.researchTrajectory.title': '科研路线',
      'common.runtime.researchTrajectory.back': '返回运行总览',
      'common.runtime.researchTrajectory.loading': '正在读取科研路线...',
      'common.runtime.researchTrajectory.refresh': '刷新科研路线',
      'common.runtime.researchTrajectory.updated': '更新时间',
      'common.runtime.researchTrajectory.mapMode': '全部研究路线',
      'common.runtime.researchTrajectory.currentBranchMode': '当前路线',
      'common.runtime.researchTrajectory.details': '研究对象详情',
      'common.runtime.researchTrajectory.selectPrompt': '请选择一个研究对象查看详情。',
      'common.runtime.researchTrajectory.researchQuestion': '研究问题',
      'common.runtime.researchTrajectory.currentHypothesis': '当前主要假设',
      'common.runtime.researchTrajectory.validationMethod': '验证方法',
      'common.runtime.researchTrajectory.mainFindings': '主要发现',
      'common.runtime.researchTrajectory.evidenceJudgment': '证据判断',
      'common.runtime.researchTrajectory.routeAdjustment': '路线调整',
      'common.runtime.researchTrajectory.nextResearchStep': '下一研究步骤',
      'common.runtime.researchTrajectory.limitations': '研究局限',
      'common.runtime.researchTrajectory.sourcesAndBasis': '来源与依据',
      'common.runtime.researchTrajectory.relatedConnections': '相关科研路线',
      'common.runtime.researchTrajectory.staleTitle': '当前显示上一次科研路线',
      'common.runtime.researchTrajectory.staleDescription': '最新研究进展仍在同步。',
      'common.runtime.researchTrajectory.loadFailedTitle': '科研路线读取失败',
      'common.runtime.researchTrajectory.loadFailedDescription': '请刷新当前研究记录后重试。',
      'common.runtime.researchTrajectory.unsupportedTitle': '当前版本暂不能展示这条科研路线',
      'common.runtime.researchTrajectory.unsupportedDescription': '请更新应用后再查看这条科研路线。',
      'common.runtime.researchTrajectory.missingTitle': '科研路线记录尚不可用',
      'common.runtime.researchTrajectory.missingDescription': '尚未读取到本次研究的科研路线记录。',
      'common.runtime.researchTrajectory.emptyTitle': '科研路线正在形成',
      'common.runtime.researchTrajectory.emptyDescription': '尚无可展示的研究对象。',
      'common.runtime.domainDetailView.loadFailedTitle': '任务详情读取失败',
      'common.runtime.domainDetailView.loadFailedDescription': '请刷新运行状态后重试。',
      'common.runtime.domainDetailView.missingTitle': '任务详情暂不可用',
      'common.runtime.domainDetailView.missingDescription': '该任务尚未提供所请求的详情视图。',
      'common.runtime.domainDetailView.refresh': '刷新任务详情',
    };
    return {
      t: (key: string) => labels[key] ?? key,
      i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' },
    };
  },
}));

function renderRoute(element: React.ReactNode = <ScientificReasoningPage />) {
  return render(
    <MemoryRouter initialEntries={['/runtime/item/diabetes%3A001/insights/scientific-reasoning']}>
      <Routes>
        <Route path='/runtime/item/:itemId/insights/:viewId' element={element} />
      </Routes>
    </MemoryRouter>
  );
}

function removeDescriptor(): void {
  const state = createRuntimeV2AppState();
  state.app_state.operator.workbench.work_item_projection_v2.items[0]!.domain_detail_views = [];
  appStateMocks.appState = state;
}

describe('ScientificReasoningPage', () => {
  beforeEach(() => {
    resetScientificReasoningCacheForTest();
    appStateMocks.appState = createRuntimeV2AppState();
    appStateMocks.error = null;
    appStateMocks.load.mockReset();
    appStateMocks.load.mockResolvedValue(appStateMocks.appState);
    bridgeMocks.readDomainDetailView.mockReset();
    bridgeMocks.readDomainDetailView.mockResolvedValue({
      ok: true,
      parsed: createScientificReasoningViewResponse(),
    });
  });

  it('renders exact MAS medical prose and complete edge labels without machine bindings', async () => {
    renderRoute();

    const canvas = await screen.findByTestId('runtime-research-map-canvas');
    expect(canvas).toHaveTextContent('提出主要研究假设');
    expect(canvas).toHaveTextContent('执行预设验证');
    expect(canvas).toHaveTextContent('形成阶段性证据判断');
    expect(canvas).toHaveTextContent('评估替代分析路线');
    expect(canvas).toHaveTextContent('按预设方案验证');
    expect(canvas).toHaveTextContent('形成阶段性支持');

    fireEvent.click(screen.getByRole('radio', { name: '当前路线' }));
    await waitFor(() => expect(canvas).not.toHaveTextContent('评估替代分析路线'));
    fireEvent.click(screen.getByRole('radio', { name: '全部研究路线' }));
    await waitFor(() => expect(canvas).toHaveTextContent('评估替代分析路线'));

    const inspector = await screen.findByTestId('runtime-research-map-inspector');
    await waitFor(() => expect(inspector).toHaveTextContent('现有结果是否足以支持继续推进该研究路线？'));
    expect(inspector).toHaveTextContent('证据判断');
    expect(inspector).toHaveTextContent('来源与依据');

    fireEvent.click(within(canvas).getByRole('button', { name: /提出主要研究假设/ }));
    await waitFor(() => expect(inspector).toHaveTextContent('炎症负荷能否识别心血管死亡高风险人群？'));
    expect(screen.getByTestId('runtime-research-related-edges')).toHaveTextContent('按预设方案验证');
    expect(screen.getByTestId('runtime-research-related-edges')).toHaveTextContent('曾评估替代分析路线');

    const machineValues = [
      'mas-study:',
      'mas-source:',
      'machine_only_reason',
      'machine_only_envelope_reason',
      'sha256:',
      'attempt_id',
      'provider',
      'payload',
    ];
    const accessibleNames = Array.from(document.querySelectorAll<HTMLElement>('[aria-label], [title]'))
      .flatMap((element) => [element.getAttribute('aria-label'), element.getAttribute('title')])
      .filter((value): value is string => value !== null)
      .join('\n');
    for (const machineValue of machineValues) {
      expect(document.body).not.toHaveTextContent(machineValue);
      expect(accessibleNames).not.toContain(machineValue);
    }
  });

  it('renders the v1 compatibility snapshot without adding a second semantic layer', async () => {
    const state = createRuntimeV2AppState();
    state.app_state.operator.workbench.work_item_projection_v2.items[0]!.domain_detail_views[0]!.schema_version =
      'scientific-reasoning-map.v1';
    appStateMocks.appState = state;
    bridgeMocks.readDomainDetailView.mockResolvedValue({
      ok: true,
      parsed: createScientificReasoningViewResponse({ schemaVersion: 'scientific-reasoning-map.v1' }),
    });

    renderRoute();

    expect(await screen.findByTestId('runtime-research-map-canvas')).toHaveTextContent('形成阶段性证据判断');
    expect(screen.queryByText(/阶段性研究记录|accepted|rejected/i)).not.toBeInTheDocument();
  });

  it('retains a cached view only after an exact revision-based not-modified response', async () => {
    const first = renderRoute();
    expect(await screen.findByTestId('runtime-research-map-canvas')).toHaveTextContent('形成阶段性证据判断');
    await waitFor(() => expect(bridgeMocks.readDomainDetailView).toHaveBeenCalledTimes(1));
    first.unmount();

    bridgeMocks.readDomainDetailView.mockResolvedValue({
      ok: true,
      parsed: createScientificReasoningViewResponse({ notModified: true }),
    });
    renderRoute();

    expect(await screen.findByTestId('runtime-research-map-canvas')).toHaveTextContent('形成阶段性证据判断');
    await waitFor(() =>
      expect(bridgeMocks.readDomainDetailView).toHaveBeenLastCalledWith({
        itemId: 'diabetes:001',
        viewId: 'scientific-reasoning',
        ifRevision: 7,
      })
    );
  });

  it('does not show a cache ahead of the descriptor until lazy read confirms it', async () => {
    const first = renderRoute();
    expect(await screen.findByTestId('runtime-research-map-canvas')).toBeInTheDocument();
    first.unmount();

    const nextState = createRuntimeV2AppState();
    const descriptor = nextState.app_state.operator.workbench.work_item_projection_v2.items[0]!.domain_detail_views[0]!;
    descriptor.revision = 6;
    delete descriptor.digest;
    appStateMocks.appState = nextState;
    let resolveRead: ((value: unknown) => void) | null = null;
    bridgeMocks.readDomainDetailView.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );

    renderRoute();
    expect(await screen.findByTestId('runtime-research-map-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-research-map-canvas')).not.toBeInTheDocument();
    resolveRead?.({ ok: true, parsed: createScientificReasoningViewResponse({ notModified: true }) });

    expect(await screen.findByTestId('runtime-research-map-canvas')).toHaveTextContent('形成阶段性证据判断');
  });

  it('uses lazy availability ahead of a stale fast descriptor', async () => {
    const state = createRuntimeV2AppState();
    state.app_state.operator.workbench.work_item_projection_v2.items[0]!.domain_detail_views[0]!.availability = 'stale';
    appStateMocks.appState = state;

    renderRoute();

    expect(await screen.findByTestId('runtime-research-map-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-research-map-stale')).not.toBeInTheDocument();
  });

  it('shows a confirmed cached view with a stale warning when lazy read reports the same revision stale', async () => {
    const first = renderRoute();
    expect(await screen.findByTestId('runtime-research-map-canvas')).toBeInTheDocument();
    first.unmount();

    const stale = createScientificReasoningViewResponse({ notModified: true });
    stale.availability = 'stale';
    stale.not_modified = false;
    bridgeMocks.readDomainDetailView.mockResolvedValue({ ok: true, parsed: stale });
    renderRoute();

    expect(await screen.findByTestId('runtime-research-map-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-research-map-stale')).toHaveTextContent('当前显示上一次科研路线');
  });

  it('uses the generic missing state without guessing a renderer when the descriptor is absent', async () => {
    removeDescriptor();
    const first = renderRoute(<DomainDetailViewPage />);
    expect(await screen.findByTestId('runtime-domain-detail-view-state')).toHaveTextContent('任务详情暂不可用');
    expect(screen.queryByTestId('runtime-research-map-canvas')).not.toBeInTheDocument();
    expect(bridgeMocks.readDomainDetailView).not.toHaveBeenCalled();
    first.unmount();

    resetScientificReasoningCacheForTest();
    const state = createRuntimeV2AppState();
    state.app_state.operator.workbench.work_item_projection_v2.items[0]!.domain_detail_views[0]!.availability =
      'missing';
    appStateMocks.appState = state;
    bridgeMocks.readDomainDetailView.mockClear();
    renderRoute();
    expect(await screen.findByTestId('runtime-research-map-canvas')).toBeInTheDocument();
    expect(bridgeMocks.readDomainDetailView).toHaveBeenCalledTimes(1);
  });

  it('renders lazy missing as transport state without treating it as a scientific conclusion', async () => {
    removeDescriptor();
    const missing = createScientificReasoningViewResponse({ notModified: true });
    missing.availability = 'missing';
    missing.revision = 0;
    missing.generation = 0;
    missing.not_modified = false;
    delete missing.digest;
    bridgeMocks.readDomainDetailView.mockResolvedValue({ ok: true, parsed: missing });

    renderRoute();

    expect(await screen.findByTestId('runtime-research-map-state')).toHaveTextContent('科研路线记录尚不可用');
    expect(screen.queryByText(/假设失败|结论不成立/)).not.toBeInTheDocument();
  });

  it('distinguishes App-state failure in the real route wrapper and never starts lazy read', async () => {
    appStateMocks.appState = createRuntimeV2AppState();
    appStateMocks.error = 'app state unavailable';

    renderRoute(<DomainDetailViewPage />);

    expect(await screen.findByTestId('runtime-domain-detail-view-state')).toHaveTextContent('任务详情读取失败');
    expect(screen.getByTestId('runtime-domain-detail-view-state')).not.toHaveTextContent('任务详情暂不可用');
    expect(bridgeMocks.readDomainDetailView).not.toHaveBeenCalled();
  });

  it('keeps an explicit Escape selection clear instead of automatically selecting the focus again', async () => {
    renderRoute();
    const canvas = await screen.findByTestId('runtime-research-map-canvas');
    const inspector = screen.getByTestId('runtime-research-map-inspector');
    await waitFor(() => expect(inspector).toHaveTextContent('现有结果是否足以支持继续推进该研究路线？'));

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(inspector).toHaveTextContent('请选择一个研究对象查看详情。'));
    fireEvent.click(screen.getByRole('radio', { name: '当前路线' }));
    expect(canvas).toBeInTheDocument();
    expect(inspector).toHaveTextContent('请选择一个研究对象查看详情。');
  });

  it('preserves MAS-authored line breaks and intentional spacing in the inspector', async () => {
    const response = createScientificReasoningViewResponse();
    if (!response.payload) throw new Error('fixture payload is required');
    const currentNode = response.payload.nodes.find((node) => node.id === 'finding-1');
    if (!currentNode) throw new Error('fixture current node is required');
    const exactJudgment = '  当前证据支持继续验证。\n尚不足以形成因果结论。  ';
    currentNode.details.evidence_judgment = exactJudgment;
    bridgeMocks.readDomainDetailView.mockResolvedValue({ ok: true, parsed: response });

    renderRoute();

    const inspector = await screen.findByTestId('runtime-research-map-inspector');
    const exactElement = await waitFor(() => {
      const element = Array.from(inspector.querySelectorAll<HTMLElement>('*')).find(
        (candidate) => candidate.textContent === exactJudgment
      );
      expect(element).toBeDefined();
      return element;
    });
    expect(exactElement?.textContent).toBe(exactJudgment);
  });

  it('implements a true 32-entry LRU cache', () => {
    const parsed = readScientificReasoningView(createScientificReasoningViewResponse());
    if (parsed.state !== 'ready') throw new Error('fixture must parse');
    for (let index = 0; index < 32; index += 1) {
      __scientificReasoningPageTest.writeCachedView(`key-${index}`, {
        ...parsed.view,
        itemId: `item-${index}`,
        revision: index + 1,
      });
    }
    expect(__scientificReasoningPageTest.readCachedView('key-0')).not.toBeNull();
    __scientificReasoningPageTest.writeCachedView('key-32', {
      ...parsed.view,
      itemId: 'item-32',
      revision: 33,
    });

    expect(__scientificReasoningPageTest.cacheKeys()).toHaveLength(32);
    expect(__scientificReasoningPageTest.cacheKeys()).toContain('key-0');
    expect(__scientificReasoningPageTest.cacheKeys()).not.toContain('key-1');
    expect(__scientificReasoningPageTest.cacheKeys().at(-1)).toBe('key-32');
  });
});
