import {
  Communication,
  Computer,
  Dashboard,
  Earth,
  FolderOpen,
  Lightning,
  LinkCloud,
  Puzzle,
  SettingConfig,
  SwitchThemes,
  System,
  Toolkit,
} from '@icon-park/react';
import React from 'react';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  getOplGuiSettingsControlPlane,
  getOplGuiSettingsSecondaryPageIds,
  getOplGuiSettingsVisibleTabs,
  type OplSettingsControlPlane,
  type OplSettingsControlPlaneRoute,
  type OplSettingsControlPlaneSecondaryPage,
} from '@/common/config/oplProductProfile';
import { iconColors } from '@/renderer/styles/colors';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

export const APP_SETTINGS_TOP_LEVEL_TAB_IDS = [
  'general',
  'access',
  'workspace',
  'capabilities',
  'resources',
  'environment',
  'storage',
  'appearance',
] as const;

export type AppSettingsTopLevelTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

const settingsControlPlane = getOplGuiSettingsControlPlane();
const profileTabIds = getOplGuiSettingsVisibleTabs();
const secondaryPageIds = getOplGuiSettingsSecondaryPageIds();
const ordinaryRoutes = settingsControlPlane?.ordinary_routes ?? [];
const contractSecondaryPages = settingsControlPlane?.secondary_pages ?? [];
const shellSecondaryPages: OplSettingsControlPlaneSecondaryPage[] = [];
const secondaryPages = [...contractSecondaryPages, ...shellSecondaryPages];
const ordinaryRoutesById = new Map(ordinaryRoutes.map((route) => [route.id, route]));
const secondaryPagesById = new Map(secondaryPages.map((page) => [page.id, page]));

export const BUILTIN_TAB_IDS = APP_SETTINGS_TOP_LEVEL_TAB_IDS.filter((id) => profileTabIds.includes(id));

export type BuiltinSettingsTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

export const OPL_SEARCHABLE_SECONDARY_TAB_IDS = secondaryPages
  .filter((page) => secondaryPageIds.includes(page.id) && page.visibility === 'secondary_or_deep_link')
  .map((page) => page.id);

export const SETTINGS_DEFAULT_ROUTE = settingsControlPlane?.default_route ?? '/settings/general';

export const SETTINGS_ROUTE_PATHS: Record<string, string> = Object.fromEntries(
  [...ordinaryRoutes, ...secondaryPages].map((route) => [route.id, route.path])
);

const pathToSettingsRoute = (path: string): string => {
  const normalized = path.trim();
  return normalized.startsWith('/settings/') || normalized === '/settings' ? normalized : SETTINGS_DEFAULT_ROUTE;
};

const parseSettingsRouteTarget = (
  routeId: string
): { routeId: string; queryParams: Record<string, string>; anchor: string } => {
  const [routeAndQuery, anchor = ''] = routeId.split('#', 2);
  const [baseRouteId, query = ''] = routeAndQuery.split('?', 2);
  return {
    routeId: baseRouteId,
    queryParams: Object.fromEntries(new URLSearchParams(query).entries()),
    anchor,
  };
};

const routePathFor = (routeId: string): string => {
  const routeTarget = parseSettingsRouteTarget(routeId);
  const route = ordinaryRoutesById.get(routeTarget.routeId);
  const query = new URLSearchParams(routeTarget.queryParams).toString();
  const suffix = query ? `?${query}` : '';
  const anchorSuffix = routeTarget.anchor ? `#${routeTarget.anchor}` : '';
  if (route) return `${pathToSettingsRoute(route.path)}${suffix}${anchorSuffix}`;
  const page = secondaryPagesById.get(routeTarget.routeId);
  if (page) return `${pathToSettingsRoute(page.path)}${suffix}${anchorSuffix}`;
  return SETTINGS_DEFAULT_ROUTE;
};

export function getOplGuiLegacySettingsRouteRedirects(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settingsControlPlane?.legacy_route_redirects ?? {}).map(([legacyId, targetId]) => [
      legacyId,
      routePathFor(targetId),
    ])
  );
}

export const LEGACY_SETTINGS_ROUTE_REDIRECTS = getOplGuiLegacySettingsRouteRedirects();

export const LEGACY_SETTINGS_ANCHOR_REMAP: Record<string, string> = settingsControlPlane?.extension_anchor_remap
  ? { ...settingsControlPlane.extension_anchor_remap }
  : {};
export const LEGACY_ANCHOR_REMAP = LEGACY_SETTINGS_ANCHOR_REMAP;

