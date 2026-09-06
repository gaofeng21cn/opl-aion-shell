/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA and reverse-proxies /api/*, /ws, /api/stt/stream,
 * /login and /logout to aioncore. All auth goes to backend's aionui-auth crate;
 * /login and /logout are aionui-auth's top-level paths, the rest live under
 * /api/auth/*. /ws and /api/stt/stream are WebSocket/stream upgrades spliced at
 * TCP level; /api/stt/stream is the STT streaming endpoint.
 *
 * Design: Node native http + serve-handler. No Express. No business routes.
 */

import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { networkInterfaces } from 'node:os';
import net, { type Socket } from 'node:net';
import serveHandler from 'serve-handler';
import { handleOplRuntimeProxyRequest } from './opl-runtime-proxy.js';
import { WebuiDataVolumeLifecycleManager } from './storage/webuiDataLifecycle.js';
import {
  handleWebuiDataLifecycleRequest,
  type WebuiDataLifecycleAuthentication,
} from './storage/webuiDataLifecycleHttp.js';
import type { WebAutoLoginBootstrap, WebOplRuntimeProxyConfig, WebuiDataLifecycleHostConfig } from './types.js';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
  webAutoLogin?: WebAutoLoginBootstrap;
  oplRuntimeProxy?: WebOplRuntimeProxyConfig;
  webuiDataLifecycle?: WebuiDataLifecycleHostConfig;
};

export type StaticServerHandle = {
  port: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};

const DEFAULT_PORT = 25808;

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function forwardToBackend(req: IncomingMessage, res: ServerResponse, backendPort: number): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BACKEND_UNREACHABLE' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

