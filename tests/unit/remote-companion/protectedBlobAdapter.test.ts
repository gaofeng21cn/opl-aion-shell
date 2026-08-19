import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProtectedBlobAdapter,
  ProtectedBlobInvalidError,
  ProtectedBlobUnavailableError,
  REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES,
} from '@/process/services/remote-companion/protectedBlobAdapter';

const roots: string[] = [];

const reverse = (value: string): string => [...value].reduce((output, character) => character + output, '');

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-protected-blob-'));
  roots.push(root);
  return root;
}

function storage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(reverse(Buffer.from(value, 'utf8').toString('base64')), 'utf8'),
    decryptString: (value: Buffer) => Buffer.from(reverse(value.toString('utf8')), 'base64').toString('utf8'),
  };
}

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('ProtectedBlobAdapter', () => {
  it('round-trips opaque bytes through one package-scoped encrypted file', () => {
    const root = tempRoot();
    const first = new ProtectedBlobAdapter({
      userDataPath: root,
      packageId: 'opl-link-desktop-connector',
      safeStorageApi: storage(),
    });
    const second = new ProtectedBlobAdapter({
      userDataPath: root,
      packageId: 'other-package',
      safeStorageApi: storage(),
    });
    const bytes = Buffer.from('opaque bytes, not JSON');

    first.replace(bytes);
    expect(first.read()).toEqual(bytes);
    expect(second.read()).toBeNull();
    expect(first.path).not.toContain('opl-link-desktop-connector');
    expect(fs.readFileSync(first.path).toString('utf8')).not.toContain(bytes.toString('utf8'));

    first.replace(Buffer.from('replacement'));
    expect(first.read()).toEqual(Buffer.from('replacement'));
  });

  it('enforces the plaintext limit and reports safeStorage unavailability explicitly', () => {
    const root = tempRoot();
    const adapter = new ProtectedBlobAdapter({ userDataPath: root, packageId: 'connector', safeStorageApi: storage() });
    expect(() => adapter.replace(Buffer.alloc(REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES + 1))).toThrow(
      ProtectedBlobInvalidError
    );

    const unavailable = new ProtectedBlobAdapter({
      userDataPath: root,
      packageId: 'connector-unavailable',
      safeStorageApi: storage(false),
    });
    expect(unavailable.availability).toBe('unavailable');
    expect(() => unavailable.read()).toThrow(ProtectedBlobUnavailableError);
    expect(() => unavailable.replace(Buffer.from('x'))).toThrow(ProtectedBlobUnavailableError);
    expect(() => unavailable.clear()).toThrow(ProtectedBlobUnavailableError);
  });
});
