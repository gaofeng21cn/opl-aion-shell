# OPL AionUI Shell

提交 PR 前遵循 [CONTRIBUTING.md](CONTRIBUTING.md)；中文说明见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

- 本仓是 One Person Lab App 已退役的 AionUI 实现，只保留历史源码、旧版迁移基线与固定测试夹具。当前 Desktop、Nightly 和 Docker WebUI 生产构建由 `opl-studio` 提供；不得从本仓恢复生产发布或 upstream intake。
- GUI 产品 authority 在 `one-person-lab-app`；产品行为、页面状态、模型/引导策略、截图、发布与用户文档由 App contracts 定义，本仓只实现并验证这些边界。
- Upstream fork body 默认只读；OPL-owned adapter/overlay 变更必须以 App contract 为依据。不得把 upstream 默认值、候选取舍或产品 truth 下沉到 Shell。
- Shell 只渲染 Framework/App projection 并提交已授权 action；不得维护固定 Package/Agent/Skill/Tool 清单、依赖图、版本解析、lock、payload、receipt 或 currentness 镜像。
- 新建模块前读取 `docs/contributing/file-structure.md`。组件使用 Arco；已迁移的 OPL Titlebar、navigation rail、Home、composer 与 Settings navigation 图标统一使用 pinned DSH cohort 的 `OplIcon`，DSH 缺失的语义 glyph 只能登记在 `OplVisualProvider` 兼容表，未迁移 upstream surface 才继续直接使用 IconPark。样式优先 UnoCSS；TypeScript 保持 strict，用户可见文本必须使用 i18n keys。
- Main process 不使用 DOM API，Renderer 不使用 Node.js API，跨进程只走 preload IPC bridge。
- 默认验证入口是 `bun run test`；按影响补 DOM/integration/full、i18n、lint、format 或 `bunx tsc --noEmit`。测试通过不等于 App release-ready。
- GitHub 上自己新建的对外文本用英文书写：commit subject/body、PR 标题与正文、Issue、comment、Release Notes。产品名、代码标识、路径、命令与原始引用除外。他人写的 Issue、PR 或 comment，无论对方用什么语言，回复沿用对方的语言；历史中已有的非英文 commit 保持原样，App 生成的公开正文会直接省略非英文条目。
- 文档职责和生命周期由 `docs/README.md` 归口；已完成清单并入当前实现参考，失效步骤从现行文档删除。上游 PRD、翻译、历史与工具规范不构成 OPL 产品或发布 authority。

<!-- CODEGRAPH_START -->

## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。

<!-- CODEGRAPH_END -->
