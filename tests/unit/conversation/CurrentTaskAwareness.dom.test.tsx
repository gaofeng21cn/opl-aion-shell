import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import CurrentTaskAwareness from '@/renderer/pages/conversation/runtime/CurrentTaskAwareness';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const map: Record<string, string> = {
        'conversation.currentTask.kicker': 'Current task',
        'conversation.currentTask.defaultTitle': 'Task in progress',
        'conversation.currentTask.artifact': 'Artifact',
        'conversation.currentTask.latestArtifact': 'Latest artifact',
        'conversation.currentTask.review': 'Review',
        'conversation.currentTask.action': 'Action',
        'conversation.currentTask.workflow': 'Workflow',
        'conversation.currentTask.ownerLabel': 'Owner',
        'conversation.currentTask.result': 'Result',
        'conversation.currentTask.status': 'Status',
        'conversation.currentTask.stage': 'Stage',
        'conversation.currentTask.progress': 'Progress',
        'conversation.currentTask.nextStep': 'Next step',
        'conversation.currentTask.taskIdentity': 'Task identity',
        'conversation.currentTask.plan': 'Plan ref',
        'conversation.currentTask.latestReceipt': 'Latest receipt',
        'conversation.currentTask.condition': 'Condition',
        'conversation.currentTask.evidence': 'Evidence',
        'conversation.currentTask.resource': 'Resource',
        'conversation.currentTask.diagnostics': 'Diagnostics',
        'conversation.currentTask.gatewayStatus': 'Gateway status',
        'conversation.currentTask.resourceSource': 'Resource source',
        'conversation.currentTask.environment': 'Environment',
        'conversation.currentTask.storage': 'Storage',
        'conversation.currentTask.resourceReceipt': 'Resource receipt',
        'conversation.currentTask.costEstimate': 'Cost estimate',
        'conversation.currentTask.taskEvidence': 'Task evidence',
        'conversation.currentTask.resourceSummary': 'Resource summary',
        'conversation.currentTask.resourceConfirmation': 'Plan-approve-execute-collect confirmation',
        'conversation.currentTask.receiptProvenance': 'Receipt context',
        'conversation.currentTask.artifactsProvenanceRefs': 'Result context',
        'conversation.currentTask.reviewFollowUp': 'Review and follow-up',
        'conversation.currentTask.workflowResourceActionRefs': 'Supporting context',
        'conversation.currentTask.exportBundleAction': 'Export bundle action',
        'conversation.currentTask.lineage': 'Lineage',
        'conversation.currentTask.provenanceBundle': 'Source bundle',
        'conversation.currentTask.provenanceIndex': 'Source index',
        'conversation.currentTask.roCrateMetadata': 'RO-Crate metadata',
        'conversation.currentTask.replayStatus': 'Replay status',
        'conversation.currentTask.agentTrace': 'Agent activity trail',
        'conversation.currentTask.reviewRef': 'Review note',
        'conversation.currentTask.typedIssue': 'Typed issue',
        'conversation.currentTask.contentHash': 'Content hash',
        'conversation.currentTask.drawerRoute': 'Detail route',
        'conversation.currentTask.drawerProjection': 'Detail source',
        'conversation.currentTask.structuredFollowUp': 'Structured follow-up',
        'conversation.currentTask.requestChangePrompt': 'Ask for changes with this context:',
        'conversation.currentTask.resourcePlan': 'Resource plan',
        'conversation.currentTask.resourceApproval': 'Resource approval',
        'conversation.currentTask.resourceExecute': 'Resource execute',
        'conversation.currentTask.resourceMonitor': 'Resource monitor',
        'conversation.currentTask.resourceCollect': 'Resource collect',
        'conversation.currentTask.resourceUsage': 'Resource usage',
        'conversation.currentTask.consolePolicy': 'Console policy',
        'conversation.currentTask.quota': 'Quota',
        'conversation.currentTask.billing': 'Billing',
        'conversation.currentTask.permission': 'Permission',
        'conversation.currentTask.environmentTemplate': 'Environment template',
        'conversation.currentTask.environmentVersion': 'Environment version',
        'conversation.currentTask.environmentSource': 'Environment source',
        'conversation.currentTask.environmentTask': 'Environment task',
        'conversation.currentTask.confirmPlan': 'Plan',
        'conversation.currentTask.confirmApproval': 'Approval',
        'conversation.currentTask.confirmExecute': 'Execute',
        'conversation.currentTask.confirmMonitor': 'Monitor',
        'conversation.currentTask.confirmCollect': 'Collect',
        'conversation.currentTask.jobReceipt': 'Job receipt',
        'conversation.currentTask.elapsed': 'Elapsed',
        'conversation.currentTask.nextAction': 'Next action',
        'conversation.currentTask.unavailable': 'Unavailable',
        'conversation.currentTask.pin': 'Pin task summary',
        'conversation.currentTask.unpin': 'Unpin task summary',
        'conversation.currentTask.expand': 'Show task evidence',
        'conversation.currentTask.collapse': 'Hide task evidence',
        'conversation.currentTask.stop': 'Stop task',
        'conversation.currentTask.stopUnavailable': 'No running turn can be stopped',
      };
      if (key === 'conversation.currentTask.owner') return `Owner: ${options?.owner ?? ''}`;
      return map[key] ?? key;
    },
  }),
}));

