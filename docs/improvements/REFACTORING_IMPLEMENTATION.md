# 启动流程重构实施记录

## 实施日期
2026年6月29日

## 问题诊断
用户每次启动 OPL App 都会经过 FirstRun 页面并卡顿几秒，即使系统已经配置完成。

**根本原因：职责错位**
- AppLoader：只负责前端启动（连接后端、加载配置），不检查系统就绪状态
- FirstRun：承担了"门卫"职责，每次启动都要检查系统状态并决定是否跳转
- 结果：即使已配置，每次也要经过 FirstRun 的检查，导致卡顿

## 重构方案（基于 Codex 审计建议）

### 核心原则
1. **启动检查归启动 gate**：新增 StartupGate 负责系统就绪检查
2. **FirstRun 只做配置向导**：保留兜底自动跳转，但不再作为默认入口
3. **最小改动**：不做缓存、不做 feature flag、不加跳过按钮

### 实施的改动

#### 1. 新增 StartupGate 组件 ✅
**文件：** `packages/desktop/src/renderer/components/layout/StartupGate.tsx`

**职责：**
- 调用 `ipcBridge.oplRuntime.getInitialize.invoke()` 检查系统状态
- 根据 `is_first_run` 和 `ready_to_launch` 决定路由
- 显示统一的启动加载界面（AppLoader）

**逻辑：**
```typescript
function shouldEnterFirstRun(initialize: InitializeState | null): boolean {
  if (!initialize) return true; // 无法获取状态，进入配置
  
  // 首次运行，需要配置
  if (initialize.setup_flow?.is_first_run !== false) {
    return true;
  }
  
  // 未就绪，需要配置
  const isReady =
    initialize.setup_flow?.ready_to_launch === true ||
    initialize.readiness?.launch_ready === true;
  
  return !isReady;
}

// 根据检查结果导航
if (needsFirstRun) {
  return <Navigate to="/first-run" replace />;
}
return <Navigate to="/guid" replace />;
```

**设计特点：**
- 运行在 Router 内部，有正确的 React Router context
- 检查失败时，进入 FirstRun 让用户看到详细信息
- 保留 console.log 便于调试

#### 2. 修改 Router.tsx ✅
**文件：** `packages/desktop/src/renderer/components/layout/Router.tsx`

**改动：**
```typescript
// 导入 StartupGate
import StartupGate from '@renderer/components/layout/StartupGate';

// 修改默认路由：从 /first-run 改为 /startup-gate
<Route path='*' element={
  <Navigate to={status === 'authenticated' ? '/startup-gate' : '/login'} replace />
} />

// 新增 StartupGate 路由
<Route path='/startup-gate' element={<StartupGate />} />
```

**效果：**
- 认证后默认进入 `/startup-gate` 而不是 `/first-run`
- StartupGate 决定下一步去 `/first-run` 还是 `/guid`
- 日常启动不再先渲染 FirstRun

#### 3. 简化 main.tsx ✅
**文件：** `packages/desktop/src/renderer/main.tsx`

**改动：**
- 删除 `isFirstRun` 判断和 localStorage 逻辑
- 删除倒计时相关代码
- 删除跳过按钮相关代码
- 删除虚假的"步骤3：初始化状态"
- 恢复到只有2个真实步骤

**简化后的步骤：**
```typescript
const steps: AppLoaderStep[] = [
  {
    label: '连接后台服务',
    state: ready ? 'complete' : 'active',
    progress: ready ? 100 : 50,
  },
  {
    label: '加载应用配置',
    state: !ready ? 'pending' : configReady ? 'complete' : 'active',
    progress: !ready ? 0 : configReady ? 100 : 75,
  },
];
```

**职责清晰：**
- AppLoader 只负责前端基础启动
- 系统就绪检查交给 StartupGate

#### 4. 优化翻译文案 ✅
**文件：** 
- `packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json`
- `packages/desktop/src/renderer/services/i18n/locales/en-US/common.json`

