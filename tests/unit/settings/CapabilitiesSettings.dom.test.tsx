import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CapabilitiesSettingsContent } from '@/renderer/pages/settings/CapabilitiesSettings';
import { resolveOplHomeAssistants } from '@/renderer/pages/guid/utils/oplHomeAssistants';

const bridgeMocks = vi.hoisted(() => ({
  executeActionInvoke: vi.fn(),
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
            status: 'ready',
            version: '1.2.3',
            source: 'managed_root',
            package_lock: {
              ref: 'opl://agent-package-lock/mas/0.1.0a4',
              physical_surface: {
                status: 'materialized',
                plugin_id: 'mas',
                marketplace_id: 'opl-agent-mas-local',
                codex_plugin_cache_path: '/tmp/codex/plugins/cache/opl-agent-mas-local/mas/0.1.0a4',
                marketplace_path: '/tmp/opl/codex-plugin-marketplaces/opl-agent-mas-local/.agents/plugins/marketplace.json',
                codex_config_path: '/tmp/codex/config.toml',
                reload_required: true,
              },
            },
            capability_exposure: { status: 'visible', last_sync_at: '2026-06-30T01:00:00Z' },
          },
          { module_id: 'medautogrant', status: 'update_available', exposure_status: 'needs_sync' },
          { module_id: 'redcube', status: 'failed_with_repair', failure_reason: 'receipt missing' },
          { module_id: 'oplbookforge', status: 'ready', codex_visible: true },
          { module_id: 'oplmetaagent', status: 'missing' },
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
                  decision_actions: ['review', 'needs_changes', 'open_in_codex'],
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
  }),
}));