export const GROUP_HEADER_BEFORE: Record<BuiltinSettingsTabId, string | undefined> = {
  general: undefined,
  access: undefined,
  workspace: undefined,
  capabilities: undefined,
  resources: undefined,
  environment: undefined,
  storage: undefined,
  appearance: undefined,
};

const controlPlaneLabelKeys = Object.fromEntries(ordinaryRoutes.map((route) => [route.id, route.label_key]));

export const OPL_SETTINGS_TAB_LABEL_KEYS: Record<string, string> = {
  ...controlPlaneLabelKeys,
};

const controlPlaneDefaultLabels = Object.fromEntries(ordinaryRoutes.map((route) => [route.id, route.default_label_en]));

export const OPL_SETTINGS_TAB_DEFAULT_LABELS: Record<string, string> = {
  ...controlPlaneDefaultLabels,
};

export const OPL_SETTINGS_SEARCH_TERMS: Record<string, string[]> = {
  general: ['overview', 'status', 'attention', 'workspace', '概览', '状态', '待处理', '工作目录'],
  access: [
    'access',
    'model',
    'account',
    'api key',
    'gateway',
    'codex',
    'browser',
    'remote',
    '访问',
    '模型',
    '密钥',
    '浏览器',
    '远程',
  ],
  resources: [
    'resources',
    'connections',
    'server webui',
    'workspace',
    'cloud',
    'external',
    '资源',
    '连接',
    '服务器',
    '工作区',
    '云端',
    '外部连接',
  ],
  workspace: [
    'workspace',
    'work directory',
    'project folder',
    'logs',
    'modules root',
    'paths',
    'permission',
    '工作目录',
    '项目',
    '日志',
    '模块',
    '路径',
    '权限',
  ],
  capabilities: [
    'capabilities',
    'agents',
    'skills',
    'tools',
    'voice',
    'mas',
    'mag',
    'rca',
    'oma',
    'book forge',
    '能力',
    '智能体',
    '技能',
    '工具',
    '语音',
    '首页显示',
  ],
  environment: [
    'maintenance',
    'updates',
    'runtime',
    'packages',
    'repair',
    'rollback',
    'health',
    'background services',
    '维护',
    '更新',
    '本机环境',
    '能力包',
    '修复',
    '回滚',
    '健康',
    '后台服务',
  ],
  storage: [
    'data',
    'storage',
    'cleanup',
    'archive',
    'restore',
    'logs',
    'cache',
    '数据',
    '存储',
    '清理',
    '归档',
    '恢复',
    '日志',
    '缓存',
  ],
  appearance: [
    'preferences',
    'appearance',
    'theme',
    'language',
    'startup',
    'font',
    'timeout',
    'hardware acceleration',
    '偏好',
    '外观',
    '主题',
    '语言',
    '开机启动',
    '字体',
    '超时',
    '硬件加速',
  ],
  advanced: ['advanced', 'developer', 'diagnostics', 'paths', 'flow', '高级', '开发者', '诊断', '路径'],
  about: ['about', 'version', 'release channel', 'updates', 'feedback', '关于', '版本', '发布通道', '更新', '反馈'],
};

type SettingsSearchEntryDefinition = {
  id: string;
  pageId: string;
  anchor: string;
  labelKey: string;
  defaultLabelEn: string;
  defaultLabelZh: string;
  terms: string[];
};

