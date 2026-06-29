# OPL App 启动流程重构方案

## 问题诊断

### 当前的职责混乱

**AppLoader（启动加载）：**
- ✅ 连接后端
- ✅ 加载配置
- ❌ 不检查系统就绪状态

**FirstRun（首次运行配置）：**
- ✅ 引导首次配置
- ❌ 承担了"门卫"职责：每次启动都检查状态
- ❌ 承担了"路由判断"职责：决定是否进入主界面

**问题：**
- FirstRun 被滥用，承担了日常启动检查的职责
- 导致每次启动都要经过 FirstRun，即使不需要配置

---

## 重构方案

### 核心原则

1. **AppLoader 是唯一的启动入口**
   - 负责所有启动时的检查和准备
   - 决定下一步去哪里

2. **FirstRun 是配置向导**
   - 只在需要配置时才显示
   - 不参与日常启动流程

3. **主界面 (/guid) 是最终目标**
   - 如果系统就绪，直接进入
   - 不需要经过中间页面

### 重构后的流程

```
启动 App
  ↓
AppLoader（统一的启动页面）
  ├─ 步骤1：连接后端
  ├─ 步骤2：加载配置
  └─ 步骤3：检查系统状态 ⭐ 新增
  ↓
判断（在 AppLoader 内部完成）
  ├─ 需要首次配置？ → 路由到 /first-run
  ├─ 需要重新配置？ → 路由到 /first-run  
  └─ 系统就绪？     → 路由到 /guid ✅
```

---

## 实现方案

### 方案A：在 AppLoader 中集成检查（推荐）

#### 1. 扩展 AppLoader 的职责

```typescript
// main.tsx

const Main = () => {
  const { ready } = useAuth();
  const [configReady, setConfigReady] = useState(false);
  const [systemReady, setSystemReady] = useState(false);  // 新增
  const [needsFirstRun, setNeedsFirstRun] = useState(false);  // 新增
  const navigate = useNavigate();

  // 原有的配置加载逻辑
  useEffect(() => {
    if (!ready) return;
    
    Promise.all([
      configService.initialize(),
      fetchDetectedAgents(),
    ]).finally(() => setConfigReady(true));
  }, [ready]);

  // 新增：检查系统状态
  useEffect(() => {
    if (!ready || !configReady) return;

    const checkSystemReady = async () => {
      try {
        const result = await ipcBridge.oplRuntime.getInitialize.invoke();
        const initialize = readInitializePayload(result.parsed);
        
        // 判断：需要首次运行配置吗？
        if (initialize.setup_flow.is_first_run !== false) {
          setNeedsFirstRun(true);
          return;
        }
        
        // 判断：系统已就绪吗？
        if (initialize.setup_flow.ready_to_launch === true || 
            initialize.readiness?.launch_ready === true) {
          setSystemReady(true);
        } else {
          setNeedsFirstRun(true);
        }
      } catch (err) {
        console.error('Failed to check system ready:', err);
        setNeedsFirstRun(true);  // 出错时，进入配置页面
      }
    };

    void checkSystemReady();
  }, [ready, configReady]);

  // 显示启动加载页面
  if (!ready || !configReady || (!systemReady && !needsFirstRun)) {
    const steps: AppLoaderStep[] = [
      {
        label: '连接后台服务',
        state: ready ? 'complete' : 'active',
        message: ready ? undefined : '正在连接到 Codex...',
        progress: ready ? 100 : 33,
      },
      {
        label: '加载应用配置',
        state: !ready ? 'pending' : configReady ? 'complete' : 'active',
        message: !ready ? undefined : configReady ? undefined : '正在加载设置...',
        progress: !ready ? 0 : configReady ? 100 : 66,
      },
      {
        label: '检查系统状态',  // 新增：真实的检查步骤
        state: !ready || !configReady ? 'pending' : 'active',
        message: ready && configReady ? '正在检查系统就绪状态...' : undefined,
        progress: ready && configReady ? 90 : 0,
      },
    ];
    
    return (
      <AppLoader
        title="正在启动 One Person Lab"
        description="正在为您准备工作环境，马上就好..."
        steps={steps}
        testId='opl-startup-preflight'
        showProgress={true}
      />
    );
  }

  // 根据检查结果决定去哪里
  if (needsFirstRun) {
    return <Navigate to="/first-run" replace />;
  }

  // 系统就绪，直接进入主界面
  return (
    <Router
      layout={
        <ConversationHistoryProvider>
          <Layout sider={<Sider />} />
        </ConversationHistoryProvider>
      }
    />
  );
};
```

