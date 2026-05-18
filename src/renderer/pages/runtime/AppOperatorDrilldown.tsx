import React from 'react';
import { Empty, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { RuntimeTrayJsonRecord } from './types';

type RuntimeTranslator = ReturnType<typeof useTranslation>['t'];
type DrilldownMetric = {
  label: string;
  value: string;
};
type DrilldownSection = {
  title: string;
  refs: RuntimeTrayJsonRecord[];
};

const isRecord = (value: unknown): value is RuntimeTrayJsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecordArray = (value: unknown): RuntimeTrayJsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const isAppOperatorDrilldown = (value: unknown): value is RuntimeTrayJsonRecord =>
  isRecord(value) && value.surface_kind === 'opl_app_operator_drilldown_read_model';

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const nestedRecord = (record: RuntimeTrayJsonRecord, key: string): RuntimeTrayJsonRecord => {
  const value = record[key];
  return isRecord(value) ? value : {};
};

const textList = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  return value
    .map(asString)
    .filter((entry): entry is string => Boolean(entry))
    .join(', ');
};

const refsFromStrings = (value: unknown, role: string): RuntimeTrayJsonRecord[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(asString)
    .filter((entry): entry is string => Boolean(entry))
    .map((ref) => ({ ref, role }));
};

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const scalar = asString(value);
    if (scalar) return scalar;
    if (Array.isArray(value)) {
      const joined = textList(value);
      if (joined) return joined;
    }
  }
  return '';
};

const refSummary = (ref: RuntimeTrayJsonRecord): string => {
  const parts = [
    ['ref', firstText(ref.ref, ref.command_or_surface_ref, ref.receipt_ref, ref.source_ref)],
    ['role', firstText(ref.role, ref.action_kind, ref.item_kind)],
    ['owner', firstText(ref.owner, ref.action_owner, ref.execution_owner)],
    ['domain', firstText(ref.domain_id)],
    ['stage', firstText(ref.stage_id)],
    ['policy', firstText(ref.execution_policy, ref.projection_policy, ref.content_policy)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return parts.map(([label, value]) => `${label}=${value}`).join('; ');
};

const metric = (summary: RuntimeTrayJsonRecord, label: string, key: string): DrilldownMetric => ({
  label,
  value: firstText(summary[key]) || '0',
});

const sectionRefs = (drilldown: RuntimeTrayJsonRecord, key: string): RuntimeTrayJsonRecord[] => {
  const section = nestedRecord(drilldown, key);
  if (Array.isArray(section.refs)) return asRecordArray(section.refs);
  if (Array.isArray(section.items)) return asRecordArray(section.items);
  return [
    ...refsFromStrings(section.package_refs, 'package_ref'),
    ...refsFromStrings(section.export_refs, 'export_ref'),
    ...refsFromStrings(section.gap_report_refs, 'gap_report_ref'),
    ...refsFromStrings(section.handoff_refs, 'handoff_ref'),
  ];
};

const functionalResidueCount = (summary: RuntimeTrayJsonRecord, functional: RuntimeTrayJsonRecord): string => {
  return (
    firstText(
      functional.active_private_generic_residue_count,
      summary.functional_privatization_active_private_generic_residue_count
    ) || '0'
  );
};

const functionalWatchlistCount = (summary: RuntimeTrayJsonRecord, functional: RuntimeTrayJsonRecord): string => {
  return firstText(functional.default_watchlist_count, summary.functional_privatization_default_watchlist_count) || '0';
};

const functionalBlockerCount = (summary: RuntimeTrayJsonRecord, functional: RuntimeTrayJsonRecord): string => {
  return firstText(functional.blocker_count, summary.functional_privatization_blocker_count) || '0';
};

const functionalReviewCount = (summary: RuntimeTrayJsonRecord, functional: RuntimeTrayJsonRecord): string => {
  return (
    firstText(
      functional.semantic_equivalence_review_count,
      summary.functional_privatization_semantic_equivalence_review_count
    ) || '0'
  );
};

const functionalAuditSummary = (
  summary: RuntimeTrayJsonRecord,
  functional: RuntimeTrayJsonRecord,
  t: RuntimeTranslator
): string => {
  const entries = [
    [t('common.runtimeTray.appDrilldown.privateResidue'), functionalResidueCount(summary, functional)],
    [t('common.runtimeTray.appDrilldown.watchlist'), functionalWatchlistCount(summary, functional)],
    [t('common.runtimeTray.appDrilldown.semanticReview'), functionalReviewCount(summary, functional)],
    [t('common.runtimeTray.appDrilldown.blockers'), functionalBlockerCount(summary, functional)],
  ];
  return entries.map(([label, value]) => `${label}: ${value}`).join('; ');
};

const lifecycleSummary = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): string => {
  const entries = [
    [t('common.runtimeTray.appDrilldown.packages'), firstText(summary.package_ref_count) || '0'],
    [t('common.runtimeTray.appDrilldown.exports'), firstText(summary.export_ref_count) || '0'],
  ];
  return entries.map(([label, value]) => `${label}: ${value}`).join('; ');
};

const safeActionSummary = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): string => {
  const entries = [
    [t('common.runtimeTray.appDrilldown.safeActions'), firstText(summary.safe_action_ref_count) || '0'],
    [t('common.runtimeTray.appDrilldown.executableRoutes'), firstText(summary.operator_executable_route_count) || '0'],
  ];
  return entries.map(([label, value]) => `${label}: ${value}`).join('; ');
};