const SETTINGS_SEARCH_ENTRY_DEFINITIONS: SettingsSearchEntryDefinition[] = [
  {
    id: 'overview-status',
    pageId: 'general',
    anchor: 'status',
    labelKey: 'settings.searchEntries.overview.status',
    defaultLabelEn: 'Overall status',
    defaultLabelZh: '总体状态',
    terms: ['ready', 'usable', '可用', '健康'],
  },
  {
    id: 'overview-attention',
    pageId: 'general',
    anchor: 'attention',
    labelKey: 'settings.searchEntries.overview.attention',
    defaultLabelEn: 'Needs attention',
    defaultLabelZh: '待处理事项',
    terms: ['issue', 'problem', 'next action', '问题', '异常', '下一步'],
  },
  {
    id: 'overview-workspace',
    pageId: 'general',
    anchor: 'workspace',
    labelKey: 'settings.searchEntries.overview.workspace',
    defaultLabelEn: 'Work directory summary',
    defaultLabelZh: '工作目录摘要',
    terms: ['folder', 'path', '目录', '路径'],
  },
  {
    id: 'overview-shortcuts',
    pageId: 'general',
    anchor: 'shortcuts',
    labelKey: 'settings.searchEntries.overview.shortcuts',
    defaultLabelEn: 'Common destinations',
    defaultLabelZh: '常用入口',
    terms: ['shortcut', 'quick', '快捷', '入口'],
  },
  {
    id: 'access-model',
    pageId: 'access',
    anchor: 'model-access',
    labelKey: 'settings.searchEntries.access.modelAccess',
    defaultLabelEn: 'Model access',
    defaultLabelZh: '模型访问',
    terms: ['provider', 'login', 'openai', 'gateway', '供应方', '登录'],
  },
  {
    id: 'access-codex',
    pageId: 'access',
    anchor: 'codex-cli',
    labelKey: 'settings.searchEntries.access.codexCli',
    defaultLabelEn: 'Codex CLI',
    defaultLabelZh: 'Codex CLI',
    terms: ['version', 'default model', '版本', '默认模型'],
  },
  {
    id: 'access-gateway',
    pageId: 'access',
    anchor: 'opl-gateway',
    labelKey: 'settings.searchEntries.access.gateway',
    defaultLabelEn: 'OPL Gateway access key',
    defaultLabelZh: 'OPL Gateway 访问密钥',
    terms: ['api key', 'replace key', '密钥', '更换密钥'],
  },
  {
    id: 'access-browser',
    pageId: 'access',
    anchor: 'browser-access',
    labelKey: 'settings.searchEntries.access.browser',
    defaultLabelEn: 'Browser access',
    defaultLabelZh: '本机浏览器访问',
    terms: ['port', 'account', 'password', 'webui', 'remote', '端口', '账号', '密码', '远程'],
  },
  {
    id: 'workspace-root',
    pageId: 'workspace',
    anchor: 'work-directory',
    labelKey: 'settings.searchEntries.workspace.root',
    defaultLabelEn: 'Work directory',
    defaultLabelZh: '工作目录',
    terms: ['project folder', 'artifact', '项目目录', '任务产物'],
  },
  {
    id: 'workspace-permission',
    pageId: 'workspace',
    anchor: 'permissions',
    labelKey: 'settings.searchEntries.workspace.permissions',
    defaultLabelEn: 'File permissions',
    defaultLabelZh: '文件权限',
    terms: ['write access', 'executor', '写入', '执行权限'],
  },
  {
    id: 'workspace-technical',
    pageId: 'workspace',
    anchor: 'technical-paths',
    labelKey: 'settings.searchEntries.workspace.technical',
    defaultLabelEn: 'Technical paths',
    defaultLabelZh: '技术路径',
    terms: ['logs', 'modules root', 'support', '日志', '模块目录', '支持'],
  },
  {
    id: 'capabilities-directory',
    pageId: 'capabilities',
    anchor: 'capability-directory',
    labelKey: 'settings.searchEntries.capabilities.directory',
    defaultLabelEn: 'Capability availability',
    defaultLabelZh: '能力可用状态',
    terms: ['mas', 'mag', 'rca', 'oma', 'book forge', '可在对话中使用'],
  },
  {
    id: 'capabilities-home',
    pageId: 'capabilities',
    anchor: 'home-shortcuts',
    labelKey: 'settings.searchEntries.capabilities.home',
    defaultLabelEn: 'Home shortcuts',
    defaultLabelZh: '首页显示',
    terms: ['show on home', 'order', '首页快捷方式', '排序'],
  },
  {
    id: 'capabilities-tools',
    pageId: 'capabilities',
    anchor: 'external-tools',
    labelKey: 'settings.searchEntries.capabilities.tools',
    defaultLabelEn: 'External tools and voice',
    defaultLabelZh: '外部工具与语音',
    terms: ['mcp', 'voice input', '连接工具', '语音输入'],
  },
  {
    id: 'capabilities-assistants',
    pageId: 'capabilities',
    anchor: 'custom-assistants',
    labelKey: 'settings.searchEntries.capabilities.assistants',
    defaultLabelEn: 'Custom assistants',
    defaultLabelZh: '自定义助手',
    terms: ['assistant', 'create assistant', '助手', '创建助手'],
  },
  {
    id: 'resources-webui',
    pageId: 'resources',
    anchor: 'server-webui',
    labelKey: 'settings.searchEntries.resources.webui',
    defaultLabelEn: 'Server WebUI',
    defaultLabelZh: '服务器 WebUI',
    terms: ['docker', 'browser server', '部署', '服务器访问'],
  },
  {
    id: 'resources-workspace',
    pageId: 'resources',
    anchor: 'opl-workspace',
    labelKey: 'settings.searchEntries.resources.workspace',
    defaultLabelEn: 'Workspace',
    defaultLabelZh: '工作区',
    terms: ['hosted workspace', '托管工作区'],
  },
  {
    id: 'resources-connections',
    pageId: 'resources',
    anchor: 'external-connections',
    labelKey: 'settings.searchEntries.resources.connections',
    defaultLabelEn: 'External connections',
    defaultLabelZh: '外部连接',
    terms: ['ssh', 'hpc', 'cloud', 'fabric', 'console', '外部资源', '云端'],
  },
  {
    id: 'maintenance-health',
    pageId: 'environment',
    anchor: 'health',
    labelKey: 'settings.searchEntries.maintenance.health',
    defaultLabelEn: 'Health summary',
    defaultLabelZh: '健康摘要',
    terms: ['status', 'attention', '状态', '待处理'],
  },
  {
    id: 'maintenance-updates',
    pageId: 'environment',
    anchor: 'updates',
    labelKey: 'settings.searchEntries.maintenance.updates',
    defaultLabelEn: 'App updates',
    defaultLabelZh: 'App 更新',
    terms: ['check for updates', 'release', '检查更新', '版本'],
  },
  {
    id: 'maintenance-runtime',
    pageId: 'environment',
    anchor: 'runtime-environment',
    labelKey: 'settings.searchEntries.maintenance.runtime',
    defaultLabelEn: 'Local environment',
    defaultLabelZh: '本机环境',
    terms: ['runtime substrate', 'repair', '运行环境', '修复'],
  },
  {
    id: 'maintenance-packages',
    pageId: 'environment',
    anchor: 'capability-packages',
    labelKey: 'settings.searchEntries.maintenance.packages',
    defaultLabelEn: 'Capability packages',
    defaultLabelZh: '能力包',
    terms: ['sync', 'module update', '同步', '模块更新'],
  },
  {
    id: 'maintenance-services',
    pageId: 'environment',
    anchor: 'background-services',
    labelKey: 'settings.searchEntries.maintenance.services',
    defaultLabelEn: 'Background services',
    defaultLabelZh: '后台服务',
    terms: ['temporal', 'doctor', '后台任务', '检查服务'],
  },
  {
    id: 'maintenance-advanced',
    pageId: 'environment',
    anchor: 'advanced-maintenance',
    labelKey: 'settings.searchEntries.maintenance.advanced',
    defaultLabelEn: 'Advanced maintenance',
    defaultLabelZh: '高级维护',
    terms: ['rollback', 'receipts', 'diagnostics', '回滚', '操作记录', '诊断'],
  },
  {
    id: 'storage-installer',
    pageId: 'storage',
    anchor: 'installer-cache',
    labelKey: 'settings.searchEntries.storage.installer',
    defaultLabelEn: 'Installer cache',
    defaultLabelZh: '安装缓存',
    terms: ['updater cache', '安装包', '更新缓存'],
  },
  {
    id: 'storage-conversations',
    pageId: 'storage',
    anchor: 'conversation-archives',
    labelKey: 'settings.searchEntries.storage.conversations',
    defaultLabelEn: 'Conversation archives',
    defaultLabelZh: '对话归档',
    terms: ['archive', 'restore', 'backup', '归档', '恢复', '备份'],
  },
  {
    id: 'storage-runtime',
    pageId: 'storage',
    anchor: 'runtime-cache',
    labelKey: 'settings.searchEntries.storage.runtime',
    defaultLabelEn: 'Runtime cache',
    defaultLabelZh: '运行缓存',
    terms: ['cleanup preview', '清理预览'],
  },
  {
    id: 'storage-logs',
    pageId: 'storage',
    anchor: 'logs',
    labelKey: 'settings.searchEntries.storage.logs',
    defaultLabelEn: 'Logs',
    defaultLabelZh: '日志',
    terms: ['rotation', 'log cleanup', '轮转', '清理日志'],
  },
  {
    id: 'preferences-behavior',
    pageId: 'appearance',
    anchor: 'app-behavior',
    labelKey: 'settings.searchEntries.preferences.behavior',
    defaultLabelEn: 'App behavior',
    defaultLabelZh: 'App 行为',
    terms: ['startup', 'close window', '开机启动', '关闭窗口', '菜单栏'],
  },
  {
    id: 'preferences-display',
    pageId: 'appearance',
    anchor: 'display',
    labelKey: 'settings.searchEntries.preferences.display',
    defaultLabelEn: 'Language and display',
    defaultLabelZh: '语言与显示',
    terms: ['language', 'font', 'scale', '语言', '字体', '缩放'],
  },
  {
    id: 'preferences-theme',
    pageId: 'appearance',
    anchor: 'themes',
    labelKey: 'settings.searchEntries.preferences.theme',
    defaultLabelEn: 'Themes',
    defaultLabelZh: '主题',
    terms: ['appearance', 'color', '外观', '颜色'],
  },
  {
    id: 'preferences-advanced',
    pageId: 'appearance',
    anchor: 'advanced-preferences',
    labelKey: 'settings.searchEntries.preferences.advanced',
    defaultLabelEn: 'Advanced preferences',
    defaultLabelZh: '高级偏好',
    terms: ['model timeout', 'background assistant', 'hardware acceleration', '模型响应超时', '后台助手', '硬件加速'],
  },
  {
    id: 'advanced-paths',
    pageId: 'advanced',
    anchor: 'resolved-paths',
    labelKey: 'settings.searchEntries.advanced.paths',
    defaultLabelEn: 'Resolved paths',
    defaultLabelZh: '解析路径',
    terms: ['work directory', 'logs', '工作目录', '日志'],
  },
  {
    id: 'advanced-profile',
    pageId: 'advanced',
    anchor: 'developer-profile',
    labelKey: 'settings.searchEntries.advanced.profile',
    defaultLabelEn: 'Developer profile',
    defaultLabelZh: '开发者配置',
    terms: ['capabilities', 'source profile', '能力', '来源配置'],
  },
  {
    id: 'advanced-flow',
    pageId: 'advanced',
    anchor: 'opl-flow',
    labelKey: 'settings.searchEntries.advanced.flow',
    defaultLabelEn: 'OPL Flow context',
    defaultLabelZh: 'OPL Flow 上下文',
    terms: ['workflow profile', 'intelligence enhancement', '工作流配置', '智能增强'],
  },
  {
    id: 'advanced-developer-tools',
    pageId: 'advanced',
    anchor: 'developer-tools',
    labelKey: 'settings.searchEntries.advanced.developerTools',
    defaultLabelEn: 'Developer tools',
    defaultLabelZh: '开发工具',
    terms: ['diagnostics', 'devtools', 'cdp', '诊断', '开发工具'],
  },
  {
    id: 'about-version',
    pageId: 'about',
    anchor: 'version',
    labelKey: 'settings.searchEntries.about.version',
    defaultLabelEn: 'Version and channel',
    defaultLabelZh: '版本与通道',
    terms: ['app version', 'stable', 'nightly', 'App版本', '稳定版'],
  },
  {
    id: 'about-updates',
    pageId: 'about',
    anchor: 'update-status',
    labelKey: 'settings.searchEntries.about.updates',
    defaultLabelEn: 'Update status',
    defaultLabelZh: '更新状态',
    terms: ['check update', 'latest version', '检查更新', '最新版本'],
  },
  {
    id: 'about-feedback',
    pageId: 'about',
    anchor: 'feedback',
    labelKey: 'settings.searchEntries.about.feedback',
    defaultLabelEn: 'Feedback and support',
    defaultLabelZh: '反馈与支持',
    terms: ['issue', 'help', 'bug', '问题', '帮助', '反馈'],
  },
  {
    id: 'about-technical',
    pageId: 'about',
    anchor: 'technical-details',
    labelKey: 'settings.searchEntries.about.technical',
    defaultLabelEn: 'Technical details',
    defaultLabelZh: '技术详情',
    terms: ['shell version', 'framework revision', '界面版本', '框架版本'],
  },
];