**改动：**
```json
// 步骤名称更友好
"desktopSession": "连接后台服务",  // 原：桌面会话
"appConfig": "加载应用配置",       // 原：应用配置
"systemReady": "检查系统状态",     // 原：初始化状态（新增）

// 消息更友好
"connectingBackend": "正在连接到 Codex...",  // 原：正在连接后端服务
"loadingConfig": "正在加载您的设置...",      // 原：正在加载应用配置
"checkingSystemReady": "正在检查系统就绪状态..."  // 新增

// 描述更友好
"description": "正在为您准备工作环境，马上就好..."  
// 原：正在准备桌面会话，随后会进入初始化检查
```

#### 5. FirstRun 保持不变 ✅
**文件：** `packages/desktop/src/renderer/pages/FirstRun/index.tsx`

**未修改的原因（遵循 Codex 建议）：**
- 保留现有的初始化展示和兜底自动跳转
- 用户手动打开 `/first-run` 时，仍应自动跳转（如果已就绪）
- 防止"已配置但停在配置页"的边界 bug

---

## 重构后的流程

### 日常启动（已配置）
```
用户启动
  ↓
AppLoader (2-3秒)
  - 步骤1：连接后台服务 ✓
  - 步骤2：加载应用配置 ✓
  ↓
进入路由系统
  ↓
默认路由到 /startup-gate
  ↓
StartupGate (1-3秒)
  - 步骤1：连接后台服务 ✓ (已完成)
  - 步骤2：加载应用配置 ✓ (已完成)
  - 步骤3：检查系统状态 🔄 (调用后端)
  ↓
检查结果：ready_to_launch = true
  ↓
导航到 /guid ✅
  ↓
主界面

总耗时：3-6秒
用户体验：看到一个统一的启动过程
```

### 首次启动（需要配置）
```
用户启动
  ↓
AppLoader (2-3秒)
  ↓
StartupGate (1-3秒)
  - 检查结果：is_first_run = true
  ↓
导航到 /first-run ✅
  ↓
FirstRun 配置页面
  - 工作目录
  - 本机助手
  - 访问权限
  ↓
配置完成，自动跳转到 /guid
  ↓
主界面
```

---

## 对比分析

### 重构前的问题

| 问题 | 影响 |
|------|------|
| 每次都进入 FirstRun | 即使已配置，也要等待几秒 |
| FirstRun 承担门卫职责 | 职责混乱，难以维护 |
| 用户看到两次加载 | AppLoader → FirstRun 0% |
| 虚假的步骤3 | 显示"初始化状态"但没有实际操作 |
| 技术化的文案 | "桌面会话"、"初始化检查" |

### 重构后的改进

| 改进 | 效果 |
|------|------|
| ✅ StartupGate 统一检查 | 职责清晰，易于维护 |
| ✅ 日常启动不经过 FirstRun | 减少一次页面切换 |
| ✅ 真实的3个步骤 | 每个步骤都有实际操作 |
| ✅ 友好的文案 | "连接 Codex"、"加载您的设置" |
| ✅ FirstRun 保留兜底 | 防止边界 bug |

---

## 技术细节

### React Router Context 问题
**Codex 指出的问题：**
> 把 `useNavigate` / `<Navigate>` 放进 `Main`，但当前 `Main` 是在 `Router/HashRouter` 外面渲染的。

**解决方案：**
- StartupGate 作为 Router 内的一个 Route，有正确的 context
- 不在 Main 中使用 Navigate，保持 Main 的职责纯粹

### 为什么保留 FirstRun 的自动跳转？
**Codex 的建议：**
> FirstRun 应保留兜底自动跳转：用户手动打开 `/first-run`、登录页旧入口、或者启动 gate 被绕过时，已就绪仍应自动回 `/guid`。

**场景举例：**
1. 用户在浏览器收藏了 `http://localhost/#/first-run`
2. 某个旧的链接或按钮指向 `/first-run`
3. 开发者手动导航到 `/first-run` 测试

这些情况下，如果系统已就绪，FirstRun 应该自动跳转，而不是让用户困在配置页面。

### 为什么不做缓存？
**Codex 的建议：**
> 启动 readiness 是 runtime truth，缓存会引入 stale ready；跳过会绕过 `ready_to_launch` gate。

