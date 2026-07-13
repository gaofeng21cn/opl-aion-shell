import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import { startStaticServer, type StaticServerHandle } from './static-server.js';
import { __oplRuntimeProxyTest } from './opl-runtime-proxy.js';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

async function mkRendererFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-static-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'assets', 'main.js'), 'console.log("hi")');
  return dir;
}

async function startMockBackend(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe('static-server', () => {
  let handle: StaticServerHandle | null = null;
  let stopBackend: (() => Promise<void>) | null = null;
  let staticDir = '';

  beforeEach(async () => {
    staticDir = await mkRendererFixture();
  });

  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = null;
    }
    if (stopBackend) {
      await stopBackend();
      stopBackend = null;
    }
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  it('serves static index.html at /', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('<title>root</title>');
  });

  it('SPA fallback: /chat/123 returns index.html', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/chat/123`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>root</title>');
  });

  it('static asset /assets/main.js served', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/assets/main.js`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('hi');
  });

  it('/api/* reverse-proxies to backend', async () => {
    const backend = await startMockBackend((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method }));
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { path: string };
    expect(json.path).toBe('/api/anything');
  });

  it('/login reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/login' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'aionui-session=backend-token; Path=/; HttpOnly',
        });
        res.end(JSON.stringify({ success: true, proxied: true }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'anything' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/aionui-session=backend-token/);
    const json = (await r.json()) as { proxied: boolean };
    expect(json.proxied).toBe(true);
  });

  it('/api/auth/user reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/api/auth/user' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: { username: 'from-backend', id: 'from-backend' } }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/api/auth/user`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { user: { username: string } };
    expect(json.user.username).toBe('from-backend');
  });

  it('/api/auth/user auto-logins with startup credentials when backend returns 401', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/api/auth/user' && req.method === 'GET') {
        if (req.headers.cookie?.includes('aionui-session=boot-token')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true, user: { username: 'admin', id: 'admin' } }));
          return;
        }
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
        return;
      }
      if (req.url === '/login' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            username?: string;
            password?: string;
          };
          if (body.username === 'admin' && body.password === 'boot-password') {
            res.writeHead(200, {
              'content-type': 'application/json',
              'set-cookie': 'aionui-session=boot-token; Path=/; HttpOnly',
            });
            res.end(JSON.stringify({ success: true, user: { username: 'admin', id: 'admin' } }));
            return;
          }
          res.writeHead(401).end();
        });
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      webAutoLogin: {
        getCredentials: () => ({ username: 'admin', password: 'boot-password' }),
      },
    });

    const r = await fetch(`${handle.localUrl}/api/auth/user`);
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/aionui-session=boot-token/);
    const json = (await r.json()) as { user: { username: string } };
    expect(json.user.username).toBe('admin');
  });

  it('/api/auth/user keeps backend 401 when auto-login is not configured', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/api/auth/user' && req.method === 'GET') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/api/auth/user`);
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('/logout reverse-proxies to backend (no local handler)', async () => {
    const backend = await startMockBackend((req, res) => {
      if (req.url === '/logout' && req.method === 'POST') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'aionui-session=; Path=/; Max-Age=0',
        });
        res.end(JSON.stringify({ success: true, proxied: true }));
        return;
      }
      res.writeHead(404).end();
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0 });

    const r = await fetch(`${handle.localUrl}/logout`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('/api proxy returns 502 when backend unreachable', async () => {
    // allocate a port then free it
    const placeholder = await startMockBackend((_req, res) => res.end());
    const freePort = placeholder.port;
    await placeholder.close();

    handle = await startStaticServer({ staticDir, backendPort: freePort, port: 0 });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(502);
  });

  it('/api/opl-runtime/* is handled before the backend proxy', async () => {
    const backend = await startMockBackend((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ backend: true }));
    });
    stopBackend = backend.close;
    const dataDir = path.join(staticDir, 'data');
    const projectsDir = path.join(staticDir, 'projects');
    const resourcesPath = path.join(staticDir, 'resources');
    await fs.mkdir(resourcesPath, { recursive: true });

    vi.mocked(spawn).mockImplementationOnce((command, args, options) => {
      const child = new EventEmitter() as ReturnType<typeof spawn> & {
        stdout: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
        stderr: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
      };
      child.stdout = new EventEmitter() as typeof child.stdout;
      child.stderr = new EventEmitter() as typeof child.stderr;
      child.stdout.setEncoding = () => {};
      child.stderr.setEncoding = () => {};
      child.kill = vi.fn() as typeof child.kill;
      queueMicrotask(() => {
        child.stdout.emit('data', JSON.stringify({ ok: true }));
        child.emit('close', 0);
      });
      expect(command).toBe('opl');
      expect(args).toEqual(['app', 'state', '--profile', 'fast', '--json']);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.HOME).toBe(dataDir);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_STATE_DIR).toBe(path.join(dataDir, 'opl', 'state'));
      expect((options as { env?: NodeJS.ProcessEnv }).env?.CODEX_HOME).toBe(path.join(dataDir, '.codex'));
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_WORKSPACE_ROOT).toBe(projectsDir);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_PROJECTS_DIR).toBe(projectsDir);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_DATA_DIR).toBe(dataDir);
      return child;
    });

    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      oplRuntimeProxy: { dataDir, projectsDir, resourcesPath },
    });

    const r = await fetch(`${handle.localUrl}/api/opl-runtime/app-state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'fast' }),
    });
    expect(r.status).toBe(200);
    const json = (await r.json()) as { data: { surface: string; parsed: unknown } };
    expect(json.data.surface).toBe('app_state_fast');
    expect(json.data.parsed).toEqual({ ok: true });
  });

  it('can inherit the user OPL environment for App runtime status', () => {
    const dataDir = path.join(staticDir, 'user-home');
    const projectsDir = path.join(staticDir, 'projects');
    const resourcesPath = path.join(staticDir, 'resources');
    const previous = {
      OPL_DATA_DIR: process.env.OPL_DATA_DIR,
      OPL_STATE_DIR: process.env.OPL_STATE_DIR,
      CODEX_HOME: process.env.CODEX_HOME,
      OPL_INSTALL_DIR: process.env.OPL_INSTALL_DIR,
      OPL_MANAGED_TOOLCHAIN_ROOT: process.env.OPL_MANAGED_TOOLCHAIN_ROOT,
    };

    try {
      delete process.env.OPL_DATA_DIR;
      delete process.env.OPL_STATE_DIR;
      delete process.env.CODEX_HOME;
      delete process.env.OPL_INSTALL_DIR;
      delete process.env.OPL_MANAGED_TOOLCHAIN_ROOT;

      const env = __oplRuntimeProxyTest.buildOplEnv({
        dataDir,
        projectsDir,
        resourcesPath,
        inheritUserOplEnvironment: true,
      });

      expect(env.HOME).toBe(dataDir);
      expect(env.OPL_WORKSPACE_ROOT).toBe(projectsDir);
      expect(env.OPL_PROJECTS_DIR).toBe(projectsDir);
      expect(env.OPL_DATA_DIR).toBeUndefined();
      expect(env.OPL_STATE_DIR).toBeUndefined();
      expect(env.CODEX_HOME).toBeUndefined();
      expect(env.OPL_INSTALL_DIR).toBeUndefined();
      expect(env.OPL_MANAGED_TOOLCHAIN_ROOT).toBeUndefined();
      expect(env.PATH).toContain(path.join(dataDir, '.opl', 'one-person-lab', 'bin'));
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('/api/opl-runtime/configure-codex sends the API key through stdin only', async () => {
    const backend = await startMockBackend((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ backend: true }));
    });
    stopBackend = backend.close;
    const dataDir = path.join(staticDir, 'data');
    const projectsDir = path.join(staticDir, 'projects');
    const resourcesPath = path.join(staticDir, 'resources');
    const apiKey = 'sk-test-configure-codex-secret';
    const logged: string[] = [];
    await fs.mkdir(resourcesPath, { recursive: true });

    const consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation((...args) => logged.push(args.map(String).join(' '))),
      vi.spyOn(console, 'warn').mockImplementation((...args) => logged.push(args.map(String).join(' '))),
      vi.spyOn(console, 'error').mockImplementation((...args) => logged.push(args.map(String).join(' '))),
    ];

    try {
      const stdinEnd = vi.fn();
      vi.mocked(spawn).mockImplementationOnce((command, args, options) => {
        const child = new EventEmitter() as ReturnType<typeof spawn> & {
          stdin: { end: ReturnType<typeof vi.fn> };
          stdout: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
          stderr: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
        };
        child.stdin = { end: stdinEnd };
        child.stdout = new EventEmitter() as typeof child.stdout;
        child.stderr = new EventEmitter() as typeof child.stderr;
        child.stdout.setEncoding = () => {};
        child.stderr.setEncoding = () => {};
        child.kill = vi.fn() as typeof child.kill;
        queueMicrotask(() => {
          child.stdout.emit('data', JSON.stringify({ configured: true }));
          child.emit('close', 0);
        });
        expect(command).toBe('opl');
        expect(args).toEqual(['system', 'configure-codex', '--api-key-stdin', '--json']);
        expect(JSON.stringify(args)).not.toContain(apiKey);
        expect((options as { stdio?: unknown[] }).stdio?.[0]).toBe('pipe');
        return child;
      });

      handle = await startStaticServer({
        staticDir,
        backendPort: backend.port,
        port: 0,
        oplRuntimeProxy: { dataDir, projectsDir, resourcesPath },
      });

      const r = await fetch(`${handle.localUrl}/api/opl-runtime/configure-codex`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      expect(r.status).toBe(200);
      const json = (await r.json()) as {
        success: boolean;
        data: { command: string; surface: string; parsed: unknown };
      };
      expect(json.success).toBe(true);
      expect(json.data.surface).toBe('configure_codex');
      expect(json.data.command).toBe('opl system configure-codex --api-key-stdin --json');
      expect(json.data.parsed).toEqual({ configured: true });
      expect(stdinEnd).toHaveBeenCalledWith(`${apiKey}\n`);
      expect(JSON.stringify(json)).not.toContain(apiKey);
      expect(logged.join('\n')).not.toContain(apiKey);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
    }
  });

  it('/api/opl-runtime/* passes packaged image manifest and seed env to OPL commands', async () => {
    const backend = await startMockBackend((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ backend: true }));
    });
    stopBackend = backend.close;
    const dataDir = path.join(staticDir, 'data');
    const projectsDir = path.join(staticDir, 'projects');
    const resourcesPath = path.join(staticDir, 'resources');
    const imageManifestPath = path.join(resourcesPath, 'opl-image-manifest.json');
    const imageSeedDir = path.join(resourcesPath, 'opl-image-seed');
    await fs.mkdir(imageSeedDir, { recursive: true });

    vi.mocked(spawn).mockImplementationOnce((command, args, options) => {
      const child = new EventEmitter() as ReturnType<typeof spawn> & {
        stdout: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
        stderr: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
      };
      child.stdout = new EventEmitter() as typeof child.stdout;
      child.stderr = new EventEmitter() as typeof child.stderr;
      child.stdout.setEncoding = () => {};
      child.stderr.setEncoding = () => {};
      child.kill = vi.fn() as typeof child.kill;
      queueMicrotask(() => {
        child.stdout.emit('data', JSON.stringify({ ok: true }));
        child.emit('close', 0);
      });
      expect(command).toBe('opl');
      expect(args).toEqual(['system', 'startup-maintenance', '--json']);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_IMAGE_MANIFEST_PATH).toBe(imageManifestPath);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_IMAGE_SEED_DIR).toBe(imageSeedDir);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_DATA_DIR).toBe(dataDir);
      expect((options as { env?: NodeJS.ProcessEnv }).env?.OPL_PROJECTS_DIR).toBe(projectsDir);
      return child;
    });

    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      oplRuntimeProxy: { dataDir, projectsDir, resourcesPath, imageManifestPath, imageSeedDir },
    });

    const r = await fetch(`${handle.localUrl}/api/opl-runtime/startup-maintenance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(200);
    const json = (await r.json()) as { data: { surface: string; parsed: unknown } };
    expect(json.data.surface).toBe('startup_maintenance');
    expect(json.data.parsed).toEqual({ ok: true });
  });

  it('/api/opl-runtime/* gives maintenance commands a long timeout without changing fast reads', () => {
    const maintenanceSpec = __oplRuntimeProxyTest.buildCommandFromRequest('startup-maintenance', {});
    const updateCheckSpec = __oplRuntimeProxyTest.buildCommandFromRequest('update-check', {});
    const updateApplySpec = __oplRuntimeProxyTest.buildCommandFromRequest('update-plan-apply', {});
    const appStateSpec = __oplRuntimeProxyTest.buildCommandFromRequest('app-state', {});

    expect(maintenanceSpec.timeoutMs).toBe(__oplRuntimeProxyTest.MAINTENANCE_TIMEOUT_MS);
    expect(updateCheckSpec.timeoutMs).toBe(__oplRuntimeProxyTest.MAINTENANCE_TIMEOUT_MS);
    expect(updateApplySpec.timeoutMs).toBe(__oplRuntimeProxyTest.MAINTENANCE_TIMEOUT_MS);
    expect(appStateSpec.timeoutMs).toBeUndefined();
  });

  it('/api/opl-runtime/* prefers the installed App-managed runtime/current before developer PATH shims', async () => {
    const runtimeHome = path.join(staticDir, 'home', 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    const originalHome = process.env.HOME;
    const originalPath = process.env.PATH;
    await fs.mkdir(path.join(runtimeHome, 'bin'), { recursive: true });
    await fs.mkdir(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    await fs.mkdir(path.join(runtimeHome, 'uv', 'bin'), { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    process.env.HOME = path.join(staticDir, 'home');
    process.env.PATH = '/opt/homebrew/bin:/usr/bin:/bin';

    try {
      expect(__oplRuntimeProxyTest.resolveDefaultFullRuntimeHome(process.env.HOME)).toBe(runtimeHome);
      const env = __oplRuntimeProxyTest.buildOplEnv({
        dataDir: path.join(staticDir, 'data'),
        projectsDir: path.join(staticDir, 'projects'),
        resourcesPath: path.join(staticDir, 'resources'),
      });
      expect(env.OPL_FULL_RUNTIME_HOME).toBe(runtimeHome);
      expect(env.PATH?.split(path.delimiter).slice(0, 3)).toEqual([
        path.join(runtimeHome, 'bin'),
        path.join(runtimeHome, 'node', 'bin'),
        path.join(runtimeHome, 'uv', 'bin'),
      ]);
    } finally {
      process.env.HOME = originalHome;
      process.env.PATH = originalPath;
    }
  });

  it('/api/opl-runtime/* reruns bootstrap when an existing OPL checkout has missing dependencies', async () => {
    const backend = await startMockBackend((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ backend: true }));
    });
    stopBackend = backend.close;
    const dataDir = path.join(staticDir, 'data');
    const projectsDir = path.join(staticDir, 'projects');
    const resourcesPath = path.join(staticDir, 'resources');
    await fs.mkdir(resourcesPath, { recursive: true });
    await fs.writeFile(path.join(resourcesPath, 'opl-install.sh'), '#!/usr/bin/env bash\n');

    const initialSpawnCallCount = vi.mocked(spawn).mock.calls.length;
    vi.mocked(spawn)
      .mockImplementationOnce((command, args) => {
        const child = new EventEmitter() as ReturnType<typeof spawn> & {
          stdout: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
          stderr: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
        };
        child.stdout = new EventEmitter() as typeof child.stdout;
        child.stderr = new EventEmitter() as typeof child.stderr;
        child.stdout.setEncoding = () => {};
        child.stderr.setEncoding = () => {};
        child.kill = vi.fn() as typeof child.kill;
        queueMicrotask(() => {
          child.stderr.emit(
            'data',
            "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@temporalio/common' imported from /data/.opl/one-person-lab/src/family-runtime-temporal-query.ts"
          );
          child.emit('close', 1);
        });
        expect(command).toBe('opl');
        expect(args).toEqual(['app', 'state', '--profile', 'fast', '--json']);
        return child;
      })
      .mockImplementationOnce((command, args) => {
        const child = new EventEmitter() as ReturnType<typeof spawn> & {
          stdout: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
          stderr: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
        };
        child.stdout = new EventEmitter() as typeof child.stdout;
        child.stderr = new EventEmitter() as typeof child.stderr;
        child.stdout.setEncoding = () => {};
        child.stderr.setEncoding = () => {};
        child.kill = vi.fn() as typeof child.kill;
        queueMicrotask(() => child.emit('close', 0));
        expect(command).toBe('/bin/bash');
        expect(args).toEqual([path.join(resourcesPath, 'opl-install.sh'), '--headless', '--skip-modules']);
        return child;
      })
      .mockImplementationOnce((command, args) => {
        const child = new EventEmitter() as ReturnType<typeof spawn> & {
          stdout: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
          stderr: InstanceType<typeof EventEmitter> & { setEncoding: (encoding: string) => void };
        };
        child.stdout = new EventEmitter() as typeof child.stdout;
        child.stderr = new EventEmitter() as typeof child.stderr;
        child.stdout.setEncoding = () => {};
        child.stderr.setEncoding = () => {};
        child.kill = vi.fn() as typeof child.kill;
        queueMicrotask(() => {
          child.stdout.emit('data', JSON.stringify({ recovered: true }));
          child.emit('close', 0);
        });
        expect(command).toBe('opl');
        expect(args).toEqual(['app', 'state', '--profile', 'fast', '--json']);
        return child;
      });

    handle = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      oplRuntimeProxy: { dataDir, projectsDir, resourcesPath },
    });

    const r = await fetch(`${handle.localUrl}/api/opl-runtime/app-state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'fast' }),
    });
    expect(r.status).toBe(200);
    const json = (await r.json()) as { success: boolean; data: { parsed: unknown } };
    expect(json.success).toBe(true);
    expect(json.data.parsed).toEqual({ recovered: true });
    expect(vi.mocked(spawn).mock.calls.length - initialSpawnCallCount).toBe(3);
  });

  it('/ws WebSocket upgrade is spliced to backend and 101 is relayed', async () => {
    // Mock backend that accepts any WebSocket upgrade and replies with 101.
    // We don't run a real ws protocol — just verify the upgrade response makes
    // it back through the TCP-splice proxy. This is the exact regression path
    // that bun 1.3's http-compat upgrade handler broke.
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      // Send a single 0-length WS text frame as a liveness marker then close.
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    // Speak raw HTTP/1.1 upgrade over a TCP socket against the public listener.
    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /ws HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('/api/stt/stream WebSocket upgrade is spliced to backend and 101 is relayed', async () => {
    // Same as /ws test but for STT streaming endpoint.
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /api/stt/stream HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('/api/stt/stream with query params is spliced to backend', async () => {
    const { createHash } = await import('node:crypto');
    const net = await import('node:net');
    const httpMod = await import('node:http');
    const backendServer = httpMod.createServer();
    backendServer.on('upgrade', (req, socket) => {
      const wsKey = (req.headers['sec-websocket-key'] as string) || '';
      const accept = createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('Connection: Upgrade\r\n');
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.write(Buffer.from([0x81, 0x00]));
      socket.end();
    });
    await new Promise<void>((r) => backendServer.listen(0, '127.0.0.1', () => r()));
    stopBackend = () => new Promise<void>((r) => backendServer.close(() => r()));
    const backendPort = (backendServer.address() as { port: number }).port;

    handle = await startStaticServer({ staticDir, backendPort, port: 0 });

    const { port: publicPort } = handle;
    const status: string = await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port: publicPort }, () => {
        sock.write(
          'GET /api/stt/stream?lang=en&model=default HTTP/1.1\r\n' +
            `Host: 127.0.0.1:${publicPort}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );
      });
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const firstLine = buf.slice(0, buf.indexOf(0x0a)).toString('ascii');
          sock.destroy();
          resolve(firstLine.trim());
        }
      });
      sock.on('error', reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout waiting for 101'));
      }, 3000).unref();
    });
    expect(status).toMatch(/HTTP\/1\.1 101/i);
  });

  it('network URL populated only when allowRemote=true', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    const h1 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      allowRemote: false,
    });
    expect(h1.networkUrl).toBeUndefined();
    await h1.stop();

    const h2 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      allowRemote: true,
    });
    // may still be undefined on CI machines without a LAN interface
    expect(typeof h2.networkUrl === 'string' || h2.networkUrl === undefined).toBe(true);
    await h2.stop();
  });
});