export type SettingsSearchEntry = {
  id: string;
  pageId: string;
  pageLabel: string;
  itemLabel: string;
  resultLabel: string;
  path: string;
  anchor: string;
  searchText: string;
};

export function getSettingsSearchEntries(t: TranslateFn): SettingsSearchEntry[] {
  return SETTINGS_SEARCH_ENTRY_DEFINITIONS.flatMap((entry) => {
    if (!ordinaryRoutesById.has(entry.pageId) && !secondaryPagesById.has(entry.pageId)) return [];
    const pageLabel = getSettingsTabLabel(entry.pageId, t);
    const itemLabel = t(entry.labelKey, { defaultValue: entry.defaultLabelEn });
    const route = routePathFor(entry.pageId).replace(/^\/settings\/?/, '');
    const routeMetadata = ordinaryRoutesById.get(entry.pageId) ?? secondaryPagesById.get(entry.pageId);
    const routeLabels = routeMetadata as Partial<OplSettingsControlPlaneRoute>;
    return [
      {
        id: entry.id,
        pageId: entry.pageId,
        pageLabel,
        itemLabel,
        resultLabel: `${pageLabel} > ${itemLabel}`,
        path: `${route}#${entry.anchor}`,
        anchor: entry.anchor,
        searchText: normalizeSearchText(
          [
            entry.pageId,
            pageLabel,
            routeLabels.default_label_en,
            routeLabels.default_label_zh,
            entry.defaultLabelEn,
            entry.defaultLabelZh,
            itemLabel,
            ...entry.terms,
          ].join(' ')
        ),
      },
    ];
  });
}