describe('CurrentTaskAwareness', () => {
  it('pins, expands, and stops from the compact current-task summary', async () => {
    const onStop = vi.fn().mockResolvedValue(true);
    render(
      <CurrentTaskAwareness
        compact
        onStop={onStop}
        task={
          {
            title: 'Manuscript review',
            status: { status_label: 'attention_needed' },
            stage: 'review',
            progress: '2/4',
            elapsed_label: '12m',
            next_owner: 'reviewer',
            next_step: 'Approve edits',
            artifact_or_blocker_ref: 'artifact://draft',
          } as never
        }
      />
    );

    expect(screen.getByTestId('conversation-current-task-inline')).toBeTruthy();
    expect(screen.getByText('Current task')).toBeTruthy();
    expect(screen.getByText('Manuscript review')).toBeTruthy();
    expect(screen.getByText('attention_needed')).toBeTruthy();
    expect(screen.getByText('2/4')).toBeTruthy();
    expect(screen.getByText('12m')).toBeTruthy();
    expect(screen.getByText('Approve edits')).toBeTruthy();
    expect(screen.queryByText('artifact://draft')).toBeNull();

    const pinButton = screen.getByRole('button', { name: 'Unpin task summary' });
    expect(pinButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pinButton);
    expect(screen.getByRole('button', { name: 'Pin task summary' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('2/4')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Pin task summary' }));
    expect(screen.getByText('2/4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show task evidence' }));
    expect(screen.getByText('artifact://draft')).toBeTruthy();
    expect(screen.getByText('Owner: reviewer')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stop task' }));
    await waitFor(() => expect(onStop).toHaveBeenCalledTimes(1));
  });

  it('renders inspector evidence refs without artifact body', () => {
    render(
      <CurrentTaskAwareness
        task={
          {
            title: 'Submission package',
            status: { status_label: 'ready_for_review' },
            artifact_or_blocker_summary: 'draft manifest ready',
            artifact_or_blocker_ref: 'artifact://draft',
            review_receipt_ref: 'receipt://review',
            action_receipt_ref: 'receipt://action',
            workflow_ref: 'workflow://submission',
            gateway_status_ref: 'opl://gateway/status',
            resource_source_refs: ['opl://resource-source/workspace', 'opl://resource-source/fabric'],
            environment_ref: 'opl://environment/default',
            storage_ref: 'opl://storage/default',
            resource_receipt_ref: 'receipt://resource',
            cost_estimate_ref: 'opl://cost/estimate',
            lineage_refs: ['lineage://draft'],
            artifact_native_drilldown: {
              provenance_bundle_refs: ['bundle://provenance'],
              provenance_index_ref: 'index://provenance',
              ro_crate_metadata_ref: 'ro-crate://metadata',
              replay_status_ref: 'replay://status',
              agent_trace_refs: ['trace://agent'],
              review_refs: ['review://ref'],
              typed_issues: [{ kind: 'request_change', summary: 'needs ref-level clarification', ref: 'issue://ref' }],
              content_hash_refs: ['sha256:abc123'],
              body: 'artifact body',
              provenance_drawer: {
                route: 'drawer://provenance',
                projection_ref: 'contracts/app-runtime-bridge.json#artifact_provenance_bundle_projection',
              },
            },
          } as never
        }
      />
    );

    const inspector = screen.getByTestId('conversation-current-task-inspector');
    expect(inspector).toBeTruthy();
    expect(screen.getByText('Result')).toBeTruthy();
    expect(screen.getByText('Result context')).toBeTruthy();
    expect(screen.getByText('Review and follow-up')).toBeTruthy();
    expect(screen.getByText('Supporting context')).toBeTruthy();
    expect(inspector).toHaveTextContent('ready_for_review');
    expect(inspector).toHaveTextContent('draft manifest ready');
    expect(inspector).toHaveTextContent('artifact://draft');
    expect(inspector).toHaveTextContent('receipt://review');
    expect(inspector).toHaveTextContent('receipt://action');
    expect(inspector).toHaveTextContent('workflow://submission');
    expect(inspector).toHaveTextContent('lineage://draft');
    expect(inspector).toHaveTextContent('bundle://provenance');
    expect(inspector).toHaveTextContent('index://provenance');
    expect(inspector).toHaveTextContent('ro-crate://metadata');
    expect(inspector).toHaveTextContent('replay://status');
    expect(inspector).toHaveTextContent('trace://agent');
    expect(inspector).toHaveTextContent('review://ref');
    expect(inspector).toHaveTextContent('needs ref-level clarification');
    expect(inspector).toHaveTextContent('sha256:abc123');
    expect(inspector).toHaveTextContent('drawer://provenance');
    expect(inspector).toHaveTextContent('Ask for changes with this context:');
    expect(inspector).toHaveTextContent('opl://resource-source/workspace');
    expect(inspector).toHaveTextContent('opl://resource-source/fabric');
    expect(inspector).toHaveTextContent('opl://environment/default');
    expect(inspector).toHaveTextContent('opl://storage/default');
    expect(inspector).toHaveTextContent('receipt://resource');
    expect(inspector).toHaveTextContent('opl://cost/estimate');
    expect(screen.queryByText('artifact body')).toBeNull();
  });

  it('renders v2 current task slice cards without a separate store', () => {
    render(
      <CurrentTaskAwareness
        task={
          {
            title: 'TaskRun slice',
            conditions: [{ type: 'HumanGate', status: 'False', reason: 'NeedsOwner', message: 'owner approval' }],
            evidence_cards: [
              {
                card_id: 'artifact',
                title: 'Artifact card',
                summary: 'artifact summary',
                ref: 'artifact://summary',
                why_it_matters: 'artifact refs without body access',
                open_action: { route: 'opl app action execute --action task_export_bundle_preview --dry-run' },
              },
            ],
            action_cards: [
              {
                card_id: 'dry-run',
                title: 'Preview action',
                ref: 'action://dry-run',
                risk: { mutation_policy: 'no_writes_preview_only' },
                expected_output: { ref: 'receipt://expected' },
              },
            ],
            resource_cards: [
              {
                card_id: 'fabric',
                resource_kind: 'fabric',
                title: 'Fabric resource',
                status_ref: 'resource://status',
                quota_ref: 'resource://quota',
              },
            ],
            diagnostics_ref: 'diagnostics://task',
          } as never
        }
      />
    );

    expect(screen.getByTestId('conversation-current-task-inspector')).toBeTruthy();
    expect(screen.getByText('TaskRun slice')).toBeTruthy();
    expect(screen.getByText('owner approval')).toBeTruthy();
    expect(screen.getAllByText('Artifact card').length).toBeGreaterThan(0);
    expect(screen.getByTestId('conversation-current-task-inspector')).toHaveTextContent('artifact://summary');
    expect(screen.getAllByText('Preview action').length).toBeGreaterThan(0);
    expect(screen.getByTestId('conversation-current-task-inspector')).toHaveTextContent('action://dry-run');
    expect(screen.getAllByText('Fabric resource').length).toBeGreaterThan(0);
    expect(screen.getByText('resource://status')).toBeTruthy();
    expect(screen.getByText('diagnostics://task')).toBeTruthy();
  });

  it('does not render without current task refs', () => {
    const { container } = render(<CurrentTaskAwareness task={null} />);

    expect(container.firstChild).toBeNull();
  });
});
