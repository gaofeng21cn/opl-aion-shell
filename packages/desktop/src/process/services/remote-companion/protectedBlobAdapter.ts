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

function packageIdForScope(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value) || value.length > 128) {
    throw new ProtectedBlobInvalidError('Protected blob package id is not a valid scoped id.');
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

function decodePlaintext(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ProtectedBlobInvalidError('Protected blob plaintext is not a valid opaque encoding.');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new ProtectedBlobInvalidError('Protected blob plaintext is not a canonical opaque encoding.');
  }
  if (decoded.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
    throw new ProtectedBlobInvalidError('Protected blob exceeds the Package size limit.');
  }
  return decoded;
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

  read(): Buffer | null {
    this.assertAvailable();
    if (!this.fsApi.existsSync(this.filePath)) return null;
    let encrypted: Buffer;
    try {
      encrypted = Buffer.from(this.fsApi.readFileSync(this.filePath));
    } catch (error) {
      throw new ProtectedBlobInvalidError(
        `Protected blob could not be read: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
    let plaintext: string;
    try {
      plaintext = this.storage.decryptString(encrypted);
    } catch {
      throw new ProtectedBlobInvalidError('Protected blob could not be decrypted.');
    }
    return decodePlaintext(plaintext);
  }

  replace(value: Uint8Array): void {
    this.assertAvailable();
    const bytes = Buffer.from(value);
    if (bytes.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
      throw new ProtectedBlobInvalidError('Protected blob exceeds the Package size limit.');
    }
    const encrypted = this.storage.encryptString(bytes.toString('base64'));
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

  clear(): void {
    this.assertAvailable();
    if (this.fsApi.existsSync(this.filePath)) this.fsApi.unlinkSync(this.filePath);
  }

  private assertAvailable(): void {
    if (!isSafeStorageAvailable(this.storage)) throw new ProtectedBlobUnavailableError();
  }
}

export { ProtectedBlobAdapter as ElectronProtectedBlobAdapter };
