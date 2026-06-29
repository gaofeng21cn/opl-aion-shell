import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import StartupGate from '@renderer/components/layout/StartupGate';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const FirstRun = React.lazy(() => import('@renderer/pages/FirstRun'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const OverviewSettings = React.lazy(() => import('@renderer/pages/settings/sections/OverviewSettings'));
const RuntimeSettings = React.lazy(() => import('@renderer/pages/settings/sections/RuntimeSettings'));
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
          <Route path='/settings/general' element={withRouteFallback(OverviewSettings)} />
          <Route path='/settings/overview' element={<Navigate to='/settings/general' replace />} />
          <Route path='/settings/environment' element={withRouteFallback(RuntimeSettings)} />
          <Route path='/settings/runtime' element={<Navigate to='/settings/environment' replace />} />
          <Route path='/settings/storage' element={withRouteFallback(StorageSettings)} />
          <Route path='/settings/capabilities' element={withRouteFallback(CapabilitiesSettings)} />
          <Route path='/settings/access' element={withRouteFallback(AccessSettings)} />
          <Route path='/settings/appearance' element={withRouteFallback(AppearanceSettings)} />
          <Route path='/settings/model' element={<Navigate to='/settings/environment' replace />} />
          <Route path='/settings/agent' element={<Navigate to='/settings/capabilities' replace />} />
          <Route path='/settings/assistants' element={<Navigate to='/settings/capabilities' replace />} />
          <Route path='/settings/skills-hub' element={<Navigate to='/settings/capabilities?tab=skills' replace />} />
          <Route path='/settings/tools' element={<Navigate to='/settings/capabilities?tab=tools' replace />} />
          <Route path='/settings/display' element={<Navigate to='/settings/appearance' replace />} />
          <Route path='/settings/webui' element={<Navigate to='/settings/access' replace />} />
          <Route path='/settings/pet' element={<Navigate to='/settings/appearance' replace />} />
          <Route path='/settings/advanced' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/system' element={<Navigate to='/settings/advanced' replace />} />
          <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/general' replace />} />
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
