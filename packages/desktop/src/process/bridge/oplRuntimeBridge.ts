/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { ipcBridge } from '@/common';
import type {
  IOplRuntimeActionRequest,
  IOplRuntimeCommandResult,
  IOplRuntimeDetailLevel,
} from '@/common/adapter/ipcBridge';

type RuntimeCommandSpec = {
  args: string[];
  surface: IOplRuntimeCommandResult['surface'];
};

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const OPL_COMMAND_TIMEOUT_MS = 30_000;

function assertActionId(actionId: string): string {
  const normalized = actionId.trim();
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL runtime action id');
  }
  return normalized;
}

function buildDrilldownCommand(detail: IOplRuntimeDetailLevel): RuntimeCommandSpec {
  if (detail === 'full') {
    return {
      surface: 'runtime_full',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    };
  }
  return {
    surface: 'runtime_summary',
    args: ['runtime', 'app-operator-drilldown', '--json'],
  };
}

function buildActionCommand(request: IOplRuntimeActionRequest): RuntimeCommandSpec {
  const args = ['runtime', 'action', 'execute', '--action', assertActionId(request.actionId)];
  if (request.dryRun) {
    args.push('--dry-run');
  }
  if (request.payloadRefsOnlyJson && Object.keys(request.payloadRefsOnlyJson).length > 0) {
    args.push('--payload', JSON.stringify(request.payloadRefsOnlyJson));
  }
  return { surface: 'runtime_action', args };
}

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

async function runOplCommand(spec: RuntimeCommandSpec): Promise<IOplRuntimeCommandResult> {
  const command = ['opl', ...spec.args].join(' ');
  return new Promise((resolve, reject) => {
    const child = spawn('opl', spec.args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`OPL runtime command timed out: ${command}`));
    }, OPL_COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_STDOUT_BYTES) {
        child.kill('SIGTERM');
        reject(new Error(`OPL runtime command output exceeded ${MAX_STDOUT_BYTES} bytes`));
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`OPL runtime command failed (${code}): ${stderr.trim() || command}`));
        return;
      }
      try {
        resolve({
          surface: spec.surface,
          command,
          stdout,
          parsed: parseJson(stdout),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function initOplRuntimeBridge(): void {
  ipcBridge.oplRuntime.getDrilldown.provider(({ detail }) => runOplCommand(buildDrilldownCommand(detail)));
  ipcBridge.oplRuntime.executeAction.provider((request) => runOplCommand(buildActionCommand(request)));
}

export const __oplRuntimeBridgeTest = {
  assertActionId,
  buildActionCommand,
  buildDrilldownCommand,
  parseJson,
};