#### 2. 简化 FirstRun 页面

```typescript
// FirstRun/index.tsx

const FirstRun: React.FC = () => {
  const navigate = useNavigate();
  const [initializeResult, setInitializeResult] = useState(null);
  
  useEffect(() => {
    // 只加载一次初始化数据
    const loadData = async () => {
      const result = await ipcBridge.oplRuntime.getInitialize.invoke();
      setInitializeResult(result);
    };
    void loadData();
  }, []);

  // 配置完成后，手动点击"进入 OPL"
  const handleEnter = () => {
    navigate('/guid', { replace: true });
  };

  // 不再有自动跳转逻辑！
  // 如果系统已就绪，根本不会到这里
  
  return (
    <div>
      {/* 显示配置界面 */}
      <h1>准备开始使用</h1>
      {/* ... 配置项 ... */}
      
      {/* 用户手动点击进入 */}
      <Button onClick={handleEnter}>
        进入 OPL
      </Button>
    </div>
  );
};
```

#### 3. 删除默认路由到 /first-run

```typescript
// Router.tsx

// 删除这个默认路由：
// <Route path='*' element={<Navigate to='/first-run' replace />} />

// 改为：
<Route path='*' element={<Navigate to='/guid' replace />} />
```

现在，只有当 AppLoader 检查后发现需要配置，才会跳转到 `/first-run`。

---

### 方案B：添加中间路由层（备选）

如果不想在 `main.tsx` 中写太多逻辑，可以创建一个路由守卫：

```typescript
// components/StartupGuard.tsx

const StartupGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [needsFirstRun, setNeedsFirstRun] = useState(false);

  useEffect(() => {
    const check = async () => {
      const result = await ipcBridge.oplRuntime.getInitialize.invoke();
      const initialize = readInitializePayload(result.parsed);
      
      const needsSetup = 
        initialize.setup_flow.is_first_run !== false ||
        !(initialize.setup_flow.ready_to_launch === true || 
          initialize.readiness?.launch_ready === true);
      
      setNeedsFirstRun(needsSetup);
      setChecking(false);
    };
    void check();
  }, []);

  if (checking) {
    return <AppLoader title="检查系统状态..." />;
  }

  if (needsFirstRun) {
    return <Navigate to="/first-run" replace />;
  }

  return <>{children}</>;
};

// 在路由中使用
<Route path="/guid" element={
  <StartupGuard>
    <Guid />
  </StartupGuard>
} />
```

---

## 方案对比

| 特性 | 方案A（AppLoader 集成） | 方案B（路由守卫） |
|------|------------------------|------------------|
| 集中度 | ✅ 所有启动逻辑在 AppLoader | ⚠️ 分散在多处 |
| 代码清晰度 | ✅ 启动流程一目了然 | ⚠️ 需要理解守卫概念 |
| 性能 | ✅ 只检查一次 | ✅ 只检查一次 |
| 维护性 | ✅ 容易修改启动流程 | ⚠️ 需要同步多处 |
| 实现难度 | ⚠️ 需要重构 main.tsx | ✅ 增量添加 |

**推荐：方案A**

---

## 优化效果

### 重构前

```
用户启动
  ↓ 
AppLoader (2-5秒)
  - 连接后端
  - 加载配置
  ↓
进入 FirstRun ⚠️
  ↓
FirstRun 调用后端检查 (几秒) ⚠️
  - 显示 0%
  - 等待结果
  ↓
自动跳转到主界面

总耗时：5-10秒
用户体验：卡两次
```

