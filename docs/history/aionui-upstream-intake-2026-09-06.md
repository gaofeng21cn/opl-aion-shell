# AionUI v2.2.1 与 AionCore v0.2.1 兼容吸收

本次按 App 合同选择性吸收官方 AionUI `v2.2.1`
(`dc47f4a0173ff506b08f13c97b10944d61e422d5`，2026-09-01 发布)，并使用
官方 AionCore `v0.2.1` release assets。准确的版本与六平台 digest 由
`contracts/aionui-upstream-intake.json` 持有。OPL 的产品版本、更新、发布、
动态 Package/Agent projection 与 Codex canonical thread 继续由原 owner 管理。

## 变更取舍

此前 `v2.1.39` 至 `v2.1.59` 的审阅及已吸收实现见
[上一份记录](aionui-upstream-intake-2026-07-22.md)。本轮不合并上游历史，
保留已经实现的 OPL 会话、项目、预览、技能、Settings 和打包接口。

| 上游变化                                                      | 本次处理                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `4f7da7e72` WebUI 401 静默续期                                | 吸收到现有 HTTP、两条 WebSocket 和 AuthContext；并发共用一次 refresh，明确 401 的原请求最多重试一次，网络结果未知的写入不重发。 |
| `16589d8c7` WebSocket 退避                                    | 吸收；emit/subscribe 不绕过排队退避，连接稳定后才重置，登录后恢复两条通道。                                                     |
| `3e3385b1a` WebUI 大文件上传                                  | 吸收 TCP 转发前暂停客户端 socket 的修复，避免连接后端期间丢失后续 multipart body；512KB 分段上传回归测试验证完整字节。          |
| `cbabbc8de`、`7d1c7b722` 具名通知与等待用户                   | 适配既有普通及 canonical Codex 事件，遵守通知偏好与焦点、权限、内容边界，不改变任务状态 authority。                             |
| AionCore `v0.2.0` 技能目录变化                                | 使用官方每会话 skill view 与 Codex `skills/extraRoots/set`，保留现有独立进程隔离和 Framework/Package 技能 projection。          |
| AionCore `v0.2.1` linked worktree discovery                   | 使用官方实现，不建立 Shell-owned 仓库发现或项目真相。                                                                           |
| Codex CLI pin                                                 | 升级到官方 npm `0.153.4`，继续只携带 Node + Codex，不携带 Claude；与官方 AionCore `v0.2.1` 的组合由 OPL Shell 验证。            |
| 上游字体选择、侧栏重排、归档、计划面板、预览和 `@@` UI        | 使用现有 App 交互合同和 canonical adapter；不替换 OPL 状态模型、路由、模型策略或权限。                                          |
| 上游品牌、安装下载、Team、多 backend、额外语言与发布 workflow | 不吸收；继续 OPL 品牌、两语言、官方更新与发布路径。                                                                             |

## 视觉

用户选择统一成熟体系优先。本轮继续使用固定 DSH visual cohort，修复 OPL
adapter 中 Button/Menu 图文几何和导航标签布局的迁移遗漏。使用已存在的
DSH branch glyph，保留用户显式字体设置、Arco 行为、无障碍与原事件 handler。
不复制 Codex 专有素材，不新增另一套仿 Codex 的视觉数值。

## 验证边界

官方 Core 已通过 Shell BackendLifecycleManager 启停、版本回读、基础 API、
managed-resource schema 2、Codex extra roots 与软链接 Skill 解析检查。
HTTP/WS、通知、图标布局和资源验证使用对应 focused tests，并由 App
`validate:active-shell` 检查组合兼容性。开发截图证明渲染结果；公开发布、
安装版像素基线和生产数据升级仍分别以对应运行结果为准。

Codex `0.153.4` 已经通过与 App 相同的 stdio app-server 协议，读取完整模型目录，
确认 `gpt-6-astra` 为默认且支持 `max`。在隔离工作区中，真实 Astra 会话调用命令
工具读取随机文件，CLI 进程退出重启后通过 `thread/resume` 恢复，并正确回忆文件内容。
Shell 的实际 runtime resolver 与 Auto resolver 也回读为 `0.153.4` 和
`gpt-6-astra + max`。这些调用使用已配置 provider，模型目录本身不构成账号授权证明。
