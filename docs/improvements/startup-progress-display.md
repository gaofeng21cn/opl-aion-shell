# 启动配置页面进度显示改进

## 问题描述

OPL App 启动时会在配置页面停留几秒钟，但没有任何进度显示，用户不知道系统正在做什么。这会导致：

1. 用户体验不佳，不知道正在等待什么
2. 没有明确的进度感知，感觉应用"卡住了"
3. 缺乏透明度，用户无法判断是否出现问题

## 改进方案

参考 Hermes Desktop 的实现，为启动配置页面添加详细的进度显示。

### 改进内容

#### 1. AppLoader 组件增强

**新增功能：**
- 支持为每个步骤显示详细消息
- 添加进度条显示当前步骤的完成百分比
- 优化视觉层次，让活动步骤的信息更突出

**新增属性：**
```typescript
export type AppLoaderStep = {
  label: string;
  state?: 'active' | 'complete' | 'pending';
  message?: string;      // 当前步骤的详细消息
  progress?: number;     // 进度百分比 (0-100)
};

type AppLoaderProps = {
  title?: string;
  description?: string;
  steps?: AppLoaderStep[];
  testId?: string;
  showProgress?: boolean; // 是否显示进度条
};
```

#### 2. 视觉改进

**步骤列表：**
- 每个步骤显示状态标记（圆点）
- 活动步骤显示详细消息
- 完成的步骤变为成功色（绿色）
- 等待中的步骤为灰色

**进度条：**
- 全局进度条显示当前活动步骤的进度
- 平滑的过渡动画
- 显示百分比数字
- 当前步骤的详细消息显示在进度条下方

**样式特点：**
- 使用 CSS Grid 布局，确保对齐美观
- 文本溢出时使用省略号
- 支持响应式设计
- 使用 CSS 变量确保主题一致性

#### 3. 启动流程信息

**桌面会话 (50% → 100%)**
- 消息：正在连接后端服务...
- 状态：连接建立后标记为完成

**应用配置 (60% → 100%)**
- 消息：正在加载应用配置...
- 状态：配置加载完成后标记为完成

**初始化状态 (80%)**
- 消息：正在检查初始化状态...
- 状态：准备进入主界面

#### 4. 国际化支持

添加了中英文进度消息：

**中文：**
- `connectingBackend`: "正在连接后端服务..."
- `loadingConfig`: "正在加载应用配置..."
- `checkingFirstRun`: "正在检查初始化状态..."

**英文：**
- `connectingBackend`: "Connecting to backend service..."
- `loadingConfig`: "Loading application configuration..."
- `checkingFirstRun`: "Checking initialization status..."

## 实现细节

### 文件修改清单

1. **AppLoader.tsx** - 组件逻辑增强
   - 添加 `message` 和 `progress` 支持
   - 添加进度条渲染逻辑
   - 优化步骤内容布局

2. **AppLoader.module.css** - 样式更新
   - 新增 `.appLoaderStepContent` 布局容器
   - 新增 `.appLoaderStepMessage` 消息样式
   - 新增进度条相关样式：
     - `.appLoaderProgress`
     - `.appLoaderProgressBar`
     - `.appLoaderProgressFill`
     - `.appLoaderProgressText`
     - `.appLoaderProgressMessage`
     - `.appLoaderProgressPercent`

3. **main.tsx** - 使用方式更新
   - 为每个步骤添加 `message` 和 `progress`
   - 启用 `showProgress={true}`

4. **翻译文件更新**
   - `zh-CN/common.json` - 添加 `startupPreflight.messages`
   - `en-US/common.json` - 添加 `startupPreflight.messages`

## 效果对比

### 改进前
```
[旋转图标] 正在启动 One Person Lab
           正在准备桌面会话，随后会进入初始化检查。

● 桌面会话
○ 应用配置
○ 初始化状态
```

### 改进后
```
[旋转图标] 正在启动 One Person Lab
           正在准备桌面会话，随后会进入初始化检查。

● 桌面会话
  正在连接后端服务...
○ 应用配置
○ 初始化状态

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 50%
正在连接后端服务...                    50%
```

## 未来优化方向

### 1. 动态进度更新

目前进度是基于步骤状态的静态值，未来可以考虑：
- 连接后端时显示实时连接进度
- 配置加载时显示加载项数量
- 接入真实的初始化进度 API

### 2. 更详细的步骤分解

参考 Hermes Desktop 的实现，可以进一步细化步骤：
- 检查运行环境
- 验证必需工具
- 加载核心模块
- 准备工作目录
- 建立 Codex 连接
- 加载用户配置

### 3. 错误处理

当某个步骤失败时：
- 显示错误图标和消息
- 提供重试按钮
- 显示详细的错误日志链接

### 4. 性能监控

添加性能指标收集：
- 记录每个步骤的耗时
- 识别启动瓶颈
- 优化慢速步骤

## 参考资料

- Hermes Desktop 实现：`/Users/gaofeng/workspace/opl-hermes-shell/src/components/desktop-onboarding-overlay.tsx`
- 特别参考 `Preparing` 组件（第314-341行）

## 测试建议

1. **正常启动流程**
   - 验证三个步骤依次激活和完成
   - 检查进度条平滑过渡
   - 确认消息正确显示

2. **慢速网络场景**
   - 模拟后端连接延迟
   - 验证用户能看到明确的等待状态

3. **首次启动**
   - 验证初始化状态检查的显示
   - 确认过渡到主界面流畅

4. **国际化**
   - 切换到英文界面验证翻译
   - 确认中文显示无乱码

5. **响应式设计**
   - 测试不同窗口尺寸
   - 验证移动端显示（如果适用）

6. **无障碍访问**
   - 验证 `aria-live="polite"` 正确通知屏幕阅读器
   - 确认键盘导航可用（如果有交互元素）
