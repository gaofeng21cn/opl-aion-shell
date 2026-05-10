import React, { useMemo } from 'react';
import { Button, Empty, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { RuntimeTrayJsonRecord, RuntimeTrayOpenPayload } from './types';

type RuntimeTranslator = ReturnType<typeof useTranslation>['t'];
type Field = { label: string; value: string };
type ListItem = { title: string; detail?: string; status?: string };

type Props = {
  item: RuntimeTrayOpenPayload;
  onOpenMasPortal: () => void;
  onOpenExternal: (url: string | null | undefined) => void;
};

const isRecord = (value: unknown): value is RuntimeTrayJsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): RuntimeTrayJsonRecord | null => (isRecord(value) ? value : null);

const asRecordArray = (value: unknown): RuntimeTrayJsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
};

const nestedRecord = (record: RuntimeTrayJsonRecord | null | undefined, key: string): RuntimeTrayJsonRecord | null =>
  record ? asRecord(record[key]) : null;

const textFromObject = (value: unknown): string | null => {
  const direct = asString(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

const sourceItems = (value: unknown, fallbackTitle: string): ListItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index): ListItem | null => {
      if (typeof entry === 'string') {
        return { title: `${fallbackTitle} ${index + 1}`, detail: entry };
      }
      if (!isRecord(entry)) return null;
      return {
        title:
          firstString(entry.label, entry.title, entry.surface_kind, entry.role, entry.ref_kind) ??
          `${fallbackTitle} ${index + 1}`,
        detail:
          firstString(entry.ref, entry.path, entry.file, entry.url, entry.href, entry.source_ref) ??
          textFromObject(entry) ??
          undefined,
        status: firstString(entry.status, entry.source_status) ?? undefined,
      };
    })
    .filter((item): item is ListItem => Boolean(item));
};

const field = (label: string, ...values: unknown[]): Field | null => {
  const value = firstString(...values);
  return value ? { label, value } : null;
};

const compact = <T,>(items: Array<T | null | undefined>): T[] => items.filter((item): item is T => Boolean(item));

const statusColor = (status?: string) => {
  switch (status) {
    case 'available':
    case 'fresh':
    case 'running':
    case 'live':
    case 'read_only_tail':
      return 'green';
    case 'missing':
    case 'blocked':
    case 'stale':
    case 'unavailable':
      return 'orangered';
    default:
      return 'blue';
  }
};

const fieldsForStudy = (
  item: RuntimeTrayOpenPayload,
  study: RuntimeTrayJsonRecord | null,
  projection: RuntimeTrayJsonRecord | null,
  t: RuntimeTranslator
): Field[] => {
  const freshness = nestedRecord(study, 'freshness') ?? item.portalFreshness;
  const terminal = nestedRecord(study, 'terminal') ?? nestedRecord(projection, 'terminal');
  return compact([
    field(t('common.runtimeTray.masWorkbench.studyId'), study?.study_id, item.studyId),
    field(t('common.runtimeTray.masWorkbench.currentStage'), study?.current_stage, item.healthStatus),
    field(t('common.runtimeTray.masWorkbench.state'), study?.macro_state, item.statusLabel),
    field(t('common.runtimeTray.masWorkbench.summary'), study?.next_action_summary, item.detailSummary, item.summary),
    field(t('common.runtimeTray.masWorkbench.userNext'), study?.user_next, item.nextActionSummary),
    field(t('common.runtimeTray.masWorkbench.activeRun'), study?.active_run_id, item.activeRunId),
    field(t('common.runtimeTray.masWorkbench.worker'), study?.worker_state, item.healthStatus),
    field(t('common.runtimeTray.masWorkbench.terminalMode'), terminal?.mode),
    field(t('common.runtimeTray.masWorkbench.freshnessStatus'), freshness?.status),
    field(t('common.runtimeTray.masWorkbench.freshnessSummary'), freshness?.summary),
  ]);
};

const linksForStudy = (study: RuntimeTrayJsonRecord | null, t: RuntimeTranslator): ListItem[] => {
  const links = nestedRecord(study, 'links');
  if (!links) return [];
  return compact([
    firstString(links.progress_payload_ref)
      ? {
          title: t('common.runtimeTray.masWorkbench.progressPayload'),
          detail: firstString(links.progress_payload_ref) ?? undefined,
        }
      : null,
    firstString(links.conversation_read_model_ref)
      ? {
          title: t('common.runtimeTray.masWorkbench.conversationReadModel'),
          detail: firstString(links.conversation_read_model_ref) ?? undefined,
        }
      : null,
    firstString(links.live_console_read_model_ref)
      ? {
          title: t('common.runtimeTray.masWorkbench.liveConsoleReadModel'),
          detail: firstString(links.live_console_read_model_ref) ?? undefined,
        }
      : null,
    firstString(links.terminal_attach_status_ref)
      ? {
          title: t('common.runtimeTray.masWorkbench.terminalAttachGate'),
          detail: firstString(links.terminal_attach_status_ref) ?? undefined,
        }
      : null,
    ...sourceItems(links.artifact_refs, t('common.runtimeTray.masWorkbench.artifact')),
  ]);
};

const actionsForStudy = (study: RuntimeTrayJsonRecord | null, t: RuntimeTranslator): ListItem[] => {
  const actions = nestedRecord(study, 'actions');
  if (!actions) return [];
  return Object.entries(actions).map(([name, raw]) => {
    const action = asRecord(raw);
    const allowed = action?.allowed === true;
    return {
      title: name,
      status: allowed
        ? t('common.runtimeTray.masWorkbench.actionAvailable')
        : t('common.runtimeTray.masWorkbench.actionDisabled'),
      detail:
        firstString(action?.owner, action?.endpoint_ref) ?? t('common.runtimeTray.masWorkbench.actionReceiptRequired'),
    };
  });
};

