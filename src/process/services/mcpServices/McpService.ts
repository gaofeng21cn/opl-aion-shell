/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import { CodexMcpAgent } from './agents/CodexMcpAgent';
import type { IMcpProtocol, DetectedMcpServer, McpConnectionTestResult, McpSyncResult, McpSource } from './McpProtocol';

/**
 * MCP服务 - 负责协调各个Agent的MCP操作协议
 * 新架构：只定义协议，具体实现由各个Agent类完成
 *
 * OPL only manages Codex MCP configuration by default.
 */
export class McpService {
  private agents: Map<McpSource, IMcpProtocol>;

  /**
   * Service-level operation lock to serialize heavy MCP operations.
   * Prevents concurrent getAgentMcpConfigs / syncMcpToAgents / removeMcpFromAgents
   * which would otherwise spawn dozens of child processes simultaneously,
   * causing resource exhaustion and potential system freezes.
   */
  private operationQueue: Promise<unknown> = Promise.resolve();

  private withServiceLock<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operationQueue.then(operation, () => operation());
    // Keep the queue moving even if the operation rejects
    this.operationQueue = queued.catch(() => {});
    return queued;
  }

  constructor() {
    this.agents = new Map([['codex', new CodexMcpAgent()]]);
  }

  /**
   * 获取特定backend的agent实例
   */
  private getAgent(backend: McpSource): IMcpProtocol | undefined {
    return this.agents.get(backend);
  }

  private getAgentForConfig(agent: { backend: string; cliPath?: string }): IMcpProtocol | undefined {
    return this.agents.get(agent.backend as McpSource);
  }

  /**
   * Resolve which MCP agent should be used for config detection and how it
   * should be reported back to the renderer.
   */
  private getDetectionTarget(agent: { backend: string; cliPath?: string }): {
    agentInstance: IMcpProtocol | undefined;
    source: McpSource;
  } {
    const agentInstance = this.getAgentForConfig(agent);
    const source = agent.backend as McpSource;
    return { agentInstance, source };
  }

  /**
   * Merge detection results by source so the UI sees a single entry per agent.
   * This prevents duplicate rows for the same source.
   */
  private mergeDetectedServers(results: DetectedMcpServer[]): DetectedMcpServer[] {
    const merged = new Map<McpSource, Map<string, IMcpServer>>();

    results.forEach((result) => {
      const serversByName = merged.get(result.source) ?? new Map<string, IMcpServer>();

      result.servers.forEach((server) => {
        if (!serversByName.has(server.name)) {
          serversByName.set(server.name, server);
        }
      });

      merged.set(result.source, serversByName);
    });

    return Array.from(merged.entries()).map(([source, serversByName]) => ({
      source,
      servers: Array.from(serversByName.values()),
    }));
  }

  /**
   * 从检测到的ACP agents中获取MCP配置（并发版本）
   *
   */
  getAgentMcpConfigs(
    agents: Array<{
      backend: string;
      name: string;
      cliPath?: string;
    }>
  ): Promise<DetectedMcpServer[]> {
    return this.withServiceLock(async () => {
      // 并发执行所有agent的MCP检测
      const promises = agents.map(async (agent) => {
        try {
          const { agentInstance, source } = this.getDetectionTarget(agent);
          if (!agentInstance) {
            console.warn(`[McpService] No agent instance for backend: ${agent.backend}`);
            return null;
          }

          const servers = await agentInstance.detectMcpServers(agent.cliPath);
          console.log(
            `[McpService] Detected ${servers.length} MCP servers for ${agent.backend} (cliPath: ${agent.cliPath || 'default'})`
          );

          if (servers.length > 0) {
            return {
              source,
              servers,
            };
          }
          return null;
        } catch (error) {
          console.warn(`[McpService] Failed to detect MCP servers for ${agent.backend}:`, error);
          return null;
        }
      });

      const results = await Promise.all(promises);
      return this.mergeDetectedServers(results.filter((result): result is DetectedMcpServer => result !== null));
    });
  }

  /**
   * Get supported transport types for a given agent config.
   */
  getSupportedTransportsForAgent(agent: { backend: string; cliPath?: string }): string[] {
    const agentInstance = this.getAgentForConfig(agent as { backend: string; cliPath?: string });
    return agentInstance ? agentInstance.getSupportedTransports() : [];
  }

  /**
   * 测试MCP服务器连接
   */
  async testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult> {
    // 使用第一个可用的agent进行连接测试，因为测试逻辑在基类中是通用的
    const firstAgent = this.agents.values().next().value;
    if (firstAgent) {
      return await firstAgent.testMcpConnection(server);
    }
    return {
      success: false,
      error: 'No agent available for connection testing',
    };
  }

  /**
   * 将MCP配置同步到所有检测到的agent
   */
  syncMcpToAgents(
    mcpServers: IMcpServer[],
    agents: Array<{
      backend: string;
      name: string;
      cliPath?: string;
    }>
  ): Promise<McpSyncResult> {
    // 只同步启用的MCP服务器
    const enabledServers = mcpServers.filter((server) => server.enabled);

    if (enabledServers.length === 0) {
      return Promise.resolve({ success: true, results: [] });
    }

    return this.withServiceLock(async () => {
      // 并发执行所有agent的MCP同步
      const promises = agents.map(async (agent) => {
        try {
          const agentInstance = this.getAgentForConfig(agent);
          if (!agentInstance) {
            console.warn(`[McpService] Skipping MCP sync for unsupported backend: ${agent.backend}`);
            return {
              agent: agent.name,
              success: true,
            };
          }

          const result = await agentInstance.installMcpServers(enabledServers);
          return {
            agent: agent.name,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          return {
            agent: agent.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(promises);

      const allSuccess = results.every((r) => r.success);

      return { success: allSuccess, results };
    });
  }

  /**
   * 从所有检测到的agent中删除MCP配置
   */
  removeMcpFromAgents(
    mcpServerName: string,
    agents: Array<{
      backend: string;
      name: string;
      cliPath?: string;
    }>
  ): Promise<McpSyncResult> {
    return this.withServiceLock(async () => {
      // 并发执行所有agent的MCP删除
      const promises = agents.map(async (agent) => {
        try {
          const agentInstance = this.getAgentForConfig(agent);
          if (!agentInstance) {
            console.warn(`[McpService] Skipping MCP removal for unsupported backend: ${agent.backend}`);
            return {
              agent: `${agent.backend}:${agent.name}`,
              success: true,
            };
          }

          const result = await agentInstance.removeMcpServer(mcpServerName);
          return {
            agent: `${agent.backend}:${agent.name}`,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          return {
            agent: `${agent.backend}:${agent.name}`,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(promises);

      return { success: true, results };
    });
  }
}

export const mcpService = new McpService();
