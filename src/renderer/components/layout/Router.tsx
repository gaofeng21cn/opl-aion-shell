import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import { SETTINGS_DEFAULT_ROUTE, SETTINGS_ROUTE_PATHS } from '@renderer/pages/settings/sections/settingsNav';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const OverviewSettings = React.lazy(() => import('@renderer/pages/settings/sections/OverviewSettings'));
const RuntimeSettings = React.lazy(() => import('@renderer/pages/settings/sections/RuntimeSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const AccessSettings = React.lazy(() => import('@renderer/pages/settings/sections/AccessSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/sections/AppearanceSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));
const RuntimeTrayItemPage = React.lazy(() => import('@renderer/pages/runtime'));

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
          element={status === 'authenticated' ? <Navigate to='/guid' replace /> : withRouteFallback(LoginPage)}
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route
            path='/team/:id'
            element={TEAM_MODE_ENABLED ? withRouteFallback(TeamIndex) : <Navigate to='/guid' replace />}
          />
          <Route path='/settings/gemini' element={<Navigate to={SETTINGS_ROUTE_PATHS.capabilities} replace />} />
          <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />
          <Route path='/settings/assistants' element={withRouteFallback(AssistantSettings)} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/personalization' element={<Navigate to={SETTINGS_ROUTE_PATHS.appearance} replace />} />
          {/* Legacy routes — redirect to the merged /settings/capabilities page */}
          <Route path='/settings/skills-hub' element={<Navigate to='/settings/capabilities?tab=skills' replace />} />
          <Route path='/settings/tools' element={<Navigate to='/settings/capabilities?tab=tools' replace />} />
          <Route path='/settings/display' element={<Navigate to={SETTINGS_ROUTE_PATHS.appearance} replace />} />
          <Route path='/settings/webui' element={<Navigate to={SETTINGS_ROUTE_PATHS.access} replace />} />
          <Route path='/settings/opl' element={<Navigate to={SETTINGS_ROUTE_PATHS.runtime} replace />} />
          <Route path='/settings/pet' element={<Navigate to={SETTINGS_ROUTE_PATHS.appearance} replace />} />
          <Route path={SETTINGS_ROUTE_PATHS.overview} element={withRouteFallback(OverviewSettings)} />
          <Route path={SETTINGS_ROUTE_PATHS.runtime} element={withRouteFallback(RuntimeSettings)} />
          <Route path={SETTINGS_ROUTE_PATHS.capabilities} element={withRouteFallback(CapabilitiesSettings)} />
          <Route path={SETTINGS_ROUTE_PATHS.access} element={withRouteFallback(AccessSettings)} />
          <Route path={SETTINGS_ROUTE_PATHS.appearance} element={withRouteFallback(AppearanceSettings)} />
          <Route path={SETTINGS_ROUTE_PATHS.system} element={withRouteFallback(SystemSettings)} />
          <Route path={SETTINGS_ROUTE_PATHS.about} element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to={SETTINGS_DEFAULT_ROUTE} replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:jobId' element={withRouteFallback(TaskDetailPage)} />
          <Route path='/runtime' element={withRouteFallback(RuntimeTrayItemPage)} />
          <Route path='/runtime/item' element={withRouteFallback(RuntimeTrayItemPage)} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
