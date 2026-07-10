/**
 * StartupGate - 启动检查门控
 *
 * 职责：
 * - 快速读取本机启动状态
 * - 根据结果决定路由到 /first-run 或 /guid
 * - 显示统一的启动加载界面
 *
 * 设计原则：
 * - 只负责检查和路由决策
 * - 不承担配置向导职责
 * - 未确认 ready 时默认进入 FirstRun，但允许用户显式进入 OPL
 */

import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { isCoreLaunchReadyFromAppState, readInitializePayload } from '@/renderer/pages/FirstRun/initializeModel';
import AppLoader, { type AppLoaderStep } from './AppLoader';

type StartupCheckPhase = 'startupState' | 'routeDecision';

const StartupGate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [needsFirstRun, setNeedsFirstRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<StartupCheckPhase>('startupState');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const skipStartupCheck = () => {
    navigate('/guid', { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const elapsedTimer = window.setInterval(() => {
      if (!cancelled) {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }
    }, 1000);

    const checkSystemReady = async () => {
      try {
        let result = null;
        try {
          result = await ipcBridge.oplRuntime.getAppState.invoke({ profile: 'fast' });
        } catch (err) {
          console.error('[StartupGate] App state check threw:', err);
        }
        if (cancelled) return;

        if (!result || result.ok === false) {
          console.error('[StartupGate] App state check failed:', result);
          const initializeResult = await ipcBridge.oplRuntime.getInitialize.invoke();
          if (cancelled) return;

          setPhase('routeDecision');
          const initialize = initializeResult?.ok === false ? null : readInitializePayload(initializeResult?.parsed);
          setNeedsFirstRun(initialize?.setup_flow.ready_to_launch !== true);
          return;
        }

        setPhase('routeDecision');
        const launchReady = isCoreLaunchReadyFromAppState(result.parsed);

        setNeedsFirstRun(!launchReady);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[StartupGate] Check error:', message);
        setError(message);
        setNeedsFirstRun(true); // 出错时进入配置页面
      } finally {
        window.clearInterval(elapsedTimer);
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void checkSystemReady();

    return () => {
      cancelled = true;
      window.clearInterval(elapsedTimer);
    };
  }, []);

  // 正在检查，显示加载界面
  if (checking) {
    const startupStateMessage =
      elapsedSeconds >= 3
        ? t('common.startupPreflight.messages.stillReadingStartupState', { seconds: elapsedSeconds })
        : t('common.startupPreflight.messages.checkingStartupState');
    const steps: AppLoaderStep[] = [
      {
        label: t('common.startupPreflight.steps.desktopSession'),
        state: 'complete',
      },
      {
        label: t('common.startupPreflight.steps.startupState'),
        state: phase === 'startupState' ? 'active' : 'complete',
        message: phase === 'startupState' ? startupStateMessage : undefined,
      },
      {
        label: t('common.startupPreflight.steps.routeDecision'),
        state: phase === 'routeDecision' ? 'active' : 'pending',
        message: phase === 'routeDecision' ? t('common.startupPreflight.messages.decidingNextScreen') : undefined,
      },
    ];

    return (
      <AppLoader
        title={t('common.startupPreflight.title')}
        description={t('common.startupPreflight.description')}
        steps={steps}
        testId='opl-startup-gate'
        showProgress={false}
        showSkipButton={true}
        skipButtonText={t('common.startupPreflight.skipCheck')}
        onSkip={skipStartupCheck}
      />
    );
  }

  // 检查完成，根据结果导航
  if (error) {
    // 出错时仍然进入配置页面，让用户看到详细信息
    return <Navigate to='/first-run' replace />;
  }

  if (needsFirstRun) {
    return <Navigate to='/first-run' replace />;
  }

  return <Navigate to='/guid' replace />;
};

export default StartupGate;
