import React, { useMemo, useState } from 'react';
import { Button, Empty, Message, Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import { useTranslation } from 'react-i18next';
import type { RuntimeTrayJsonRecord } from './types';

type RuntimeTranslator = ReturnType<typeof useTranslation>['t'];
type AttemptOperationKind = 'human_gate' | 'resume' | 'dead_letter_repair';
type AttemptOperation = {
  kind: AttemptOperationKind;
  label: string;
  args: string[];
};
type AttemptFilter = 'all' | 'active' | 'human_gate' | 'dead_letter';
type AttemptFeedback = {
  tone: 'pending' | 'success' | 'error';
  message: string;
};
type AttemptItem = {
  id: string;
  title: string;
  status: string;
  details: Array<{ label: string; value: string }>;
  operations: AttemptOperation[];
};
type StageAttemptIdentity = {
  displayId: string;
  signalId: string | null;
};

const isRecord = (value: unknown): value is RuntimeTrayJsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecordArray = (value: unknown): RuntimeTrayJsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const isStageAttemptWorkbench = (value: unknown): value is RuntimeTrayJsonRecord =>
  isRecord(value) && value.surface_kind === 'opl_stage_attempt_workbench' && Array.isArray(value.attempts);

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const nestedRecord = (record: RuntimeTrayJsonRecord, key: string): RuntimeTrayJsonRecord | null => {
  const value = record[key];
  return isRecord(value) ? value : null;
};

const textList = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  return value
    .map(asString)
    .filter((entry): entry is string => Boolean(entry))
    .join(', ');
};

const recordSummary = (value: RuntimeTrayJsonRecord): string => {
  const parts = [
    field('ref', value.ref, value.receipt_ref, value.source_ref),
    field('id', value.id, value.memory_id, value.writeback_id, value.route_id),
    field('status', value.status, value.decision, value.outcome),
    field('reason', value.reason, value.blocked_reason),
    field('next', value.next_owner),
    field('summary', value.summary),
  ];
  return parts
    .filter((part): part is { label: string; value: string } => Boolean(part))
    .map((part) => `${part.label}=${part.value}`)
    .join('; ');
};

const displayText = (value: unknown): string => {
  const scalar = asString(value);
  if (scalar) return scalar;
  if (Array.isArray(value)) {
    return value
      .map((entry) => (isRecord(entry) ? recordSummary(entry) : asString(entry)))
      .filter((entry): entry is string => Boolean(entry))
      .join(', ');
  }
  if (isRecord(value)) return recordSummary(value);
  return '';
};

const field = (label: string, ...values: unknown[]): { label: string; value: string } | null => {
  for (const value of values) {
    const text = displayText(value);
    if (text) return { label, value: text };
  }
  return null;
};

const compact = <T,>(items: Array<T | null | undefined>): T[] => items.filter((item): item is T => Boolean(item));

const statusColor = (status: string): string => {
  if (['completed', 'available'].includes(status)) return 'green';
  if (['failed', 'dead_lettered', 'unavailable'].includes(status)) return 'red';
  if (['human_gate', 'blocked'].includes(status)) return 'orangered';
  if (['running', 'checkpointed'].includes(status)) return 'blue';
  return 'gray';
};

const attemptMatchesFilter = (attempt: AttemptItem, filter: AttemptFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'human_gate') return attempt.status === 'human_gate' || attempt.status === 'blocked';
  if (filter === 'dead_letter') return attempt.status === 'dead_lettered';
  return !['completed', 'dead_lettered'].includes(attempt.status);
};

const signalArgs = (
  stageAttemptId: string,
  signalKind: 'human_gate' | 'resume' | 'user_instruction',
  payload: RuntimeTrayJsonRecord
): string[] => [
  'family-runtime',
  'attempt',
  'signal',
  stageAttemptId,
  '--kind',
  signalKind,
  '--payload',
  JSON.stringify(payload),
  '--source',
  'opl-aion-shell',
];

