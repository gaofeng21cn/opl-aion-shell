/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpConfigOptionDto, AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';

const {
  getModelInvokeMock,
  setModelInvokeMock,
  getConfigOptionsInvokeMock,
  setConfigOptionInvokeMock,
  conversationUpdateInvokeMock,
  writeRendererLogInvokeMock,
  configServiceGetMock,
  configServiceSetMock,
  fetchDetectedAgentsMock,
  responseStreamHandlerRef,
} = vi.hoisted(() => ({
  getModelInvokeMock: vi.fn(),
  setModelInvokeMock: vi.fn(),
  getConfigOptionsInvokeMock: vi.fn(),
  setConfigOptionInvokeMock: vi.fn(),
  conversationUpdateInvokeMock: vi.fn(),
  writeRendererLogInvokeMock: vi.fn(),
  configServiceGetMock: vi.fn(),
  configServiceSetMock: vi.fn(),
  fetchDetectedAgentsMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModel: { invoke: getModelInvokeMock },
      setModel: { invoke: setModelInvokeMock },
      getConfigOptions: { invoke: getConfigOptionsInvokeMock },
      setConfigOption: { invoke: setConfigOptionInvokeMock },
      responseStream: {
        on: vi.fn().mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
    },
    conversation: {
      update: { invoke: conversationUpdateInvokeMock },
    },
    application: {
      writeRendererLog: { invoke: writeRendererLogInvokeMock },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configServiceGetMock,
    set: configServiceSetMock,
  },
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  DETECTED_AGENTS_SWR_KEY: 'detected-agents',
  fetchDetectedAgents: fetchDetectedAgentsMock,
}));