export type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export type SettingsIconSlot = 'modal' | 'siderDesktop' | 'siderMobile';

export function getSettingsTabLabel(tabId: string, t: TranslateFn): string {
  const route = ordinaryRoutesById.get(tabId);
  return t(OPL_SETTINGS_TAB_LABEL_KEYS[tabId] ?? `settings.${tabId}`, {
    defaultValue:
      OPL_SETTINGS_TAB_DEFAULT_LABELS[tabId] ?? route?.default_label_en ?? secondaryPagesById.get(tabId)?.id ?? tabId,
  });
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function getSettingsTabSearchText(tabId: string, label: string): string {
  const route = ordinaryRoutesById.get(tabId);
  const page = secondaryPagesById.get(tabId);
  return normalizeSearchText(
    [
      tabId,
      label,
      route?.default_label_en,
      route?.default_label_zh,
      route?.ia_group,
      route?.state_source,
      route?.refresh_source,
      route?.scope,
      route?.intent,
      route?.risk,
      route?.frequency,
      page?.ia_group,
      page?.visibility,
      page?.scope,
      page?.intent,
      page?.risk,
      page?.frequency,
      ...(OPL_SETTINGS_SEARCH_TERMS[tabId] ?? []),
    ].join(' ')
  );
}

export function getSettingsTabIcon(tabId: string, slot: SettingsIconSlot): React.ReactElement {
  const iconToken = ordinaryRoutesById.get(tabId)?.icon_token ?? tabId;
  if (slot === 'modal') {
    const modalIcons: Record<string, React.ReactElement> = {
      general: <Computer theme='outline' size='20' fill={iconColors.secondary} />,
      workspace: <FolderOpen theme='outline' size='20' fill={iconColors.secondary} />,
      'local-services': <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      resources: <LinkCloud theme='outline' size='20' fill={iconColors.secondary} />,
      environment: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      storage: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      capabilities: <Lightning theme='outline' size='20' fill={iconColors.secondary} />,
      access: <Earth theme='outline' size='20' fill={iconColors.secondary} />,
      appearance: <SwitchThemes theme='outline' size='20' fill={iconColors.secondary} />,
      advanced: <SettingConfig theme='outline' size='20' fill={iconColors.secondary} />,
    };
    return (
      modalIcons[iconToken] ?? modalIcons[tabId] ?? <Puzzle theme='outline' size='20' fill={iconColors.secondary} />
    );
  }

  const siderIcons: Record<string, React.ReactElement> = {
    general: <Dashboard />,
    access: slot === 'siderDesktop' ? <Earth /> : <Communication />,
    workspace: <FolderOpen />,
    capabilities: <Lightning />,
    resources: <LinkCloud />,
    environment: <Toolkit />,
    storage: <Toolkit />,
    appearance: <SwitchThemes />,
    advanced: <System />,
  };
  return siderIcons[iconToken] ?? siderIcons[tabId] ?? <Puzzle />;
}

export function resolveLegacySettingsAnchor(anchor: string): string {
  return LEGACY_SETTINGS_ANCHOR_REMAP[anchor] ?? anchor;
}

export function resolveLegacySettingsRoute(tabId: string): string {
  return LEGACY_SETTINGS_ROUTE_REDIRECTS[tabId] ?? routePathFor(tabId);
}

export function normalizeOplSettingsTab(tabId: string): string {
  return LEGACY_SETTINGS_ANCHOR_REMAP[tabId] ?? tabId;
}

export type SettingsCapabilityDetailTab = 'skills' | 'tools';

const SETTINGS_CAPABILITY_DETAIL_TABS = new Set<string>(['skills', 'tools']);

const normalizeCapabilityDetailTab = (value: string | undefined): SettingsCapabilityDetailTab | null => {
  return value && SETTINGS_CAPABILITY_DETAIL_TABS.has(value) ? (value as SettingsCapabilityDetailTab) : null;
};

export type SettingsRenderTarget = {
  routeId: string;
  capabilitiesTab: SettingsCapabilityDetailTab;
};

export function resolveSettingsRenderTarget(tabId: string): SettingsRenderTarget {
  const routeTarget = parseSettingsRouteTarget(settingsControlPlane?.legacy_route_redirects?.[tabId] ?? tabId);
  const routeId = routeSlotIds.has(routeTarget.routeId)
    ? routeTarget.routeId
    : normalizeOplSettingsTab(routeTarget.routeId);
  const slot = getSettingsRenderSlot(routeId);
  const subrouteParam = slot?.subrouteQueryParam ?? 'tab';
  const tabFromRoute = normalizeCapabilityDetailTab(routeTarget.queryParams[subrouteParam]);
  const tabFromLegacySlot = normalizeCapabilityDetailTab(slot?.legacySubroutes?.[tabId]);

  return {
    routeId,
    capabilitiesTab: tabFromRoute ?? tabFromLegacySlot ?? 'skills',
  };
}

export function capabilityDetailTabFor(tabId: string): SettingsCapabilityDetailTab {
  return resolveSettingsRenderTarget(tabId).capabilitiesTab;
}

type RegistryItem = {
  id: string;
};

type BuildSettingsItemsOptions<Item extends RegistryItem> = {
  builtinItems: Item[];
  extensionTabs: IExtensionSettingsTab[];
  toExtensionItem: (tab: IExtensionSettingsTab) => Item;
};

export function buildSettingsItemsWithExtensions<Item extends RegistryItem>({
  builtinItems,
  extensionTabs,
  toExtensionItem,
}: BuildSettingsItemsOptions<Item>): Item[] {
  const result = [...builtinItems];
  const builtinIds = new Set(result.map((item) => item.id));
  const beforeMap = new Map<string, IExtensionSettingsTab[]>();
  const afterMap = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];

  for (const tab of extensionTabs) {
    const rawAnchor = tab.position?.relativeTo;
    const anchor = rawAnchor ? resolveLegacySettingsAnchor(rawAnchor) : undefined;
    if (!anchor || !builtinIds.has(anchor)) {
      unanchored.push(tab);
      continue;
    }

    const map = tab.position?.placement === 'before' ? beforeMap : afterMap;
    let list = map.get(anchor);
    if (!list) {
      list = [];
      map.set(anchor, list);
    }
    list.push(tab);
  }

  for (let i = result.length - 1; i >= 0; i--) {
    const id = result[i].id;
    const afters = afterMap.get(id);
    if (afters) result.splice(i + 1, 0, ...afters.map(toExtensionItem));
    const befores = beforeMap.get(id);
    if (befores) result.splice(i, 0, ...befores.map(toExtensionItem));
  }

  if (unanchored.length > 0) {
    const advancedIdx = result.findIndex((item) => item.id === 'advanced');
    const insertIdx = advancedIdx >= 0 ? advancedIdx : result.length;
    result.splice(insertIdx, 0, ...unanchored.map(toExtensionItem));
  }

  return result;
}

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  path: string;
  searchText: string;
};

