import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import StartupGate from '@renderer/components/layout/StartupGate';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import {
  LEGACY_SETTINGS_ROUTE_REDIRECTS,
  SETTINGS_DEFAULT_ROUTE,
  getSettingsRouteDefinitions,
  type SettingsRouteDefinition,
} from '@renderer/pages/settings/registry/settingsRegistry';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const FirstRun = React.lazy(() => import('@renderer/pages/FirstRun'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const OverviewSettings = React.lazy(() => import('@renderer/pages/settings/sections/OverviewSettings'));
const RuntimeSettings = React.lazy(() => import('@renderer/pages/settings/sections/RuntimeSettings'));
const WorkspaceSettings = React.lazy(() => import('@renderer/pages/settings/sections/WorkspaceSettings'));
const LocalServicesSettings = React.lazy(() => import('@renderer/pages/settings/sections/LocalServicesSettings'));
const StorageSettings = React.lazy(() => import('@renderer/pages/settings/StorageSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const AccessSettings = React.lazy(() => import('@renderer/pages/settings/sections/AccessSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/sections/AppearanceSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const RuntimePage = React.lazy(() => import('@renderer/pages/runtime'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

const SETTINGS_COMPONENTS = {
  OverviewSettings,
  WorkspaceSettings,
  LocalServicesSettings,
  RuntimeSettings,
  StorageSettings,
  CapabilitiesSettingsContent: CapabilitiesSettings,
  AccessSettingsContent: AccessSettings,
  AppearanceModalContent: AppearanceSettings,
  SystemModalContent: SystemSettings,
};

function renderSettingsRoute({ routeId, path, componentKey }: SettingsRouteDefinition): React.ReactElement {
  const Component = SETTINGS_COMPONENTS[componentKey];
  return <Route key={`settings-route-${routeId}`} path={`/settings/${path}`} element={withRouteFallback(Component)} />;
}

function renderSettingsRedirect([legacyId, targetPath]: [string, string]): React.ReactElement {
  const path = `/settings/${legacyId}`;
  return <Route key={`settings-redirect-${legacyId}`} path={path} element={<Navigate to={targetPath} replace />} />;
}

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route
          path='/login'
          element={status === 'authenticated' ? <Navigate to='/startup-gate' replace /> : withRouteFallback(LoginPage)}
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/startup-gate' replace />} />
          <Route path='/startup-gate' element={<StartupGate />} />
          <Route path='/first-run' element={withRouteFallback(FirstRun)} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route
            path='/team/:id'
            element={TEAM_MODE_ENABLED ? withRouteFallback(TeamIndex) : <Navigate to='/guid' replace />}
          />
          {getSettingsRouteDefinitions().map(renderSettingsRoute)}
          {Object.entries(LEGACY_SETTINGS_ROUTE_REDIRECTS)
            .filter(([legacyId, targetPath]) => targetPath !== `/settings/${legacyId}`)
            .map(renderSettingsRedirect)}
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to={SETTINGS_DEFAULT_ROUTE} replace />} />
          <Route path='/runtime' element={withRouteFallback(RuntimePage)} />
          <Route path='/runtime/item' element={withRouteFallback(RuntimePage)} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:job_id' element={withRouteFallback(TaskDetailPage)} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/startup-gate' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
