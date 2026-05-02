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

export const OPL_CODEX_CONTEXT_SNIPPET = [
  'One Person Lab is the default Codex runtime surface for this app.',
  'Apply the OPL App activation policy before choosing domain routes.',
  'Use @opl as the general One Person Lab route, @mas for Med Auto Science, @mag for Med Auto Grant, and @rca for RedCube AI.',
  'Keep domain truth in the selected domain module and use OPL only as the activation and shared-contract layer.',
  '',
  OPL_APP_ACTIVATION_POLICY,
].join('\n');

export function mergeOplDefaultCodexSkills(enabledSkills?: string[]): string[] {
  return [...new Set([...OPL_DEFAULT_CODEX_SKILLS, ...(enabledSkills ?? [])])];
}

export function mergeOplDefaultCodexContext(
  context?: string,
  options: { codexSessionAddendum?: string } = {}
): string {
  const trimmed = context?.trim();
  const sessionAddendum = options.codexSessionAddendum?.trim();
  const parts = [OPL_CODEX_CONTEXT_SNIPPET];
  if (sessionAddendum) {
    parts.push(['## OPL App Session Addendum', '', sessionAddendum].join('\n'));
  }
  if (trimmed) {
    parts.push(trimmed);
  }
  return parts.join('\n\n');
}