type BuildNavOptions = {
  builtinItems: SettingsNavItem[];
  extensionTabs: IExtensionSettingsTab[];
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
  extensionIconClassName: string;
};

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn): SettingsNavItem[] {
  const slot: SettingsIconSlot = isDesktop ? 'siderDesktop' : 'siderMobile';
  return BUILTIN_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t);
    const path = routePathFor(id).replace(/^\/settings\/?/, '');
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, slot),
      path,
      searchText: getSettingsTabSearchText(id, label),
    };
  });
}

export function buildSettingsNavItems({
  builtinItems,
  extensionTabs,
  resolveExtTabName,
  extensionIconClassName,
}: BuildNavOptions): SettingsNavItem[] {
  return buildSettingsItemsWithExtensions({
    builtinItems,
    extensionTabs,
    toExtensionItem: (tab) => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      const label = resolveExtTabName(tab);
      return {
        id: tab.id,
        label,
        icon: resolvedIcon ? <img src={resolvedIcon} alt='' className={extensionIconClassName} /> : <Puzzle />,
        isImageIcon: Boolean(resolvedIcon),
        path: `ext/${tab.id}`,
        searchText: normalizeSearchText([tab.id, label, tab.extensionName ?? ''].join(' ')),
      };
    },
  });
}

export type SettingsModalMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  searchText: string;
};