type BufferedBackendResponse = {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

function backendRequest(
  backendPort: number,
  request: {
    path: string;
    method: string;
    headers?: IncomingHttpHeaders | OutgoingHttpHeaders;
    body?: Buffer | string;
  }
): Promise<BufferedBackendResponse> {
  return new Promise((resolve, reject) => {
    const body = request.body;
    const headers: OutgoingHttpHeaders = {
      ...request.headers,
      host: `127.0.0.1:${backendPort}`,
    };
    if (body !== undefined && headers['content-length'] === undefined) {
      headers['content-length'] = Buffer.byteLength(body);
    }
    const proxy = http.request(
      {
        hostname: '127.0.0.1',
        port: backendPort,
        path: request.path,
        method: request.method,
        headers,
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', () => {
          resolve({
            statusCode: proxyRes.statusCode ?? 502,
            headers: proxyRes.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    proxy.on('error', reject);
    if (body !== undefined) proxy.write(body);
    proxy.end();
  });
}

function setCookiesFrom(headers: IncomingHttpHeaders): string[] {
  const value = headers['set-cookie'];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

function withMergedCookies(headers: IncomingHttpHeaders, setCookies: string[]): IncomingHttpHeaders {
  const cookieHeader = cookieHeaderFromSetCookies(setCookies);
  if (!cookieHeader) return headers;
  const existing = headers.cookie;
  return {
    ...headers,
    cookie: existing ? `${existing}; ${cookieHeader}` : cookieHeader,
  };
}

function writeBufferedResponse(
  res: ServerResponse,
  response: BufferedBackendResponse,
  extraSetCookies: string[] = []
): void {
  const headers: OutgoingHttpHeaders = { ...response.headers };
  const setCookies = [...setCookiesFrom(response.headers), ...extraSetCookies];
  if (setCookies.length > 0) headers['set-cookie'] = setCookies;
  res.writeHead(response.statusCode, headers);
  res.end(response.body);
}

async function forwardAuthUserWithAutoLogin(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StaticServerOptions
): Promise<void> {
  const original = await backendRequest(opts.backendPort, {
    path: req.url ?? '/api/auth/user',
    method: req.method ?? 'GET',
    headers: req.headers,
  });
  if (original.statusCode !== 401) {
    writeBufferedResponse(res, original);
    return;
  }

  const credentials = (await opts.webAutoLogin?.getCredentials()) ?? null;
  if (!credentials) {
    writeBufferedResponse(res, original);
    return;
  }

  const loginBody = JSON.stringify({
    username: credentials.username,
    password: credentials.password,
    remember: true,
  });
  let login: BufferedBackendResponse;
  try {
    login = await backendRequest(opts.backendPort, {
      path: '/login',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: loginBody,
    });
  } catch {
    writeBufferedResponse(res, original);
    return;
  }

  if (login.statusCode < 200 || login.statusCode >= 300) {
    writeBufferedResponse(res, original);
    return;
  }

  const loginCookies = setCookiesFrom(login.headers);
  const retry = await backendRequest(opts.backendPort, {
    path: req.url ?? '/api/auth/user',
    method: 'GET',
    headers: withMergedCookies(req.headers, loginCookies),
  });
  writeBufferedResponse(res, retry, loginCookies);
}

async function authenticateWebuiRequest(
  req: IncomingMessage,
  backendPort: number
): Promise<WebuiDataLifecycleAuthentication> {
  const headers: IncomingHttpHeaders = {};
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  try {
    const response = await backendRequest(backendPort, {
      path: '/api/auth/user',
      method: 'GET',
      headers,
    });
    if (response.statusCode >= 200 && response.statusCode < 300) return 'authenticated';
    if (response.statusCode === 401 || response.statusCode === 403) return 'unauthenticated';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function writeWebuiAuthenticationError(res: ServerResponse, authentication: WebuiDataLifecycleAuthentication): void {
  res.writeHead(authentication === 'unavailable' ? 503 : 401, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
  });
  res.end(
    JSON.stringify({
      success: false,
      error: { code: authentication === 'unavailable' ? 'AUTHENTICATION_UNAVAILABLE' : 'AUTHENTICATION_REQUIRED' },
    })
  );
}

// Max bytes we peek before forcing a routing decision. An HTTP request-line
// on its own is typically < 100 bytes; a full header block is < 2 KB. If we
// haven't seen a newline after 4 KB the client is sending something weird —
// hand it to the internal HTTP server and let it return 400.
const PEEK_LIMIT_BYTES = 4096;

/**
 * Splice `client` to a TCP endpoint on `targetPort`. Any bytes already read
 * from `client` during peek are replayed to the upstream as the first write,
 * so the endpoint sees the full HTTP request as-sent.
 */
function spliceToTcpEndpoint(client: Socket, targetPort: number, initialBytes: Buffer): void {
  client.setNoDelay(true);
  client.setKeepAlive(true);
  client.setTimeout(0);
  // The peek listener has been removed, but pipe() is wired only after connect.
  // Buffer body bytes during that gap; otherwise uploads lose TCP segments.
  client.pause();
  const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true);
  upstream.once('connect', () => {
    if (initialBytes.length > 0) upstream.write(initialBytes);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const tearDown = (): void => {
    client.destroy();
    upstream.destroy();
  };
  upstream.on('error', tearDown);
  client.on('error', tearDown);
  upstream.on('close', tearDown);
  client.on('close', tearDown);
}

/**
 * Decide routing from the first chunk of an incoming HTTP connection:
 *  - `true`  → `GET /ws[...] HTTP/1.x` or `GET /api/stt/stream[...] HTTP/1.x` (WebSocket/stream upgrades), splice to backend
 *  - `false` → any other HTTP method / path, hand to internal HTTP server
 *  - `null`  → need more bytes (no CRLF yet)
 *
 * We only check the request-line; `Upgrade: websocket` is not strictly
 * required — the backend will reject a non-upgrade GET on these paths on its own.
 * Keeping the rule simple means we can decide after the first ~50 bytes
 * instead of waiting for the full header block.
 */
function peekWsRoute(buf: Buffer): boolean | null {
  const newlineIdx = buf.indexOf(0x0a); // \n
  if (newlineIdx < 0) return null;
  const firstLine = buf.slice(0, newlineIdx).toString('ascii');
  return /^GET\s+\/(?:ws|api\/stt\/stream)(?:\?[^\s]*)?\s+HTTP\/1\.[01]\r?$/.test(firstLine);
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
  let webuiDataLifecycleManager: WebuiDataVolumeLifecycleManager | null = null;
  if (opts.webuiDataLifecycle) {
    try {
      webuiDataLifecycleManager = new WebuiDataVolumeLifecycleManager(opts.webuiDataLifecycle);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'CONFIGURATION_INVALID';
      console.warn(`[web-host] WebUI data lifecycle capability unavailable: ${code}`);
    }
  }

  // The HTTP server listens only on loopback — user traffic hits the outer
  // net.Server first. We route to this server for everything except WS
  // upgrades and STT stream upgrades, which go straight to the backend via a raw TCP splice.
  //
  // Why two listeners instead of using `http.Server`'s native `upgrade` event:
  // bun 1.3's http-compat layer does not faithfully forward writes on the
  // socket delivered to the `upgrade` handler, so the backend's 101 response
  // never reaches the browser (see #2824). Making the outer listener pure
  // TCP avoids touching that code path on both bun and node.
  const http_server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      // /api/* — reverse proxy to backend (includes /api/auth/*).
      // /login and /logout are aionui-auth's top-level auth endpoints: proxy them too
      // so WebUI browser clients reach the backend without a path-rewrite.
      if (req.method === 'GET' && (req.url === '/api/auth/user' || req.url.startsWith('/api/auth/user?'))) {
        await forwardAuthUserWithAutoLogin(req, res, opts);
        return;
      }
      if (
        webuiDataLifecycleManager &&
        (await handleWebuiDataLifecycleRequest(req, res, {
          manager: webuiDataLifecycleManager,
          authenticate: (request) => authenticateWebuiRequest(request, opts.backendPort),
        }))
      ) {
        return;
      }
      if (opts.oplRuntimeProxy && req.url.startsWith('/api/opl-runtime/')) {
        const authentication = await authenticateWebuiRequest(req, opts.backendPort);
        if (authentication !== 'authenticated') {
          writeWebuiAuthenticationError(res, authentication);
          return;
        }
        if (await handleOplRuntimeProxyRequest(req, res, opts.oplRuntimeProxy)) return;
      }
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?') || req.url === '/login' || req.url === '/logout') {
        forwardToBackend(req, res, opts.backendPort);
        return;
      }

      // static files + SPA fallback
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      } else {
        res.destroy();
      }
    }
  });

  // Internal HTTP server — 127.0.0.1 ephemeral port, never visible to the user.
  await new Promise<void>((resolve, reject) => {
    http_server.once('error', reject);
    http_server.listen(0, '127.0.0.1', () => {
      http_server.off('error', reject);
      resolve();
    });
  });
  const internalPort = (http_server.address() as { port: number } | null)?.port;
  if (!internalPort) {
    throw new Error('internal HTTP server failed to bind to a port');
  }

  // User-facing listener: inspect the first line of every TCP connection and
  // route to either the backend (for /ws and /api/stt/stream upgrades) or the internal HTTP
  // server (everything else). Both routes use raw TCP splice — no reliance
  // on http.Server's upgrade event.
  const tcp_server = net.createServer((client: Socket) => {
    let peeked = Buffer.alloc(0);
    let settled = false;
    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      client.removeListener('data', onData);
      client.removeListener('error', onEarlyError);
      client.removeListener('end', onEarlyEnd);
    };
    const onData = (chunk: Buffer): void => {
      peeked = Buffer.concat([peeked, chunk]);
      const decision = peekWsRoute(peeked);
      if (decision === null && peeked.length < PEEK_LIMIT_BYTES) return;
      cleanup();
      const target = decision === true ? opts.backendPort : internalPort;
      spliceToTcpEndpoint(client, target, peeked);
    };
    const onEarlyError = (): void => {
      cleanup();
      client.destroy();
    };
    const onEarlyEnd = (): void => {
      // Client closed before we saw a request line — nothing to route.
      cleanup();
      client.destroy();
    };
    client.on('data', onData);
    client.on('error', onEarlyError);
    client.on('end', onEarlyEnd);
  });

  await new Promise<void>((resolve, reject) => {
    tcp_server.once('error', reject);
    tcp_server.listen(port, host, () => {
      tcp_server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (tcp_server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? (getLanIP() ?? undefined) : undefined;
  const localUrl = `http://127.0.0.1:${actualPort}`;
  const networkUrl = lanIP ? `http://${lanIP}:${actualPort}` : undefined;

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop: () =>
      new Promise<void>((resolve) => {
        tcp_server.close(() => {
          http_server.close(() => resolve());
        });
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
