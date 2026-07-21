import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCodexDefaultModelInfo } from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import OplCodexSessionMenu from '@/renderer/components/agent/OplCodexSessionMenu';

const mocks = vi.hoisted(() => ({
  getModel: vi.fn(),
  setModel: vi.fn(),
  getConfigOptions: vi.fn(),
  setConfigOption: vi.fn(),
  configOptions: [] as unknown[],
  conversationUpdate: vi.fn(),
  writeRendererLog: vi.fn(),
  responseStreamOn: vi.fn(),
  agentsData: [] as unknown[],
  acpModelInfo: null as AcpModelInfo | null,
  mutateModelInfo: vi.fn(),
  clientConfigGet: vi.fn(),
  clientConfigSet: vi.fn(),
  clientConfigStore: {} as Record<string, unknown>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModel: { invoke: mocks.getModel },
      setModel: { invoke: mocks.setModel },
      getConfigOptions: { invoke: mocks.getConfigOptions },
      setConfigOption: { invoke: mocks.setConfigOption },
      responseStream: { on: mocks.responseStreamOn },
    },
    conversation: {
      update: { invoke: mocks.conversationUpdate },
    },
    application: {
      writeRendererLog: { invoke: mocks.writeRendererLog },
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

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.clientConfigGet,
    set: mocks.clientConfigSet,
  },
}));

vi.mock('swr', () => ({
  default: (key: unknown) => {
    if (Array.isArray(key) && key[0] === 'acp-model-info') {
      return {
        data: mocks.acpModelInfo,
        isLoading: false,
        mutate: mocks.mutateModelInfo,
      };
    }
    if (Array.isArray(key) && key[0] === 'acp-config-options') {
      return {
        data: mocks.configOptions,
        isLoading: false,
        mutate: vi.fn(),
      };
    }
    return {
      data: mocks.agentsData,
      isLoading: false,
      mutate: vi.fn(),
    };
  },
  mutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'conversation.welcome.autoModel') return `Auto (${String(options?.model)})`;
      if (key === 'common.defaultModel') return 'Default Model';
      if (key === 'conversation.welcome.useCliModel') return 'Select Model';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch not supported';
      if (key === 'agent.thoughtLevel.label') return 'Reasoning';
      if (key === 'agent.thoughtLevel.switchSuccess') return 'Reasoning switched';
      if (key === 'agent.config.failed') return 'Config failed';
      if (key === 'common.model') return '模型';
      if (key === 'agent.sessionConfiguration.menuLabel') return '会话配置';
      if (key === 'agent.sessionConfiguration.model') return '模型';
      if (key === 'agent.sessionConfiguration.reasoning') return '推理';
      if (key === 'agent.sessionConfiguration.resetDefaults') return '恢复默认';
      return String(options?.defaultValue ?? key);
    },
  }),
}));

