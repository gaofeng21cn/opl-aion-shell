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
const ArchivedPage = React.lazy(() => import('@renderer/pages/conversation/GroupedHistory/ArchivedPage'));
const OverviewSettings = React.lazy(() => import('@renderer/pages/settings/sections/OverviewSettings'));
const RuntimeSettings = React.lazy(() => import('@renderer/pages/settings/sections/RuntimeSettings'));
const WorkspaceSettings = React.lazy(() => import('@renderer/pages/settings/sections/WorkspaceSettings'));
const LocalServicesSettings = React.lazy(() => import('@renderer/pages/settings/sections/LocalServicesSettings'));
const StorageSettings = React.lazy(() => import('@renderer/pages/settings/StorageSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const AgentPackagesSettings = React.lazy(() =>
  import('@renderer/pages/settings/CapabilitiesSettings').then((module) => ({ default: module.AgentPackagesSettings }))
);
const AccessSettings = React.lazy(() => import('@renderer/pages/settings/sections/AccessSettings'));
const GatewaySettings = React.lazy(() =>
  import('@renderer/pages/settings/sections/AccessSettings').then((module) => ({ default: module.GatewaySettings }))
);
const ResourcesSettings = React.lazy(() => import('@renderer/pages/settings/sections/ResourcesSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/sections/AppearanceSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const RuntimePage = React.lazy(() => import('@renderer/pages/runtime'));
const DomainDetailViewPage = React.lazy(() => import('@renderer/pages/runtime/DomainDetailViewPage'));
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
  AgentPackagesSettingsContent: AgentPackagesSettings,
  GatewaySettingsContent: GatewaySettings,
  AccessSettingsContent: AccessSettings,
  ResourcesSettingsContent: ResourcesSettings,
  AppearanceModalContent: AppearanceSettings,
  AboutModalContent: SystemSettings,
  SystemModalContent: SystemSettings,
};

function renderSettingsRoute({ routeId, path, componentKey }: SettingsRouteDefinition): React.ReactElement {
  if (routeId === 'local-services') {
    return (
      <Route
        key='settings-route-local-services'
        path='/settings/local-services'
        element={<Navigate to='/settings/environment?section=services' replace />}
      />
    );
  }
  const Component = SETTINGS_COMPONENTS[componentKey];
  return <Route key={`settings-route-${routeId}`} path={`/settings/${path}`} element={withRouteFallback(Component)} />;
}

function renderSettingsRedirect([legacyId, targetPath]: [string, string]): React.ReactElement {
  const path = `/settings/${legacyId}`;
  return <Route key={`settings-redirect-${legacyId}`} path={path} element={<Navigate to={targetPath} replace />} />;
}

const ProtectedRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return children;
};

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  return <ProtectedRoute>{React.cloneElement(layout)}</ProtectedRoute>;
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
        <Route
          index
          element={
            <ProtectedRoute>
              <Navigate to='/startup-gate' replace />
            </ProtectedRoute>
          }
        />
        <Route
          path='/startup-gate'
          element={
            <ProtectedRoute>
              <StartupGate />
            </ProtectedRoute>
          }
        />
        <Route path='/first-run' element={<ProtectedRoute>{withRouteFallback(FirstRun)}</ProtectedRoute>} />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/capabilities' element={<Navigate to='/guid' replace />} />
          <Route path='/archived' element={withRouteFallback(ArchivedPage)} />
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
          <Route path='/settings/*' element={<Navigate to={SETTINGS_DEFAULT_ROUTE} replace />} />
          <Route path='/runtime' element={withRouteFallback(RuntimePage)} />
          <Route path='/runtime/item' element={withRouteFallback(RuntimePage)} />
          <Route path='/runtime/item/:itemId/insights/:viewId' element={withRouteFallback(DomainDetailViewPage)} />
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
