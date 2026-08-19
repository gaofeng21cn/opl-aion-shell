/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

export const REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES = 256 * 1024;
const PROTECTED_BLOB_SCHEMA = 'opl_remote_companion_protected_blob.v1';
const LEGACY_KEY = '__legacy__';

export type ProtectedBlobSafeStorage = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

export type ProtectedBlobFs = {
  mkdirSync: typeof fs.mkdirSync;
  readFileSync: typeof fs.readFileSync;
  writeFileSync: typeof fs.writeFileSync;
  renameSync: typeof fs.renameSync;
  unlinkSync: typeof fs.unlinkSync;
  existsSync: typeof fs.existsSync;
};

export type ProtectedBlobPort = Readonly<{
  read(key: string): Promise<Uint8Array | null>;
  replace(key: string, value: Uint8Array): Promise<void>;
  clear(key: string): Promise<void>;
}>;

export type ProtectedBlobHost = Readonly<{
  forPackage(packageId: string): ProtectedBlobPort;
}>;

export class ProtectedBlobUnavailableError extends Error {
  readonly code = 'protected_blob_unavailable' as const;

  constructor() {
    super('Electron safeStorage is unavailable for the protected Package blob.');
    this.name = 'ProtectedBlobUnavailableError';
  }
}

export class ProtectedBlobInvalidError extends Error {
  readonly code = 'protected_blob_invalid' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ProtectedBlobInvalidError';
  }
}

export type ProtectedBlobAdapterOptions = {
  userDataPath: string;
  packageId: string;
  safeStorageApi?: ProtectedBlobSafeStorage;
  fsApi?: ProtectedBlobFs;
  randomId?: () => string;
};

type ProtectedBlobDocument = {
  schema: typeof PROTECTED_BLOB_SCHEMA;
  entries: Record<string, string>;
};

function packageIdForScope(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value) || value.length > 128) {
    throw new ProtectedBlobInvalidError('Protected blob package id is not a valid scoped id.');
  }
  return value;
}

function keyForScope(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || /\p{Cc}/u.test(value)) {
    throw new ProtectedBlobInvalidError('Protected blob key is not a bounded opaque key.');
  }
  return value;
}

function isSafeStorageAvailable(api: ProtectedBlobSafeStorage): boolean {
  try {
    return api.isEncryptionAvailable() === true;
  } catch {
    return false;
  }
}

function decodeBytes(value: unknown): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ProtectedBlobInvalidError('Protected blob entry is not a canonical opaque encoding.');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new ProtectedBlobInvalidError('Protected blob entry is not a canonical opaque encoding.');
  }
  if (decoded.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
    throw new ProtectedBlobInvalidError('Protected blob exceeds the Package size limit.');
  }
  return decoded;
}

function documentBytes(document: ProtectedBlobDocument): Buffer {
  const encoded = JSON.stringify(document);
  const bytes = Buffer.from(encoded, 'utf8');
  if (bytes.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
    throw new ProtectedBlobInvalidError('Protected blob exceeds the Package size limit.');
  }
  return bytes;
}

export class ProtectedBlobAdapter {
  private readonly storage: ProtectedBlobSafeStorage;
  private readonly fsApi: ProtectedBlobFs;
  private readonly filePath: string;
  private readonly randomId: () => string;

  constructor(options: ProtectedBlobAdapterOptions) {
    const packageId = packageIdForScope(options.packageId);
    const scope = crypto.createHash('sha256').update(packageId, 'utf8').digest('hex');
    const root = path.join(options.userDataPath, 'remote-companion-protected');
    this.filePath = path.join(root, `${scope}.blob`);
    this.storage = options.safeStorageApi ?? safeStorage;
    this.fsApi = options.fsApi ?? fs;
    this.randomId = options.randomId ?? (() => crypto.randomUUID());
  }

  get path(): string {
    return this.filePath;
  }

  get availability(): 'available' | 'unavailable' {
    return isSafeStorageAvailable(this.storage) ? 'available' : 'unavailable';
  }

  /** Compatibility API for the existing Shell-owned opaque blob surface. */
  read(): Buffer | null;
  /** Framework package-host port API. */
  read(key: string): Promise<Uint8Array | null>;
  read(key?: string): Buffer | null | Promise<Uint8Array | null> {
    if (key === undefined) return this.readLegacy();
    return Promise.resolve(this.readKey(key));
  }