### 重构后

```
用户启动
  ↓
AppLoader (3-7秒)
  - 连接后端
  - 加载配置
  - 检查系统状态 ⭐ 合并到这里
  ↓
判断结果
  ├─ 需要配置 → FirstRun 页面
  └─ 已就绪 → 直接进入主界面 ✅

总耗时：3-7秒（合并后不增加）
用户体验：只有一个加载页面
```

**关键改进：**
- ✅ 消除了 FirstRun 的"门卫"职责
- ✅ 日常启动不再经过 FirstRun
- ✅ 用户只看到一个加载过程
- ✅ 进度显示更准确（3个真实步骤）

---

## 实施步骤

### 第一阶段：重构 main.tsx（核心）

1. ✅ 在 AppLoader 中添加第3步：检查系统状态
2. ✅ 根据检查结果决定路由
3. ✅ 删除虚假的步骤，使用真实的3步

### 第二阶段：简化 FirstRun

1. ✅ 删除 `shouldEnterGuidAutomatically()` 逻辑
2. ✅ 删除自动跳转代码
3. ✅ 改为用户手动点击"进入 OPL"

### 第三阶段：优化路由

1. ✅ 删除默认路由到 `/first-run`
2. ✅ 改为默认路由到 `/guid`
3. ✅ 只有在需要时才访问 `/first-run`

### 第四阶段：添加缓存（可选）

如果后端检查仍然很慢，可以添加缓存：

```typescript
// 在 AppLoader 的检查逻辑中
const lastCheck = localStorage.getItem('system-ready-check-time');
const lastResult = localStorage.getItem('system-ready-check-result');
const now = Date.now();

// 如果最近5分钟检查过且成功，直接使用缓存
if (lastResult === 'ready' && 
    lastCheck && 
    now - parseInt(lastCheck) < 5 * 60 * 1000) {
  setSystemReady(true);
  return;
}

// 否则才调用后端
const result = await ipcBridge.oplRuntime.getInitialize.invoke();
// ... 保存结果到缓存
```

---

## 风险评估

### 潜在风险

1. **兼容性**
   - 现有的 FirstRun 页面可能被其他地方引用
   - 需要全面测试

2. **性能**
   - AppLoader 增加了检查步骤，可能变慢
   - 解决：添加缓存优化

3. **错误处理**
   - 检查失败时如何处理？
   - 解决：出错时默认进入 FirstRun，让用户手动配置

### 降低风险的方法

1. **渐进式迁移**
   - 先添加 AppLoader 的检查逻辑
   - 保留 FirstRun 的自动跳转作为后备
   - 验证无问题后，再删除 FirstRun 的跳转逻辑

2. **添加开关**
   ```typescript
   const USE_NEW_STARTUP_FLOW = true;  // 开关
   
   if (USE_NEW_STARTUP_FLOW) {
     // 新逻辑
   } else {
     // 旧逻辑
   }
   ```

3. **详细日志**
   ```typescript
   console.log('[Startup] Phase:', phase);
   console.log('[Startup] Needs first run:', needsFirstRun);
   console.log('[Startup] System ready:', systemReady);
   ```

---

## 总结

### 问题的本质

**FirstRun 承担了双重职责：**
1. 门卫（每次启动检查）← 应该由 AppLoader 负责
2. 向导（引导配置）← FirstRun 的真正职责

### 解决方案

**职责归位：**
- AppLoader：统一的启动入口，负责所有检查
- FirstRun：纯粹的配置向导，只在需要时显示
- 主界面：如果就绪，直接进入

### 预期效果

- ✅ 日常启动不再经过 FirstRun
- ✅ 用户只看到一个加载页面
- ✅ 进度显示更准确
- ✅ 逻辑更清晰，易于维护

---

**创建时间**：2026年6月29日  
**方案类型**：架构重构  
**影响范围**：启动流程
