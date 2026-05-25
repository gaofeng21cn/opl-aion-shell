/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty, Message, Spin, Tag } from '@arco-design/web-react';
import { ArrowRight, BranchOne, CheckOne, Info, Lightning, Refresh, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { normalizeRuntimeProjection } from './runtimeProjection';
import type { RuntimeGraphEdge, RuntimeGraphNode, RuntimeSafeActionRoute } from './types';
import './runtime.css';

function GraphPanel({
  title,
  nodes,
  edges,
  icon,
}: {
  title: string;
  nodes: RuntimeGraphNode[];
  edges?: RuntimeGraphEdge[];
  icon: React.ReactNode;
}) {
  return (
    <section className='runtime-card'>
      <div className='runtime-card__header'>
        <span className='runtime-card__icon'>{icon}</span>
        <h3>{title}</h3>
      </div>
      {nodes.length === 0 ? (
        <Empty className='py-20px' />
      ) : (
        <div className='runtime-node-list'>
          {nodes.map((node) => (
            <div key={node.id} className='runtime-node'>
              <div className='runtime-node__main'>
                <span>{node.label}</span>
                {node.state && <Tag size='small'>{node.state}</Tag>}
              </div>
              <div className='runtime-node__meta'>
                {node.owner && <span>{node.owner}</span>}
                {node.ref && <code>{node.ref}</code>}
              </div>
            </div>
          ))}
        </div>
      )}
      {edges && edges.length > 0 && (
        <div className='runtime-edge-list'>
          {edges.map((edge) => (
            <div key={`${edge.from}-${edge.to}-${edge.label ?? ''}`} className='runtime-edge'>
              <code>{edge.from}</code>
              <ArrowRight className='runtime-edge__arrow' size={14} />
              <code>{edge.to}</code>
              {edge.label && <Tag size='small'>{edge.label}</Tag>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionRouteList({
  routes,
  onRun,
  busyAction,
}: {
  routes: RuntimeSafeActionRoute[];
  onRun: (route: RuntimeSafeActionRoute, dryRun: boolean) => void;
  busyAction: string | null;
}) {
  const { t } = useTranslation();
  if (routes.length === 0) {
    return <Empty className='py-20px' />;
  }
  return (
    <div className='runtime-action-list'>
      {routes.map((route) => (
        <div key={route.id} className='runtime-action'>
          <div className='runtime-action__body'>
            <div className='runtime-action__title'>{route.label}</div>
            <div className='runtime-action__meta'>
              {route.owner && <span>{route.owner}</span>}
              {route.route && <code>{route.route}</code>}
            </div>
          </div>
          <div className='runtime-action__controls'>
            <Button
              size='small'
              loading={busyAction === `${route.id}:dry`}
              onClick={() => onRun(route, true)}
            >
              {t('settings.runtime.actions.dryRun')}
            </Button>
            <Button
              size='small'
              type='primary'
              loading={busyAction === `${route.id}:execute`}
              onClick={() => onRun(route, false)}
            >
              {t('settings.runtime.actions.execute')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

const RuntimeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [summaryResult, setSummaryResult] = useState<IOplRuntimeCommandResult | null>(null);
  const [fullResult, setFullResult] = useState<IOplRuntimeCommandResult | null>(null);
  const [actionResult, setActionResult] = useState<IOplRuntimeCommandResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = useMemo(
    () => normalizeRuntimeProjection(fullResult?.parsed ?? summaryResult?.parsed ?? {}),
    [fullResult, summaryResult]
  );

  const refreshSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'summary' });
      setSummaryResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFull = useCallback(async () => {
    setFullLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'full' });
      setFullResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFullLoading(false);
    }
  }, []);

  const runAction = useCallback(async (route: RuntimeSafeActionRoute, dryRun: boolean) => {
    setBusyAction(`${route.id}:${dryRun ? 'dry' : 'execute'}`);
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: route.id,
        dryRun,
        payloadRefsOnlyJson: route.payloadRefsOnlyJson,
      });
      setActionResult(result);
      Message.success(
        dryRun
          ? t('settings.runtime.actions.dryRunComplete')
          : t('settings.runtime.actions.executeComplete')
      );
      if (!dryRun) {
        void refreshSummary();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      Message.error(message);
    } finally {
      setBusyAction(null);
    }
  }, [refreshSummary, t]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  return (
    <SettingsPageWrapper contentClassName='max-w-1280px'>
      <div className='runtime-workbench'>
        <header className='runtime-header'>
          <div>
            <h2>{t('settings.runtime.title')}</h2>
            <p>{t('settings.runtime.description')}</p>
          </div>
          <div className='runtime-header__actions'>
            <Button icon={<Refresh />} loading={loading} onClick={() => void refreshSummary()}>
              {t('common.refresh')}
            </Button>
            <Button type='primary' loading={fullLoading} onClick={() => void loadFull()}>
              {t('settings.runtime.actions.loadFull')}
            </Button>
          </div>
        </header>

        {error && <div className='runtime-error'>{error}</div>}

        <Spin loading={loading && !summaryResult}>
          <section className='runtime-summary'>
            <div>
              <span>{t('settings.runtime.sourceSurface')}</span>
              <strong>{model.sourceSurface}</strong>
            </div>
            <div>
              <span>{t('settings.runtime.state')}</span>
              <strong>{model.state}</strong>
            </div>
            {model.summary.slice(0, 6).map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </section>

          <div className='runtime-grid runtime-grid--graphs'>
            <GraphPanel
              title={t('settings.runtime.stageGraph')}
              nodes={model.stageGraph.nodes}
              edges={model.stageGraph.edges}
              icon={<BranchOne />}
            />
            <GraphPanel
              title={t('settings.runtime.routeGraph')}
              nodes={model.routeGraph.nodes}
              edges={model.routeGraph.edges}
              icon={<BranchOne />}
            />
            <GraphPanel
              title={t('settings.runtime.decisionMap')}
              nodes={model.decisionMap}
              icon={<Lightning />}
            />
          </div>

          <div className='runtime-grid'>
            <section className='runtime-card'>
              <div className='runtime-card__header'>
                <span className='runtime-card__icon'>
                  <Right />
                </span>
                <h3>{t('settings.runtime.timeline')}</h3>
              </div>
              {model.timeline.length === 0 ? (
                <Empty className='py-20px' />
              ) : (
                <div className='runtime-node-list'>
                  {model.timeline.map((item) => (
                    <div key={item.id} className='runtime-node'>
                      <div className='runtime-node__main'>
                        <span>{item.label}</span>
                        {item.state && <Tag size='small'>{item.state}</Tag>}
                      </div>
                      <div className='runtime-node__meta'>
                        {item.timestamp && <span>{item.timestamp}</span>}
                        {item.ref && <code>{item.ref}</code>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <GraphPanel
              title={t('settings.runtime.paperLensRefs')}
              nodes={model.researchPaperLensRefs}
              icon={<Info />}
            />
          </div>

          <div className='runtime-grid'>
            <section className='runtime-card'>
              <div className='runtime-card__header'>
                <span className='runtime-card__icon'>
                  <CheckOne />
                </span>
                <h3>{t('settings.runtime.safeActions')}</h3>
              </div>
              <ActionRouteList routes={model.safeActionRoutes} onRun={runAction} busyAction={busyAction} />
            </section>

            <section className='runtime-card'>
              <div className='runtime-card__header'>
                <span className='runtime-card__icon'>
                  <CheckOne />
                </span>
                <h3>{t('settings.runtime.ownerBoundary')}</h3>
              </div>
              {model.ownerBoundary.length === 0 ? (
                <Empty className='py-20px' />
              ) : (
                <div className='runtime-ref-list'>
                  {model.ownerBoundary.map((entry) => (
                    <code key={entry}>{entry}</code>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className='runtime-card'>
            <div className='runtime-card__header'>
              <span className='runtime-card__icon'>
                <Info />
              </span>
              <h3>{t('settings.runtime.refs')}</h3>
            </div>
            {model.refs.length === 0 ? (
              <Empty className='py-20px' />
            ) : (
              <div className='runtime-ref-list'>
                {model.refs.map((ref) => (
                  <code key={`${ref.id}-${ref.ref ?? ''}`}>{ref.ref ?? ref.label}</code>
                ))}
              </div>
            )}
          </section>

          {actionResult && (
            <section className='runtime-card'>
              <div className='runtime-card__header'>
                <h3>{t('settings.runtime.actionResult')}</h3>
              </div>
              <pre className='runtime-json-preview'>{JSON.stringify(actionResult.parsed, null, 2)}</pre>
            </section>
          )}
        </Spin>
      </div>
    </SettingsPageWrapper>
  );
};

export default RuntimeSettings;