**理由：**
- 系统状态可能随时变化（依赖安装、配置修改等）
- 缓存会导致显示的状态与实际不符
- 绕过检查可能让用户进入不可用的系统

**正确的优化方向：**
- 优化后端 `getInitialize` 的性能（根本解决）
- 减少不必要的检查项
- 并行执行检查

---

## 测试建议

### 1. 日常启动测试
```bash
# 已配置的系统
1. 启动应用
2. 观察：AppLoader → StartupGate → 主界面
3. 验证：不经过 FirstRun 页面
4. 验证：启动时间 3-6 秒
```

### 2. 首次启动测试
```bash
# 清除后端状态（模拟首次运行）
1. 删除工作目录配置
2. 启动应用
3. 观察：AppLoader → StartupGate → FirstRun
4. 验证：显示配置向导
5. 完成配置
6. 验证：自动跳转到主界面
```

### 3. 边界情况测试
```bash
# 手动导航到 FirstRun
1. 在已配置的系统中
2. 手动访问 /#/first-run
3. 验证：自动跳转到 /guid（兜底逻辑）

# 检查失败
1. 断开后端连接
2. 启动应用
3. 验证：进入 FirstRun 显示错误信息
```

### 4. 性能测试
```bash
# 对比启动时间
重构前：5-10秒（AppLoader 2-5秒 + FirstRun 3-5秒）
重构后：3-7秒（AppLoader 2-3秒 + StartupGate 1-4秒）

预期改进：减少 2-3秒
```

---

## 后续优化方向

### 短期（不在本次重构范围）
1. 优化后端 `getInitialize` 性能
2. 添加更详细的进度反馈（如果后端支持）
3. 改进错误处理和提示

### 中期
1. 将 FirstRun 配置页面简化（另一个任务）
2. 优化文案和视觉呈现
3. 添加性能监控

### 长期
1. 考虑增量检查（只检查变化的部分）
2. 后台自动修复常见问题
3. 更智能的启动流程

---

## 风险评估

### 低风险
- ✅ 改动集中在启动流程
- ✅ 不影响主要功能
- ✅ FirstRun 保留兜底逻辑
- ✅ 代码改动量小（~200行）

### 回滚方案
如果出现问题，可以：
1. `git revert` 相关 commit
2. 或临时禁用 StartupGate 路由
```typescript
// Router.tsx
<Route path='*' element={
  <Navigate to={status === 'authenticated' ? '/first-run' : '/login'} replace />
} />
// 注释掉 StartupGate 路由
```

---

## 文件清单

### 新增文件
1. `packages/desktop/src/renderer/components/layout/StartupGate.tsx`

### 修改文件
1. `packages/desktop/src/renderer/components/layout/Router.tsx`
2. `packages/desktop/src/renderer/main.tsx`
3. `packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json`
4. `packages/desktop/src/renderer/services/i18n/locales/en-US/common.json`

### 未修改文件（按 Codex 建议）
1. `packages/desktop/src/renderer/pages/FirstRun/index.tsx`
2. `packages/desktop/src/renderer/components/layout/AppLoader.tsx`（保留跳过按钮功能）

---

## 总结

### 问题解决
✅ **职责归位**：启动检查归 StartupGate，FirstRun 只做配置向导  
✅ **流程优化**：日常启动不再经过 FirstRun  
✅ **代码清晰**：职责分明，易于维护  
✅ **用户体验**：减少卡顿，统一的启动过程

### 技术质量
✅ **遵循 Codex 建议**：最小改动，稳定可靠  
✅ **保留兜底逻辑**：防止边界 bug  
✅ **不做过度优化**：不引入缓存和 stale state  
✅ **正确使用 React Router**：在 Router 内部使用 Navigate

### 预期效果
- 启动时间减少 2-3 秒
- 用户不再看到"卡在 0%"的 FirstRun 页面
- 代码更清晰，易于后续优化

---

**重构完成时间**：2026年6月29日  
**实施者**：Claude (Kiro)  
**审计者**：Codex  
**状态**：✅ 已完成，待测试
