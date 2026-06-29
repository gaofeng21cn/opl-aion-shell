/**
 * StartupGate - 启动检查门控
 *
 * 职责：
 * - 调用后端检查系统初始化状态
 * - 根据结果决定路由到 /first-run 或 /guid
 * - 显示统一的启动加载界面
 *
 * 设计原则：
 * - 只负责检查和路由决策
 * - 不承担配置向导职责
 * - FirstRun 保留兜底自动跳转
 */

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import AppLoader, { type AppLoaderStep } from './AppLoader';

interface InitializeState {
  setup_flow?: {
    is_first_run?: boolean;
    ready_to_launch?: boolean;
    phase?: string;
  };
  readiness?: {
    launch_ready?: boolean;
  };
}

function readInitializePayload(parsed: any): InitializeState {
  return {
    setup_flow: parsed?.setup_flow,
    readiness: parsed?.readiness,
  };
}

function shouldEnterFirstRun(initialize: InitializeState | null): boolean {
  if (!initialize) return true; // 无法获取状态，进入配置页面

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

const StartupGate: React.FC = () => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [needsFirstRun, setNeedsFirstRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSystemReady = async () => {
      try {
        const result = await ipcBridge.oplRuntime.getInitialize.invoke();

        if (result.status !== 'ok') {
          console.error('[StartupGate] Initialize check failed:', result);
          setNeedsFirstRun(true); // 出错时进入配置页面
          setChecking(false);
          return;
        }

        const initialize = readInitializePayload(result.parsed);
        const needsSetup = shouldEnterFirstRun(initialize);

        console.log('[StartupGate] Check result:', {
          is_first_run: initialize.setup_flow?.is_first_run,
          ready_to_launch: initialize.setup_flow?.ready_to_launch,
          launch_ready: initialize.readiness?.launch_ready,
          needsSetup,
        });

        setNeedsFirstRun(needsSetup);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[StartupGate] Check error:', message);
        setError(message);
        setNeedsFirstRun(true); // 出错时进入配置页面
      } finally {
        setChecking(false);
      }
    };

    void checkSystemReady();
  }, []);

  // 正在检查，显示加载界面
  if (checking) {
    const steps: AppLoaderStep[] = [
      {
        label: t('common.startupPreflight.steps.desktopSession'),
        state: 'complete',
        progress: 100,
      },
      {
        label: t('common.startupPreflight.steps.appConfig'),
        state: 'complete',
        progress: 100,
      },
      {
        label: t('common.startupPreflight.steps.firstRunStatus'),
        state: 'active',
        message: t('common.startupPreflight.messages.checkingSystemReady'),
        progress: 80,
      },
    ];

    return (
      <AppLoader
        title={t('common.startupPreflight.title')}
        description={t('common.startupPreflight.description')}
        steps={steps}
        testId='opl-startup-gate'
        showProgress={true}
      />
    );
  }

  // 检查完成，根据结果导航
  if (error) {
    // 出错时仍然进入配置页面，让用户看到详细信息
    return <Navigate to="/first-run" replace />;
  }

  if (needsFirstRun) {
    return <Navigate to="/first-run" replace />;
  }

  return <Navigate to="/guid" replace />;
};

export default StartupGate;
