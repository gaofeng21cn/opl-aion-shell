import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CapabilitiesSettingsContent } from '@/renderer/pages/settings/CapabilitiesSettings';
import { resolveOplHomeAssistants } from '@/renderer/pages/guid/utils/oplHomeAssistants';

const bridgeMocks = vi.hoisted(() => ({
  executeActionInvoke: vi.fn(),
  loadAppState: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: () => <div data-testid='skills-detail'>Skills detail</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='tools-detail'>Tools detail</div>,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      modules: {
        items: [
          {
            module_id: 'medautoscience',
            health_status: 'dirty',
            source_policy: {
              effective_install_update_source: 'git_checkout',
              configured_by: 'developer_mode',
            },
            version: '1.2.3',
            source: 'git_checkout',
            git: {
              dirty: true,
              sync_status: 'behind',
              short_sha: '1a2b3c4',
            },
            package_lock: {
              ref: 'opl://agent-package-lock/mas/0.1.0a4',
              physical_surface: {
                status: 'materialized',
                plugin_id: 'mas',
                marketplace_id: 'opl-agent-mas-local',
                codex_plugin_cache_path: '/tmp/codex/plugins/cache/opl-agent-mas-local/mas/0.1.0a4',
                marketplace_path:
                  '/tmp/opl/codex-plugin-marketplaces/opl-agent-mas-local/.agents/plugins/marketplace.json',
                codex_config_path: '/tmp/codex/config.toml',
                reload_required: true,
              },
            },
            capability_exposure: { status: 'visible', last_sync_at: '2026-06-30T01:00:00Z' },
          },
          { module_id: 'medautogrant', status: 'update_available', exposure_status: 'needs_sync' },
          { module_id: 'redcube', status: 'failed_with_repair', failure_reason: 'receipt missing' },
          { module_id: 'oplbookforge', status: 'ready', codex_visible: true, recommended_action: 'update' },
          { module_id: 'oplmetaagent', status: 'ready', recommended_action: 'update' },
        ],
      },
      operator: {
        workbench: {
          task_drilldowns: {
            medautoscience: {
              status: 'blocked',
              next_owner: 'opl_framework',
              next_visible_step: 'repair connector',
              workflow_refs: [
                {
                  id: 'module-runtime-repair',
                  title: 'Module runtime repair',
                  status: 'available',
                  ref: 'opl://workflow/medautoscience/module-runtime-repair',
                  owner: 'opl_framework',
                  next_action: 'run dry-run first',
                },
              ],
              candidate_reports: [
                {
                  id: 'openscience-artifact-graph',
                  title: 'OpenScience artifact graph review',
                  status: 'candidate_report_ready',
                  ref: 'candidate://openscience/artifact-graph',
                  owner: 'opl_ledger',
                  next_action: 'review report before enabling any skill',
                  candidate_purpose: 'Review OpenScience artifact graph before enabling any skill.',
                  report_ref: 'report://openscience/artifact-graph',
                  decision_status: 'review_pending',
                  decision_actions: ['review', 'needs_changes', 'continue_in_conversation'],
                  body: 'must not render',
                },
              ],
              connector_readiness_refs: [
                'opl://connect/pubmed/readiness',
                'opl://connector/generic/readiness',
                {
                  id: 'fabric-storage',
                  title: 'Fabric storage readiness',
                  ref: 'opl://fabric/storage/readiness',
                  status: 'refs_only',
                },
              ],
              gateway_status_ref: 'opl://gateway/status/gflabtoken',
              environment_ref: 'opl://environment/python-r-quarto',
              environment_template_ref: 'opl://environment-template/python-r-quarto',
              environment_version_ref: 'opl://environment-version/python-r-quarto/2026-07',
              task_applicability_ref: 'opl://task-applicability/mas',
              storage_ref: 'opl://storage/workspace-volume/medautoscience',
              resource_source_refs: ['opl://resource-source/opl-cloud/managed-compute'],
              resource_receipt_ref: 'receipt://resource/latest',
              cost_estimate_ref: 'opl://cost-estimate/mas/latest',
              export_bundle_action_ref: 'opl://app-action/export_reproducibility_bundle',
              action_receipt: {
                dry_run_action_ref: 'opl://app-action/task_action_receipt_preview',
                latest_receipt_ref: 'receipt://export/latest',
              },
            },
            medautogrant: {
              status: 'ready',
              next_owner: 'grant_owner',
              next_visible_step: 'review reusable grant workflow first',
              workflow_refs: [
                {
                  id: 'grant-workflow',
                  title: 'Grant workflow candidate',
                  status: 'refs_available',
                  ref: 'opl://workflow/medautogrant/grant-draft',
                },
              ],
            },
          },
        },
      },
    },
    load: bridgeMocks.loadAppState,
  }),
}));