const attemptOperations = (
  attempt: RuntimeTrayJsonRecord,
  status: string,
  stageAttemptId: string | null,
  t: RuntimeTranslator
): AttemptOperation[] => {
  if (!stageAttemptId) return [];
  const operations: AttemptOperation[] = [];
  if (!['completed', 'dead_lettered', 'human_gate'].includes(status)) {
    operations.push({
      kind: 'human_gate',
      label: t('common.runtimeTray.attemptWorkbench.signalHumanGate'),
      args: signalArgs(stageAttemptId, 'human_gate', {
        human_gate_ref: `opl-aion-shell:human_gate:${stageAttemptId}`,
        reason: 'operator_human_gate_requested',
      }),
    });
  }
  if (['human_gate', 'blocked', 'failed'].includes(status)) {
    operations.push({
      kind: 'resume',
      label: t('common.runtimeTray.attemptWorkbench.signalResume'),
      args: signalArgs(stageAttemptId, 'resume', {
        reason: 'operator_resume_requested',
      }),
    });
  }
  if (status === 'dead_lettered') {
    operations.push({
      kind: 'dead_letter_repair',
      label: t('common.runtimeTray.attemptWorkbench.signalDeadLetterRepair'),
      args: signalArgs(stageAttemptId, 'user_instruction', {
        instruction_kind: 'dead_letter_repair',
        reason: 'operator_dead_letter_repair_requested',
      }),
    });
  }
  return operations;
};

const stageAttemptIdentity = (attempt: RuntimeTrayJsonRecord, index: number): StageAttemptIdentity => {
  const stageAttemptId = asString(attempt.stage_attempt_id);
  if (stageAttemptId) {
    return { displayId: stageAttemptId, signalId: stageAttemptId };
  }
  return { displayId: `attempt-${index}`, signalId: null };
};

const attemptItems = (workbench: RuntimeTrayJsonRecord, t: RuntimeTranslator): AttemptItem[] =>
  asRecordArray(workbench.attempts).map((attempt, index) => {
    const completion = nestedRecord(attempt, 'completion_boundary');
    const heartbeat = nestedRecord(attempt, 'heartbeat');
    const status = asString(attempt.local_status) ?? asString(attempt.workflow_status) ?? 'unknown';
    const closeoutStatus = asString(attempt.closeout_receipt_status);
    const domainReadyVerdict = asString(completion?.domain_ready_verdict);
    const identity = stageAttemptIdentity(attempt, index);
    return {
      id: identity.displayId,
      title:
        [asString(attempt.domain_id), asString(attempt.stage_id), asString(attempt.provider_kind)]
          .filter((value): value is string => Boolean(value))
          .join(' / ') || t('common.runtimeTray.attemptWorkbench.attempt'),
      status,
      details: compact([
        field(t('common.runtimeTray.attemptWorkbench.providerCompletion'), completion?.provider_completion),
        field(t('common.runtimeTray.attemptWorkbench.domainReadyVerdict'), domainReadyVerdict),
        field(t('common.runtimeTray.attemptWorkbench.closeoutReceipt'), closeoutStatus),
        field(t('common.runtimeTray.attemptWorkbench.nextOwner'), attempt.next_owner),
        field(
          t('common.runtimeTray.attemptWorkbench.heartbeat'),
          heartbeat?.last_heartbeat_at,
          heartbeat?.last_updated_at
        ),
        field(t('common.runtimeTray.attemptWorkbench.checkpoints'), textList(attempt.checkpoint_refs)),
        field(t('common.runtimeTray.attemptWorkbench.closeoutRefs'), textList(attempt.closeout_refs)),
        field(
          t('common.runtimeTray.attemptWorkbench.consumedRefs'),
          attempt.consumed_refs,
          attempt.consumed_memory_refs,
          attempt.consumed_knowledge_refs
        ),
        field(
          t('common.runtimeTray.attemptWorkbench.rejectedWrites'),
          attempt.rejected_writes,
          attempt.rejected_writeback_refs,
          attempt.rejected_write_refs
        ),
        field(t('common.runtimeTray.attemptWorkbench.routeImpact'), attempt.route_impact, attempt.route_impact_refs),
        field(t('common.runtimeTray.attemptWorkbench.humanGate'), textList(attempt.human_gate_refs)),
        field(t('common.runtimeTray.attemptWorkbench.resume'), attempt.resume_refs, attempt.resume_token_ref),
        field(t('common.runtimeTray.attemptWorkbench.deadLetter'), attempt.dead_letter),
      ]),
      operations: attemptOperations(attempt, status, identity.signalId, t),
    };
  });

