/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Message, Space, Tag, Typography } from '@arco-design/web-react';
import { Play, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import {
  oplRecord,
  oplRecordList,
  oplString,
  useOplAppState,
} from '@/renderer/hooks/system/useOplAppState';

type RuntimeSnapshot = Record<string, unknown>;

function isRecord(value: unknown): value is RuntimeSnapshot {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): RuntimeSnapshot {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown): RuntimeSnapshot[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

const RUNTIME_VALUE_KEYS: Record<string, string> = {
  available: 'common.runtime.values.available',
  empty: 'common.runtime.values.empty',
  ready: 'common.runtime.values.ready',
  compatible: 'settings.oplEnvironmentPage.status.compatible',
  installed: 'settings.oplEnvironmentPage.status.installed',
  missing: 'settings.oplEnvironmentPage.status.missing',
  blocking: 'settings.oplEnvironmentPage.status.blocking',
  blocked: 'settings.oplEnvironmentPage.status.blocking',
  failed: 'settings.oplEnvironmentPage.status.failed',
  warning: 'settings.oplEnvironmentPage.status.warning',
  degraded: 'settings.oplEnvironmentPage.status.degraded',
  pending: 'settings.oplEnvironmentPage.status.pending',
  unknown: 'settings.oplEnvironmentPage.status.unknown',
  attention_required: 'common.runtime.values.attentionRequired',
  update: 'settings.oplEnvironmentPage.moduleActions.update',
  'provider-worker:temporal:restart': 'common.runtime.values.restartTemporalWorker',
};

function formatValue(value: unknown, t: (key: string) => string): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const text = stringValue(value);
  if (text) return RUNTIME_VALUE_KEYS[text] ? t(RUNTIME_VALUE_KEYS[text]) : text;
  return JSON.stringify(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickRecordFields(source: RuntimeSnapshot, keys: string[]): RuntimeSnapshot {
  const result: RuntimeSnapshot = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }
  return result;
}

function compactAction(action: RuntimeSnapshot): RuntimeSnapshot {
  return pickRecordFields(action, [
    'action_id',
    'action_kind',
    'owner',
    'execution_policy',
    'submit_via',
    'can_submit_to_safe_action_shell',
    'route_requires_domain_or_app_payload',
    'provider_worker_lifecycle_status',
    'provider_worker_required_next_action',
    'provider_worker_repair_command',
  ]);
}

function compactDrilldown(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  const attention = record(drilldown.attention_first_payload);
  const executionBridge = record(drilldown.app_execution_bridge);
  const actionRefs = record(drilldown.operator_action_routing_refs);
  return {
    ...pickRecordFields(drilldown, [
      'surface_kind',
      'projection_scope',
      'consumer',
      'availability',
      'projection_policy',
      'detail_level',
    ]),
    summary: pickRecordFields(record(drilldown.summary), [
      'stage_attempt_count',
      'current_control_state_count',
      'current_control_state_blocked_count',
      'current_control_state_accepted_typed_closeout_count',
      'safe_action_ref_count',
      'app_execution_bridge_safe_action_route_count',
      'evidence_envelope_open_count',
      'evidence_envelope_blocked_count',
      'typed_blocker_count',
    ]),
    attention_first_payload: {
      provider_health: pickRecordFields(record(attention.provider_health), [
        'provider_kind',
        'health_status',
        'cadence_window_status',
        'capability_slo_status',
        'expected_receipt_count',
        'observed_receipt_count',
        'missing_receipt_count',
        'blocked_repair_receipt_count',
      ]),
      next_safe_action: compactAction(record(attention.next_safe_action)),
      lazy_load_targets: recordList(attention.lazy_load_targets),
    },
    app_execution_bridge: {
      safe_action_routes: recordList(executionBridge.safe_action_routes).slice(0, 8).map(compactAction),
    },
    operator_action_routing_refs: {
      refs: recordList(actionRefs.refs).slice(0, 8).map(compactAction),
    },
  };
}

function parseDrilldown(stdout: string): RuntimeSnapshot | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const payload = record(parsed);
    const drilldown = record(payload.app_operator_drilldown);
    return Object.keys(drilldown).length > 0 ? compactDrilldown(drilldown) : null;
  } catch {
    return null;
  }
}