vi.mock('@/common/config/oplProductProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/config/oplProductProfile')>();
  return {
    ...actual,
    getOplHomeAgentShortcuts: () => [
      {
        shortcut_id: 'research',
        package_id: 'med-autoscience',
        primary_label: 'Research',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'grant',
        package_id: 'med-autogrant',
        primary_label: 'Grant Writing',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'ppt',
        package_id: 'redcube-ai',
        primary_label: 'Presentations',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'book',
        package_id: 'opl-bookforge',
        primary_label: 'Writing books',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'automations',
        package_id: 'oma',
        primary_label: 'Always-On/Automations',
        user_configurable: true,
        default_visible: false,
      },
    ],
    getOplProfessionalAgentPackages: () => [
      {
        package_id: 'med-autoscience',
        display_name: 'Med Auto Science',
        short_name: 'MAS',
        codex_visible_entry: 'mas',
        default_home_visible: true,
        required_skill_ids: ['mas'],
        optional_skill_ids: [],
      },
      {
        package_id: 'med-autogrant',
        display_name: 'Med Auto Grant',
        short_name: 'MAG',
        codex_visible_entry: 'mag',
        default_home_visible: true,
        required_skill_ids: ['mag'],
        optional_skill_ids: [],
      },
      {
        package_id: 'redcube-ai',
        display_name: 'RedCube AI',
        short_name: 'RCA',
        codex_visible_entry: 'rca',
        default_home_visible: true,
        required_skill_ids: ['rca'],
        optional_skill_ids: [],
      },
      {
        package_id: 'opl-bookforge',
        display_name: 'OPL BookForge',
        short_name: 'OBF',
        codex_visible_entry: 'opl-bookforge',
        default_home_visible: true,
        required_skill_ids: ['opl-bookforge'],
        optional_skill_ids: [],
      },
      {
        package_id: 'oma',
        display_name: 'OPL Meta Agent',
        short_name: 'OMA',
        codex_visible_entry: 'opl-meta-agent',
        default_home_visible: false,
        required_skill_ids: ['opl-meta-agent'],
        optional_skill_ids: [],
      },
    ],
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, string | undefined> & { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.capabilitiesPage.title': 'Agents & Capabilities',
        'settings.capabilitiesPage.description': 'Choose capabilities by work purpose first.',
        'settings.capabilitiesPage.status.ready': 'Ready',
        'settings.capabilitiesPage.status.update': 'Update available',
        'settings.capabilitiesPage.status.sync': 'Needs sync',
        'settings.capabilitiesPage.status.source': 'Developer source',
        'settings.capabilitiesPage.status.attention': 'Needs attention',
        'settings.capabilitiesPage.status.repair': 'Needs repair',
        'settings.capabilitiesPage.status.missing': 'Missing',
        'settings.capabilitiesPage.detailsHeader': 'Capability details',
        'settings.capabilitiesPage.codexVisibilitySummary': `Codex visibility: ${options?.value ?? ''}`,
        'settings.capabilitiesPage.codexVisibility.visible': 'Visible in Codex',
        'settings.capabilitiesPage.codexVisibility.needsSync': 'Needs sync before Codex sees the latest version',
        'settings.capabilitiesPage.codexVisibility.notVisible': 'Not visible to Codex yet',
        'settings.capabilitiesPage.codexVisibility.unknown': 'Visibility not reported',
        'settings.capabilitiesPage.detailLabels.purpose': 'Purpose',
        'settings.capabilitiesPage.detailLabels.codexVisibility': 'Codex visibility',
        'settings.capabilitiesPage.detailLabels.packageId': 'Package ID',
        'settings.capabilitiesPage.detailLabels.codexVisibleEntry': 'Codex entry',
        'settings.capabilitiesPage.detailLabels.defaultHomeVisible': 'Default Home shortcut',
        'settings.capabilitiesPage.detailLabels.userConfigurable': 'User configurable',
        'settings.capabilitiesPage.detailLabels.sourceKind': 'Source kind',
        'settings.capabilitiesPage.detailLabels.packageLockRef': 'Package lock receipt',
        'settings.capabilitiesPage.detailLabels.actionReceiptRef': 'Action receipt',
        'settings.capabilitiesPage.detailLabels.rollbackRef': 'Rollback receipt',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceStatus': 'Installed Codex surface',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceReloadRequired': 'Codex reload required',
        'settings.capabilitiesPage.detailLabels.physicalSurfacePluginId': 'Installed plugin',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplaceId': 'Local marketplace',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceCachePath': 'Plugin cache path',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplacePath': 'Marketplace path',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceConfigPath': 'Codex config path',
        'settings.capabilitiesPage.detailLabels.version': 'Version',
        'settings.capabilitiesPage.detailLabels.source': 'Source',
        'settings.capabilitiesPage.detailLabels.lastSync': 'Last sync',
        'settings.capabilitiesPage.detailLabels.failureReason': 'Failure reason',
        'settings.capabilitiesPage.detailLabels.connectorReadinessRefs': 'Connector readiness',
        'settings.capabilitiesPage.detailLabels.workflowRefs': 'Reusable workflows',
        'settings.capabilitiesPage.detailLabels.resourceContextRefs': 'Environment and resource context',
        'settings.capabilitiesPage.detailLabels.exportBundleAction': 'Reproducibility export bundle action',
        'settings.capabilitiesPage.detailValues.notReported': 'Not reported',
        'settings.capabilitiesPage.detailValues.none': 'None',
        'settings.capabilitiesPage.detailValues.yes': 'Yes',
        'settings.capabilitiesPage.detailValues.no': 'No',
        'settings.capabilitiesPage.candidateReports.title': 'Review suggestions',
        'settings.capabilitiesPage.candidateReports.description':
          'Review workflow and skill suggestions from their source context. This view does not install, enable, or edit skills.',
        'settings.capabilitiesPage.candidateReports.purpose': 'Suggested use',
        'settings.capabilitiesPage.candidateReports.report': 'Source report',
        'settings.capabilitiesPage.candidateReports.decision': 'Review state',
        'settings.capabilitiesPage.candidateReports.pendingDecision': 'Needs review',
        'settings.capabilitiesPage.candidateReports.actions.review': 'Review',
        'settings.capabilitiesPage.candidateReports.actions.needsChanges': 'Needs changes',
        'settings.capabilitiesPage.candidateReports.actions.continueInConversation': 'Continue in conversation',
        'settings.capabilitiesPage.connectorGroups.oplConnect': 'OPL Connect',
        'settings.capabilitiesPage.connectorGroups.oplFabric': 'OPL Fabric',
        'settings.capabilitiesPage.resourceContextGroups.gateway': 'OPL Gateway',
        'settings.capabilitiesPage.resourceContextGroups.environment': 'Environment catalog',
        'settings.capabilitiesPage.resourceContextGroups.storage': 'Storage',
        'settings.capabilitiesPage.resourceContextGroups.resources': 'Resource sources',
        'settings.capabilitiesPage.resourceContextGroups.receipts': 'Resource receipts',
        'settings.capabilitiesPage.resourceContextGroups.costs': 'Quota / cost',
        'settings.capabilitiesPage.refLabels.id': 'ID',
        'settings.capabilitiesPage.refLabels.ref': 'Source',
        'settings.capabilitiesPage.refLabels.owner': 'Owner',
        'settings.capabilitiesPage.refLabels.nextAction': 'Next action',
        'settings.capabilitiesPage.refLabels.action': 'Action',
        'settings.capabilitiesPage.refLabels.dryRun': 'Dry-run summary',
        'settings.capabilitiesPage.refLabels.receipt': 'Receipt summary',
        'settings.capabilitiesPage.actions.openDetails': 'Review capability',
        'settings.capabilitiesPage.actions.installOrSync': 'Set up capability',
        'settings.capabilitiesPage.actions.updateOrSync': 'Update or sync',
        'settings.capabilitiesPage.actions.repair': 'Review repair path',
        'settings.capabilitiesPage.packageManager.title': 'Agent packages',
        'settings.capabilitiesPage.packageManager.description': 'Package lifecycle actions use App action routes.',
        'settings.capabilitiesPage.packageManager.catalogTitle': 'Package catalog',
        'settings.capabilitiesPage.packageManager.catalogDescription':
          'Manage install state and Home visibility from one compact list.',
        'settings.capabilitiesPage.packageManager.refreshRegistry': 'Refresh registry',
        'settings.capabilitiesPage.packageManager.searchPlaceholder': 'Search package, tag, or description',
        'settings.capabilitiesPage.packageManager.allStatuses': 'All statuses',
        'settings.capabilitiesPage.packageManager.manifestUrlPlaceholder': 'Manifest URL',
        'settings.capabilitiesPage.packageManager.installFromManifest': 'Install manifest',
        'settings.capabilitiesPage.packageManager.hideFromHome': 'Hide from Home',
        'settings.capabilitiesPage.packageManager.showOnHome': 'Show on Home',
        'settings.capabilitiesPage.packageManager.moveUp': 'Move up',
        'settings.capabilitiesPage.packageManager.moveDown': 'Move down',
        'settings.capabilitiesPage.packageManager.homeVisibleWithOrder': `Home visible · Order ${options?.order ?? ''}`,
        'settings.capabilitiesPage.packageManager.homeHidden': 'Home hidden',
        'settings.capabilitiesPage.packageManager.noHomeShortcut': 'No Home shortcut',
        'settings.capabilitiesPage.packageManager.rowMeta': `${options?.sourceLabel ?? ''}: ${options?.sourceValue ?? ''} · ${options?.versionLabel ?? ''}: ${options?.versionValue ?? ''} · ${options?.homeLabel ?? ''}`,
        'settings.capabilitiesPage.packageManager.packageCount': `Showing ${options?.count ?? ''} / ${options?.total ?? ''}`,
        'settings.capabilitiesPage.packageManager.empty': 'No matching agent packages.',
        'settings.capabilitiesPage.packageManager.pendingFrameworkAction':
          'Waiting for Framework action receipt support',
        'settings.capabilitiesPage.packageManager.actionQueued': 'Action routed to OPL',
        'settings.capabilitiesPage.packageManager.tableHeaders.package': 'Package',
        'settings.capabilitiesPage.packageManager.tableHeaders.purpose': 'Purpose / tags',
        'settings.capabilitiesPage.packageManager.tableHeaders.status': 'Status',
        'settings.capabilitiesPage.packageManager.tableHeaders.source': 'Source',
        'settings.capabilitiesPage.packageManager.tableHeaders.version': 'Version',
        'settings.capabilitiesPage.packageManager.tableHeaders.codex': 'Codex',
        'settings.capabilitiesPage.packageManager.tableHeaders.home': 'Home shortcut',
        'settings.capabilitiesPage.packageManager.tableHeaders.actions': 'Actions',
        'settings.capabilitiesPage.packageManager.actions.update': 'Update',
        'settings.capabilitiesPage.packageManager.actions.repair': 'Repair',
        'settings.capabilitiesPage.packageManager.actions.rollback': 'Rollback',
        'settings.capabilitiesPage.packageManager.actions.uninstall': 'Uninstall',
        'settings.capabilitiesPage.packageManager.actions.hide': 'Hide',
        'settings.capabilitiesPage.packageManager.actions.show': 'Show',
        'settings.capabilitiesPage.purposes.automation.title': 'OPL Meta Agent',
        'settings.capabilitiesPage.purposes.automation.description': 'Use OMA explicitly.',
        'settings.capabilitiesPage.entries.externalTools.title': 'External tools & voice',
        'settings.capabilitiesPage.entries.externalTools.description': 'Connect external tools and speech input.',
        'settings.capabilitiesPage.entries.externalTools.technical': 'Technical detail: MCP is the protocol.',
        'settings.capabilitiesPage.entries.customAssistants.title': 'Custom assistants',
        'settings.capabilitiesPage.entries.customAssistants.description': 'Use the Advanced assistant area.',
        'settings.capabilitiesPage.supporting.title': 'Skills, tools, and custom assistants',
        'settings.capabilitiesPage.supporting.description':
          'Supporting capability details stay collapsed by default. Open them only when you need to configure or troubleshoot.',
        'settings.capabilitiesTab.skills': 'Skills',
        'settings.capabilitiesTab.tools': 'External tools & voice',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('CapabilitiesSettingsContent', () => {
  beforeEach(() => {
    bridgeMocks.executeActionInvoke.mockReset();
    bridgeMocks.executeActionInvoke.mockResolvedValue({
      ok: true,
      command: 'opl app action execute --action test --json',
    });
    bridgeMocks.loadAppState.mockReset();
    bridgeMocks.loadAppState.mockResolvedValue(null);
    localStorage.clear();
  });

  it('shows purpose capability groups before skills and tools details', async () => {
    const onTabChange = vi.fn();
    const Harness = () => {
      const [activeTab, setActiveTab] = React.useState<'skills' | 'tools'>('skills');
      return (
        <CapabilitiesSettingsContent
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            onTabChange(tab);
          }}
        />
      );
    };
    render(<Harness />);

    expect(screen.getByText('Agents & Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Agent packages')).toBeInTheDocument();
    expect(screen.getByText('Package catalog')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-refresh-registry')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-search')).toBeInTheDocument();
    expect(screen.getByText('Showing 5 / 5')).toBeInTheDocument();
    expect(screen.getByText('Package')).toBeInTheDocument();
    expect(screen.getByText('Home shortcut')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-install-manifest')).toBeDisabled();
    expect(screen.getAllByText('Med Auto Science').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MAS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Med Auto Grant').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MAG').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RedCube AI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RCA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPL BookForge').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OBF').length).toBeGreaterThan(0);
    expect(screen.getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(screen.getAllByText('OMA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Developer source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Update available').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs repair').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Visible in Codex').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs sync before Codex sees the latest version').length).toBeGreaterThan(0);

    const research = screen.getByTestId('capability-purpose-mas');
    expect(within(research).getByText(/Home visible · Order 1/)).toBeInTheDocument();
    fireEvent.click(within(research).getByTestId('capability-row-details-mas'));
    let detailedResearch = screen.getByTestId('capability-details-mas');
    expect(within(detailedResearch).getByText('Review suggestions')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OpenScience artifact graph review')).toBeInTheDocument();
    const openscienceCandidate = within(detailedResearch).getByTestId(
      'capability-candidate-report-mas-openscience-artifact-graph'
    );
    expect(openscienceCandidate).toHaveTextContent('Review OpenScience artifact graph before enabling any skill.');
    expect(openscienceCandidate).toHaveTextContent('candidate://openscience/artifact-graph');
    expect(openscienceCandidate).toHaveTextContent('report://openscience/artifact-graph');
    expect(openscienceCandidate).toHaveTextContent('review_pending');
    expect(openscienceCandidate).toHaveTextContent('Needs changes');
    expect(openscienceCandidate).toHaveTextContent('Continue in conversation');
    expect(openscienceCandidate).not.toHaveTextContent('must not render');

    detailedResearch = screen.getByTestId('capability-details-mas');
    expect(within(detailedResearch).getAllByText('1.2.3').length).toBeGreaterThan(0);
    expect(within(detailedResearch).getAllByText('git_checkout').length).toBeGreaterThan(0);
    expect(within(detailedResearch).getAllByText('2026-06-30T01:00:00Z').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        within(screen.getByTestId('capability-details-mas')).getByTestId('capability-connector-group-mas-oplConnect')
      ).toBeInTheDocument()
    );
    detailedResearch = screen.getByTestId('capability-details-mas');
    expect(within(detailedResearch).getByTestId('capability-connector-group-mas-oplConnect')).toBeInTheDocument();
    expect(within(detailedResearch).getByTestId('capability-connector-group-mas-oplFabric')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OPL Connect')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OPL Fabric')).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/connect\/pubmed\/readiness/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/connector\/generic\/readiness/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/fabric\/storage\/readiness/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Reusable workflows')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Module runtime repair')).toBeInTheDocument();
    expect(
      within(detailedResearch).getByText(/opl:\/\/workflow\/medautoscience\/module-runtime-repair/)
    ).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Environment and resource context')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OPL Gateway')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Environment catalog')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Storage')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Resource sources')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Resource receipts')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Quota / cost')).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/gateway\/status\/gflabtoken/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/environment\/python-r-quarto/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/environment-template\/python-r-quarto/)).toBeInTheDocument();
    expect(
      within(detailedResearch).getByText(/opl:\/\/environment-version\/python-r-quarto\/2026-07/)
    ).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/task-applicability\/mas/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/storage\/workspace-volume\/medautoscience/)).toBeInTheDocument();
    expect(
      within(detailedResearch).getByText(/opl:\/\/resource-source\/opl-cloud\/managed-compute/)
    ).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/receipt:\/\/resource\/latest/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/cost-estimate\/mas\/latest/)).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Reproducibility export bundle action')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('export_reproducibility_bundle')).toBeInTheDocument();
    expect(within(detailedResearch).getByText(/opl:\/\/app-action\/task_action_receipt_preview/)).toBeInTheDocument();
    expect(within(detailedResearch).getAllByText(/receipt:\/\/export\/latest/).length).toBeGreaterThan(0);

    const grant = screen.getByTestId('capability-purpose-mag');
    fireEvent.click(within(grant).getByTestId('capability-row-details-mag'));
    const grantCandidate = within(screen.getByTestId('capability-details-mag')).getByTestId(
      'capability-candidate-report-mag-grant-workflow'
    );
    expect(grantCandidate).toHaveTextContent('Grant workflow candidate');
    expect(grantCandidate).toHaveTextContent('opl://workflow/medautogrant/grant-draft');
    expect(grantCandidate).toHaveTextContent('Needs review');

    const presentations = screen.getByTestId('capability-purpose-rca');
    fireEvent.click(within(presentations).getByTestId('capability-row-details-rca'));
    expect(within(screen.getByTestId('capability-details-rca')).getAllByText('receipt missing').length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText('External tools & voice').length).toBeGreaterThan(0);
    expect(screen.getByText('Technical detail: MCP is the protocol.')).toBeInTheDocument();
    expect(screen.getByText('Custom assistants')).toBeInTheDocument();
    expect(screen.getAllByText('Skills').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('skills-detail')).not.toBeInTheDocument();
    expect(screen.getAllByText('OPL Meta Agent')).toHaveLength(1);

    const externalTools = screen.getByTestId('capability-entry-external-tools');
    fireEvent.click(within(externalTools).getByRole('button', { name: 'External tools & voice' }));
    expect(onTabChange).toHaveBeenCalledWith('tools');
    await waitFor(() => expect(screen.getByTestId('tools-detail')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('open-skills-support'));
    expect(onTabChange).toHaveBeenCalledWith('skills');
    expect(screen.getByTestId('skills-detail')).toBeInTheDocument();
  });

  it('persists Home shortcut visibility/order and routes registry/install through App actions', async () => {
    render(<CapabilitiesSettingsContent activeTab='skills' onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('agent-package-home-toggle-mas'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v1')).toContain('research');
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_home_shortcut_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: 'med-autoscience',
          shortcut_id: 'research',
          visible: false,
          sort_order: 0,
        },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-home-down-mas'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v1')).toContain('grant');
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_home_shortcut_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: 'med-autoscience',
          shortcut_id: 'research',
          visible: false,
          sort_order: 1,
        },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-refresh-registry'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'refresh_registry',
        dryRun: false,
        payloadRefsOnlyJson: {
          registry_url: 'https://raw.githubusercontent.com/gaofeng21cn/opl-agent-registry/main/registry.json',
        },
      })
    );

    fireEvent.change(screen.getByTestId('agent-package-manifest-url'), {
      target: { value: 'https://example.test/agent.json' },
    });
    fireEvent.click(screen.getByTestId('agent-package-install-manifest'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'install_from_manifest_url',
        dryRun: false,
        payloadRefsOnlyJson: { manifest_url: 'https://example.test/agent.json' },
      })
    );

    fireEvent.click(within(screen.getByTestId('capability-purpose-mas')).getByTestId('capability-row-details-mas'));
    fireEvent.click(screen.getByTestId('agent-package-action-mas-update'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_update',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-action-mas-repair'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_repair',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-action-mas-rollback'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_rollback',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-action-mas-uninstall'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_uninstall',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-action-mas-hide'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_hide',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-action-mas-show'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_unhide',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      })
    );
    await waitFor(() => expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true }));
  });

  it('uses persisted shortcut preferences when building Home agents', () => {
    localStorage.setItem(
      'opl.homeAgentShortcutPreferences.v1',
      JSON.stringify({
        hiddenShortcutIds: ['grant'],
        orderedShortcutIds: ['book', 'research', 'ppt', 'grant'],
      })
    );

    expect(resolveOplHomeAssistants([]).map((assistant) => assistant.id)).toEqual([
      'opl-bookforge',
      'med-autoscience',
      'redcube-ai',
    ]);
  });

  it('uses Framework app-state shortcut preference readback before the local fallback', () => {
    localStorage.setItem(
      'opl.homeAgentShortcutPreferences.v1',
      JSON.stringify({
        hiddenShortcutIds: [],
        orderedShortcutIds: ['research', 'grant', 'ppt', 'book'],
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: {
          app_state: {
            opl_agent_packages: {
              home_shortcut_preferences: [
                { package_id: 'opl-bookforge', shortcut_id: 'book', visible: true, sort_order: 0 },
                { package_id: 'med-autoscience', shortcut_id: 'research', visible: true, sort_order: 1 },
                { package_id: 'med-autogrant', shortcut_id: 'grant', visible: false, sort_order: 2 },
                { package_id: 'redcube-ai', shortcut_id: 'ppt', visible: true, sort_order: 3 },
              ],
            },
          },
        },
        loadedAt: '12:00:00',
      })
    );

    expect(resolveOplHomeAssistants([]).map((assistant) => assistant.id)).toEqual([
      'opl-bookforge',
      'med-autoscience',
      'redcube-ai',
    ]);
  });
});
