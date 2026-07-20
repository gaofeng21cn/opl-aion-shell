type CapabilitySummaryTranslate = (key: string, options?: Record<string, string>) => string;

const CAPABILITY_SUMMARY_KEYS = new Map<string, string>([
  ['documents', 'documents'],
  ['presentations', 'presentations'],
  ['spreadsheets', 'spreadsheets'],
  ['pdf', 'pdf'],
  ['med-autoscience', 'medAutoscience'],
  ['med-autogrant', 'medAutogrant'],
  ['redcube-ai', 'redcubeAi'],
  ['opl-bookforge', 'oplBookforge'],
  ['opl-meta-agent', 'oplMetaAgent'],
  ['officecli', 'officecli'],
  ['officecli-docx', 'officecliDocx'],
  ['officecli-pptx', 'officecliPptx'],
  ['officecli-xlsx', 'officecliXlsx'],
  ['mineru-document-extractor', 'mineruDocumentExtractor'],
  ['ui-ux-pro-max', 'uiUxProMax'],
]);

const normalizedCapabilityIdentities = (value: string): string[] => {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  const unqualified = normalized.split(':').at(-1)?.split('/').at(-1);
  return unqualified && unqualified !== normalized ? [normalized, unqualified] : [normalized];
};

export function localizedCapabilitySummary(
  identities: Array<string | null | undefined>,
  fallbackName: string,
  t: CapabilitySummaryTranslate
): string {
  const summaryKey = identities
    .filter((value): value is string => Boolean(value))
    .flatMap(normalizedCapabilityIdentities)
    .map((identity) => CAPABILITY_SUMMARY_KEYS.get(identity))
    .find((value): value is string => Boolean(value));
  return summaryKey
    ? t(`settings.uiOptimization.capabilities.summaries.${summaryKey}`)
    : t('settings.uiOptimization.capabilities.summaries.fallback', { name: fallbackName });
}
