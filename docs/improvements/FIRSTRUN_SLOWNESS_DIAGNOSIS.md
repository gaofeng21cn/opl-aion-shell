# FirstRun 页面每次启动卡顿问题诊断

## 问题描述

用户每次启动 OPL App 都会：

1. 看到 FirstRun 配置页面
2. 页面显示 0%，"正在准备"
3. 停留几秒钟（没有进度）
4. 然后才能进入主界面

## 问题根源

### 正常流程 vs 实际流程

**预期的正常流程：**

```
启动 → AppLoader(2-5秒) → 直接进入主界面 ✅
```

**实际发生的流程：**

```
启动 → AppLoader(2-5秒) → FirstRun 页面(卡几秒) → 主界面 ❌
```

### 为什么会进入 FirstRun 页面？

查看路由配置（`Router.tsx` 第90行）：

```typescript
<Route path='*' element={
  <Navigate to={status === 'authenticated' ? '/first-run' : '/login'} replace />
} />
```

**关键发现：默认路由就是 `/first-run`！**

也就是说，**每次启动都会先进入 FirstRun 页面**，然后由 FirstRun 页面决定是否自动跳转。

### FirstRun 页面的加载流程

```typescript
// FirstRun/index.tsx 第321-324行
useEffect(() => {
  // 页面加载时自动调用
  void refreshInitialize();
}, [refreshInitialize]);

// 第252-269行
const refreshInitialize = useCallback(async () => {
  setInitializeLoading(true);
  try {
    // 1. 调用后端获取初始化状态（可能很慢！）
    const result = await ipcBridge.oplRuntime.getInitialize.invoke();

    // 2. 解析数据
    const initializePayload = readInitializePayload(result.parsed);

    // 3. 判断是否自动跳转
    if (shouldEnterGuidAutomatically(initializePayload)) {
      navigate('/guid', { replace: true }); // 跳转到主界面
    }
    // 如果不跳转，就停留在 FirstRun 页面
  } finally {
    setInitializeLoading(false);
  }
}, [navigate]);
```

### 自动跳转的判断逻辑

```typescript
// 第183-186行
function shouldEnterGuidAutomatically(initialize: FirstRunInitialize | null): boolean {
  // 条件1：必须不是首次运行
  if (initialize?.setup_flow?.is_first_run !== false) return false;

  // 条件2：必须准备就绪
  return initialize.setup_flow.ready_to_launch === true || initialize.readiness?.launch_ready === true;
}
```

**必须同时满足：**

1. `is_first_run === false`（不是首次运行）
2. `ready_to_launch === true` 或 `launch_ready === true`（已准备就绪）

## 问题分析

### 你看到的"卡顿"是什么？

**卡顿发生在第256行的 IPC 调用：**

```typescript
const result = await ipcBridge.oplRuntime.getInitialize.invoke();
```

这个调用会执行后端的 `opl system initialize` 命令，可能包括：

- 检查工作目录
- 检查 Codex 配置
- 检查访问权限
- 检查依赖和模块
- 网络连接检查
- 文件系统操作

**如果这些检查很慢，就会导致前端卡住等待。**

### 为什么每次启动都要检查？

这是设计决策：

- ✅ **优点**：确保每次启动时系统状态是最新的
- ❌ **缺点**：即使已经配置好，每次也要等待几秒

### 你的具体情况

从你的截图看，页面显示：

- "正在准备" 0%
- "正在读取初始化状态，首次启动可能需要更久。"
- `reading_initialize_state`

**这说明：**

1. ✅ `ipcBridge.oplRuntime.getInitialize.invoke()` 正在执行
2. ✅ 后端正在读取初始化状态
3. ❌ 这个过程很慢（几秒钟）
4. ❌ 前端显示 0% 是因为没有真实的进度数据

## 解决方案

### 方案A：缓存初始化结果（推荐）

**思路：**

- 如果上次初始化成功且没有太久，直接跳过检查
- 只在必要时才调用后端

**实现：**

```typescript
const lastInitCheck = localStorage.getItem('last-init-check');
const lastInitSuccess = localStorage.getItem('last-init-success');
const now = Date.now();

// 如果上次检查成功且在5分钟内，直接跳转
if (lastInitSuccess === 'true' && lastInitCheck && now - parseInt(lastInitCheck) < 5 * 60 * 1000) {
  navigate('/guid', { replace: true });
  return;
}

// 否则才调用后端检查
const result = await ipcBridge.oplRuntime.getInitialize.invoke();
// ...
localStorage.setItem('last-init-check', now.toString());
localStorage.setItem('last-init-success', 'true');
```