const RuntimeAttemptWorkbench: React.FC<{ workbench: RuntimeTrayJsonRecord | null | undefined }> = ({ workbench }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AttemptFilter>('all');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [feedbackByAttempt, setFeedbackByAttempt] = useState<Record<string, AttemptFeedback>>({});
  const projection = isStageAttemptWorkbench(workbench) ? workbench : null;
  const attempts = useMemo(() => (projection ? attemptItems(projection, t) : []), [projection, t]);
  const filteredAttempts = useMemo(
    () => attempts.filter((attempt) => attemptMatchesFilter(attempt, filter)),
    [attempts, filter]
  );
  const selectedAttempt = attempts.find((attempt) => attempt.id === selectedAttemptId) ?? null;
  const availability = asString(projection?.availability) ?? 'missing';
  const summary = isRecord(projection?.summary) ? projection.summary : null;
  if (!projection) return null;
  const runAttemptOperation = (attempt: AttemptItem, operation: AttemptOperation) => {
    setFeedbackByAttempt((feedback) => ({
      ...feedback,
      [attempt.id]: {
        tone: 'pending',
        message: t('common.runtimeTray.attemptWorkbench.feedbackPending', {
          attempt: attempt.id,
          operation: operation.label,
        }),
      },
    }));
    void ipcBridge.shell.runOplCommand
      .invoke({ args: operation.args })
      .then((result) => {
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || result.stdout || t('common.runtimeTray.attemptWorkbench.signalFailed'));
        }
        setFeedbackByAttempt((feedback) => ({
          ...feedback,
          [attempt.id]: {
            tone: 'success',
            message: t('common.runtimeTray.attemptWorkbench.feedbackQueued', { attempt: attempt.id }),
          },
        }));
        Message.success(t('common.runtimeTray.attemptWorkbench.signalQueued'));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : t('common.runtimeTray.attemptWorkbench.signalFailed');
        setFeedbackByAttempt((feedback) => ({
          ...feedback,
          [attempt.id]: {
            tone: 'error',
            message: t('common.runtimeTray.attemptWorkbench.feedbackFailed', { attempt: attempt.id, message }),
          },
        }));
        Message.error(message);
      });
  };
  const filters: Array<{ kind: AttemptFilter; label: string }> = [
    { kind: 'all', label: t('common.runtimeTray.attemptWorkbench.filterAll') },
    { kind: 'active', label: t('common.runtimeTray.attemptWorkbench.filterActive') },
    { kind: 'human_gate', label: t('common.runtimeTray.attemptWorkbench.filterHumanGate') },
    { kind: 'dead_letter', label: t('common.runtimeTray.attemptWorkbench.filterDeadLetter') },
  ];

  return (
    <section className='flex flex-col gap-14px'>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.attemptWorkbench.title')}</h2>
        <Tag color={statusColor(availability)}>{availability}</Tag>
      </div>
      <div className='h-1px w-full bg-[var(--color-border-2)]' />

      <div className='grid grid-cols-1 gap-10px md:grid-cols-3'>
        <div className='rounded-6px bg-fill-2 px-10px py-8px'>
          <div className='text-12px text-t-secondary'>{t('common.runtimeTray.attemptWorkbench.total')}</div>
          <div className='mt-4px text-18px font-semibold text-t-primary'>{asString(summary?.total) ?? '0'}</div>
        </div>
        <div className='rounded-6px bg-fill-2 px-10px py-8px'>
          <div className='text-12px text-t-secondary'>{t('common.runtimeTray.attemptWorkbench.humanGateCount')}</div>
          <div className='mt-4px text-18px font-semibold text-t-primary'>
            {asString(summary?.human_gate_count) ?? '0'}
          </div>
        </div>
        <div className='rounded-6px bg-fill-2 px-10px py-8px'>
          <div className='text-12px text-t-secondary'>{t('common.runtimeTray.attemptWorkbench.deadLetterCount')}</div>
          <div className='mt-4px text-18px font-semibold text-t-primary'>
            {asString(summary?.dead_letter_count) ?? '0'}
          </div>
        </div>
      </div>

      {attempts.length > 0 && (
        <div className='flex flex-col gap-8px'>
          <div className='text-12px font-medium text-t-secondary'>
            {t('common.runtimeTray.attemptWorkbench.filterLabel')}
          </div>
          <div className='flex flex-wrap gap-8px'>
            {filters.map((item) => (
              <Button
                key={item.kind}
                size='mini'
                type={filter === item.kind ? 'primary' : 'outline'}
                onClick={() => setFilter(item.kind)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {filteredAttempts.length > 0 ? (
        <div className='grid grid-cols-1 gap-10px'>
          {filteredAttempts.map((attempt) => (
            <section
              key={attempt.id}
              className='min-w-0 rounded-6px border border-solid border-[var(--color-border-2)] px-12px py-10px'
            >
              <div className='flex min-w-0 flex-wrap items-center gap-8px'>
                <span className='min-w-0 break-words text-13px font-medium text-t-primary'>{attempt.title}</span>
                <Tag color={statusColor(attempt.status)}>{attempt.status}</Tag>
              </div>
              <dl className='m-0 mt-10px grid grid-cols-1 gap-8px md:grid-cols-[150px_minmax(0,1fr)]'>
                {attempt.details.map((item) => (
                  <React.Fragment key={`${attempt.id}-${item.label}`}>
                    <dt className='text-12px text-t-secondary'>{item.label}</dt>
                    <dd className='m-0 min-w-0 break-words text-13px leading-20px text-t-primary'>{item.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {feedbackByAttempt[attempt.id] && (
                <div
                  className={
                    feedbackByAttempt[attempt.id].tone === 'error'
                      ? 'mt-10px rounded-6px bg-fill-2 px-10px py-8px text-13px leading-20px text-danger-6'
                      : 'mt-10px rounded-6px bg-fill-2 px-10px py-8px text-13px leading-20px text-t-primary'
                  }
                >
                  {feedbackByAttempt[attempt.id].message}
                </div>
              )}
              {attempt.operations.length > 0 && (
                <div className='mt-12px flex flex-col gap-8px'>
                  <div className='text-12px font-medium text-t-secondary'>
                    {t('common.runtimeTray.attemptWorkbench.operations')}
                  </div>
                  <div className='flex flex-wrap gap-8px'>
                    {attempt.operations.map((operation) => (
                      <Button
                        key={`${attempt.id}-${operation.kind}`}
                        size='mini'
                        type='outline'
                        onClick={() => runAttemptOperation(attempt, operation)}
                      >
                        {operation.label}
                      </Button>
                    ))}
                    <Button size='mini' type='outline' onClick={() => setSelectedAttemptId(attempt.id)}>
                      {t('common.runtimeTray.attemptWorkbench.showDetails')}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      ) : attempts.length > 0 ? (
        <Empty description={t('common.runtimeTray.attemptWorkbench.noFilteredAttempts')} />
      ) : (
        <Empty description={t('common.runtimeTray.attemptWorkbench.noAttempts')} />
      )}

      {selectedAttempt && (
        <section className='min-w-0 rounded-6px border border-solid border-[var(--color-border-2)] px-12px py-10px'>
          <div className='flex min-w-0 flex-wrap items-center gap-8px'>
            <span className='text-12px font-medium text-t-secondary'>
              {t('common.runtimeTray.attemptWorkbench.selectedAttempt')}
            </span>
            <span className='min-w-0 break-words text-13px font-medium text-t-primary'>{selectedAttempt.id}</span>
            <Tag color={statusColor(selectedAttempt.status)}>{selectedAttempt.status}</Tag>
          </div>
          <dl className='m-0 mt-10px grid grid-cols-1 gap-8px md:grid-cols-[150px_minmax(0,1fr)]'>
            {selectedAttempt.details.map((item) => (
              <React.Fragment key={`selected-${selectedAttempt.id}-${item.label}`}>
                <dt className='text-12px text-t-secondary'>{item.label}</dt>
                <dd className='m-0 min-w-0 break-words text-13px leading-20px text-t-primary'>{item.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}

      <div className='rounded-6px bg-fill-2 px-12px py-10px text-13px leading-20px text-t-secondary'>
        {t('common.runtimeTray.attemptWorkbench.authorityBoundary')}
      </div>
    </section>
  );
};

export default RuntimeAttemptWorkbench;
