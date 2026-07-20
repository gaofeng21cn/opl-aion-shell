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
import type { OplAppStatePayload } from '@/common/types/opl/appState';
import { isCoreLaunchReadyFromAppState, readInitializePayload } from '@/renderer/pages/FirstRun/initializeModel';
import { cacheFastOplAppState, loadOplAppStateFromBridge } from '@/renderer/hooks/system/useOplAppState';
import AppLoader, { type AppLoaderStep } from './AppLoader';

type StartupCheckPhase = 'startupState' | 'initializeFallback' | 'routeDecision';

export const STARTUP_STATE_SOFT_TIMEOUT_MS = 1500;
const STARTUP_DETAILS_THRESHOLD_SECONDS = 3;

type StartupStateRead = { kind: 'result'; value: OplAppStatePayload | null } | { kind: 'timeout' };

function readStartupStateWithSoftTimeout(): Promise<StartupStateRead> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: 'timeout' });
    }, STARTUP_STATE_SOFT_TIMEOUT_MS);

    void loadOplAppStateFromBridge('fast').then(
      (value) => {
        if (value) cacheFastOplAppState(value, new Date().toLocaleTimeString());
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve({ kind: 'result', value });
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        console.error('[StartupGate] App state check threw:', error);
        resolve({ kind: 'result', value: null });
      }
    );
  });
}

async function readAuthoritativeInitializeReadiness(): Promise<boolean | null> {
  try {
    const result = await ipcBridge.oplRuntime.getInitialize.invoke();
    if (result.ok === false) return null;
    const initialize = readInitializePayload(result.parsed);
    return initialize ? initialize.setup_flow?.ready_to_launch === true : null;
  } catch (error) {
    console.error('[StartupGate] Authoritative initialize check threw:', error);
    return null;
  }
}

const StartupGate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [needsFirstRun, setNeedsFirstRun] = useState(false);
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
        const startupRead = await readStartupStateWithSoftTimeout();
        if (cancelled) return;

        if (startupRead.kind === 'result' && startupRead.value) {
          setPhase('routeDecision');
          setNeedsFirstRun(!isCoreLaunchReadyFromAppState(startupRead.value));
          return;
        }

        setPhase('initializeFallback');
        const initializeReady = await readAuthoritativeInitializeReadiness();
        if (cancelled) return;
        setPhase('routeDecision');
        setNeedsFirstRun(initializeReady !== true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[StartupGate] Check error:', message);
        setNeedsFirstRun(true);
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
    const currentStageMessage =
      phase === 'startupState'
        ? elapsedSeconds >= STARTUP_DETAILS_THRESHOLD_SECONDS
          ? t('common.startupPreflight.messages.stillReadingStartupState', { seconds: elapsedSeconds })
          : t('common.startupPreflight.messages.checkingStartupState')
        : phase === 'initializeFallback'
          ? t('common.startupPreflight.messages.checkingAuthoritativeReadiness')
          : t('common.startupPreflight.messages.decidingNextScreen');
    const steps: AppLoaderStep[] = [
      {
        label: t('common.uiOptimization.startup.stages.workspace'),
        state: phase === 'startupState' ? 'active' : 'complete',
      },
      {
        label: t('common.uiOptimization.startup.stages.assistant'),
        state: phase === 'startupState' ? 'pending' : phase === 'initializeFallback' ? 'active' : 'complete',
      },
      {
        label: t('common.uiOptimization.startup.stages.modelAccess'),
        state: phase === 'routeDecision' ? 'active' : 'pending',
      },
    ];
    const details =
      elapsedSeconds >= STARTUP_DETAILS_THRESHOLD_SECONDS ? (
        <>
          <p>{t('common.uiOptimization.startup.timeout')}</p>
          <p>{currentStageMessage}</p>
        </>
      ) : undefined;

    return (
      <AppLoader
        brand={t('common.uiOptimization.startup.brand')}
        title={t('common.uiOptimization.startup.title')}
        steps={steps}
        testId='opl-startup-gate'
        showProgress={false}
        details={details}
        detailsLabel={t('common.uiOptimization.startup.viewDetails')}
        showSkipButton={true}
        skipButtonText={t('common.startupPreflight.skipCheck')}
        onSkip={skipStartupCheck}
      />
    );
  }

  // 检查完成，根据结果导航
  if (needsFirstRun) {
    return <Navigate to='/first-run' replace />;
  }

  return <Navigate to='/guid' replace />;
};

export default StartupGate;
