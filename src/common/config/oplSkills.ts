/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const OPL_DEFAULT_CODEX_SKILLS = [
  'mas',
  'mag',
  'rca',
  'superpowers',
  'officecli',
  'officecli-docx',
  'officecli-pptx',
  'officecli-xlsx',
  'ui-ux-pro-max',
] as const;

export const OPL_APP_ACTIVATION_POLICY = [
  '## OPL App 默认会话规则',
  '',
  '你正在 OPL App 的 Codex 会话中工作。OPL 负责默认会话入口、显式激活和共享上下文；领域事实与运行入口由被选中的 domain module 持有。',
  '',
  '默认路由：',
  '- 科研、研究、论文、课题、数据分析、审稿、返修、投稿、投稿包、研究进度：使用 MAS。',
  '- 基金、标书、申请书：使用 MAG。',
  '- PPT、演示、视觉交付物：使用 RCA。',
  '- 通用 OPL 或工程协作：保持 Codex/OPL 默认入口。',
  '- 用户明确指定路线时，以用户指定为准；不要要求用户输入 @MAS。',
].join('\n');

const LEGACY_OPL_APP_ACTIVATION_POLICY = [
  '## OPL App Activation Policy',
  '',
  '当前会话来自 OPL App。OPL App 是科研、论文、基金和视觉交付物的自然语言入口。',
  '',
  '默认激活策略：',
  '- 用户提到科研、研究、论文、课题、数据分析、审稿、返修、投稿、投稿包、研究进度时，优先按 MAS 路线处理。',
  '- 除非用户明确要求不要使用 MAS，或请求明显不适合 MAS。',
  '- 不要求用户输入 @MAS；@MAS 只是显式快捷方式。',
  '- 选择 MAS 后，使用 MAS 作为领域 truth 和运行入口，OPL 只负责激活和共享上下文。',
].join('\n');

export const OPL_LEGACY_CODEX_CONTEXT_SNIPPETS = [
  [
    'One Person Lab is the default Codex runtime surface for this app.',
    'Apply the OPL App activation policy before choosing domain routes.',
    'Use @opl as the general One Person Lab route, @mas for Med Auto Science, @mag for Med Auto Grant, and @rca for RedCube AI.',
    'Keep domain truth in the selected domain module and use OPL only as the activation and shared-contract layer.',
    '',
    LEGACY_OPL_APP_ACTIVATION_POLICY,
  ].join('\n'),
] as const;

export const OPL_CODEX_CONTEXT_SNIPPET = OPL_APP_ACTIVATION_POLICY;

export function normalizeOplCodexSessionContext(context?: unknown): string | undefined {
  if (typeof context !== 'string') return undefined;
  const trimmed = context.trim();
  if (!trimmed) return undefined;
  return OPL_LEGACY_CODEX_CONTEXT_SNIPPETS.some((legacyContext) => legacyContext === trimmed)
    ? OPL_CODEX_CONTEXT_SNIPPET
    : trimmed;
}

export function mergeOplDefaultCodexSkills(enabledSkills?: string[]): string[] {
  return [...new Set([...OPL_DEFAULT_CODEX_SKILLS, ...(enabledSkills ?? [])])];
}

export function mergeOplDefaultCodexContext(
  context?: string,
  options: { codexSessionAddendum?: string; codexSessionContext?: string } = {}
): string {
  const trimmed = context?.trim();
  const sessionContext = normalizeOplCodexSessionContext(options.codexSessionContext);
  const sessionAddendum = sessionContext ? undefined : options.codexSessionAddendum?.trim();
  const parts = [sessionContext || OPL_CODEX_CONTEXT_SNIPPET];
  if (sessionAddendum) {
    parts.push(['## OPL App 会话补充', '', sessionAddendum].join('\n'));
  }
  if (trimmed) {
    parts.push(trimmed);
  }
  return parts.join('\n\n');
}