function parseBridgePayload(result: { parsed?: unknown; stdout?: string } | null | undefined): RuntimeSnapshot | null {
  if (isRecord(result?.parsed)) return result.parsed;
  if (typeof result?.stdout !== 'string') return null;
  try {
    return record(JSON.parse(result.stdout) as unknown);
  } catch {
    return null;
  }
}

function detailDigest(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  const attention = record(drilldown.attention_first_payload);
  return {
    detail_level: stringValue(drilldown.detail_level) ?? 'full',
    root_section_count: Object.keys(drilldown).length,
    lazy_load_target_count: recordList(attention.lazy_load_targets).length,
  };
}

function summaryEntries(
  drilldown: RuntimeSnapshot,
  t: (key: string, options?: Record<string, string | number>) => string
): Array<{ key: string; label: string; value: unknown }> {
  const summary = record(drilldown.summary);
  const attention = record(drilldown.attention_first_payload);
  const providerHealth = record(attention.provider_health);
  const nextAction = record(attention.next_safe_action);
  const safeActionCount =
    numberValue(summary.safe_action_ref_count) ?? numberValue(summary.app_execution_bridge_safe_action_route_count);
  return [
    {
      key: 'availability',
      label: t('common.runtime.summaryAvailability'),
      value: stringValue(drilldown.availability) ?? t('settings.oplEnvironmentPage.status.unknown'),
    },
    {
      key: 'provider',
      label: t('common.runtime.summaryProvider'),
      value: stringValue(providerHealth.health_status) ?? t('settings.oplEnvironmentPage.status.unknown'),
    },
    {
      key: 'stage_attempts',
      label: t('common.runtime.summaryStageAttempts'),
      value: numberValue(summary.stage_attempt_count) ?? 0,
    },
    {
      key: 'blocked',
      label: t('common.runtime.summaryBlocked'),
      value: numberValue(summary.current_control_state_blocked_count) ?? 0,
    },
    {
      key: 'safe_actions',
      label: t('common.runtime.summarySafeActions'),
      value: safeActionCount ?? 0,
    },
    {
      key: 'next_action',
      label: t('common.runtime.summaryNextAction'),
      value: stringValue(nextAction.action_id) ?? t('common.runtime.noSafeActions'),
    },
  ];
}

function collectSafeActions(drilldown: RuntimeSnapshot): RuntimeSnapshot[] {
  const attention = record(drilldown.attention_first_payload);
  const candidates = [
    record(attention.next_safe_action),
    ...recordList(record(drilldown.app_execution_bridge).safe_action_routes),
    ...recordList(record(drilldown.operator_action_routing_refs).refs),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const actionId = stringValue(candidate.action_id);
      if (!actionId || seen.has(actionId)) return false;
      const isSafe =
        candidate.can_submit_to_safe_action_shell === true ||
        candidate.execution_policy === 'opl_safe_action_shell' ||
        stringValue(candidate.submit_via) === 'opl app action execute' ||
        stringValue(candidate.submit_via) === 'opl runtime action execute';
      if (!isSafe) return false;
      seen.add(actionId);
      return true;
    })
    .slice(0, 8);
}

function appStateToRuntimeProjection(appState: RuntimeSnapshot): RuntimeSnapshot | null {
  if (Object.keys(appState).length === 0) return null;
  const operator = oplRecord(appState.operator);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const actions = [
    ...oplRecordList(appState.actions),
    ...oplRecordList(operator.actions),
    ...oplRecordList(oplRecord(operator.action_queue).items),
  ];
  const firstAction = actions[0] ?? {};
  return {
    availability:
      oplString(operator.availability) ??
      oplString(appState.availability) ??
      oplString(temporal.status) ??
      'available',
    summary: oplRecord(operator.summary),
    attention_first_payload: {
      provider_health: {
        provider_kind: 'temporal',
        health_status: oplString(temporal.status) ?? oplString(temporal.health_status) ?? 'unknown',
      },
      next_safe_action: compactAction(firstAction),
      lazy_load_targets: oplRecordList(operator.lazy_load_targets),
    },
    app_execution_bridge: {
      safe_action_routes: actions.map(compactAction),
    },
    operator_action_routing_refs: {
      refs: actions.map(compactAction),
    },
  };
}

const RuntimePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, contextHolder] = Message.useMessage();
  const appStateQuery = useOplAppState('fast');
  const [detailLoading, setDetailLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [fullDetailDigest, setFullDetailDigest] = useState<RuntimeSnapshot | null>(null);
  const [actionResult, setActionResult] = useState<RuntimeSnapshot | null>(null);
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const requestSeq = useRef({ full: 0 });

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const drilldown = useMemo(() => appStateToRuntimeProjection(appStateQuery.appState), [appStateQuery.appState]);
  const loading = appStateQuery.loading || appStateQuery.refreshing;
  const lastLoadedAt = appStateQuery.loadedAt;

  const refreshAppState = useCallback(
    async (showToast = false) => {
      const nextPayload = await appStateQuery.load('full', { showRefreshing: true });
      if (showToast) {
        if (nextPayload) {
          messageRef.current.success(tRef.current('common.refreshSuccess'));
        } else {
          messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      }
    },
    [appStateQuery.load]
  );

  const loadFullDrilldown = useCallback(async (options: { showToast?: boolean } = {}) => {
    requestSeq.current.full += 1;
    const requestId = requestSeq.current.full;
    setDetailLoading(true);
    try {
      const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'full' });
      if (requestSeq.current.full !== requestId) return;
      const parsed =
        parseDrilldown(result.stdout) ?? compactDrilldown(record(record(parseBridgePayload(result)).app_operator_drilldown));
      setFullDetailDigest(parsed ? detailDigest(parsed) : null);
      if (options.showToast) {
        messageRef.current.success(tRef.current('common.runtime.detailFullLoaded'));
      }
    } catch {
      if (options.showToast) {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    } finally {
      if (requestSeq.current.full === requestId) {
        setDetailLoading(false);
      }
    }
  }, []);

  const actions = useMemo(() => collectSafeActions(drilldown ?? {}), [drilldown]);
  const summary = useMemo(() => summaryEntries(drilldown ?? {}, t), [drilldown, t]);

  const dryRunAction = useCallback(async (actionId: string) => {
    setRunningActionId(actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId,
        dryRun: true,
      });
      setActionResult(parseBridgePayload(result) ?? {});
      messageRef.current.success(tRef.current('common.runtime.dryRunSuccess'));
    } catch {
      setActionResult({ stderr: tRef.current('settings.oplEnvironmentPage.messages.commandFailed') });
      messageRef.current.error(tRef.current('common.runtime.dryRunFailed'));
    } finally {
      setRunningActionId(null);
    }
  }, []);

  return (
    <div className='w-full h-full overflow-auto px-24px md:px-48px py-28px box-border'>
      {contextHolder}
      <div className='max-w-1080px mx-auto flex flex-col gap-16px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-end md:justify-between'>
          <div>
            <Typography.Title heading={4} className='mb-6px'>
              {t('common.runtime.title')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary'>{t('common.runtime.description')}</Typography.Text>
          </div>
          <div className='flex gap-8px'>
            <Button onClick={() => navigate('/settings/runtime')}>{t('common.runtime.settings')}</Button>
            <Button
              type='primary'
              icon={<UpdateRotation theme='outline' />}
              loading={loading}
              onClick={() => void refreshAppState(true)}
            >
              {t('common.refresh')}
            </Button>
            <Button
              icon={<UpdateRotation theme='outline' />}
              loading={detailLoading}
              onClick={() => void loadFullDrilldown({ showToast: true })}
            >
              {t('common.runtime.fullDetail')}
            </Button>
          </div>
        </div>

        <Card bordered className='rd-8px'>
          <div className='flex items-center justify-between gap-16px'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('common.runtime.drilldownStatus')}
              </Typography.Text>
              {lastLoadedAt && (
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('common.runtime.loadedAt', { time: lastLoadedAt })}
                </Typography.Text>
              )}
            </div>
            <Tag color={drilldown ? 'green' : 'orange'}>
              {loading
                ? drilldown
                  ? t('common.runtime.refreshing')
                  : t('common.loading')
                : drilldown
                  ? t('common.runtime.drilldownLoaded')
                  : t('common.runtime.drilldownUnavailable')}
            </Tag>
          </div>
        </Card>

        {drilldown ? (
          <>
            <Card bordered className='rd-8px'>
              <div className='flex flex-col gap-12px'>
                <Typography.Text className='font-600 text-t-primary'>{t('common.runtime.summary')}</Typography.Text>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
                  {summary.map((item) => (
                    <div key={item.key} className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                      <Typography.Text className='block text-12px text-t-secondary break-words'>
                        {item.label}
                      </Typography.Text>
                      <Typography.Text className='block font-600 text-t-primary break-words'>
                        {formatValue(item.value, t)}
                      </Typography.Text>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card bordered className='rd-8px'>
              <div className='flex flex-col gap-12px'>
                <Typography.Text className='font-600 text-t-primary'>{t('common.runtime.safeActions')}</Typography.Text>
                {actions.length > 0 ? (
                  <div className='flex flex-col divide-y divide-border-1'>
                    {actions.map((action) => {
                      const actionId = stringValue(action.action_id) ?? '';
                      return (
                        <div
                          key={actionId}
                          className='flex flex-col md:flex-row md:items-center md:justify-between gap-10px py-12px'
                        >
                          <div className='min-w-0'>
                            <Typography.Text className='block font-600 text-t-primary break-all'>
                              {actionId}
                            </Typography.Text>
                            <Space wrap size='mini' className='mt-6px'>
                              {stringValue(action.action_kind) && <Tag>{stringValue(action.action_kind)}</Tag>}
                              {stringValue(action.owner) && <Tag>{stringValue(action.owner)}</Tag>}
                              {action.route_requires_domain_or_app_payload === true && (
                                <Tag color='orange'>{t('common.runtime.payloadRequired')}</Tag>
                              )}
                            </Space>
                          </div>
                          <Button
                            icon={<Play theme='outline' />}
                            loading={runningActionId === actionId}
                            disabled={!actionId}
                            onClick={() => void dryRunAction(actionId)}
                          >
                            {t('common.runtime.dryRun')}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Alert type='info' content={t('common.runtime.noSafeActions')} />
                )}
              </div>
            </Card>

            {actionResult && (
              <Card bordered className='rd-8px'>
                <Typography.Text className='block font-600 text-t-primary mb-10px'>
                  {t('common.runtime.actionResult')}
                </Typography.Text>
                <pre className='m-0 max-h-360px overflow-auto text-12px leading-18px whitespace-pre-wrap break-words'>
                  {JSON.stringify(actionResult, null, 2)}
                </pre>
              </Card>
            )}

            {fullDetailDigest && (
              <Card bordered className='rd-8px'>
                <Typography.Text className='block font-600 text-t-primary mb-10px'>
                  {t('common.runtime.fullDetail')}
                </Typography.Text>
                <Alert type='info' content={t('common.runtime.fullDetailReady')} />
                <pre className='m-0 mt-12px max-h-180px overflow-auto text-12px leading-18px whitespace-pre-wrap break-words'>
                  {JSON.stringify(fullDetailDigest, null, 2)}
                </pre>
              </Card>
            )}
          </>
        ) : (
          <Alert type='info' content={t('common.runtime.drilldownUnavailableDescription')} />
        )}
      </div>
    </div>
  );
};

export default RuntimePage;
