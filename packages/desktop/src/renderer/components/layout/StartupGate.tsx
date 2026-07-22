/**
 * StartupGate - 启动状态预读
 *
 * 职责：
 * - 快速读取并缓存本机启动状态
 * - 普通启动始终进入 /guid
 * - 显示统一的启动加载界面
 *
 * 设计原则：
 * - 只负责 bounded bootstrap read 和普通入口导航
 * - 不承担配置向导职责
 * - /first-run 仅由显式入口进入，readiness 在具体操作处判断
 */

import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cacheFastOplAppState, loadOplAppStateFromBridge } from '@/renderer/hooks/system/useOplAppState';
import AppLoader, { type AppLoaderStep } from './AppLoader';

type StartupCheckPhase = 'startupState' | 'routeDecision';

export const STARTUP_STATE_SOFT_TIMEOUT_MS = 1500;

function readStartupStateWithSoftTimeout(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, STARTUP_STATE_SOFT_TIMEOUT_MS);

    void loadOplAppStateFromBridge('fast').then(
      (value) => {
        if (value) cacheFastOplAppState(value, new Date().toLocaleTimeString());
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve();
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        console.error('[StartupGate] App state check threw:', error);
        resolve();
      }
    );
  });
}

const StartupGate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [phase, setPhase] = useState<StartupCheckPhase>('startupState');

  const skipStartupCheck = () => {
    navigate('/guid', { replace: true });
  };

  useEffect(() => {
    if (phase !== 'routeDecision') return;

    const frameId = window.requestAnimationFrame(() => {
      setChecking(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    const readStartupState = async () => {
      try {
        await readStartupStateWithSoftTimeout();
        if (cancelled) return;
        setPhase('routeDecision');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[StartupGate] Check error:', message);
        setPhase('routeDecision');
      }
    };

    void readStartupState();

    return () => {
      cancelled = true;
    };
  }, []);

  // 正在检查，显示加载界面
  if (checking) {
    const steps: AppLoaderStep[] = [
      {
        label: t('common.uiOptimization.startup.stages.workspace'),
        state: phase === 'startupState' ? 'active' : 'complete',
      },
      {
        label: t('common.uiOptimization.startup.stages.assistant'),
        state: phase === 'startupState' ? 'pending' : 'complete',
      },
      {
        label: t('common.uiOptimization.startup.stages.modelAccess'),
        state: phase === 'routeDecision' ? 'active' : 'pending',
      },
    ];
    return (
      <AppLoader
        brand={t('common.uiOptimization.startup.brand')}
        title={t('common.uiOptimization.startup.title')}
        steps={steps}
        testId='opl-startup-gate'
        showProgress={false}
        showSkipButton={true}
        skipButtonText={t('common.startupPreflight.skipCheck')}
        onSkip={skipStartupCheck}
      />
    );
  }

  return <Navigate to='/guid' replace />;
};

export default StartupGate;
