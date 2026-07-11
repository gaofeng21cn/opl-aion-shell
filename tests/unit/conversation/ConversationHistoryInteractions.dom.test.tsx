import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import type { IMessageSearchItem } from '@/common/types/team/database';
import { configService } from '@/common/config/configService';
import ProjectContextSection from '@/renderer/components/layout/Sider/ProjectContextSection';
import ConversationSearchPopover from '@/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import { useWorkspaceExpansionState } from '@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState';
import {
  appendProjectContextRefs,
  createProjectContextRef,
  getProjectContextRefs,
} from '@/renderer/utils/workspace/projectContext';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: vi.fn(),
  showOpen: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      searchConversationMessages: { invoke: mocks.search },
    },
    dialog: {
      showOpen: { invoke: mocks.showOpen },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ visible, children }: React.PropsWithChildren<{ visible: boolean }>) =>
    visible ? <div role='dialog'>{children}</div> : null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

const searchItem = (id: string, archived: boolean): IMessageSearchItem =>
  ({
    message_id: `message-${id}`,
    preview_text: `${id} preview`,
    message_created_at: 1,
    conversation: {
      id,
      name: `${id} conversation`,
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: { archived },
    },
  }) as IMessageSearchItem;

describe('conversation history interactions', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.navigate.mockClear();
    mocks.search.mockReset();
    mocks.showOpen.mockReset();
    configService.reset();
    configService.setLocal('workspace.projectContextInputs', {});
    vi.spyOn(Message, 'error').mockImplementation(() => undefined as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  it('continues active search past an archived-only backend page', async () => {
    mocks.search
      .mockResolvedValueOnce({ items: [searchItem('archived', true)], has_more: true })
      .mockResolvedValueOnce({ items: [searchItem('active', false)], has_more: false });

    render(
      <ConversationSearchPopover renderTrigger={({ onClick }) => <button onClick={onClick}>Open search</button>} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    fireEvent.change(screen.getByPlaceholderText('conversation.historySearch.placeholder'), {
      target: { value: 'result' },
    });

    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('active conversation')).toBeInTheDocument();
    expect(screen.queryByText('conversation.historySearch.empty')).not.toBeInTheDocument();
  });

  it('continues active search past a sparse backend page', async () => {
    mocks.search
      .mockResolvedValueOnce({
        items: [searchItem('active-first', false), searchItem('archived', true)],
        has_more: true,
      })
      .mockResolvedValueOnce({ items: [searchItem('active-second', false)], has_more: false });

    render(
      <ConversationSearchPopover renderTrigger={({ onClick }) => <button onClick={onClick}>Open search</button>} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    fireEvent.change(screen.getByPlaceholderText('conversation.historySearch.placeholder'), {
      target: { value: 'result' },
    });

    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(screen.getByText('active-first conversation')).toBeInTheDocument();
    expect(screen.getByText('active-second conversation')).toBeInTheDocument();
  });

  it('keeps newer keyword results when an older request resolves last', async () => {
    let resolveFirstSearch!: (value: { items: IMessageSearchItem[]; has_more: boolean }) => void;
    const firstSearch = new Promise<{ items: IMessageSearchItem[]; has_more: boolean }>((resolve) => {
      resolveFirstSearch = resolve;
    });
    mocks.search
      .mockReturnValueOnce(firstSearch)
      .mockResolvedValueOnce({ items: [searchItem('newer', false)], has_more: false });

    render(
      <ConversationSearchPopover renderTrigger={({ onClick }) => <button onClick={onClick}>Open search</button>} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    const input = screen.getByPlaceholderText('conversation.historySearch.placeholder');
    fireEvent.change(input, { target: { value: 'older' } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'newer' } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('newer conversation')).toBeInTheDocument();

    await act(async () => {
      resolveFirstSearch({ items: [searchItem('older', false)], has_more: false });
      await firstSearch;
    });

    expect(screen.getByText('newer conversation')).toBeInTheDocument();
    expect(screen.queryByText('older conversation')).not.toBeInTheDocument();
  });

  it('keeps active and archived workspace expansion in separate storage scopes', () => {
    localStorage.setItem('aionui_workspace_expansion', JSON.stringify(['/active']));
    localStorage.setItem('aionui_workspace_expansion_archived', JSON.stringify(['/archived']));

    const useScopedExpansion = useWorkspaceExpansionState as (archived?: boolean) => string[];
    const { result } = renderHook(() => useScopedExpansion(true));

    expect(result.current).toEqual(['/archived']);
  });

  it('persists rail project context add and remove in stable insertion order', async () => {
    mocks.showOpen.mockResolvedValueOnce(['/workspace/docs/evidence.md']);
    render(<ProjectContextSection workspace='/workspace' />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.projectContext.add' }));
    fireEvent.click(await screen.findByText('conversation.history.projectContext.addFile'));

    await waitFor(() => {
      expect(getProjectContextRefs(configService.get('workspace.projectContextInputs'), '/workspace')).toEqual([
        {
          path: '/workspace/docs/evidence.md',
          name: 'evidence.md',
          isFile: true,
          relativePath: 'docs/evidence.md',
        },
      ]);
    });
    expect(screen.getByText('docs/evidence.md')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.projectContext.remove' }));
    await waitFor(() => {
      expect(getProjectContextRefs(configService.get('workspace.projectContextInputs'), '/workspace')).toEqual([]);
    });
  });

  it('rejects rail context paths outside the canonical project workspace', async () => {
    mocks.showOpen.mockResolvedValueOnce(['/outside/secret.txt']);
    render(<ProjectContextSection workspace='/workspace' />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.projectContext.add' }));
    fireEvent.click(await screen.findByText('conversation.history.projectContext.addFile'));

    await waitFor(() =>
      expect(Message.error).toHaveBeenCalledWith('conversation.history.projectContext.outsideWorkspace')
    );
    expect(configService.get('workspace.projectContextInputs')).toEqual({});
  });

  it('deduplicates project refs without changing their insertion order', () => {
    const first = createProjectContextRef('/workspace', '/workspace/z.txt', true)!;
    const second = createProjectContextRef('/workspace', '/workspace/a', false)!;

    expect(appendProjectContextRefs('/workspace', [first], [second, first])).toEqual([first, second]);
    expect(createProjectContextRef('/workspace', '/workspace-other/out.txt', true)).toBeNull();
    expect(createProjectContextRef('/', '/tmp/context', false)).toMatchObject({ path: '/tmp/context', isFile: false });
  });
});