const sectionCount = (drilldown: RuntimeTrayJsonRecord, key: string): number => {
  const section = nestedRecord(drilldown, key);
  if (Array.isArray(section.refs)) return section.refs.length;
  if (Array.isArray(section.items)) return section.items.length;
  return (
    refsFromStrings(section.package_refs, 'package_ref').length +
    refsFromStrings(section.export_refs, 'export_ref').length +
    refsFromStrings(section.gap_report_refs, 'gap_report_ref').length +
    refsFromStrings(section.handoff_refs, 'handoff_ref').length
  );
};

const hasPackageLifecycleRefs = (drilldown: RuntimeTrayJsonRecord): boolean => {
  return sectionCount(drilldown, 'package_export_lifecycle_refs') > 0;
};

const hasSafeActionRefs = (drilldown: RuntimeTrayJsonRecord): boolean => {
  return sectionCount(drilldown, 'safe_action_refs') > 0;
};

const packageLifecycleSection = (drilldown: RuntimeTrayJsonRecord, t: RuntimeTranslator): DrilldownSection | null => {
  if (!hasPackageLifecycleRefs(drilldown)) return null;
  return {
    title: t('common.runtimeTray.appDrilldown.packageLifecycle'),
    refs: sectionRefs(drilldown, 'package_export_lifecycle_refs'),
  };
};

const safeActionSection = (drilldown: RuntimeTrayJsonRecord, t: RuntimeTranslator): DrilldownSection | null => {
  if (!hasSafeActionRefs(drilldown)) return null;
  return {
    title: t('common.runtimeTray.appDrilldown.safeActions'),
    refs: sectionRefs(drilldown, 'safe_action_refs'),
  };
};

const optionalSection = (section: DrilldownSection | null): DrilldownSection[] => {
  return section ? [section] : [];
};

const sectionList = (sections: DrilldownSection[]): DrilldownSection[] => {
  return sections.filter((section) => section.refs.length > 0);
};

