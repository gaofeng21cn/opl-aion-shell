/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Sentry must be initialized first
// Use electron-specific renderer package only inside Electron; fall back to the
// browser SDK when running as a web server (no window.electronAPI).
if ((window as { electronAPI?: unknown }).electronAPI) {
  // Dynamic import avoids bundling sentry-ipc:// protocol code into the web build
  import('@sentry/electron/renderer')
    .then((Sentry) =>
      Sentry.init({
        beforeSend(event) {
          if (!(window as { __backendStartupFailed?: boolean }).__backendStartupFailed) {
            return event;
          }
          const haystacks: string[] = [];
          if (event.message) haystacks.push(event.message);
          const exceptions = event.exception?.values ?? [];
          for (const ex of exceptions) {
            if (ex.value) haystacks.push(ex.value);
          }
          if (haystacks.some((h) => /Failed to fetch|window\.__backendPort|__backendPort unset/.test(h))) {
            return null;
          }
          return event;
        },
      })
    )
    .catch(() => {});
}

// Runtime patches must be imported early
import './utils/ui/runtimePatches';

// Browser adapter setup
import '@/common/adapter/browser';

// React and core dependencies
import type { PropsWithChildren } from 'react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';

// Context providers
import { AuthProvider } from './hooks/context/AuthContext';
import { FeedbackProvider } from './hooks/context/FeedbackContext';
import { ThemeProvider } from './hooks/context/ThemeContext';
import { PreviewProvider } from './pages/conversation/Preview/context/PreviewContext';

// Arco Design
import { ConfigProvider, Modal, Typography } from '@arco-design/web-react';
// Configure Arco Design to use React 18's createRoot, fixing Message component's CopyReactDOM.render error
import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import enUS from '@arco-design/web-react/es/locale/en-US';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import { useTranslation } from 'react-i18next';

// Styles
import 'uno.css';
import './styles/arco-override.css';
import './styles/themes/index.css';
import './styles/markdown.css';
import './styles/opl-codex-primitives.css';

// Config service — kick off initialization before i18n / theme modules load,
// so their startup paths (which await configService.whenReady()) observe the
// authoritative settings from the backend instead of the empty cache.
import { configService } from '@/common/config/configService';
configService.initialize().catch((err) => {
  console.error('Failed to initialize config:', err);
});

// i18n
import './services/i18n';
import { registerPwa } from './services/registerPwa';

import { mutate as swrMutate } from 'swr';
import { ipcBridge } from '@/common';
import { MANAGED_AGENTS_SWR_KEY, fetchManagedAgents } from './utils/model/agentTypes';
import { repairAllCronJobTimeZonesOnce } from '@renderer/pages/cron/repairCronJobTimeZone';
import { startManagedUpdateMaintenanceScheduler } from './services/managedUpdateMaintenance';

// Components and utilities
import BackendStartingView from './components/layout/BackendStartingView';
import BackendStartupGate from './components/layout/BackendStartupGate';
import Layout from './components/layout/Layout';
import Router from './components/layout/Router';
import Sider from './components/layout/Sider';
import { useAuth } from './hooks/context/AuthContext';
import { ConversationHistoryProvider } from './hooks/context/ConversationHistoryContext';
import HOC from './utils/ui/HOC';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import type { IRuntimeStatusEvent, RuntimeFailureKind } from '@/common/adapter/ipcBridge';
import {
  getBackendStartupFailureDialogRoute,
  InstallationIntegrityContent,
  InstallationIntegrityModalHost,
  getDownloadLatestModalActionProps,
  getInstallationIntegrityDescription,
  getRuntimeComponentInstallationDescription,
  showInstallationIntegrityModal,
  type BackendStartupFailureDialogRoute,
} from './components/layout/InstallationIntegrityDialog';
import AppLoader, { type AppLoaderStep } from './components/layout/AppLoader';
import { createRuntimeInstallationReconciler } from './services/runtime/runtimeInstallationReconciler';

