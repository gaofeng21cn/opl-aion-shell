import React, { useMemo } from 'react';
import { Empty, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { RuntimeTrayJsonRecord } from './types';

type RuntimeTranslator = ReturnType<typeof useTranslation>['t'];
type AttemptItem = {
  id: string;
  title: string;
  status: string;
  details: Array<{ label: string; value: string }>;
};

const isRecord = (value: unknown): value is RuntimeTrayJsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecordArray = (value: unknown): RuntimeTrayJsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

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
  return value.map(asString).filter((entry): entry is string => Boolean(entry)).join(', ');
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

const attemptItems = (workbench: RuntimeTrayJsonRecord, t: RuntimeTranslator): AttemptItem[] =>
  asRecordArray(workbench.attempts).map((attempt, index) => {
    const completion = nestedRecord(attempt, 'completion_boundary');
    const heartbeat = nestedRecord(attempt, 'heartbeat');
    const status = asString(attempt.local_status) ?? asString(attempt.workflow_status) ?? 'unknown';
    const closeoutStatus = asString(attempt.closeout_receipt_status);
    const domainReadyVerdict = asString(completion?.domain_ready_verdict);
    return {
      id: asString(attempt.stage_attempt_id) ?? `attempt-${index}`,
      title:
        [
          asString(attempt.domain_id),
          asString(attempt.stage_id),
          asString(attempt.provider_kind),
        ]
          .filter((value): value is string => Boolean(value))
          .join(' / ') || t('common.runtimeTray.attemptWorkbench.attempt'),
      status,
      details: compact([
        field(t('common.runtimeTray.attemptWorkbench.providerCompletion'), completion?.provider_completion),
        field(t('common.runtimeTray.attemptWorkbench.domainReadyVerdict'), domainReadyVerdict),
        field(t('common.runtimeTray.attemptWorkbench.closeoutReceipt'), closeoutStatus),
        field(t('common.runtimeTray.attemptWorkbench.nextOwner'), attempt.next_owner),
        field(t('common.runtimeTray.attemptWorkbench.heartbeat'), heartbeat?.last_heartbeat_at, heartbeat?.last_updated_at),
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
    };
  });

const RuntimeAttemptWorkbench: React.FC<{ workbench: RuntimeTrayJsonRecord | null | undefined }> = ({ workbench }) => {
  const { t } = useTranslation();
  const projection = isRecord(workbench) ? workbench : null;
  const attempts = useMemo(() => (projection ? attemptItems(projection, t) : []), [projection, t]);
  const availability = asString(projection?.availability) ?? 'missing';
  const summary = isRecord(projection?.summary) ? projection.summary : null;

  return (
    <section className='flex flex-col gap-14px'>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>
          {t('common.runtimeTray.attemptWorkbench.title')}
        </h2>
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

      {attempts.length > 0 ? (
        <div className='grid grid-cols-1 gap-10px'>
          {attempts.map((attempt) => (
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
            </section>
          ))}
        </div>
      ) : (
        <Empty description={t('common.runtimeTray.attemptWorkbench.noAttempts')} />
      )}

      <div className='rounded-6px bg-fill-2 px-12px py-10px text-13px leading-20px text-t-secondary'>
        {t('common.runtimeTray.attemptWorkbench.authorityBoundary')}
      </div>
    </section>
  );
};

export default RuntimeAttemptWorkbench;
