import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { RemotePairingState } from '@/common/types/remoteCompanion';
import type { BrokerCreatePairingRequest } from './brokerClient';
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
  sdk_app_id: number;
  usersig_expires_at: string | null;
  provider_refresh_idempotency_key?: string;
  revocation_idempotency_key?: string;
  revocation_receipt_id?: string;
  revocation_receipt_token?: string;
};

export type RemotePendingPairingRecord = {
  operation_idempotency_key: string;
  request: BrokerCreatePairingRequest;
  desktop_key_material: X25519KeyMaterial;
  pairing_id: string | null;
  desktop_pair_token: string | null;
  claim_secret: string | null;
  manual_code: string | null;
  broker_url: string | null;
  expires_at: string | null;
  state: 'creating' | RemotePairingState;
  authentication_string: string | null;
  confirm_idempotency_key?: string;
  revocation_idempotency_key?: string;
};

export interface RemoteCredentialStore {
  list(): Promise<RemoteCredentialRecord[]>;
  replace(records: RemoteCredentialRecord[]): Promise<void>;
  readPendingPairing(): Promise<RemotePendingPairingRecord | null>;
  replacePendingPairing(pairing: RemotePendingPairingRecord | null): Promise<void>;
}

type CredentialDocument = {
  schema: typeof CREDENTIAL_SCHEMA;
  records: RemoteCredentialRecord[];
  pending_pairing: RemotePendingPairingRecord | null;
};

export class RemoteCredentialStoreUnavailableError extends Error {
  constructor() {
    super('The operating system credential facility is unavailable.');
    this.name = 'RemoteCredentialStoreUnavailableError';
  }
}

export class ElectronRemoteCredentialStore implements RemoteCredentialStore {
  private readonly filePath: string;
  private document: CredentialDocument | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'remote-companion-credentials.bin');
  }

  async list(): Promise<RemoteCredentialRecord[]> {
    const document = this.readDocument();
    this.document = document;
    return document.records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }

  async readPendingPairing(): Promise<RemotePendingPairingRecord | null> {
    const document = this.document ?? this.readDocument();
    this.document = document;
    return clonePendingPairing(document.pending_pairing);
  }

  async replace(records: RemoteCredentialRecord[]): Promise<void> {
    const current = this.document ?? this.readDocument();
    await this.writeDocument({ schema: CREDENTIAL_SCHEMA, records, pending_pairing: current.pending_pairing });
  }

  async replacePendingPairing(pairing: RemotePendingPairingRecord | null): Promise<void> {
    const current = this.document ?? this.readDocument();
    await this.writeDocument({ schema: CREDENTIAL_SCHEMA, records: current.records, pending_pairing: pairing });
  }

  private async writeDocument(document: CredentialDocument): Promise<void> {
    this.requireEncryption();
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
    this.document = document;
  }

  private readDocument(): CredentialDocument {
    if (!fs.existsSync(this.filePath)) {
      return { schema: CREDENTIAL_SCHEMA, records: [], pending_pairing: null };
    }
    this.requireEncryption();
    try {
      const encrypted = fs.readFileSync(this.filePath);
      const parsed: unknown = JSON.parse(safeStorage.decryptString(encrypted));
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid document.');
      const document = parsed as Partial<CredentialDocument>;
      if (document.schema !== CREDENTIAL_SCHEMA || !Array.isArray(document.records))
        throw new Error('Invalid document.');
      return {
        schema: CREDENTIAL_SCHEMA,
        records: document.records as RemoteCredentialRecord[],
        pending_pairing:
          document.pending_pairing && typeof document.pending_pairing === 'object'
            ? (document.pending_pairing as RemotePendingPairingRecord)
            : null,
      };
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
  private pendingPairing: RemotePendingPairingRecord | null;

  constructor(records: RemoteCredentialRecord[] = [], pendingPairing: RemotePendingPairingRecord | null = null) {
    this.records = records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
    this.pendingPairing = clonePendingPairing(pendingPairing);
  }

  async list(): Promise<RemoteCredentialRecord[]> {
    return this.records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }

  async replace(records: RemoteCredentialRecord[]): Promise<void> {
    this.records = records.map((record) => ({ ...record, desktop_key_material: { ...record.desktop_key_material } }));
  }

  async readPendingPairing(): Promise<RemotePendingPairingRecord | null> {
    return clonePendingPairing(this.pendingPairing);
  }

  async replacePendingPairing(pairing: RemotePendingPairingRecord | null): Promise<void> {
    this.pendingPairing = clonePendingPairing(pairing);
  }
}

function clonePendingPairing(
  pairing: RemotePendingPairingRecord | null | undefined
): RemotePendingPairingRecord | null {
  if (!pairing) return null;
  return {
    ...pairing,
    request: { ...pairing.request },
    desktop_key_material: { ...pairing.desktop_key_material },
  };
}
