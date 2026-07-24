# OPL AionUI Shell

提交 PR 前必须遵循 [CONTRIBUTING.md](CONTRIBUTING.md)；中文说明见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

## App Boundary

- 本仓是 One Person Lab App 当前 AionUI shell 的实现仓与 upstream intake 边界，承载 renderer、process、package metadata、测试和 shell release hooks。
- GUI 产品 authority 在 `one-person-lab-app`。产品行为、页面状态、模型/引导策略、截图、release 与用户文档由 App contracts 定义，本仓只实现和验证这些边界。
- GUI 角色遵循 App：`active=aionui; foreground=opl-native-workbench; retained=hermes-codex; archived=agui-codex`。不得把 AGUI 或 upstream AionUI 默认值当作 OPL 产品基线。
- Upstream intake 留在本仓并保持隔离；fork body 默认只读。OPL-owned adapter/overlay 变更必须以 App contract 为依据，不得把产品 truth 下沉到 Shell。
- 不得仅为对齐 Codex 或 upstream 删除 OPL 导航入口。入口迁移必须由 App contract 授权，并同时提供可见、键盘可达的替代入口和导航测试。
- 未来 shell candidate 的声明、门禁和产品取舍仍由 App 仓管理；本仓不是第二个 GUI control plane。
- Package identity、carrier 与 executor 是三个独立角色，官方 publication/currentness 是正交轴：一方 Package owner 各自发布完整 bytes 到 GHCR 并推进自己的 `latest-stable`；本仓只是 GUI implementation/consumer，不是 Package carrier 或 executor owner。当前实施遵循 `Codex-first, OPL-owned boundaries`：只维护一条正式 Codex 路径，不平行建设第二套 executor 产品；Codex Plugin Manager 只是一种 Plugin/config/cache carrier，不是 OPL Package identity 或完整 installed truth。
- Shell 只渲染 Framework/App projection 并提交已授权 action；Settings 与 Home 必须从动态 Package/capability projection 生成，不得维护 Package、Agent、Skill、Tool 或 Plugin 固定清单、依赖图、版本解析、lock、payload、receipt 或 source/currentness 镜像。Package owner 独立发布至 GHCR；共享 Release Set 只服务 Full、离线、集成测试和 QA，不是普通更新权威。
- 只切换 executor 不得重装 Package。唯一物理 carrier 被移除时必须如实投影 `physical_unavailable`；迁移到另一 carrier 时可以重新 materialize 完整 Package bytes，但不得改变 Package identity、OPL-owned preference、Work Item、依赖关系或 typed view。新增产品语义先进入 App SSOT，再由本仓消费。

## Engineering Constraints

- 新建文件或模块前读取 `docs/contributing/file-structure.md` 和 `.claude/skills/architecture/SKILL.md`；单目录直接子项不得超过 10 个。
- 组件使用 `@arco-design/web-react`，图标使用 `@icon-park/react`。样式优先 UnoCSS；复杂样式用 CSS Modules；颜色使用 semantic tokens 或 CSS variables，不硬编码。
- TypeScript 保持 strict：不用 `any`，不允许隐式返回；使用既有 path aliases，优先 `type`。公共函数写 JSDoc，代码注释用英文。
- 所有用户可见文本必须使用 i18n keys。语言与模块定义以 `packages/desktop/src/common/config/i18n-config.json` 为准，并按 `.claude/skills/i18n/SKILL.md` 执行。
- Main process 位于 `packages/desktop/src/process/`，不得使用 DOM API；Renderer 位于 `packages/desktop/src/renderer/`，不得使用 Node.js API；跨进程只走 `packages/desktop/src/preload/` IPC bridge。

## Verification

- 默认最小门禁：`bun run test`；按影响补 `bun run test:dom`、`bun run test:integration` 或 `bun run test:full`。
- 修改 renderer、locales 或 i18n config 时，额外运行 `bun run i18n:types` 和 `node scripts/check-i18n.js`。
- 提交前按需运行 `bun run lint:fix`、`bun run format`、`bunx tsc --noEmit`；推送使用 `just push`，以退出码判断结果。
- 测试通过只证明对应代码门禁，不等于 App release-ready 或安装完成。

<!-- CODEGRAPH_START -->

## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。

<!-- CODEGRAPH_END -->
