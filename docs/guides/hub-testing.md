# Hub UI 测试

本指南只负责 Shell 的 Hub UI 与 HTTP 传输测试。产品是否暴露某个 Agent、
安装动作是否可用，以及后端安装结果，都由 App 合同和真实后端决定。

现有入口为 `tests/e2e/specs/hub-backend-install.e2e.ts`，UI 位于
`AgentHubModal` 和 `LocalAgents`，桥接通过
`packages/desktop/src/common/adapter/ipcBridge.ts` 的 `/api/hub/*` 路由进入后端。
测试重点是安装状态、错误与重试、安装后的列表刷新和会话选择是否反映响应。

```bash
bunx playwright test tests/e2e/specs/hub-backend-install.e2e.ts --config playwright.config.ts
```

运行前按 `tests/e2e/README.md` 准备隔离环境。这个入口不能证明每个实际 Agent
可调用，也不能替代真实安装、协议交互和 App 产品验收。

旧的 `hub-install-flow.test.ts`、`acp-smoke.test.ts` 及其描述的 Electron
主进程安装链路已经退出当前实现，不再保留 L1/L3 操作步骤或 CLI 白名单。
现存 fake fixtures 只有在被实际测试调用时才构成测试输入；其文件存在不代表
已经执行完整安装链路。