vi.mock('@/common/config/oplProductProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/config/oplProductProfile')>();
  return {
    ...actual,
    getOplHomeAgentShortcuts: () => [
      {
        shortcut_id: 'research',
        package_id: 'mas',
        primary_label: 'Research',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'grant',
        package_id: 'mag',
        primary_label: 'Grant Writing',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'ppt',
        package_id: 'rca',
        primary_label: 'Presentations',
        user_configurable: true,
        default_visible: true,
      },
      {
        shortcut_id: 'book',
        package_id: 'bookforge',
        primary_label: 'Writing books',
        user_configurable: true,
        default_visible: true,
      },
    ],
    getOplProfessionalAgentPackages: () => [
      {
        package_id: 'mas',
        display_name: 'Med Auto Science',
        short_name: 'MAS',
        codex_visible_entry: 'mas',
        default_home_visible: true,
        required_skill_ids: ['mas'],
        optional_skill_ids: [],
      },
      {
        package_id: 'mag',
        display_name: 'Med Auto Grant',
        short_name: 'MAG',
        codex_visible_entry: 'mag',
        default_home_visible: true,
        required_skill_ids: ['mag'],
        optional_skill_ids: [],
      },
      {
        package_id: 'rca',
        display_name: 'RedCube AI',
        short_name: 'RCA',
        codex_visible_entry: 'rca',
        default_home_visible: true,
        required_skill_ids: ['rca'],
        optional_skill_ids: [],
      },
      {
        package_id: 'bookforge',
        display_name: 'OPL BookForge',
        short_name: 'BookForge',
        codex_visible_entry: 'opl-bookforge',
        default_home_visible: true,
        required_skill_ids: ['opl-bookforge'],
        optional_skill_ids: [],
      },
    ],
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.capabilitiesPage.title': 'Agents & Capabilities',
        'settings.capabilitiesPage.description': 'Choose capabilities by work purpose first.',
        'settings.capabilitiesPage.status.ready': 'Ready',
        'settings.capabilitiesPage.status.update': 'Update available',
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
        'settings.capabilitiesPage.detailLabels.rollbackRef': 'Rollback ref',
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
        'settings.capabilitiesPage.detailLabels.connectorReadinessRefs': 'Connector readiness refs',
        'settings.capabilitiesPage.detailLabels.workflowRefs': 'Reusable workflow refs',
        'settings.capabilitiesPage.detailLabels.resourceContextRefs': 'Environment and resource refs',
        'settings.capabilitiesPage.detailLabels.exportBundleAction': 'Reproducibility export bundle action',
        'settings.capabilitiesPage.detailValues.notReported': 'Not reported',
        'settings.capabilitiesPage.detailValues.none': 'None',
        'settings.capabilitiesPage.detailValues.yes': 'Yes',
        'settings.capabilitiesPage.detailValues.no': 'No',
        'settings.capabilitiesPage.candidateReports.title': 'Candidate reports',
        'settings.capabilitiesPage.candidateReports.description':
          'Review workflow and skill candidates as refs first. Nothing is installed or enabled from this view.',
        'settings.capabilitiesPage.candidateReports.purpose': 'Candidate purpose',
        'settings.capabilitiesPage.candidateReports.report': 'Report ref',
        'settings.capabilitiesPage.candidateReports.decision': 'Decision',
        'settings.capabilitiesPage.candidateReports.pendingDecision': 'Pending review',
        'settings.capabilitiesPage.candidateReports.actions.review': 'Review',
        'settings.capabilitiesPage.candidateReports.actions.needsChanges': 'Needs changes',
        'settings.capabilitiesPage.candidateReports.actions.openInCodex': 'Open in Codex',
        'settings.capabilitiesPage.connectorGroups.oplConnect': 'OPL Connect',
        'settings.capabilitiesPage.connectorGroups.oplFabric': 'OPL Fabric',
        'settings.capabilitiesPage.resourceContextGroups.gateway': 'OPL Gateway',
        'settings.capabilitiesPage.resourceContextGroups.environment': 'Environment catalog',
        'settings.capabilitiesPage.resourceContextGroups.storage': 'Storage',
        'settings.capabilitiesPage.resourceContextGroups.resources': 'Resource sources',
        'settings.capabilitiesPage.resourceContextGroups.receipts': 'Resource receipts',
        'settings.capabilitiesPage.resourceContextGroups.costs': 'Quota / cost',
        'settings.capabilitiesPage.refLabels.id': 'ID',
        'settings.capabilitiesPage.refLabels.ref': 'Ref',
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
        'settings.capabilitiesPage.packageManager.refreshRegistry': 'Refresh registry',
        'settings.capabilitiesPage.packageManager.manifestUrlPlaceholder': 'Manifest URL',
        'settings.capabilitiesPage.packageManager.installFromManifest': 'Install manifest',
        'settings.capabilitiesPage.packageManager.hideFromHome': 'Hide from Home',
        'settings.capabilitiesPage.packageManager.showOnHome': 'Show on Home',
        'settings.capabilitiesPage.packageManager.moveUp': 'Move up',
        'settings.capabilitiesPage.packageManager.moveDown': 'Move down',
        'settings.capabilitiesPage.packageManager.pendingFrameworkAction':
          'Waiting for Framework action receipt support',
        'settings.capabilitiesPage.packageManager.actionQueued': 'Action routed to OPL',
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
    localStorage.clear();
  });

  it('shows purpose capability groups before skills and tools details', async () => {
    const onTabChange = vi.fn();
    render(<CapabilitiesSettingsContent activeTab='skills' onTabChange={onTabChange} />);

    expect(screen.getByText('Agents & Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Agent packages')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-refresh-registry')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-install-manifest')).toBeDisabled();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('MAS')).toBeInTheDocument();
    expect(screen.getByText('Grant Writing')).toBeInTheDocument();
    expect(screen.getByText('MAG')).toBeInTheDocument();
    expect(screen.getByText('Presentations')).toBeInTheDocument();
    expect(screen.getByText('RCA')).toBeInTheDocument();
    expect(screen.getByText('Writing books')).toBeInTheDocument();
    expect(screen.getByText('BookForge')).toBeInTheDocument();
    expect(screen.getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(screen.getByText('OMA')).toBeInTheDocument();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.getByText('Update available')).toBeInTheDocument();
    expect(screen.getByText('Needs repair')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(screen.getAllByText('Codex visibility: Visible in Codex').length).toBeGreaterThan(0);
    expect(screen.getByText('Codex visibility: Needs sync before Codex sees the latest version')).toBeInTheDocument();

    const research = screen.getByTestId('capability-purpose-mas');
    expect(within(research).getByText('Candidate reports')).toBeInTheDocument();
    expect(within(research).getByText('OpenScience artifact graph review')).toBeInTheDocument();
    const openscienceCandidate = within(research).getByTestId(
      'capability-candidate-report-mas-openscience-artifact-graph'
    );
    expect(openscienceCandidate).toHaveTextContent('Review OpenScience artifact graph before enabling any skill.');
    expect(openscienceCandidate).toHaveTextContent('candidate://openscience/artifact-graph');
    expect(openscienceCandidate).toHaveTextContent('report://openscience/artifact-graph');
    expect(openscienceCandidate).toHaveTextContent('review_pending');
    expect(openscienceCandidate).toHaveTextContent('Needs changes');
    expect(openscienceCandidate).toHaveTextContent('Open in Codex');
    expect(openscienceCandidate).not.toHaveTextContent('must not render');

    const grant = screen.getByTestId('capability-purpose-mag');
    const grantCandidate = within(grant).getByTestId('capability-candidate-report-mag-grant-workflow');
    expect(grantCandidate).toHaveTextContent('Grant workflow candidate');
    expect(grantCandidate).toHaveTextContent('opl://workflow/medautogrant/grant-draft');
    expect(grantCandidate).toHaveTextContent('Pending review');

    fireEvent.click(within(research).getByRole('button', { name: 'Capability details' }));
    await waitFor(() => expect(within(research).getByText(/Installed Codex surface:/)).toBeInTheDocument());
    expect(within(research).getByText('materialized')).toBeInTheDocument();
    expect(within(research).getByText(/Codex reload required:/)).toBeInTheDocument();
    expect(within(research).getAllByText('Yes').length).toBeGreaterThan(0);
    expect(within(research).getByText('opl-agent-mas-local')).toBeInTheDocument();
    expect(within(research).getByText('/tmp/codex/config.toml')).toBeInTheDocument();
    expect(within(research).getByText('1.2.3')).toBeInTheDocument();
    expect(within(research).getByText('managed_root')).toBeInTheDocument();
    expect(within(research).getByText('2026-06-30T01:00:00Z')).toBeInTheDocument();
    expect(within(research).getByText('Connector readiness refs')).toBeInTheDocument();
    expect(within(research).getByTestId('capability-connector-group-mas-oplConnect')).toBeInTheDocument();
    expect(within(research).getByTestId('capability-connector-group-mas-oplFabric')).toBeInTheDocument();
    expect(within(research).getByText('OPL Connect')).toBeInTheDocument();
    expect(within(research).getByText('OPL Fabric')).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/connect\/pubmed\/readiness/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/connector\/generic\/readiness/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/fabric\/storage\/readiness/)).toBeInTheDocument();
    expect(within(research).getByText('Reusable workflow refs')).toBeInTheDocument();
    expect(within(research).getByText('Module runtime repair')).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/workflow\/medautoscience\/module-runtime-repair/)).toBeInTheDocument();
    expect(within(research).getByText('Environment and resource refs')).toBeInTheDocument();
    expect(within(research).getByText('OPL Gateway')).toBeInTheDocument();
    expect(within(research).getByText('Environment catalog')).toBeInTheDocument();
    expect(within(research).getByText('Storage')).toBeInTheDocument();
    expect(within(research).getByText('Resource sources')).toBeInTheDocument();
    expect(within(research).getByText('Resource receipts')).toBeInTheDocument();
    expect(within(research).getByText('Quota / cost')).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/gateway\/status\/gflabtoken/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/environment\/python-r-quarto/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/environment-template\/python-r-quarto/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/environment-version\/python-r-quarto\/2026-07/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/task-applicability\/mas/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/storage\/workspace-volume\/medautoscience/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/resource-source\/opl-cloud\/managed-compute/)).toBeInTheDocument();
    expect(within(research).getByText(/receipt:\/\/resource\/latest/)).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/cost-estimate\/mas\/latest/)).toBeInTheDocument();
    expect(within(research).getByText('Reproducibility export bundle action')).toBeInTheDocument();
    expect(within(research).getByText('export_reproducibility_bundle')).toBeInTheDocument();
    expect(within(research).getByText(/opl:\/\/app-action\/task_action_receipt_preview/)).toBeInTheDocument();
    expect(within(research).getAllByText(/receipt:\/\/export\/latest/).length).toBeGreaterThan(0);

    const presentations = screen.getByTestId('capability-purpose-rca');
    fireEvent.click(within(presentations).getByRole('button', { name: 'Capability details' }));
    expect(within(presentations).getByText('receipt missing')).toBeInTheDocument();
    expect(screen.getAllByText('External tools & voice').length).toBeGreaterThan(0);
    expect(screen.getByText('Technical detail: MCP is the protocol.')).toBeInTheDocument();
    expect(screen.getByText('Custom assistants')).toBeInTheDocument();
    expect(screen.getAllByText('Skills').length).toBeGreaterThan(0);
    expect(screen.getByTestId('skills-detail')).toBeInTheDocument();

    const externalTools = screen.getByTestId('capability-entry-external-tools');
    fireEvent.click(within(externalTools).getByRole('button', { name: 'External tools & voice' }));
    expect(onTabChange).toHaveBeenCalledWith('tools');

    fireEvent.click(within(research).getByRole('button', { name: 'Review capability' }));
    expect(onTabChange).toHaveBeenCalledWith('skills');
  });

  it('persists Home shortcut visibility/order and routes registry/install through App actions', async () => {
    render(<CapabilitiesSettingsContent activeTab='skills' onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('agent-package-home-toggle-mas'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v1')).toContain('research');

    fireEvent.click(screen.getByTestId('agent-package-home-down-mas'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v1')).toContain('grant');

    fireEvent.click(screen.getByTestId('agent-package-refresh-registry'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'refresh_registry',
      dryRun: false,
      payloadRefsOnlyJson: {
        registry_url: 'https://raw.githubusercontent.com/gaofeng21cn/opl-agent-registry/main/registry.json',
      },
    });

    fireEvent.change(screen.getByTestId('agent-package-manifest-url'), {
      target: { value: 'https://example.test/agent.json' },
    });
    fireEvent.click(screen.getByTestId('agent-package-install-manifest'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'install_from_manifest_url',
      dryRun: false,
      payloadRefsOnlyJson: { manifest_url: 'https://example.test/agent.json' },
    });

    fireEvent.click(screen.getByTestId('agent-package-action-mas-update'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'agent_package_update',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });

    fireEvent.click(screen.getByTestId('agent-package-action-mas-repair'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'agent_package_repair',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });

    fireEvent.click(screen.getByTestId('agent-package-action-mas-rollback'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'agent_package_rollback',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });

    fireEvent.click(screen.getByTestId('agent-package-action-mas-uninstall'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'agent_package_uninstall',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });

    fireEvent.click(screen.getByTestId('agent-package-action-mas-hide'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'agent_package_hide',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });

    fireEvent.click(screen.getByTestId('agent-package-action-mas-show'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'agent_package_unhide',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });
  });

  it('uses persisted shortcut preferences when building Home agents', () => {
    localStorage.setItem(
      'opl.homeAgentShortcutPreferences.v1',
      JSON.stringify({
        hiddenShortcutIds: ['grant'],
        orderedShortcutIds: ['book', 'research', 'ppt', 'grant'],
      })
    );

    expect(resolveOplHomeAssistants([]).map((assistant) => assistant.id)).toEqual(['bookforge', 'mas', 'rca']);
  });
});