const drilldownSections = (drilldown: RuntimeTrayJsonRecord, t: RuntimeTranslator): DrilldownSection[] => {
  return sectionList([
    {
      title: t('common.runtimeTray.appDrilldown.routeGraph'),
      refs: sectionRefs(drilldown, 'route_graph_refs'),
    },
    {
      title: t('common.runtimeTray.appDrilldown.decisionMap'),
      refs: sectionRefs(drilldown, 'decision_map_refs'),
    },
    {
      title: t('common.runtimeTray.appDrilldown.reviewRepair'),
      refs: sectionRefs(drilldown, 'review_repair_queue_refs'),
    },
    {
      title: t('common.runtimeTray.appDrilldown.artifacts'),
      refs: sectionRefs(drilldown, 'artifact_gallery_refs'),
    },
    ...optionalSection(packageLifecycleSection(drilldown, t)),
    {
      title: t('common.runtimeTray.appDrilldown.providerSlo'),
      refs: sectionRefs(drilldown, 'provider_slo_operator_action_refs'),
    },
    {
      title: t('common.runtimeTray.appDrilldown.actionRouting'),
      refs: sectionRefs(drilldown, 'operator_action_routing_refs'),
    },
    ...optionalSection(safeActionSection(drilldown, t)),
  ]);
};

const summaryCards = (
  summary: RuntimeTrayJsonRecord,
  functional: RuntimeTrayJsonRecord,
  t: RuntimeTranslator
): DrilldownMetric[] => {
  return [
    {
      label: t('common.runtimeTray.appDrilldown.packageLifecycle'),
      value: lifecycleSummary(summary, t),
    },
    {
      label: t('common.runtimeTray.appDrilldown.safeActions'),
      value: safeActionSummary(summary, t),
    },
    {
      label: t('common.runtimeTray.appDrilldown.functionalAudit'),
      value: functionalAuditSummary(summary, functional, t),
    },
  ];
};

const renderSummaryCard = (item: DrilldownMetric): React.ReactNode => {
  return (
    <div key={item.label} className='rounded-6px bg-fill-2 px-10px py-8px'>
      <div className='text-12px text-t-secondary'>{item.label}</div>
      <div className='mt-4px break-words text-13px leading-20px font-medium text-t-primary'>{item.value}</div>
    </div>
  );
};

const renderMetricCard = (item: DrilldownMetric): React.ReactNode => {
  return (
    <div key={item.label} className='rounded-6px bg-fill-2 px-10px py-8px'>
      <div className='text-12px text-t-secondary'>{item.label}</div>
      <div className='mt-4px text-18px font-semibold text-t-primary'>{item.value}</div>
    </div>
  );
};

const sectionSummary = (section: DrilldownSection): string => {
  return section.refs.length > 5 ? `+${section.refs.length - 5}` : '';
};

const renderSection = (section: DrilldownSection): React.ReactNode => {
  return (
    <section
      key={section.title}
      className='rounded-6px border border-solid border-[var(--color-border-2)] px-12px py-10px'
    >
      <div className='mb-8px flex items-center justify-between gap-8px text-12px font-medium text-t-secondary'>
        <span>{section.title}</span>
        {sectionSummary(section) && <span>{sectionSummary(section)}</span>}
      </div>
      <div className='flex flex-col gap-6px'>
        {section.refs.slice(0, 5).map((ref, index) => (
          <code
            key={`${section.title}-${index}`}
            className='block min-w-0 whitespace-pre-wrap break-all rounded bg-fill-2 px-8px py-6px text-12px text-t-primary'
          >
            {refSummary(ref)}
          </code>
        ))}
      </div>
    </section>
  );
};

const buildSections = (drilldown: RuntimeTrayJsonRecord, t: RuntimeTranslator): DrilldownSection[] => {
  return drilldownSections(drilldown, t);
};

const buildMetrics = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): DrilldownMetric[] => [
  metric(summary, t('common.runtimeTray.appDrilldown.stageAttempts'), 'stage_attempt_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.routeGraph'), 'route_graph_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.decisionMap'), 'decision_map_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.reviewRepair'), 'review_repair_queue_item_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.artifacts'), 'artifact_gallery_item_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.packages'), 'package_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.exports'), 'export_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.memory'), 'memory_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.memoryWriteback'), 'memory_writeback_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.quality'), 'quality_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.readiness'), 'readiness_ref_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.providerSlo'), 'provider_slo_action_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.actionRouting'), 'operator_action_route_count'),
  metric(summary, t('common.runtimeTray.appDrilldown.safeActions'), 'safe_action_ref_count'),
  metric(
    summary,
    t('common.runtimeTray.appDrilldown.privateResidue'),
    'functional_privatization_active_private_generic_residue_count'
  ),
];