describe('AcpModelSelector Codex model switching', () => {
  beforeEach(() => {
    mocks.getModel.mockReset();
    mocks.setModel.mockReset();
    mocks.getConfigOptions.mockReset();
    mocks.setConfigOption.mockReset();
    mocks.configOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        option_type: 'select',
        current_value: 'max',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Extra high' },
          { value: 'max', label: 'Max' },
          { value: 'ultra', label: 'Ultra' },
        ],
      },
    ];
    mocks.conversationUpdate.mockReset();
    mocks.writeRendererLog.mockReset();
    mocks.responseStreamOn.mockReset();
    mocks.mutateModelInfo.mockReset();
    mocks.clientConfigGet.mockReset();
    mocks.clientConfigSet.mockReset();
    mocks.clientConfigStore = {};
    mocks.clientConfigGet.mockImplementation((key: string) => mocks.clientConfigStore[key]);
    mocks.clientConfigSet.mockImplementation((key: string, value: unknown) => {
      mocks.clientConfigStore[key] = value;
      return Promise.resolve();
    });
    mocks.getModel.mockRejectedValue(new Error('session not ready'));
    mocks.setModel.mockResolvedValue(undefined);
    mocks.getConfigOptions.mockResolvedValue({
      config_options: [
        {
          id: 'reasoning_effort',
          category: 'thought_level',
          option_type: 'select',
          current_value: 'max',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Extra high' },
            { value: 'max', label: 'Max' },
            { value: 'ultra', label: 'Ultra' },
          ],
        },
      ],
    });
    mocks.setConfigOption.mockImplementation(({ value }: { value: string }) =>
      Promise.resolve({
        confirmation: 'observed',
        config_options: [
          {
            id: 'reasoning_effort',
            category: 'thought_level',
            option_type: 'select',
            current_value: value,
            options: [
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'xhigh', label: 'Extra high' },
              { value: 'max', label: 'Max' },
              { value: 'ultra', label: 'Ultra' },
            ],
          },
        ],
      })
    );
    mocks.conversationUpdate.mockResolvedValue(true);
    mocks.writeRendererLog.mockResolvedValue(undefined);
    mocks.responseStreamOn.mockReturnValue(() => undefined);
    mocks.acpModelInfo = {
      current_model_id: 'gpt-5.6-sol',
      current_model_label: 'GPT-5.6-Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
      ],
    };
    mocks.mutateModelInfo.mockImplementation((updater: unknown) => {
      if (typeof updater === 'function') {
        mocks.acpModelInfo = (updater as (previous: unknown) => unknown)(mocks.acpModelInfo);
      } else {
        mocks.acpModelInfo = updater;
      }
      return Promise.resolve(mocks.acpModelInfo);
    });
    mocks.agentsData = [
      {
        agent_type: 'acp',
        backend: 'codex',
        handshake: {
          available_models: {
            current_model_id: 'gpt-5.2-codex',
            current_model_label: 'gpt-5.2-codex',
            available_models: [
              { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
              { id: 'gpt-5.5', label: 'GPT-5.5' },
              { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1 mini' },
            ],
          },
        },
      },
    ];
  });

  it('uses auto latest Codex as the default visible selector on the fixed App path', async () => {
    const user = userEvent.setup();
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 最高/ });
    expect(autoButton).not.toHaveTextContent('自动（推荐）');
    expect(autoButton.querySelector('[data-icon="brain"], .i-icon-brain')).toBeNull();

    await user.click(autoButton);

    const menu = await screen.findByTestId('opl-codex-session-menu');
    expect(
      Array.from(menu.querySelectorAll('[data-opl-session-root-item], [role="separator"]')).map(
        (element) => element.getAttribute('data-testid') ?? element.getAttribute('role')
      )
    ).toEqual([
      'opl-codex-session-menu-model',
      'opl-codex-session-menu-reasoning',
      'separator',
      'opl-codex-session-menu-reset',
    ]);
    expect(within(menu).queryByText(/speed/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-codex-session-menu-model-choice-__auto')).not.toBeInTheDocument();

    const modelItem = screen.getByTestId('opl-codex-session-menu-model');
    fireEvent.mouseEnter(modelItem);
    expect(screen.queryByTestId('opl-codex-session-menu-model-choice-__auto')).not.toBeInTheDocument();
    fireEvent.click(modelItem);
    const autoChoice = await screen.findByTestId('opl-codex-session-menu-model-choice-__auto');
    expect(autoChoice).toHaveTextContent('当前 5.6 Sol · 推理最高 · 跟随最新最强');
    expect(autoChoice).toHaveAttribute('role', 'menuitemradio');
    expect(autoChoice).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opl-codex-session-menu-model-choice-gpt-5.5')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('智力增强')).not.toBeInTheDocument();

    fireEvent.keyDown(autoChoice, { key: 'Escape' });
    await waitFor(() => expect(modelItem).toHaveFocus());
    const reasoningItem = screen.getByTestId('opl-codex-session-menu-reasoning');
    fireEvent.click(reasoningItem);
    expect(screen.queryByTestId('opl-codex-session-menu-reasoning-choice-minimal')).not.toBeInTheDocument();
    const lowChoice = await screen.findByTestId('opl-codex-session-menu-reasoning-choice-low');
    expect(lowChoice).toHaveAttribute('role', 'menuitemradio');
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-high')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-xhigh')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-max')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-ultra')).toBeInTheDocument();

    fireEvent.keyDown(lowChoice, { key: 'Escape' });
    await waitFor(() => expect(reasoningItem).toHaveFocus());
    fireEvent.keyDown(reasoningItem, { key: 'Escape' });
    await waitFor(() => expect(autoButton).toHaveFocus());
    expect(autoButton).toHaveAttribute('aria-expanded', 'false');

    expect(mocks.setModel).not.toHaveBeenCalled();
  });

  it('renders App default Codex model options from the product profile', async () => {
    mocks.acpModelInfo = buildCodexDefaultModelInfo();

    render(<AcpModelSelector conversation_id='new-codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 最高/ });

    await userEvent.click(autoButton);
    fireEvent.click(await screen.findByTestId('opl-codex-session-menu-model'));

    expect(await screen.findByTestId('opl-codex-session-menu-model-choice-__auto')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-model-choice-gpt-5.6-sol')).toBeInTheDocument();
    expect(screen.queryByText('GPT-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('Model switch not supported')).not.toBeInTheDocument();
  });

  it('keeps the built-in Sol Auto baseline when the runtime catalog omits it', async () => {
    mocks.acpModelInfo = {
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5',
      available_models: [
        { id: 'gpt-5.5', label: 'GPT-5.5' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
      ],
    };
    mocks.configOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        option_type: 'select',
        current_value: 'high',
        options: [
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Extra high' },
          { value: 'max', label: 'Max' },
          { value: 'ultra', label: 'Ultra' },
        ],
      },
    ];
    mocks.setModel.mockResolvedValue({
      model_info: {
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: mocks.acpModelInfo.available_models,
      },
    });

    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const trigger = await screen.findByRole('button', { name: /5\.5 高/ });
    await userEvent.click(trigger);
    fireEvent.click(await screen.findByTestId('opl-codex-session-menu-model'));
    const autoOption = await screen.findByTestId('opl-codex-session-menu-model-choice-__auto');
    expect(autoOption).toHaveTextContent('当前 5.6 Sol · 推理最高 · 跟随最新最强');
    fireEvent.click(autoOption);

    await waitFor(() => {
      expect(mocks.setModel).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        model_id: 'gpt-5.6-sol',
      });
      expect(mocks.setConfigOption).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        option_id: 'reasoning_effort',
        value: 'max',
      });
      expect(mocks.clientConfigSet).toHaveBeenCalledWith('acp.config', { codex: {} });
      expect(trigger).toHaveFocus();
    });
  });

  it('lets users override Codex reasoning effort from ACP options in the selector menu', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 最高/ });
    expect(screen.queryByTestId('opl-reasoning-effort-selector')).not.toBeInTheDocument();

    await userEvent.click(autoButton);
    fireEvent.click(await screen.findByTestId('opl-codex-session-menu-reasoning'));

    expect(await screen.findByTestId('opl-codex-session-menu-reasoning-choice-low')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-medium')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-codex-session-menu-reasoning-choice-high'));

    await waitFor(() => {
      expect(mocks.setConfigOption).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        option_id: 'reasoning_effort',
        value: 'high',
      });
      expect(autoButton).toHaveFocus();
    });
  });

  it('restores Codex auto reasoning to the product-profile default from Reset', async () => {
    mocks.configOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        option_type: 'select',
        current_value: 'high',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Extra high' },
          { value: 'max', label: 'Max' },
          { value: 'ultra', label: 'Ultra' },
        ],
      },
    ];

    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 高/ });
    await userEvent.click(autoButton);
    const resetItem = await screen.findByTestId('opl-codex-session-menu-reset');
    expect(resetItem.querySelector('[data-icon="refresh"], .i-icon-refresh')).not.toBeNull();
    fireEvent.click(resetItem);

    await waitFor(() => {
      expect(mocks.setConfigOption).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        option_id: 'reasoning_effort',
        value: 'max',
      });
      expect(autoButton).toHaveFocus();
    });
  });
});

