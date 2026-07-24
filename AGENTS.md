# OPL AionUI Shell

提交 PR 前遵循 [CONTRIBUTING.md](CONTRIBUTING.md)；中文说明见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

- 本仓是 One Person Lab App 当前 AionUI Shell 的实现仓与 upstream intake 边界，承载 renderer、process、package metadata、测试和 Shell release hooks。
- GUI 产品 authority 在 `one-person-lab-app`；产品行为、页面状态、模型/引导策略、截图、发布与用户文档由 App contracts 定义，本仓只实现并验证这些边界。
- Upstream fork body 默认只读；OPL-owned adapter/overlay 变更必须以 App contract 为依据。不得把 upstream 默认值、候选取舍或产品 truth 下沉到 Shell。
- Shell 只渲染 Framework/App projection 并提交已授权 action；不得维护固定 Package/Agent/Skill/Tool 清单、依赖图、版本解析、lock、payload、receipt 或 currentness 镜像。
- 新建模块前读取 `docs/contributing/file-structure.md` 和 `.claude/skills/architecture/SKILL.md`。组件使用 Arco，图标使用 IconPark，样式优先 UnoCSS；TypeScript 保持 strict，用户可见文本必须使用 i18n keys。
- Main process 不使用 DOM API，Renderer 不使用 Node.js API，跨进程只走 preload IPC bridge。
- 默认验证入口是 `bun run test`；按影响补 DOM/integration/full、i18n、lint、format 或 `bunx tsc --noEmit`。测试通过不等于 App release-ready。

<!-- CODEGRAPH_START -->

## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。

<!-- CODEGRAPH_END -->