const arcoLocales: Record<string, typeof enUS> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

const INSTALLATION_INTEGRITY_FAILURES = new Set<RuntimeFailureKind>([
  'bundled_resource_missing',
  'bundled_resource_invalid',
  'validation_failed',
]);

function isInstallationIntegrityFailure(kind: RuntimeFailureKind | undefined): boolean {
  return INSTALLATION_INTEGRITY_FAILURES.has(kind ?? 'unknown');
}

function captureRuntimeInstallationIntegrityFailure(event: IRuntimeStatusEvent): void {
  if (!isInstallationIntegrityFailure(event.failure_kind)) {
    return;
  }

  void import('@sentry/electron/renderer')
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setTag('aionui.installation_integrity', event.failure_kind ?? 'unknown');
        scope.setTag('aionui.runtime_resource', event.resource);
        scope.setTag('aionui.runtime_resource_id', event.resource_id ?? '');
        scope.setTag('aionui.runtime_scope', event.scope.kind);
        Sentry.captureMessage('runtime-installation-integrity-failure', 'error');
      });
    })
    .catch(() => {});
}

function resolveRuntimeResourceLabel(event: IRuntimeStatusEvent, t: TFunction): string {
  if (event.resource === 'node') {
    return t('settings.runtimeResource.node');
  }
  if (event.resource_id === 'codex-acp') {
    return t('settings.runtimeResource.codexAcp');
  }
  if (event.resource_id === 'claude-agent-acp') {
    return t('settings.runtimeResource.claudeAgentAcp');
  }
  return t('settings.runtimeResource.acpTool');
}

const RuntimeFailureDialogs: React.FC = () => {
  const { t } = useTranslation();
  const [modal, modalContextHolder] = Modal.useModal();

  useEffect(() => {
    const reconciler = createRuntimeInstallationReconciler({
      showDialog: (event) => {
        const resource = resolveRuntimeResourceLabel(event, t);
        const description = getRuntimeComponentInstallationDescription(t, resource);
        const controller = showInstallationIntegrityModal(modal, t, description);
        return { close: () => controller.close() };
      },
      report: (event) => captureRuntimeInstallationIntegrityFailure(event),
    });

    const offStatus = ipcBridge.runtime.statusChanged.on((event: IRuntimeStatusEvent) => {
      if (
        (event.phase === 'failed' && isInstallationIntegrityFailure(event.failure_kind)) ||
        (event.phase === 'ready' && event.resource === 'node')
      ) {
        reconciler.handleStatus(event);
        return;
      }

      if (event.phase !== 'failed') return;
      const resource = resolveRuntimeResourceLabel(event, t);
      modal.error({
        title: t('common.error'),
        content: <InstallationIntegrityContent description={t('settings.runtimeStatus.failedUnknown', { resource })} />,
        okText: t('common.confirm'),
        closable: false,
        maskClosable: false,
      });
    });

    const onBeforeUnload = () => reconciler.flushPending();
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      offStatus();
      reconciler.flushPending();
      reconciler.dispose();
    };
  }, [modal, t]);

  return <>{modalContextHolder}</>;
};

const AppProviders: React.FC<PropsWithChildren> = ({ children }) =>
  React.createElement(
    AuthProvider,
    null,
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        PreviewProvider,
        null,
        React.createElement(
          FeedbackProvider,
          null,
          React.createElement(React.Fragment, null, React.createElement(RuntimeFailureDialogs, null), children)
        )
      )
    )
  );

const Config: React.FC<PropsWithChildren> = ({ children }) => {
  const {
    i18n: { language },
  } = useTranslation();
  const arcoLocale = arcoLocales[language] ?? enUS;

  return React.createElement(ConfigProvider, { theme: { primaryColor: '#4E5969' }, locale: arcoLocale }, children);
};

