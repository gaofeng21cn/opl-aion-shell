# Renderer i18n

本目录是 renderer 翻译实现入口。`index.ts` 初始化 i18next 和
react-i18next；`locales/zh-CN/` 与 `locales/en-US/` 按主题拆分语言资源。
OPL 普通语言范围由 App 产品配置与 shared i18n 配置决定，不由上游翻译列表推断。

组件通过 `useTranslation()` 和 `t('namespace.key')` 消费翻译。
新增文案时更新对应主题的中英文 JSON，沿用相邻键命名，并核对变量与复数语义。
不要直接新增语言选择项或维护第二份语言目录。

在仓库根目录执行 `bun run i18n:types` 和
`node scripts/check-i18n.js`，检查生成类型及资源一致性。用户可见文字必须
走翻译入口；旧根 `src/renderer/i18n` 路径和完整单文件 locale 示例已退出当前布局。
