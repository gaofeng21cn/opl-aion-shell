import React from 'react';
import { Button, Empty, Message, Tag } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import { ipcBridge } from '@/common';
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
type OmaSectionSpec = {
  key: string;
  title: string;
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

const omaSummary = (ref: RuntimeTrayJsonRecord): string => {
  const parts = [
    [
      'ref',
      firstText(ref.ref, ref.section_ref, ref.package_ref, ref.evidence_ref, ref.proposal_ref, ref.work_order_ref),
    ],
    ['status', firstText(ref.status, ref.state, ref.result_status, ref.review_status)],
    ['blocker', firstText(ref.blocker, ref.blocker_ref, ref.typed_blocker_ref, ref.blocking_reason)],
    ['receipt', firstText(ref.receipt, ref.receipt_ref, ref.owner_receipt_ref, ref.evidence_receipt_ref)],
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

const omaSectionRecord = (drilldown: RuntimeTrayJsonRecord, key: string): RuntimeTrayJsonRecord => {
  const sections = nestedRecord(drilldown, 'oma_sections');
  const fromGrouped = sections[key];
  if (isRecord(fromGrouped)) return fromGrouped;
  const direct = drilldown[key];
  if (isRecord(direct)) return direct;
  const directSection = drilldown[`${key}_section`];
  return isRecord(directSection) ? directSection : {};
};

const omaSectionRefs = (drilldown: RuntimeTrayJsonRecord, key: string): RuntimeTrayJsonRecord[] => {
  const section = omaSectionRecord(drilldown, key);
  const refs = [
    ...asRecordArray(section.refs),
    ...asRecordArray(section.items),
    ...refsFromStrings(section.ref_refs, 'ref'),
    ...refsFromStrings(section.refs, 'ref'),
    ...refsFromStrings(section.blocker_refs, 'blocker'),
    ...refsFromStrings(section.typed_blocker_refs, 'blocker'),
    ...refsFromStrings(section.receipt_refs, 'receipt'),
    ...refsFromStrings(section.status_refs, 'status'),
    ...refsFromStrings(section.evidence_refs, 'evidence'),
  ];
  if (refs.length > 0) return refs;
  const synthetic = {
    ref: firstText(
      section.ref,
      section.section_ref,
      section.package_ref,
      section.evidence_ref,
      section.proposal_ref,
      section.work_order_ref
    ),
    status: firstText(section.status, section.state, section.result_status, section.review_status),
    blocker_ref: firstText(section.blocker_ref, section.typed_blocker_ref, section.blocking_reason),
    receipt_ref: firstText(section.receipt_ref, section.owner_receipt_ref, section.evidence_receipt_ref),
  };
  return firstText(synthetic.ref, synthetic.status, synthetic.blocker_ref, synthetic.receipt_ref) ? [synthetic] : [];
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

const evidenceSummary = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): string => {
  const entries = [
    [
      t('common.runtimeTray.appDrilldown.externalRequests'),
      firstText(summary.domain_external_evidence_request_count) || '0',
    ],
    [t('common.runtimeTray.appDrilldown.openRequests'), firstText(summary.domain_open_evidence_request_count) || '0'],
    [
      t('common.runtimeTray.appDrilldown.verifiedReceipts'),
      firstText(summary.domain_external_verified_evidence_receipt_count) || '0',
    ],
  ];
  return entries.map(([label, value]) => `${label}: ${value}`).join('; ');
};

const evidenceGateSummary = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): string => {
  const entries = [
    [t('common.runtimeTray.appDrilldown.evidenceGates'), firstText(summary.domain_evidence_gate_count) || '0'],
    [
      t('common.runtimeTray.appDrilldown.remainingGates'),
      firstText(summary.domain_remaining_evidence_gate_count) || '0',
    ],
    [
      t('common.runtimeTray.appDrilldown.verifiedGateReceipts'),
      firstText(summary.domain_evidence_gate_verified_receipt_count) || '0',
    ],
  ];
  return entries.map(([label, value]) => `${label}: ${value}`).join('; ');
};

const legacyCleanupSummary = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): string => {
  const entries = [
    [t('common.runtimeTray.appDrilldown.cleanupPlans'), firstText(summary.domain_legacy_cleanup_plan_count) || '0'],
    [t('common.runtimeTray.appDrilldown.readyPlans'), firstText(summary.domain_legacy_cleanup_ready_plan_count) || '0'],
    [
      t('common.runtimeTray.appDrilldown.applyReady'),
      firstText(summary.domain_legacy_cleanup_opl_apply_ready_count) || '0',
    ],
  ];
  return entries.map(([label, value]) => `${label}: ${value}`).join('; ');
};

const providerCadenceWindowSummary = (summary: RuntimeTrayJsonRecord, t: RuntimeTranslator): string => {
  const entries = [
    [
      t('common.runtimeTray.appDrilldown.cadenceWindowStatus'),
      firstText(summary.provider_cadence_window_status) || 'unknown',
    ],
    [
      t('common.runtimeTray.appDrilldown.longEvidenceReady'),
      firstText(summary.provider_cadence_window_long_evidence_ready) || 'false',
    ],
    [
      t('common.runtimeTray.appDrilldown.expectedReceipts'),
      firstText(summary.provider_cadence_window_expected_receipt_count) || '0',
    ],
    [
      t('common.runtimeTray.appDrilldown.observedReceipts'),
      firstText(summary.provider_cadence_window_observed_receipt_count) || '0',
    ],
    [
      t('common.runtimeTray.appDrilldown.missingReceipts'),
      firstText(summary.provider_cadence_window_missing_receipt_count) || '0',
    ],
    [
      t('common.runtimeTray.appDrilldown.blockedRepairReceipts'),
      firstText(summary.provider_cadence_window_blocked_repair_receipt_count) || '0',
    ],
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

const omaSectionSpecs = (t: RuntimeTranslator): OmaSectionSpec[] => [
  { key: 'target_brief', title: t('common.runtimeTray.appDrilldown.omaTargetBrief') },
  { key: 'candidate_package', title: t('common.runtimeTray.appDrilldown.omaCandidatePackage') },
  { key: 'agent_lab_results', title: t('common.runtimeTray.appDrilldown.omaAgentLabResults') },
  { key: 'developer_work_order', title: t('common.runtimeTray.appDrilldown.omaDeveloperWorkOrder') },
  { key: 'mechanism_proposal', title: t('common.runtimeTray.appDrilldown.omaMechanismProposal') },
  { key: 'scaleout_evidence', title: t('common.runtimeTray.appDrilldown.omaScaleoutEvidence') },
];

const omaSections = (drilldown: RuntimeTrayJsonRecord, t: RuntimeTranslator): DrilldownSection[] => {
  return sectionList(
    omaSectionSpecs(t).map((spec) => ({
      title: spec.title,
      refs: omaSectionRefs(drilldown, spec.key),
    }))
  );
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
    {
      label: t('common.runtimeTray.appDrilldown.externalEvidence'),
      value: evidenceSummary(summary, t),
    },
    {
      label: t('common.runtimeTray.appDrilldown.evidenceGateReceipts'),
      value: evidenceGateSummary(summary, t),
    },
    {
      label: t('common.runtimeTray.appDrilldown.legacyCleanup'),
      value: legacyCleanupSummary(summary, t),
    },
    {
      label: t('common.runtimeTray.appDrilldown.providerCadenceWindow'),
      value: providerCadenceWindowSummary(summary, t),
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

const renderOmaSection = (section: DrilldownSection): React.ReactNode => {
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
            {omaSummary(ref)}
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

const projectionSourceKey = (projection: RuntimeTrayJsonRecord | null): string => {
  if (!projection) return 'missing';
  const summary = nestedRecord(projection, 'summary');
  return [
    firstText(projection.surface_kind) || 'unknown',
    firstText(projection.detail_level) || 'summary',
    firstText(projection.availability) || 'unknown',
    firstText(summary.stage_attempt_count) || '0',
    firstText(summary.domain_evidence_gate_count) || '0',
    firstText(summary.domain_remaining_evidence_gate_count) || '0',
    firstText(summary.domain_legacy_cleanup_plan_count) || '0',
  ].join(':');
};

const AppOperatorDrilldown: React.FC<{ drilldown: RuntimeTrayJsonRecord | null | undefined }> = ({ drilldown }) => {
  const { t } = useTranslation();
  const sourceProjection = isAppOperatorDrilldown(drilldown) ? drilldown : null;
  const sourceProjectionKey = projectionSourceKey(sourceProjection);
  const [fullDetail, setFullDetail] = React.useState<RuntimeTrayJsonRecord | null>(null);
  const [loadingFullDetail, setLoadingFullDetail] = React.useState(false);

  React.useEffect(() => {
    setFullDetail(null);
  }, [sourceProjectionKey]);

  const projection = isAppOperatorDrilldown(fullDetail) ? fullDetail : sourceProjection;
  if (!projection) return null;

  const availability = firstText(projection.availability) || 'unknown';
  const detailLevel = firstText(projection.detail_level) || 'summary';
  const summary = nestedRecord(projection, 'summary');
  const authority = nestedRecord(projection, 'authority_boundary');
  const memory = nestedRecord(projection, 'memory_writeback_refs');
  const quality = nestedRecord(projection, 'quality_readiness_refs');
  const functional = nestedRecord(projection, 'functional_privatization_audit_summary');
  const metrics = buildMetrics(summary, t);
  const sections = buildSections(projection, t);
  const omaSummarySections = omaSections(projection, t);
  const consumedMemoryRefs = textList(memory.consumed_memory_refs);
  const writebackReceiptRefs = textList(memory.writeback_receipt_refs);
  const qualityRefs = textList(quality.quality_refs);
  const readinessRefs = textList(quality.readiness_refs);
  const handleLoadFullDetail = () => {
    setLoadingFullDetail(true);
    void ipcBridge.shell.runOplCommand
      .invoke({ args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'] })
      .then((result) => {
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || result.stdout || t('common.runtimeTray.appDrilldown.fullDetailFailed'));
        }
        const payload = JSON.parse(result.stdout) as { app_operator_drilldown?: unknown };
        if (!isAppOperatorDrilldown(payload.app_operator_drilldown)) {
          throw new Error(t('common.runtimeTray.appDrilldown.fullDetailFailed'));
        }
        setFullDetail(payload.app_operator_drilldown);
        Message.success(t('common.runtimeTray.appDrilldown.fullDetailLoaded'));
      })
      .catch((error) => {
        Message.error(error instanceof Error ? error.message : t('common.runtimeTray.appDrilldown.fullDetailFailed'));
      })
      .finally(() => {
        setLoadingFullDetail(false);
      });
  };

  return (
    <section className='flex flex-col gap-14px'>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.appDrilldown.title')}</h2>
        <div className='flex flex-wrap items-center gap-8px'>
          <Tag color={statusColor(availability)}>{availability}</Tag>
          <Tag color={detailLevel === 'full' ? 'green' : 'blue'}>{detailLevel}</Tag>
          <Button
            size='mini'
            type='outline'
            icon={<Refresh theme='outline' size={12} />}
            loading={loadingFullDetail}
            onClick={handleLoadFullDetail}
          >
            {t('common.runtimeTray.appDrilldown.loadFullDetail')}
          </Button>
        </div>
      </div>
      <div className='h-1px w-full bg-[var(--color-border-2)]' />

      <div className='grid grid-cols-1 gap-10px md:grid-cols-4'>{metrics.map(renderMetricCard)}</div>

      <div className='grid grid-cols-1 gap-10px md:grid-cols-3'>
        {summaryCards(summary, functional, t).map(renderSummaryCard)}
      </div>

      {omaSummarySections.length > 0 && (
        <div className='grid grid-cols-1 gap-10px'>{omaSummarySections.map(renderOmaSection)}</div>
      )}

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
