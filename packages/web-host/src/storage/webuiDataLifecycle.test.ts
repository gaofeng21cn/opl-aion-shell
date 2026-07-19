import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __webuiDataLifecycleTest,
  WebuiDataLifecycleError,
  WebuiDataVolumeLifecycleManager,
} from './webuiDataLifecycle.js';
import {
  buildDefaultWebuiDataLifecycleConfig,
  resolveWebuiDataLifecycleRecoveryRoot,
} from './webuiDataLifecycleConfig.js';

describe('WebuiDataVolumeLifecycleManager', () => {
  let fixture = '';
  let dataDir = '';
  let projectsDir = '';
  let recoveryRoot = '';
  let cacheRoot = '';
  let temporaryRoot = '';

  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-storage-'));
    dataDir = path.join(fixture, 'data');
    projectsDir = path.join(fixture, 'projects');
    recoveryRoot = path.join(fixture, 'recovery');
    cacheRoot = path.join(dataDir, 'cache');
    temporaryRoot = path.join(dataDir, 'temp');
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.mkdirSync(temporaryRoot, { recursive: true });
    fs.mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  const createManager = (overrides: Partial<ConstructorParameters<typeof WebuiDataVolumeLifecycleManager>[0]> = {}) =>
    new WebuiDataVolumeLifecycleManager({
      dataDir,
      projectsDir,
      recoveryRoot,
      managedRoots: [
        { id: 'cache', kind: 'cache', path: cacheRoot },
        { id: 'temporary', kind: 'temporary', path: temporaryRoot },
      ],
      ...overrides,
    });

  it('archives exact managed files before cleanup and restores them without exposing paths', () => {
    const cacheFile = path.join(cacheRoot, 'nested', 'cache.bin');
    const temporaryFile = path.join(temporaryRoot, 'request.tmp');
    const projectFile = path.join(projectsDir, 'keep.txt');
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, 'cache-body');
    fs.writeFileSync(temporaryFile, 'temporary-body');
    fs.writeFileSync(projectFile, 'project-body');

    const manager = createManager();
    const plan = manager.plan();
    expect(plan.candidate_count).toBe(2);
    expect(plan.estimated_reclaimable_bytes).toBe(24);
    expect(JSON.stringify(plan)).not.toContain(fixture);

    const receipt = manager.execute({
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      exact_confirmation: plan.exact_confirmation,
    });
    expect(receipt.deleted_bytes).toBe(24);
    expect(receipt.readback).toMatchObject({ terminal: true, bytes: 0, reclaimable_bytes: 0 });
    expect(receipt.receipt_ref).toMatch(/^opl-webui-data-volume-receipt:/);
    expect(JSON.stringify(receipt)).not.toContain(fixture);
    expect(fs.existsSync(cacheFile)).toBe(false);
    expect(fs.existsSync(temporaryFile)).toBe(false);
    expect(fs.readFileSync(projectFile, 'utf8')).toBe('project-body');

    const restored = manager.restore({ receipt_ref: receipt.receipt_ref });
    expect(restored.readback).toMatchObject({ terminal: true, bytes: 24, reclaimable_bytes: 24 });
    expect(fs.readFileSync(cacheFile, 'utf8')).toBe('cache-body');
    expect(fs.readFileSync(temporaryFile, 'utf8')).toBe('temporary-body');
    expect(fs.readFileSync(projectFile, 'utf8')).toBe('project-body');
    expect(manager.restore({ receipt_ref: receipt.receipt_ref })).toEqual(restored);
  });

  it('returns an idempotent completed response only for the exact original confirmation', () => {
    fs.writeFileSync(path.join(cacheRoot, 'cache.bin'), 'cache');
    const manager = createManager();
    const plan = manager.plan();
    const request = {
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      exact_confirmation: plan.exact_confirmation,
    };
    const receipt = manager.execute(request);

    expect(manager.execute(request)).toEqual(receipt);
    expect(() => manager.execute({ ...request, exact_confirmation: 'wrong' })).toThrowError(
      expect.objectContaining({ code: 'CONFIRMATION_MISMATCH' })
    );
  });

  it('rejects a stale plan without deleting changed managed data', () => {
    const file = path.join(cacheRoot, 'cache.bin');
    fs.writeFileSync(file, 'before');
    const manager = createManager();
    const plan = manager.plan();
    fs.writeFileSync(file, 'after');

    expect(() =>
      manager.execute({
        plan_id: plan.plan_id,
        plan_hash: plan.plan_hash,
        exact_confirmation: plan.exact_confirmation,
      })
    ).toThrowError(expect.objectContaining({ code: 'PLAN_STALE' }));
    expect(fs.readFileSync(file, 'utf8')).toBe('after');
  });

  it('refuses restore collisions and preserves both the current file and recovery archive', () => {
    const file = path.join(cacheRoot, 'cache.bin');
    fs.writeFileSync(file, 'archived');
    const manager = createManager();
    const plan = manager.plan();
    const receipt = manager.execute({
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      exact_confirmation: plan.exact_confirmation,
    });
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(file, 'current');

    expect(() => manager.restore({ receipt_ref: receipt.receipt_ref })).toThrowError(
      expect.objectContaining({ code: 'RESTORE_COLLISION' })
    );
    expect(fs.readFileSync(file, 'utf8')).toBe('current');
  });

  it('does not delete a restore target that wins the exclusive-create race', () => {
    const source = path.join(recoveryRoot, 'archive.bin');
    const target = path.join(cacheRoot, 'cache.bin');
    fs.mkdirSync(recoveryRoot, { recursive: true });
    fs.writeFileSync(source, 'archived');
    fs.writeFileSync(target, 'current');

    expect(() =>
      __webuiDataLifecycleTest.copyFileVerified(
        source,
        target,
        8,
        crypto.createHash('sha256').update('archived').digest('hex')
      )
    ).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('current');
  });

  it('skips symlinks and enforces bounded scans', () => {
    const outside = path.join(fixture, 'outside.txt');
    fs.writeFileSync(outside, 'outside');
    fs.symlinkSync(outside, path.join(cacheRoot, 'outside-link'));
    fs.writeFileSync(path.join(cacheRoot, 'inside.txt'), 'inside');

    const manager = createManager();
    expect(manager.plan()).toMatchObject({ candidate_count: 1, estimated_reclaimable_bytes: 6 });
    expect(() => createManager({ maxEntries: 1 }).plan()).toThrowError(
      expect.objectContaining({ code: 'SCAN_ENTRY_LIMIT_EXCEEDED' })
    );
    expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
  });

  it.each([
    ['recovery inside data', () => createManager({ recoveryRoot: path.join(dataDir, 'recovery') })],
    [
      'managed project root',
      () => createManager({ managedRoots: [{ id: 'project', kind: 'cache', path: projectsDir }] }),
    ],
    [
      'overlapping managed roots',
      () =>
        createManager({
          managedRoots: [
            { id: 'cache', kind: 'cache', path: cacheRoot },
            { id: 'nested', kind: 'temporary', path: path.join(cacheRoot, 'nested') },
          ],
        }),
    ],
    ['invalid limits', () => createManager({ maxEntries: 0 })],
  ])('fails closed for invalid configuration: %s', (_label, create) => {
    expect(create).toThrowError(WebuiDataLifecycleError);
    expect(create).toThrowError(expect.objectContaining({ code: 'CONFIGURATION_INVALID', statusCode: 503 }));
  });

  it('builds a narrow default surface without App data, projects, active logs, or external logs', () => {
    const config = buildDefaultWebuiDataLifecycleConfig({
      dataDir,
      projectsDir,
      logDir: path.join(dataDir, 'logs'),
      recoveryRoot,
    });
    expect(config.managedRoots).toEqual([
      { id: 'webui_cache', kind: 'cache', path: path.join(dataDir, 'cache') },
      { id: 'webui_temporary', kind: 'temporary', path: path.join(dataDir, 'temp') },
      { id: 'webui_rotated_logs', kind: 'rotated_log', path: path.join(dataDir, 'logs', 'rotated') },
    ]);
    expect(config.managedRoots.map((root) => root.path)).not.toContain(dataDir);
    expect(config.managedRoots.map((root) => root.path)).not.toContain(projectsDir);
    expect(config.managedRoots.map((root) => root.path)).not.toContain(path.join(dataDir, 'logs'));

    const externalLogs = buildDefaultWebuiDataLifecycleConfig({
      dataDir,
      projectsDir,
      logDir: path.join(fixture, 'external-logs'),
      recoveryRoot,
    });
    expect(externalLogs.managedRoots).toHaveLength(2);
  });

  it('resolves one shared recovery-root policy for CLI and development hosts', () => {
    expect(resolveWebuiDataLifecycleRecoveryRoot(dataDir)).toBe(path.join(fixture, 'data-recovery'));
    expect(resolveWebuiDataLifecycleRecoveryRoot(dataDir, path.join(fixture, 'explicit-recovery'))).toBe(
      path.join(fixture, 'explicit-recovery')
    );
  });
});