const FieldGrid: React.FC<{ fields: Field[] }> = ({ fields }) => (
  <dl className='m-0 grid grid-cols-1 gap-10px md:grid-cols-[150px_minmax(0,1fr)]'>
    {fields.map((item) => (
      <React.Fragment key={`${item.label}-${item.value}`}>
        <dt className='text-12px text-t-secondary'>{item.label}</dt>
        <dd className='m-0 min-w-0 whitespace-pre-wrap break-words text-13px leading-20px text-t-primary'>
          {item.value}
        </dd>
      </React.Fragment>
    ))}
  </dl>
);

const ListSection: React.FC<{ title: string; empty: string; items: ListItem[] }> = ({ title, empty, items }) => (
  <section className='flex min-w-0 flex-col gap-10px'>
    <h3 className='m-0 text-13px font-medium text-t-secondary'>{title}</h3>
    {items.length > 0 ? (
      <div className='grid grid-cols-1 gap-8px'>
        {items.map((item, index) => (
          <div
            key={`${title}-${item.title}-${index}`}
            className='min-w-0 rounded-6px border border-solid border-[var(--color-border-2)] px-10px py-8px'
          >
            <div className='flex min-w-0 flex-wrap items-center gap-6px'>
              <span className='min-w-0 break-words text-13px font-medium text-t-primary'>{item.title}</span>
              {item.status && (
                <Tag color={statusColor(item.status)} className='shrink-0'>
                  {item.status}
                </Tag>
              )}
            </div>
            {item.detail && (
              <code className='mt-6px block min-w-0 whitespace-pre-wrap break-all rounded bg-fill-2 px-8px py-6px text-12px text-t-secondary'>
                {item.detail}
              </code>
            )}
          </div>
        ))}
      </div>
    ) : (
      <Empty description={empty} />
    )}
  </section>
);

const MasRuntimeWorkbench: React.FC<Props> = ({ item, onOpenMasPortal, onOpenExternal }) => {
  const { t } = useTranslation();
  const projection = asRecord(item.workbenchProjection);
  const study = asRecord(item.studyWorkbench);
  const sourceRefs = useMemo(
    () => [
      ...sourceItems(item.workbenchProjectionSourceRefs, t('common.runtimeTray.masWorkbench.workbenchSource')),
      ...sourceItems(study?.source_refs, t('common.runtimeTray.sourceRef', { index: '' }).trim()),
      ...sourceItems(item.portalSourceRefs, t('common.runtimeTray.masWorkbench.portalSource')),
      ...sourceItems(item.sourceRefs, t('common.runtimeTray.sourceRef', { index: '' }).trim()),
    ],
    [item.portalSourceRefs, item.sourceRefs, item.workbenchProjectionSourceRefs, study, t]
  );
  const hasNativeProjection = Boolean(projection || study);

  return (
    <section className='flex flex-col gap-14px'>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.masWorkbench.title')}</h2>
        {!hasNativeProjection && <Tag color='gray'>{t('common.runtimeTray.masWorkbench.portalFallback')}</Tag>}
      </div>
      <div className='h-1px w-full bg-[var(--color-border-2)]' />

      {!hasNativeProjection && (
        <div className='rounded-6px bg-fill-2 px-12px py-10px text-13px leading-20px text-t-secondary'>
          {t('common.runtimeTray.masWorkbench.portalFallbackDescription')}
        </div>
      )}

      <section className='min-w-0 rounded-6px border border-solid border-[var(--color-border-2)] px-12px py-10px'>
        <h3 className='m-0 mb-10px text-13px font-medium text-t-secondary'>
          {t('common.runtimeTray.masWorkbench.progress')}
        </h3>
        <FieldGrid fields={fieldsForStudy(item, study, projection, t)} />
      </section>

      <div className='grid grid-cols-1 gap-14px lg:grid-cols-2'>
        <ListSection
          title={t('common.runtimeTray.masWorkbench.links')}
          empty={t('common.runtimeTray.masWorkbench.noLinks')}
          items={linksForStudy(study, t)}
        />
        <ListSection
          title={t('common.runtimeTray.masWorkbench.actions')}
          empty={t('common.runtimeTray.masWorkbench.noActions')}
          items={[
            ...actionsForStudy(study, t),
            {
              title: t('common.runtimeTray.masWorkbench.terminalInput'),
              status: t('common.runtimeTray.masWorkbench.actionDisabled'),
              detail:
                firstString(nestedRecord(study, 'terminal')?.reason, nestedRecord(projection, 'terminal')?.reason) ??
                t('common.runtimeTray.masWorkbench.terminalInputDisabled'),
            },
          ]}
        />
      </div>

      <div className='flex flex-wrap gap-8px'>
        {(item.portalPath || item.portalUrl) && (
          <Button size='mini' type='outline' onClick={onOpenMasPortal}>
            {t('common.runtimeTray.openMasPortal')}
          </Button>
        )}
        {item.browserUrl && (
          <Button size='mini' type='outline' onClick={() => onOpenExternal(item.browserUrl)}>
            {t('common.runtimeTray.masWorkbench.openMonitoring')}
          </Button>
        )}
      </div>

      <ListSection
        title={t('common.runtimeTray.masWorkbench.sourceRefs')}
        empty={t('common.runtimeTray.noSourceRefs')}
        items={sourceRefs}
      />
    </section>
  );
};

export default MasRuntimeWorkbench;