type BuildModalMenuOptions = {
  extensionTabs: IExtensionSettingsTab[];
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
  t: TranslateFn;
};

export function getBuiltinSettingsModalItems(t: TranslateFn): SettingsModalMenuItem[] {
  return BUILTIN_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t);
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, 'modal'),
      searchText: getSettingsTabSearchText(id, label),
    };
  });
}

export function getSearchableSecondarySettingsModalItems(t: TranslateFn): SettingsModalMenuItem[] {
  return OPL_SEARCHABLE_SECONDARY_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t);
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, 'modal'),
      searchText: getSettingsTabSearchText(id, label),
    };
  });
}

export function buildSettingsModalMenuItems({
  extensionTabs,
  resolveExtTabName,
  t,
}: BuildModalMenuOptions): SettingsModalMenuItem[] {
  return buildSettingsItemsWithExtensions({
    builtinItems: getBuiltinSettingsModalItems(t),
    extensionTabs,
    toExtensionItem: (tab) => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      const label = resolveExtTabName(tab);
      return {
        id: tab.id,
        label,
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-20px h-20px object-contain' />
        ) : (
          <Puzzle theme='outline' size='20' fill={iconColors.secondary} />
        ),
        searchText: normalizeSearchText([tab.id, label, tab.extensionName ?? ''].join(' ')),
      };
    },
  });
}

