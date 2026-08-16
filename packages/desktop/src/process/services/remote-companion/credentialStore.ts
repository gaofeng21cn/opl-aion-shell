import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { RemotePairingState } from '@/common/types/remoteCompanion';
import type { X25519KeyMaterial } from './crypto';

const CREDENTIAL_SCHEMA = 'opl_remote_companion_credentials.v1';

export type RemoteCredentialRecord = {
  pair_id: string;
  desktop_device_id: string;
  desktop_label: string;
  peer_device_id: string;
  peer_device_label: string;
  state: Extract<RemotePairingState, 'active' | 'revoking' | 'provider_reclaim_pending'>;
  authentication_string: string;
  key_epoch: number;
  desktop_key_material: X25519KeyMaterial;
  peer_public_key: string;
  desktop_sender_sequence: number;
  last_inbound_sequence?: number;
  seen_inbound_nonces?: string[];
  device_credential: string;
  provider_user_id: string;
  peer_provider_user_id: string;
  sdk_app_id: string;
  usersig_expires_at: string | null;
};

export interface RemoteCredentialStore {
  list(): Promise<RemoteCredentialRecord[]>;
  replace(records: RemoteCredentialRecord[]): Promise<void>;
}

type CredentialDocument = {
  schema: typeof CREDENTIAL_SCHEMA;
  records: RemoteCredentialRecord[];
};

export class RemoteCredentialStoreUnavailableError extends Error {
  constructor() {
    super('The operating system credential facility is unavailable.');
    this.name = 'RemoteCredentialStoreUnavailableError';
  }
}

export class ElectronRemoteCredentialStore implements RemoteCredentialStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'remote-companion-credentials.bin');
  }

  async list(): Promise<RemoteCredentialRecord[]> {
    if (!fs.existsSync(this.filePath)) return [];
    const document = this.readDocument();
    return document.records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }

  async replace(records: RemoteCredentialRecord[]): Promise<void> {
    this.requireEncryption();
    const document: CredentialDocument = { schema: CREDENTIAL_SCHEMA, records };
    const encrypted = safeStorage.encryptString(JSON.stringify(document));
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
      fs.renameSync(temporaryPath, this.filePath);
      fs.chmodSync(this.filePath, 0o600);
    } finally {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
  }

  private readDocument(): CredentialDocument {
    this.requireEncryption();
    try {
      const encrypted = fs.readFileSync(this.filePath);
      const parsed: unknown = JSON.parse(safeStorage.decryptString(encrypted));
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid document.');
      const document = parsed as Partial<CredentialDocument>;
      if (document.schema !== CREDENTIAL_SCHEMA || !Array.isArray(document.records))
        throw new Error('Invalid document.');
      return { schema: CREDENTIAL_SCHEMA, records: document.records as RemoteCredentialRecord[] };
    } catch {
      throw new Error('Unable to read protected OPL Link credentials.');
    }
  }

  private requireEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) throw new RemoteCredentialStoreUnavailableError();
  }
}

export class InMemoryRemoteCredentialStore implements RemoteCredentialStore {
  private records: RemoteCredentialRecord[];

  constructor(records: RemoteCredentialRecord[] = []) {
    this.records = records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }

  async list(): Promise<RemoteCredentialRecord[]> {
    return this.records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }

  async replace(records: RemoteCredentialRecord[]): Promise<void> {
    this.records = records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }
}
