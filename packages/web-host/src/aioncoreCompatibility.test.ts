import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { repairStaleManagedWorkspaceProjectBindings } from './aioncoreCompatibility.js';

describe('managed workspace stale project binding repair', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aioncore-project-binding-'));
    temporaryDirectories.push(root);
    const dataDir = path.join(root, 'data');
    const backendDir = path.join(root, 'bundled-aioncore', `${process.platform}-${process.arch}`);
    const managedResourcesDir = path.join(backendDir, 'managed-resources');
    const nodeRoot = path.join('node', 'node-v24.11.0-test');
    const nodeExecutable = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');
    const managedNodePath = path.join(managedResourcesDir, nodeRoot, nodeExecutable);
    const aioncoreBinaryPath = path.join(backendDir, process.platform === 'win32' ? 'aioncore.exe' : 'aioncore');
    const databasePath = path.join(dataDir, 'aionui-backend.db');

    fs.mkdirSync(path.dirname(managedNodePath), { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(aioncoreBinaryPath, 'fixture');
    fs.writeFileSync(managedNodePath, 'fixture');
    fs.writeFileSync(
      path.join(managedResourcesDir, 'manifest.json'),
      JSON.stringify({ node: { root: nodeRoot, executable: nodeExecutable } })
    );

    return { aioncoreBinaryPath, databasePath, dataDir, managedNodePath };
  }

  function runWithCurrentNode(_managedNodePath: string, args: readonly string[]): string {
    return execFileSync(process.execPath, [...args], { encoding: 'utf8' });
  }

  it('clears only missing same-user bindings in the exact managed workspace and is idempotent', () => {
    const input = fixture();
    const database = new DatabaseSync(input.databasePath);
    database.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT,
        folder_id TEXT,
        extra TEXT
      );
      CREATE TABLE projects (
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL
      );
    `);
    const insertConversation = database.prepare('INSERT INTO conversations VALUES (?, ?, ?, ?, ?)');
    insertConversation.run(
      'missing',
      'user-a',
      'missing-project',
      'folder-a',
      JSON.stringify({ workspace: '/projects' })
    );
    insertConversation.run('valid', 'user-a', 'valid-project', 'folder-b', JSON.stringify({ workspace: '/projects' }));
    insertConversation.run(
      'other-user',
      'user-a',
      'shared-project',
      'folder-c',
      JSON.stringify({ workspace: '/projects' })
    );
    insertConversation.run(
      'other-workspace',
      'user-a',
      'missing-other',
      'folder-d',
      JSON.stringify({ workspace: '/other' })
    );
    insertConversation.run('invalid-extra', 'user-a', 'missing-invalid', 'folder-e', 'not-json');
    database.prepare('INSERT INTO projects VALUES (?, ?)').run('valid-project', 'user-a');
    database.prepare('INSERT INTO projects VALUES (?, ?)').run('shared-project', 'user-b');
    database.close();

    const options = {
      aioncoreBinaryPath: input.aioncoreBinaryPath,
      dataDir: input.dataDir,
      workspaceRoot: '/projects',
    };
    expect(repairStaleManagedWorkspaceProjectBindings(options, runWithCurrentNode)).toEqual({
      status: 'repaired',
      repairedBindings: 2,
    });
    expect(repairStaleManagedWorkspaceProjectBindings(options, runWithCurrentNode)).toEqual({
      status: 'repaired',
      repairedBindings: 0,
    });

    const readback = new DatabaseSync(input.databasePath, { readOnly: true });
    const rows = readback
      .prepare('SELECT id, project_id, folder_id FROM conversations ORDER BY id')
      .all()
      .map((row) => ({
        id: row.id,
        project_id: row.project_id,
        folder_id: row.folder_id,
      }));
    expect(rows).toEqual([
      { id: 'invalid-extra', project_id: 'missing-invalid', folder_id: 'folder-e' },
      { id: 'missing', project_id: null, folder_id: null },
      { id: 'other-user', project_id: null, folder_id: null },
      { id: 'other-workspace', project_id: 'missing-other', folder_id: 'folder-d' },
      { id: 'valid', project_id: 'valid-project', folder_id: 'folder-b' },
    ]);
    readback.close();
  });

  it('does not create a database and does not require managed Node on first launch', () => {
    const input = fixture();
    fs.rmSync(input.databasePath, { force: true });
    fs.rmSync(input.managedNodePath, { force: true });

    expect(
      repairStaleManagedWorkspaceProjectBindings({
        aioncoreBinaryPath: input.aioncoreBinaryPath,
        dataDir: input.dataDir,
        workspaceRoot: '/projects',
      })
    ).toEqual({ status: 'database_absent', repairedBindings: 0 });
    expect(fs.existsSync(input.databasePath)).toBe(false);
  });

  it('leaves an initialization-era schema untouched for official AionCore migrations', () => {
    const input = fixture();
    const database = new DatabaseSync(input.databasePath);
    database.exec('CREATE TABLE conversations (id TEXT PRIMARY KEY, extra TEXT)');
    database.close();

    expect(
      repairStaleManagedWorkspaceProjectBindings(
        {
          aioncoreBinaryPath: input.aioncoreBinaryPath,
          dataDir: input.dataDir,
          workspaceRoot: '/projects',
        },
        runWithCurrentNode
      )
    ).toEqual({ status: 'schema_not_ready', repairedBindings: 0 });
  });

  it('rejects a filesystem root as the repair scope', () => {
    const input = fixture();
    expect(() =>
      repairStaleManagedWorkspaceProjectBindings({
        aioncoreBinaryPath: input.aioncoreBinaryPath,
        dataDir: input.dataDir,
        workspaceRoot: path.parse(input.dataDir).root,
      })
    ).toThrow(/absolute non-root path/);
  });
});