describe('OplCodexSessionMenu keyboard and accessibility contract', () => {
  const renderSessionMenu = (overrides: Partial<React.ComponentProps<typeof OplCodexSessionMenu>> = {}) => {
    const selectAuto = vi.fn();
    const selectModel = vi.fn();
    const selectDisabledModel = vi.fn();
    const selectReasoningHigh = vi.fn();
    const selectReasoningMax = vi.fn();
    const onReset = vi.fn();
    const onRequestClose = vi.fn();
    render(
      <OplCodexSessionMenu
        modelValue='5.6 Sol'
        modelChoices={[
          { id: '__auto', label: '自动（推荐）', selected: true, onSelect: selectAuto },
          { id: 'gpt-5.5', label: '5.5', onSelect: selectModel },
          { id: 'legacy', label: 'Legacy', disabled: true, onSelect: selectDisabledModel },
        ]}
        reasoningValue='最高'
        reasoningChoices={[
          { id: 'high', label: '高', onSelect: selectReasoningHigh },
          { id: 'max', label: '最高', selected: true, onSelect: selectReasoningMax },
        ]}
        onReset={onReset}
        onRequestClose={onRequestClose}
        {...overrides}
      />
    );
    return {
      selectAuto,
      selectModel,
      selectDisabledModel,
      selectReasoningHigh,
      selectReasoningMax,
      onReset,
      onRequestClose,
    };
  };

  it('keeps a strict Model, Reasoning, divider, Reset root and opens submenus only on click', async () => {
    const user = userEvent.setup();
    const { selectModel, selectReasoningMax, onRequestClose } = renderSessionMenu();
    const menu = screen.getByTestId('opl-codex-session-menu');
    const modelItem = screen.getByTestId('opl-codex-session-menu-model');
    const reasoningItem = screen.getByTestId('opl-codex-session-menu-reasoning');
    expect(modelItem).not.toHaveFocus();

    expect(
      Array.from(menu.querySelectorAll('[data-opl-session-root-item], [role="separator"]')).map(
        (element) => element.getAttribute('data-testid') ?? element.getAttribute('role')
      )
    ).toEqual([
      'opl-codex-session-menu-model',
      'opl-codex-session-menu-reasoning',
      'separator',
      'opl-codex-session-menu-reset',
    ]);
    expect(within(menu).queryByText(/speed/i)).not.toBeInTheDocument();
    expect(within(menu).queryByText('自动（推荐）')).not.toBeInTheDocument();

    fireEvent.mouseEnter(modelItem);
    expect(screen.queryByTestId('opl-codex-session-menu-model-choice-__auto')).not.toBeInTheDocument();
    await user.click(modelItem);

    const autoChoice = await screen.findByTestId('opl-codex-session-menu-model-choice-__auto');
    const fixedChoice = screen.getByTestId('opl-codex-session-menu-model-choice-gpt-5.5');
    expect(autoChoice).not.toHaveFocus();
    expect(autoChoice).toHaveAttribute('role', 'menuitemradio');
    expect(autoChoice).toHaveAttribute('aria-checked', 'true');
    expect(fixedChoice).toHaveAttribute('role', 'menuitemradio');
    expect(fixedChoice).toHaveAttribute('aria-checked', 'false');
    const modelChoicesMenu = autoChoice.closest<HTMLElement>('[data-testid="opl-codex-session-menu-model-choices"]');
    expect(modelChoicesMenu).not.toBeNull();
    expect(
      within(modelChoicesMenu!)
        .getAllByRole('menuitemradio')
        .map((choice) => choice.getAttribute('data-testid'))
    ).toEqual([
      'opl-codex-session-menu-model-choice-__auto',
      'opl-codex-session-menu-model-choice-gpt-5.5',
      'opl-codex-session-menu-model-choice-legacy',
    ]);

    fireEvent.keyDown(autoChoice, { key: 'ArrowLeft' });
    await waitFor(() => expect(modelItem).toHaveFocus());
    await user.click(reasoningItem);
    const maxChoice = await screen.findByTestId('opl-codex-session-menu-reasoning-choice-max');
    expect(maxChoice).toHaveAttribute('role', 'menuitemradio');
    expect(maxChoice).toHaveAttribute('aria-checked', 'true');
    expect(maxChoice.closest('[data-testid="opl-codex-session-menu-reasoning-choices"]')).not.toBeNull();
    fireEvent.click(maxChoice);
    expect(selectReasoningMax).toHaveBeenCalledTimes(1);
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    await user.click(modelItem);
    fireEvent.click(await screen.findByTestId('opl-codex-session-menu-model-choice-gpt-5.5'));
    expect(selectModel).toHaveBeenCalledTimes(1);
    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it('supports root and submenu ArrowUp/Down, Home/End, Right/Left, and Escape navigation', async () => {
    const { onRequestClose } = renderSessionMenu();
    const modelItem = screen.getByTestId('opl-codex-session-menu-model');
    const reasoningItem = screen.getByTestId('opl-codex-session-menu-reasoning');
    const resetItem = screen.getByTestId('opl-codex-session-menu-reset');

    expect(modelItem).not.toHaveFocus();
    modelItem.focus();
    fireEvent.keyDown(modelItem, { key: 'ArrowDown' });
    expect(reasoningItem).toHaveFocus();
    fireEvent.keyDown(reasoningItem, { key: 'ArrowDown' });
    expect(resetItem).toHaveFocus();
    fireEvent.keyDown(resetItem, { key: 'ArrowUp' });
    expect(reasoningItem).toHaveFocus();
    fireEvent.keyDown(reasoningItem, { key: 'Home' });
    expect(modelItem).toHaveFocus();
    fireEvent.keyDown(modelItem, { key: 'End' });
    expect(resetItem).toHaveFocus();
    fireEvent.keyDown(resetItem, { key: 'Home' });
    expect(modelItem).toHaveFocus();

    fireEvent.keyDown(modelItem, { key: 'ArrowRight' });
    const autoChoice = await screen.findByTestId('opl-codex-session-menu-model-choice-__auto');
    const fixedChoice = screen.getByTestId('opl-codex-session-menu-model-choice-gpt-5.5');
    await waitFor(() => expect(autoChoice).toHaveFocus());
    fireEvent.keyDown(autoChoice, { key: 'ArrowDown' });
    expect(fixedChoice).toHaveFocus();
    fireEvent.keyDown(fixedChoice, { key: 'ArrowDown' });
    expect(autoChoice).toHaveFocus();
    fireEvent.keyDown(autoChoice, { key: 'ArrowUp' });
    expect(fixedChoice).toHaveFocus();
    fireEvent.keyDown(fixedChoice, { key: 'Home' });
    expect(autoChoice).toHaveFocus();
    fireEvent.keyDown(autoChoice, { key: 'End' });
    expect(fixedChoice).toHaveFocus();
    fireEvent.keyDown(fixedChoice, { key: 'ArrowLeft' });
    await waitFor(() => expect(modelItem).toHaveFocus());

    fireEvent.keyDown(modelItem, { key: 'ArrowDown' });
    fireEvent.keyDown(reasoningItem, { key: 'ArrowRight' });
    const highChoice = await screen.findByTestId('opl-codex-session-menu-reasoning-choice-high');
    const maxChoice = screen.getByTestId('opl-codex-session-menu-reasoning-choice-max');
    await waitFor(() => expect(highChoice).toHaveFocus());
    fireEvent.keyDown(highChoice, { key: 'ArrowDown' });
    expect(maxChoice).toHaveFocus();
    fireEvent.keyDown(maxChoice, { key: 'Escape' });
    await waitFor(() => expect(reasoningItem).toHaveFocus());
    fireEvent.keyDown(reasoningItem, { key: 'Escape' });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('exposes disabled root and radio items and excludes them from keyboard movement', async () => {
    const selectDisabledModel = vi.fn();
    renderSessionMenu({
      autoFocusOnMount: true,
      reasoningDisabled: true,
      resetDisabled: true,
      modelChoices: [
        { id: '__auto', label: '自动（推荐）', selected: true, onSelect: vi.fn() },
        { id: 'legacy', label: 'Legacy', disabled: true, onSelect: selectDisabledModel },
      ],
    });
    const modelItem = screen.getByTestId('opl-codex-session-menu-model');
    const reasoningItem = screen.getByTestId('opl-codex-session-menu-reasoning');
    const resetItem = screen.getByTestId('opl-codex-session-menu-reset');

    expect(reasoningItem).toBeDisabled();
    expect(reasoningItem).toHaveAttribute('aria-disabled', 'true');
    expect(resetItem).toBeDisabled();
    expect(resetItem).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(modelItem).toHaveFocus());
    fireEvent.keyDown(modelItem, { key: 'ArrowDown' });
    expect(modelItem).toHaveFocus();
    fireEvent.keyDown(modelItem, { key: 'ArrowRight' });
    const autoChoice = await screen.findByTestId('opl-codex-session-menu-model-choice-__auto');
    const disabledChoice = screen.getByTestId('opl-codex-session-menu-model-choice-legacy');
    expect(disabledChoice).toBeDisabled();
    expect(disabledChoice).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(disabledChoice);
    expect(selectDisabledModel).not.toHaveBeenCalled();
    await waitFor(() => expect(autoChoice).toHaveFocus());
    fireEvent.keyDown(autoChoice, { key: 'ArrowDown' });
    expect(autoChoice).toHaveFocus();
  });

  it('focuses the first root item only when keyboard opening requests it', async () => {
    const { unmount } = render(
      <OplCodexSessionMenu
        modelValue='5.6 Sol'
        modelChoices={[{ id: '__auto', label: '自动（推荐）', selected: true, onSelect: vi.fn() }]}
        reasoningValue='最高'
        reasoningChoices={[{ id: 'max', label: '最高', selected: true, onSelect: vi.fn() }]}
        onReset={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('opl-codex-session-menu-model')).not.toHaveFocus();
    unmount();

    render(
      <OplCodexSessionMenu
        autoFocusOnMount
        modelValue='5.6 Sol'
        modelChoices={[{ id: '__auto', label: '自动（推荐）', selected: true, onSelect: vi.fn() }]}
        reasoningValue='最高'
        reasoningChoices={[{ id: 'max', label: '最高', selected: true, onSelect: vi.fn() }]}
        onReset={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('opl-codex-session-menu-model')).toHaveFocus());
  });
});
