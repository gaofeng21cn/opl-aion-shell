/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { IMcpServer } from '@/common/config/storage';

export interface MCPOAuthConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface OAuthStatus {
  isAuthenticated: boolean;
  needsLogin: boolean;
  error?: string;
}

/**
 * OPL does not bundle Aion CLI's MCP OAuth implementation.
 * The service keeps the bridge contract stable and reports unsupported login
 * explicitly when a remote MCP server requires OAuth.
 */
export class McpOAuthService {
  private eventEmitter: EventEmitter;

  constructor() {
    this.eventEmitter = new EventEmitter();
  }

  /**
   * 检查 MCP 服务器是否需要 OAuth 认证
   * 通过尝试连接并检查 WWW-Authenticate 头来判断
   */
  async checkOAuthStatus(server: IMcpServer): Promise<OAuthStatus> {
    try {
      // 只有 HTTP/SSE 传输类型才支持 OAuth
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          isAuthenticated: true,
          needsLogin: false,
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          isAuthenticated: false,
          needsLogin: false,
          error: 'No URL provided',
        };
      }

      // 尝试访问 MCP 服务器
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      // 检查是否返回 401 Unauthorized
      if (response.status === 401) {
        const wwwAuthenticate = response.headers.get('WWW-Authenticate');

        if (wwwAuthenticate) {
          return {
            isAuthenticated: false,
            needsLogin: true,
            error: 'MCP OAuth login is not bundled in One Person Lab.',
          };
        }
      }

      // 连接成功或不需要认证
      return {
        isAuthenticated: true,
        needsLogin: false,
      };
    } catch (error) {
      console.error('[McpOAuthService] Error checking OAuth status:', error);
      return {
        isAuthenticated: false,
        needsLogin: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行 OAuth 登录流程
   */
  async login(_server: IMcpServer, _oauthConfig?: MCPOAuthConfig): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'MCP OAuth login is not bundled in One Person Lab.',
    };
  }

  /**
   * 获取有效的访问 token
   */
  async getValidToken(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<string | null> {
    void server;
    void oauthConfig;
    return null;
  }

  /**
   * 登出（删除存储的 token）
   */
  async logout(serverName: string): Promise<void> {
    void serverName;
  }

  /**
   * 获取所有已认证的服务器列表
   */
  async getAuthenticatedServers(): Promise<string[]> {
    return [];
  }

  /**
   * 获取事件发射器，用于监听 OAuth 消息
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

// 单例导出
export const mcpOAuthService = new McpOAuthService();