export type SettingsShellWrapperPolicy = 'host_provides_wrapper';

export type SettingsShellRenderSlot = {
  id: string;
  routeId: string;
  componentKey: string;
  wrapperPolicy: SettingsShellWrapperPolicy;
  subrouteQueryParam?: string;
  legacySubroutes?: Record<string, string>;
};

const routeSlotIds = new Map<string, string>();
for (const route of settingsControlPlane.ordinary_routes) {
  routeSlotIds.set(route.id, route.slot_id);
}
for (const page of secondaryPages) {
  routeSlotIds.set(page.id, page.slot_id);
}

type SettingsRouteComponentKey =
  | 'OverviewSettings'
  | 'WorkspaceSettings'
  | 'LocalServicesSettings'
  | 'AccessSettingsContent'
  | 'ResourcesSettingsContent'
  | 'CapabilitiesSettingsContent'
  | 'RuntimeSettings'
  | 'StorageSettings'
  | 'AppearanceModalContent'
  | 'SystemModalContent';

const SHELL_SLOT_REGISTRY: OplSettingsControlPlane['slot_registry'] = {};

const ROUTE_COMPONENT_KEYS = new Set<string>([
  'OverviewSettings',
  'WorkspaceSettings',
  'LocalServicesSettings',
  'AccessSettingsContent',
  'ResourcesSettingsContent',
  'CapabilitiesSettingsContent',
  'RuntimeSettings',
  'StorageSettings',
  'AppearanceModalContent',
  'SystemModalContent',
]);

function normalizeWrapperPolicy(value: string | undefined): SettingsShellWrapperPolicy {
  if (value === 'host_provides_wrapper') return value;
  return 'host_provides_wrapper';
}

export function getSettingsRenderSlot(routeId: string): SettingsShellRenderSlot | null {
  const normalizedRouteId = routeSlotIds.has(routeId) ? routeId : normalizeOplSettingsTab(routeId);
  const slotId = routeSlotIds.get(normalizedRouteId);
  if (!slotId) return null;

  const slotConfig = settingsControlPlane.slot_registry[slotId] ?? SHELL_SLOT_REGISTRY[slotId];
  const componentKey = slotConfig?.component_key;
  if (!componentKey || !ROUTE_COMPONENT_KEYS.has(componentKey)) return null;

  return {
    id: slotId,
    routeId: normalizedRouteId,
    componentKey,
    wrapperPolicy: normalizeWrapperPolicy(slotConfig?.wrapper_policy),
    subrouteQueryParam: slotConfig?.subroute_query_param,
    legacySubroutes: slotConfig?.legacy_subroutes,
  };
}

export function getSettingsRenderSlots(): SettingsShellRenderSlot[] {
  return [...settingsControlPlane.ordinary_routes.map((route) => route.id), ...secondaryPages.map((page) => page.id)]
    .map((id) => getSettingsRenderSlot(id))
    .filter((slot): slot is SettingsShellRenderSlot => Boolean(slot));
}

export type SettingsRouteDefinition = {
  routeId: string;
  path: string;
  componentKey: SettingsRouteComponentKey;
};

function pathSegmentFor(settingsPath: string): string {
  return pathToSettingsRoute(settingsPath).replace(/^\/settings\/?/, '');
}

function routeDefinitionFrom(route: OplSettingsControlPlaneRoute | OplSettingsControlPlaneSecondaryPage) {
  const slot = getSettingsRenderSlot(route.id);
  if (!slot || !ROUTE_COMPONENT_KEYS.has(slot.componentKey)) return null;
  return {
    routeId: route.id,
    path: pathSegmentFor(route.path),
    componentKey: slot.componentKey as SettingsRouteComponentKey,
  };
}

export function getSettingsRouteDefinitions(): SettingsRouteDefinition[] {
  const seenPaths = new Set<string>();
  return [...settingsControlPlane.ordinary_routes, ...secondaryPages]
    .map(routeDefinitionFrom)
    .filter((definition): definition is SettingsRouteDefinition => {
      if (!definition || seenPaths.has(definition.path)) return false;
      seenPaths.add(definition.path);
      return true;
    });
}