const Main = () => {
  const { t } = useTranslation();
  const { ready } = useAuth();
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void configService
      .initialize()
      .catch((err) => {
        console.error('Failed to initialize config:', err);
      })
      .finally(() => setConfigReady(true));
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    // Seed model metadata opportunistically; Guid remains usable while this refresh is in flight.
    void fetchManagedAgents()
      .then((agents) => swrMutate(MANAGED_AGENTS_SWR_KEY, agents, false))
      .catch((err) => {
        console.error('Failed to prefetch agents:', err);
      });
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    void repairAllCronJobTimeZonesOnce();
  }, [ready]);

  useEffect(() => {
    if (!ready || !configReady) return;
    return startManagedUpdateMaintenanceScheduler();
  }, [ready, configReady]);

  if (!ready || !configReady) {
    const steps: AppLoaderStep[] = [
      {
        label: t('common.uiOptimization.startup.stages.workspace'),
        state: ready ? 'complete' : 'active',
      },
      {
        label: t('common.uiOptimization.startup.stages.assistant'),
        state: !ready ? 'pending' : configReady ? 'complete' : 'active',
      },
      {
        label: t('common.uiOptimization.startup.stages.modelAccess'),
        state: 'pending',
      },
    ];
    return (
      <AppLoader
        title={t('common.startupPreflight.title')}
        description={t('common.startupPreflight.description')}
        steps={steps}
        testId='opl-startup-preflight'
        showProgress={false}
      />
    );
  }

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

const App = HOC.Wrapper(Config)(Main);

const BackendStartupFailureDialog: React.FC<{
  failure: BackendStartupFailureInfo;
  route: BackendStartupFailureDialogRoute;
}> = ({ failure, route }) => {
  const { t } = useTranslation();

  const title = t('common.backendStartup.incompatibleRuntime.title');
  const description =
    route.kind === 'incompatible_runtime'
      ? t('common.backendStartup.incompatibleRuntime.description')
      : route.kind === 'package_architecture_mismatch'
        ? t('common.backendStartup.packageArchitectureMismatch.description', {
            packageArch: failure.packageArch ?? 'x64',
            deviceArch: failure.deviceArch ?? 'arm64',
            expectedArch: failure.expectedDownloadArch ?? 'arm64',
          })
        : getInstallationIntegrityDescription(t, route.diagnosticsKind);
  const requiredVersions = failure.requiredVersions?.map((version) => `GLIBC_${version}`).join(', ');

  if (route.kind === 'installation_integrity') {
    return (
      <div className='min-h-screen bg-bg-1'>
        <InstallationIntegrityModalHost
          description={description}
          diagnosticsKind={route.diagnosticsKind}
          failure={failure}
        />
      </div>
    );
  }

  if (route.kind === 'package_architecture_mismatch') {
    return (
      <div className='min-h-screen bg-bg-1'>
        <Modal
          visible
          closable={false}
          maskClosable={false}
          title={t('common.backendStartup.packageArchitectureMismatch.title')}
          {...getDownloadLatestModalActionProps(t)}
        >
          <InstallationIntegrityContent description={description} />
        </Modal>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-bg-1'>
      <Modal visible closable={false} maskClosable={false} footer={null} title={title}>
        <div className='text-t-1'>
          <Typography.Paragraph className='mb-0 text-t-secondary'>{description}</Typography.Paragraph>
          {requiredVersions ? (
            <Typography.Paragraph className='mt-12px mb-0 text-12px text-t-tertiary'>
              {t('common.backendStartup.incompatibleRuntime.requiredVersions', { versions: requiredVersions })}
            </Typography.Paragraph>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

void registerPwa();

const root = createRoot(document.getElementById('root')!);
root.render(
  <BackendStartupGate
    renderStarting={() => (
      <Config>
        <BackendStartingView />
      </Config>
    )}
    renderFailure={(failure) => {
      const route = getBackendStartupFailureDialogRoute(failure);
      return route ? (
        <Config>
          <BackendStartupFailureDialog failure={failure} route={route} />
        </Config>
      ) : null;
    }}
    renderApp={() => (
      <AppProviders>
        <App />
      </AppProviders>
    )}
  />
);