**优点：**

- ✅ 大幅减少卡顿（第二次启动直接跳过）
- ✅ 仍然定期检查（超过5分钟会重新检查）

### 方案B：后台检查，允许跳过

**思路：**

- 显示 FirstRun 页面，但立即提供"跳过"按钮
- 后台继续检查，如果发现问题再提示

**实现：**

```typescript
const [canSkip, setCanSkip] = useState(false);

useEffect(() => {
  // 500ms 后允许跳过
  const timer = setTimeout(() => setCanSkip(true), 500);
  return () => clearTimeout(timer);
}, []);

// 在页面上显示
{canSkip && (
  <Button onClick={() => navigate('/guid', { replace: true })}>
    跳过检查，直接进入
  </Button>
)}
```

**优点：**

- ✅ 用户有控制权
- ✅ 不影响必要的检查

### 方案C：优化后端检查速度

**思路：**

- 优化 `opl system initialize` 命令
- 减少不必要的检查
- 并行执行检查项

**需要：**

- 后端代码修改
- 性能分析

### 方案D：改变默认路由

**思路：**

- 不再默认跳转到 `/first-run`
- 只在真正需要时才显示

**实现：**

```typescript
// Router.tsx
<Route path='*' element={
  <Navigate to={
    needsFirstRun() ? '/first-run' : '/guid'
  } replace />
} />
```

**问题：**

- 如何在路由层面判断 `needsFirstRun()`？
- 可能需要提前调用后端，又回到性能问题

## 推荐实施方案

### 短期（立即可做）：方案A + 方案B

```typescript
const FirstRun: React.FC = () => {
  const navigate = useNavigate();
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    const checkAndNavigate = async () => {
      // 1. 检查缓存
      const lastCheck = localStorage.getItem('opl-init-check-time');
      const lastSuccess = localStorage.getItem('opl-init-check-success');
      const now = Date.now();

      // 如果上次成功且在5分钟内，直接跳转
      if (lastSuccess === 'true' &&
          lastCheck &&
          now - parseInt(lastCheck) < 5 * 60 * 1000) {
        navigate('/guid', { replace: true });
        return;
      }

      // 2. 500ms 后允许跳过
      setTimeout(() => setCanSkip(true), 500);

      // 3. 调用后端检查
      try {
        const result = await ipcBridge.oplRuntime.getInitialize.invoke();
        const initializePayload = readInitializePayload(result.parsed);

        if (shouldEnterGuidAutomatically(initializePayload)) {
          // 记录成功
          localStorage.setItem('opl-init-check-time', now.toString());
          localStorage.setItem('opl-init-check-success', 'true');
          navigate('/guid', { replace: true });
        }
      } catch (err) {
        // 记录失败
        localStorage.setItem('opl-init-check-success', 'false');
        setError(err.message);
      }
    };

    void checkAndNavigate();
  }, [navigate]);

  // ... 渲染代码

  return (
    <div>
      {/* 原有的 UI */}

      {canSkip && (
        <Button onClick={() => navigate('/guid', { replace: true })}>
          跳过检查，直接进入
        </Button>
      )}
    </div>
  );
};
```

### 中期（需要协调）：方案C

- 与后端团队合作优化 `opl system initialize` 命令
- 减少检查项目
- 提供增量检查（只检查变化的部分）

## 数据收集建议

为了更好地诊断问题，建议添加性能监控：

```typescript
const startTime = performance.now();

const result = await ipcBridge.oplRuntime.getInitialize.invoke();

const duration = performance.now() - startTime;
console.log(`Initialize check took ${duration}ms`);

// 如果超过1秒，记录详细信息
if (duration > 1000) {
  console.warn('Slow initialize check:', {
    duration,
    phase: result.parsed.setup_flow.phase,
    checklistItems: result.parsed.checklist.length,
  });
}
```

这样可以了解：

- 每次检查实际花费多少时间
- 是否某些特定情况下特别慢
- 哪个阶段最耗时

## 总结

**问题本质：**

- 每次启动都要调用后端检查初始化状态
- 这个检查需要几秒钟
- 前端在等待期间显示 0%，没有进度

**推荐方案：**

1. **立即实施**：添加缓存 + 跳过按钮
2. **中期优化**：优化后端检查速度
3. **长期改进**：重新设计启动流程

**预期效果：**

- 第一次启动：仍需等待几秒（无法避免）
- 后续启动：缓存命中，立即进入（0秒等待）
- 或者用户可以选择跳过（用户控制）

---

**创建时间**：2026年6月29日
**问题类型**：性能优化
**影响范围**：每次启动体验