const statusColor = (status: string): string => {
  if (['available', 'ready', 'proven'].includes(status)) return 'green';
  if (['blocked', 'unavailable'].includes(status)) return 'red';
  if (['empty', 'pending'].includes(status)) return 'orangered';
  return 'blue';
};

const AppOperatorDrilldown: React.FC<{ drilldown: RuntimeTrayJsonRecord | null | undefined }> = ({ drilldown }) => {
  const { t } = useTranslation();
  const projection = isAppOperatorDrilldown(drilldown) ? drilldown : null;
  if (!projection) return null;

  const availability = firstText(projection.availability) || 'unknown';
  const summary = nestedRecord(projection, 'summary');
  const authority = nestedRecord(projection, 'authority_boundary');
  const memory = nestedRecord(projection, 'memory_writeback_refs');
  const quality = nestedRecord(projection, 'quality_readiness_refs');
  const functional = nestedRecord(projection, 'functional_privatization_audit_summary');
  const metrics = buildMetrics(summary, t);
  const sections = buildSections(projection, t);
  const consumedMemoryRefs = textList(memory.consumed_memory_refs);
  const writebackReceiptRefs = textList(memory.writeback_receipt_refs);
  const qualityRefs = textList(quality.quality_refs);
  const readinessRefs = textList(quality.readiness_refs);

  return (
    <section className='flex flex-col gap-14px'>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.appDrilldown.title')}</h2>
        <Tag color={statusColor(availability)}>{availability}</Tag>
      </div>
      <div className='h-1px w-full bg-[var(--color-border-2)]' />

      <div className='grid grid-cols-1 gap-10px md:grid-cols-4'>{metrics.map(renderMetricCard)}</div>

      <div className='grid grid-cols-1 gap-10px md:grid-cols-3'>
        {summaryCards(summary, functional, t).map(renderSummaryCard)}
      </div>

      <div className='grid grid-cols-1 gap-10px md:grid-cols-2'>
        <div className='rounded-6px bg-fill-2 px-10px py-8px'>
          <div className='text-12px font-medium text-t-secondary'>{t('common.runtimeTray.appDrilldown.memory')}</div>
          <div className='mt-5px break-words text-13px leading-20px text-t-primary'>
            {consumedMemoryRefs || t('common.runtimeTray.appDrilldown.noRefs')}
          </div>
          {writebackReceiptRefs && (
            <div className='mt-5px break-words text-12px leading-18px text-t-secondary'>{writebackReceiptRefs}</div>
          )}
        </div>
        <div className='rounded-6px bg-fill-2 px-10px py-8px'>
          <div className='text-12px font-medium text-t-secondary'>{t('common.runtimeTray.appDrilldown.quality')}</div>
          <div className='mt-5px break-words text-13px leading-20px text-t-primary'>
            {qualityRefs || t('common.runtimeTray.appDrilldown.noRefs')}
          </div>
          {readinessRefs && (
            <div className='mt-5px break-words text-12px leading-18px text-t-secondary'>{readinessRefs}</div>
          )}
        </div>
      </div>

      {sections.length > 0 ? (
        <div className='grid grid-cols-1 gap-10px'>{sections.map(renderSection)}</div>
      ) : (
        <Empty description={t('common.runtimeTray.appDrilldown.noRefs')} />
      )}

      <div className='rounded-6px bg-fill-2 px-12px py-10px text-13px leading-20px text-t-secondary'>
        {t('common.runtimeTray.appDrilldown.authorityBoundary')}{' '}
        {firstText(authority.domain) ||
          firstText(authority.provider) ||
          'domain truth and provider receipts stay with owners'}
      </div>
    </section>
  );
};

export default AppOperatorDrilldown;