  /** Compatibility API for the existing Shell-owned opaque blob surface. */
  replace(value: Uint8Array): void {
    this.assertAvailable();
    const bytes = Buffer.from(value);
    const document: ProtectedBlobDocument = {
      schema: PROTECTED_BLOB_SCHEMA,
      entries: { [LEGACY_KEY]: bytes.toString('base64') },
    };
    this.writeDocument(document);
  }

  /** Compatibility API for the existing Shell-owned opaque blob surface. */
  clear(): void {
    this.assertAvailable();
    if (this.fsApi.existsSync(this.filePath)) this.fsApi.unlinkSync(this.filePath);
  }

  frameworkPort(): ProtectedBlobPort {
    return Object.freeze({
      read: (key: string) => {
        const value = this.readKey(key);
        return Promise.resolve(value === null ? null : new Uint8Array(value));
      },
      replace: (key: string, value: Uint8Array) => {
        this.writeKey(key, value);
        return Promise.resolve();
      },
      clear: (key: string) => {
        this.deleteKey(key);
        return Promise.resolve();
      },
    });
  }

  private readLegacy(): Buffer | null {
    return this.readKey(LEGACY_KEY);
  }

  private readKey(keyValue: string): Buffer | null {
    this.assertAvailable();
    const key = keyForScope(keyValue);
    const document = this.readDocument();
    const encoded = document.entries[key];
    return encoded === undefined ? null : decodeBytes(encoded);
  }

  private writeKey(keyValue: string, value: Uint8Array): void {
    this.assertAvailable();
    const key = keyForScope(keyValue);
    const bytes = Buffer.from(value);
    if (bytes.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
      throw new ProtectedBlobInvalidError('Protected blob exceeds the Package size limit.');
    }
    const current = this.readDocument();
    current.entries[key] = bytes.toString('base64');
    this.writeDocument(current);
  }

  private deleteKey(keyValue: string): void {
    this.assertAvailable();
    const key = keyForScope(keyValue);
    const current = this.readDocument();
    if (!(key in current.entries)) return;
    delete current.entries[key];
    if (Object.keys(current.entries).length === 0) {
      this.clear();
      return;
    }
    this.writeDocument(current);
  }

  private readDocument(): ProtectedBlobDocument {
    if (!this.fsApi.existsSync(this.filePath)) return { schema: PROTECTED_BLOB_SCHEMA, entries: {} };
    this.assertAvailable();
    let parsed: unknown;
    try {
      const encrypted = Buffer.from(this.fsApi.readFileSync(this.filePath));
      parsed = JSON.parse(this.storage.decryptString(encrypted));
    } catch {
      throw new ProtectedBlobInvalidError('Protected blob could not be decrypted.');
    }
    const record =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    const entries = record?.entries;
    if (record?.schema !== PROTECTED_BLOB_SCHEMA || !entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new ProtectedBlobInvalidError('Protected blob document is invalid.');
    }
    const normalized: Record<string, string> = {};
    for (const [key, encoded] of Object.entries(entries)) {
      keyForScope(key);
      decodeBytes(encoded);
      normalized[key] = encoded as string;
    }
    return { schema: PROTECTED_BLOB_SCHEMA, entries: normalized };
  }

  private writeDocument(document: ProtectedBlobDocument): void {
    this.assertAvailable();
    const plaintext = documentBytes(document).toString('utf8');
    const encrypted = this.storage.encryptString(plaintext);
    const root = path.dirname(this.filePath);
    this.fsApi.mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(root, `.${path.basename(this.filePath)}.${this.randomId()}.tmp`);
    try {
      this.fsApi.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
      this.fsApi.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      try {
        if (this.fsApi.existsSync(temporaryPath)) this.fsApi.unlinkSync(temporaryPath);
      } catch {
        // Preserve the original atomic replace failure.
      }
      throw error;
    }
  }

  private assertAvailable(): void {
    if (!isSafeStorageAvailable(this.storage)) throw new ProtectedBlobUnavailableError();
  }
}

export function createProtectedBlobHost(options: Omit<ProtectedBlobAdapterOptions, 'packageId'>): ProtectedBlobHost {
  const adapters = new Map<string, ProtectedBlobAdapter>();
  return Object.freeze({
    forPackage(packageId: string): ProtectedBlobPort {
      const normalized = packageIdForScope(packageId);
      let adapter = adapters.get(normalized);
      if (!adapter) {
        adapter = new ProtectedBlobAdapter({ ...options, packageId: normalized });
        adapters.set(normalized, adapter);
      }
      return adapter.frameworkPort();
    },
  });
}

export { ProtectedBlobAdapter as ElectronProtectedBlobAdapter };
