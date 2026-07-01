import { render, screen } from '@testing-library/react';
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
        'conversation.currentTask.review': 'Review',
        'conversation.currentTask.action': 'Action',
        'conversation.currentTask.workflow': 'Workflow',
        'conversation.currentTask.gatewayStatus': 'Gateway status',
        'conversation.currentTask.resourceSource': 'Resource source',
        'conversation.currentTask.environment': 'Environment',
        'conversation.currentTask.storage': 'Storage',
        'conversation.currentTask.resourceReceipt': 'Resource receipt',
        'conversation.currentTask.costEstimate': 'Cost estimate',
      };
      if (key === 'conversation.currentTask.owner') return `Owner: ${options?.owner ?? ''}`;
      return map[key] ?? key;
    },
  }),
}));

describe('CurrentTaskAwareness', () => {
  it('renders inline current-task status from refs-only runtime summary', () => {
    render(
      <CurrentTaskAwareness
        compact
        task={{
          title: 'Manuscript review',
          stage: 'review',
          progress: '2/4',
          next_owner: 'reviewer',
          next_step: 'Approve edits',
          artifact_or_blocker_ref: 'artifact://draft',
        }}
      />
    );

    expect(screen.getByTestId('conversation-current-task-inline')).toBeTruthy();
    expect(screen.getByText('Current task')).toBeTruthy();
    expect(screen.getByText('Manuscript review')).toBeTruthy();
    expect(screen.getByText('review')).toBeTruthy();
    expect(screen.getByText('2/4')).toBeTruthy();
    expect(screen.getByText('Owner: reviewer')).toBeTruthy();
  });

  it('renders inspector evidence refs without artifact body', () => {
    render(
      <CurrentTaskAwareness
        task={{
          title: 'Submission package',
          artifact_or_blocker_summary: 'draft manifest ready',
          review_receipt_ref: 'receipt://review',
          action_receipt_ref: 'receipt://action',
          workflow_ref: 'workflow://submission',
          gateway_status_ref: 'opl://gateway/status',
          resource_source_refs: ['opl://resource-source/workspace', 'opl://resource-source/fabric'],
          environment_ref: 'opl://environment/default',
          storage_ref: 'opl://storage/default',
          resource_receipt_ref: 'receipt://resource',
          cost_estimate_ref: 'opl://cost/estimate',
        }}
      />
    );

    expect(screen.getByTestId('conversation-current-task-inspector')).toBeTruthy();
    expect(screen.getByText('Artifact')).toBeTruthy();
    expect(screen.getByText('draft manifest ready')).toBeTruthy();
    expect(screen.getByText('receipt://review')).toBeTruthy();
    expect(screen.getByText('receipt://action')).toBeTruthy();
    expect(screen.getByText('workflow://submission')).toBeTruthy();
    expect(screen.getByText('Gateway status')).toBeTruthy();
    expect(screen.getByText('opl://gateway/status')).toBeTruthy();
    expect(screen.getAllByText('Resource source')).toHaveLength(2);
    expect(screen.getByText('opl://resource-source/workspace')).toBeTruthy();
    expect(screen.getByText('opl://resource-source/fabric')).toBeTruthy();
    expect(screen.getByText('opl://environment/default')).toBeTruthy();
    expect(screen.getByText('opl://storage/default')).toBeTruthy();
    expect(screen.getByText('receipt://resource')).toBeTruthy();
    expect(screen.getByText('opl://cost/estimate')).toBeTruthy();
    expect(screen.queryByText('artifact body')).toBeNull();
  });

  it('does not render without current task refs', () => {
    const { container } = render(<CurrentTaskAwareness task={null} />);

    expect(container.firstChild).toBeNull();
  });
});