const buildModelInfo = (overrides: Partial<AcpModelInfo> = {}): AcpModelInfo => ({
  current_model_id: 'sonnet-4',
  current_model_label: 'Claude Sonnet 4',
  available_models: [
    { id: 'sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'opus-4', label: 'Claude Opus 4' },
  ],
  ...overrides,
});

const buildConfigOptions = (currentModelId = 'sonnet-4'): AcpConfigOptionDto[] => [
  {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: currentModelId,
    options: [
      { value: 'sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'opus-4', label: 'Claude Opus 4' },
    ],
  },
];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const createSwrWrapper = () => {
  const cache = new Map();

  return function SwrTestWrapper({ children }: PropsWithChildren) {
    return createElement(
      SWRConfig,
      {
        value: {
          provider: () => cache,
          dedupingInterval: 0,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        },
      },
      children
    );
  };
};

const renderUseAcpModelInfo = (params: Parameters<typeof useAcpModelInfo>[0]) =>
  renderHook(() => useAcpModelInfo(params), { wrapper: createSwrWrapper() });

describe('useAcpModelInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseStreamHandlerRef.current = undefined;
    getModelInvokeMock.mockReset();
    setModelInvokeMock.mockReset();
    getConfigOptionsInvokeMock.mockReset();
    setConfigOptionInvokeMock.mockReset();
    conversationUpdateInvokeMock.mockReset();
    writeRendererLogInvokeMock.mockReset();
    configServiceGetMock.mockReset();
    configServiceSetMock.mockReset();
    setModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo() });
    getConfigOptionsInvokeMock.mockResolvedValue({ config_options: [] });
    setConfigOptionInvokeMock.mockResolvedValue({ confirmation: 'observed', config_options: [] });
    conversationUpdateInvokeMock.mockResolvedValue(true);
    writeRendererLogInvokeMock.mockResolvedValue(undefined);
    configServiceGetMock.mockReturnValue({});
    configServiceSetMock.mockResolvedValue(undefined);
    fetchDetectedAgentsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses backend current_model_id when reloading even if initialModelId is stale (ELECTRON-1RV)', async () => {
    // Backend is the source of truth: user previously switched to opus-4,
    // but `extra.current_model_id` (initialModelId) still says sonnet-4.
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('falls back to initialModelId only when backend has no current_model_id', async () => {
    // Genuine pre-handshake state: backend returns the available list but no
    // current model yet. initialModelId from Guid pre-selection is honored.
    getModelInvokeMock.mockResolvedValue({
      model_info: buildModelInfo({ current_model_id: '' as unknown as string }),
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'opus-4',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('waits for runtime preparation before loading model info', async () => {
    const prepareRuntimeDeferred = deferred<void>();
    const prepareRuntime = vi.fn().mockReturnValue(prepareRuntimeDeferred.promise);
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      prepareRuntime,
    });

    await waitFor(() => {
      expect(prepareRuntime).toHaveBeenCalled();
    });
    expect(getModelInvokeMock).not.toHaveBeenCalled();

    prepareRuntimeDeferred.resolve(undefined);

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(getModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
  });

  it('does not request model info when runtime preparation fails', async () => {
    const prepareRuntime = vi.fn().mockRejectedValue(new Error('warmup failed'));

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      prepareRuntime,
    });

    await waitFor(() => {
      expect(prepareRuntime).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(writeRendererLogInvokeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          tag: 'useAcpModelInfo',
          message: 'prepare_runtime_failed_before_model_reload',
        })
      );
    });
    expect(getModelInvokeMock).not.toHaveBeenCalled();
    expect(result.current.model_info).toBeNull();
  });

  it('does not prepare or request model info while disabled', async () => {
    const prepareRuntime = vi.fn().mockResolvedValue(undefined);
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      prepareRuntime,
      enabled: false,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(prepareRuntime).not.toHaveBeenCalled();
    expect(getModelInvokeMock).not.toHaveBeenCalled();
    expect(result.current.model_info).toBeNull();
    expect(result.current.canSwitch).toBe(false);

    act(() => {
      result.current.selectModel('opus-4');
    });
    expect(setModelInvokeMock).not.toHaveBeenCalled();
  });

  it('saves preferred model and does not persist conversation extra after backend confirms selectModel', async () => {
    const setModelDeferred = deferred<{ model_info: AcpModelInfo | null }>();
    const onSelectModelSuccess = vi.fn();
    const onSelectModelFailed = vi.fn();
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: buildModelInfo() })
      .mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });
    setModelInvokeMock.mockReturnValue(setModelDeferred.promise);

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
      onSelectModelSuccess,
      onSelectModelFailed,
    });

    await waitFor(() => {
      expect(result.current.canSwitch).toBe(true);
    });

    act(() => {
      result.current.selectModel('opus-4');
    });

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });
    expect(configServiceSetMock).not.toHaveBeenCalled();
    expect(conversationUpdateInvokeMock).not.toHaveBeenCalled();

    setModelDeferred.resolve({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(onSelectModelSuccess).toHaveBeenCalledWith('opus-4');
    expect(onSelectModelFailed).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(configServiceSetMock).toHaveBeenCalled();
    });
    const acpConfigCall = configServiceSetMock.mock.calls.find(([key]) => key === 'acp.config');
    expect(acpConfigCall).toBeDefined();
    expect(acpConfigCall?.[1]).toEqual({ claude: { preferredModelId: 'opus-4' } });

    expect(conversationUpdateInvokeMock).not.toHaveBeenCalled();
  });

  it('rolls back to backend model info and does not persist when selectModel fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSelectModelSuccess = vi.fn();
    const onSelectModelFailed = vi.fn();
    const setModelError = new Error('model unavailable');
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo() });
    setModelInvokeMock.mockRejectedValue(setModelError);

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
      onSelectModelSuccess,
      onSelectModelFailed,
    });

    await waitFor(() => {
      expect(result.current.canSwitch).toBe(true);
    });

    act(() => {
      result.current.selectModel('opus-4');
    });

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });
    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('sonnet-4');
    });

    expect(configServiceSetMock).not.toHaveBeenCalled();
    expect(conversationUpdateInvokeMock).not.toHaveBeenCalled();
    expect(onSelectModelFailed).toHaveBeenCalledWith('opus-4', setModelError);
    expect(onSelectModelSuccess).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('does not let initialModelId override backend current_model_id from acp_model_info stream', async () => {
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
    });

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeTypeOf('function');
    });

    responseStreamHandlerRef.current?.({
      type: 'acp_model_info',
      conversation_id: 'conv-1',
      data: buildModelInfo({ current_model_id: 'opus-4' }),
    } as unknown as IResponseMessage);

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('shares selected model info across hook instances for the same conversation', async () => {
    const setModelDeferred = deferred<{ model_info: AcpModelInfo | null }>();
    const wrapper = createSwrWrapper();
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: buildModelInfo() })
      .mockResolvedValueOnce({ model_info: buildModelInfo() })
      .mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });
    setModelInvokeMock.mockReturnValue(setModelDeferred.promise);

    const first = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );
    const second = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(first.result.current.canSwitch).toBe(true);
      expect(second.result.current.canSwitch).toBe(true);
    });

    act(() => {
      first.result.current.selectModel('opus-4');
    });

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });

    setModelDeferred.resolve({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    await waitFor(() => {
      expect(first.result.current.model_info?.current_model_id).toBe('opus-4');
      expect(second.result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('does not restore stale handshake model when active session lookup returns 404 after cache exists', async () => {
    fetchDetectedAgentsMock.mockResolvedValue([
      {
        agent_type: 'claude',
        backend: 'claude',
        handshake: {
          available_models: buildModelInfo({
            current_model_id: 'deepseek-v4-pro',
            current_model_label: 'DeepSeek V4 Pro',
            available_models: [{ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }],
          }),
        },
      },
    ]);
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) })
      .mockRejectedValueOnce({
        name: 'BackendHttpError',
        status: 404,
        code: 'NOT_FOUND',
        message: 'no active session',
      });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'deepseek-v4-pro',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });

    vi.useFakeTimers();
    await act(async () => {
      responseStreamHandlerRef.current?.({
        type: 'start',
        conversation_id: 'conv-1',
      } as unknown as IResponseMessage);
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(getModelInvokeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.model_info?.current_model_id).toBe('opus-4');
    vi.clearAllTimers();
  });

  it('deduplicates initial config option loads across hook instances for the same conversation', async () => {
    const configOptionsDeferred = deferred<{ config_options: AcpConfigOptionDto[] }>();
    getConfigOptionsInvokeMock.mockReturnValue(configOptionsDeferred.promise);
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo() });
    const wrapper = createSwrWrapper();

    const first = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );
    const second = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(getConfigOptionsInvokeMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      configOptionsDeferred.resolve({ config_options: buildConfigOptions() });
      await configOptionsDeferred.promise;
    });

    await waitFor(() => {
      expect(first.result.current.canSwitch).toBe(true);
      expect(second.result.current.canSwitch).toBe(true);
    });
  });

  it('falls back to App default Codex model options before the first ACP handshake', async () => {
    fetchDetectedAgentsMock.mockResolvedValue([
      {
        agent_type: 'acp',
        backend: 'codex',
        handshake: {},
      },
    ]);
    getModelInvokeMock.mockRejectedValue({
      name: 'BackendHttpError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'no active session',
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'new-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.canSwitch).toBe(true);
    });
    expect(result.current.model_info).toEqual({
      current_model_id: 'gpt-5.6-sol',
      current_model_label: '5.6 Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: '5.6 Sol' },
        { id: 'gpt-5.6-terra', label: '5.6 Terra' },
        { id: 'gpt-5.6-luna', label: '5.6 Luna' },
        { id: 'gpt-5.5', label: '5.5' },
        { id: 'gpt-5.4', label: '5.4' },
        { id: 'gpt-5.4-mini', label: '5.4 Mini' },
        { id: 'gpt-5.2', label: '5.2' },
      ],
    });
  });

  it('does not invent App fallback models when ACP explicitly reports an empty model list', async () => {
    fetchDetectedAgentsMock.mockResolvedValue([
      {
        agent_type: 'acp',
        backend: 'codex',
        handshake: {
          available_models: {
            current_model_id: null,
            current_model_label: null,
            available_models: [],
          },
        },
      },
    ]);
    getModelInvokeMock.mockRejectedValue({
      name: 'BackendHttpError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'no active session',
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'new-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(fetchDetectedAgentsMock).toHaveBeenCalled();
      expect(getModelInvokeMock).toHaveBeenCalled();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(result.current.model_info).toBeNull();
    expect(result.current.canSwitch).toBe(false);
  });

  it('keeps an explicitly empty active Codex model list instead of restoring fallback models', async () => {
    fetchDetectedAgentsMock.mockResolvedValue([
      {
        agent_type: 'acp',
        backend: 'codex',
        handshake: {},
      },
    ]);
    getModelInvokeMock.mockResolvedValue({
      model_info: {
        current_model_id: null,
        current_model_label: null,
        available_models: [],
      },
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(getModelInvokeMock).toHaveBeenCalled();
      expect(fetchDetectedAgentsMock).toHaveBeenCalled();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(result.current.model_info).toEqual({
      current_model_id: null,
      current_model_label: null,
      available_models: [],
    });
    expect(result.current.canSwitch).toBe(false);
  });

  it('filters and orders active Codex model info while preserving the current allowlisted model', async () => {
    getModelInvokeMock.mockResolvedValue({
      model_info: {
        current_model_id: 'gpt-5.4',
        current_model_label: 'GPT-5.4 from ACP',
        available_models: [
          { id: 'gpt-6', label: 'GPT-6' },
          { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
          { id: 'gpt-5.4', label: 'GPT-5.4' },
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          { id: 'gpt-5.5', label: 'GPT-5.5' },
        ],
      },
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.model_info).toEqual({
        current_model_id: 'gpt-5.4',
        current_model_label: '5.4',
        available_models: [
          { id: 'gpt-5.6-sol', label: '5.6 Sol' },
          { id: 'gpt-5.6-terra', label: '5.6 Terra' },
          { id: 'gpt-5.5', label: '5.5' },
          { id: 'gpt-5.4', label: '5.4' },
        ],
      });
    });
  });

  it('keeps an unsupported active Codex current model until Auto confirms an allowlisted switch', async () => {
    const legacyInfo: AcpModelInfo = {
      current_model_id: 'gpt-5.6-codex',
      current_model_label: 'GPT-5.6 Codex',
      available_models: [
        { id: 'gpt-5.6-codex', label: 'GPT-5.6 Codex' },
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
      ],
    };
    const confirmedInfo: AcpModelInfo = {
      current_model_id: 'gpt-5.6-sol',
      current_model_label: 'GPT-5.6-Sol',
      available_models: legacyInfo.available_models,
    };
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: legacyInfo })
      .mockResolvedValue({ model_info: confirmedInfo });
    setModelInvokeMock.mockResolvedValue({ model_info: confirmedInfo });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'legacy-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.model_info).toEqual({
        current_model_id: null,
        current_model_label: null,
        available_models: [
          { id: 'gpt-5.6-sol', label: '5.6 Sol' },
          { id: 'gpt-5.5', label: '5.5' },
        ],
      });
    });

    act(() => result.current.selectAutoModel());

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({
        conversation_id: 'legacy-codex-conversation',
        model_id: 'gpt-5.6-sol',
      });
    });
    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.6-sol');
      expect(configServiceSetMock).toHaveBeenCalledWith('acp.config', { codex: {} });
    });
  });

  it('filters and orders Codex acp_model_info stream receipts', async () => {
    getModelInvokeMock.mockResolvedValue({
      model_info: {
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: [
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          { id: 'gpt-5.5', label: 'GPT-5.5' },
        ],
      },
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeTypeOf('function');
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.6-sol');
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'acp_model_info',
        conversation_id: 'active-codex-conversation',
        data: {
          current_model_id: 'gpt-5.4',
          current_model_label: 'GPT-5.4 from ACP',
          available_models: [
            { id: 'gpt-6', label: 'GPT-6' },
            { id: 'gpt-5.4', label: 'GPT-5.4' },
            { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
            { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
            { id: 'gpt-5.5', label: 'GPT-5.5' },
          ],
        },
      } as unknown as IResponseMessage);
    });

    await waitFor(() => {
      expect(result.current.model_info).toEqual({
        current_model_id: 'gpt-5.4',
        current_model_label: '5.4',
        available_models: [
          { id: 'gpt-5.6-sol', label: '5.6 Sol' },
          { id: 'gpt-5.6-terra', label: '5.6 Terra' },
          { id: 'gpt-5.5', label: '5.5' },
          { id: 'gpt-5.4', label: '5.4' },
        ],
      });
    });
  });

  it('keeps the available Codex list when a legacy codex_model_info stream updates the current model', async () => {
    getModelInvokeMock.mockResolvedValue({
      model_info: {
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: [
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          { id: 'gpt-5.5', label: 'GPT-5.5' },
          { id: 'gpt-5.4', label: 'GPT-5.4' },
        ],
      },
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeTypeOf('function');
      expect(result.current.model_info?.available_models).toHaveLength(3);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'codex_model_info',
        conversation_id: 'active-codex-conversation',
        data: { model: 'gpt-5.5' },
      } as unknown as IResponseMessage);
    });

    await waitFor(() => {
      expect(result.current.model_info).toEqual({
        current_model_id: 'gpt-5.5',
        current_model_label: '5.5',
        available_models: [
          { id: 'gpt-5.6-sol', label: '5.6 Sol' },
          { id: 'gpt-5.5', label: '5.5' },
          { id: 'gpt-5.4', label: '5.4' },
        ],
      });
    });
  });

  it('filters and orders Codex setModel receipts', async () => {
    const initialInfo: AcpModelInfo = {
      current_model_id: 'gpt-5.6-sol',
      current_model_label: 'GPT-5.6-Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.4', label: 'GPT-5.4' },
      ],
    };
    const confirmedInfo: AcpModelInfo = {
      current_model_id: 'gpt-5.4',
      current_model_label: 'GPT-5.4 from setModel',
      available_models: [
        { id: 'gpt-6', label: 'GPT-6' },
        { id: 'gpt-5.4', label: 'GPT-5.4' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
      ],
    };
    getModelInvokeMock.mockResolvedValueOnce({ model_info: initialInfo }).mockResolvedValue({ model_info: null });
    setModelInvokeMock.mockResolvedValue({ model_info: confirmedInfo });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.6-sol');
    });

    act(() => result.current.selectModel('gpt-5.4'));

    await waitFor(() => {
      expect(result.current.model_info).toEqual({
        current_model_id: 'gpt-5.4',
        current_model_label: '5.4',
        available_models: [
          { id: 'gpt-5.6-sol', label: '5.6 Sol' },
          { id: 'gpt-5.6-terra', label: '5.6 Terra' },
          { id: 'gpt-5.5', label: '5.5' },
          { id: 'gpt-5.4', label: '5.4' },
        ],
      });
    });
  });

  it('clears the Codex model preference when Auto already resolves to the active model', async () => {
    configServiceGetMock.mockReturnValue({ codex: { preferredModelId: 'gpt-5.6-sol' } });
    getModelInvokeMock.mockResolvedValue({
      model_info: {
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: [
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          { id: 'gpt-5.5', label: 'GPT-5.5' },
        ],
      },
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.6-sol');
    });

    const selectAutoModel = (result.current as typeof result.current & { selectAutoModel?: () => void })
      .selectAutoModel;
    expect(selectAutoModel).toBeTypeOf('function');
    act(() => selectAutoModel?.());

    await waitFor(() => {
      expect(configServiceSetMock).toHaveBeenCalledWith('acp.config', { codex: {} });
    });
    expect(setModelInvokeMock).not.toHaveBeenCalled();
  });

  it('selects the first available App model for Auto and clears the fixed preference after confirmation', async () => {
    const fiveFiveInfo: AcpModelInfo = {
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5',
      available_models: [
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
      ],
    };
    const autoInfo: AcpModelInfo = {
      ...fiveFiveInfo,
      current_model_id: 'gpt-5.6-terra',
      current_model_label: 'GPT-5.6-Terra',
    };
    configServiceGetMock.mockReturnValue({ codex: { preferredModelId: 'gpt-5.5' } });
    getModelInvokeMock.mockResolvedValueOnce({ model_info: fiveFiveInfo }).mockResolvedValue({ model_info: autoInfo });
    setModelInvokeMock.mockResolvedValue({ model_info: autoInfo });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.5');
    });

    act(() => result.current.selectAutoModel());

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({
        conversation_id: 'active-codex-conversation',
        model_id: 'gpt-5.6-terra',
      });
    });
    await waitFor(() => {
      expect(configServiceSetMock).toHaveBeenCalledWith('acp.config', { codex: {} });
    });
  });

  it('saves the requested Codex model when setModel succeeds without a receipt and reload has no model info', async () => {
    const initialInfo: AcpModelInfo = {
      current_model_id: 'gpt-5.6-sol',
      current_model_label: 'GPT-5.6-Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
      ],
    };
    getModelInvokeMock.mockResolvedValueOnce({ model_info: initialInfo }).mockResolvedValue({ model_info: null });
    setModelInvokeMock.mockResolvedValue({ model_info: null });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'active-codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.6-sol');
    });

    act(() => result.current.selectModel('gpt-5.6-terra'));

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('gpt-5.6-terra');
    });
    await waitFor(() => {
      expect(configServiceSetMock).toHaveBeenCalledWith('acp.config', {
        codex: { preferredModelId: 'gpt-5.6-terra' },
      });
    });
  });

  it('exposes ACP reasoning effort config options for Codex conversations', async () => {
    getConfigOptionsInvokeMock.mockResolvedValue({
      config_options: [
        {
          id: 'reasoning_effort',
          category: 'thought_level',
          option_type: 'select',
          current_value: 'xhigh',
          options: [
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Extra high' },
          ],
        },
      ],
    });
    setConfigOptionInvokeMock.mockResolvedValue({
      confirmation: 'observed',
      config_options: [
        {
          id: 'reasoning_effort',
          category: 'thought_level',
          option_type: 'select',
          current_value: 'high',
          options: [
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Extra high' },
          ],
        },
      ],
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'codex-conversation',
      backend: 'codex',
    });

    await waitFor(() => {
      expect(result.current.thoughtLevel?.currentValue).toBe('xhigh');
    });

    await act(async () => {
      await result.current.setConfigOption('reasoning_effort', 'high');
    });

    expect(setConfigOptionInvokeMock).toHaveBeenCalledWith({
      conversation_id: 'codex-conversation',
      option_id: 'reasoning_effort',
      value: 'high',
    });
  });
});
