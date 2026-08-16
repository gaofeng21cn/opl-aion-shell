import { randomUUID } from 'node:crypto';
import {
  REMOTE_COMPANION_PROTOCOL_VERSION,
  type RemotePairingState,
  type RemoteProviderCredentialProjection,
} from '@/common/types/remoteCompanion';

const BROKER_BASE_PATH = '/v1/remote-companion';

export type RemoteBrokerConfig = {
  baseUrl: string | null;
};

export type BrokerCreatePairingRequest = {
  invitation_code: string;
  desktop_device_id: string;
  desktop_device_label: string;
  desktop_public_key: string;
};

export type BrokerCreatePairingResponse = {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  pairing_id: string;
  desktop_pair_token: string;
  claim_secret: string;
  manual_code: string;
  expires_at: string;
  broker_url: string;
};

export type BrokerReadPairingResponse = {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  pairing_id: string;
  state: RemotePairingState;
  authentication_string: string | null;
  expires_at: string;
  device_activation?: {
    device_id: string;
    device_label?: string;
    peer_device_id?: string;
    peer_device_label?: string;
    provider_user_id?: string;
    peer_provider_user_id?: string;
    peer_public_key?: string;
    sdk_app_id?: string;
    usersig?: string;
    usersig_expires_at?: string;
  };
};

export type BrokerConfirmPairingResponse = {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  pairing_id: string;
  state: RemotePairingState;
};

export type BrokerRevokePairingResponse = {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  pairing_id: string;
  state: RemotePairingState;
  revocation_receipt_id: string;
  revocation_receipt_token: string;
};

export type BrokerRevocationResponse = {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  pairing_id: string;
  state: RemotePairingState;
  desktop_provider_identity_absent: boolean;
  ios_provider_identity_absent: boolean;
  seat_released: boolean;
};

export class RemoteBrokerError extends Error {
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(errorCode: string, retryable: boolean, status: number) {
    super(`Remote broker request failed: ${errorCode}`);
    this.name = 'RemoteBrokerError';
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.status = status;
  }
}

export function readRemoteBrokerConfig(env: NodeJS.ProcessEnv = process.env): RemoteBrokerConfig {
  const configuredBaseUrl = env.OPL_REMOTE_COMPANION_BROKER_URL?.trim() || env.OPL_REMOTE_BROKER_URL?.trim() || null;
  let baseUrl: string | null = null;
  if (configuredBaseUrl) {
    try {
      const url = new URL(configuredBaseUrl);
      if (url.protocol !== 'https:') throw new Error('Remote broker URL must use HTTPS.');
      baseUrl = url.toString().replace(/\/$/u, '');
    } catch {
      baseUrl = null;
    }
  }
  return {
    baseUrl,
  };
}

export type RemoteBrokerClientOptions = {
  config: RemoteBrokerConfig;
  fetchImpl?: typeof fetch;
};

export class RemoteBrokerClient {
  private readonly config: RemoteBrokerConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteBrokerClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return this.config.baseUrl !== null;
  }

  async createPairing(request: BrokerCreatePairingRequest): Promise<BrokerCreatePairingResponse> {
    return this.request<BrokerCreatePairingResponse>('/pairings', {
      method: 'POST',
      body: { protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION, ...request },
      idempotencyKey: randomUUID(),
    });
  }

  async readPairing(pairingId: string, bearerToken: string): Promise<BrokerReadPairingResponse> {
    return this.request<BrokerReadPairingResponse>(`/pairings/${encodeURIComponent(pairingId)}`, {
      method: 'GET',
      bearerToken,
    });
  }

  async confirmPairing(
    pairingId: string,
    bearerToken: string,
    authenticationString: string
  ): Promise<BrokerConfirmPairingResponse> {
    return this.request<BrokerConfirmPairingResponse>(`/pairings/${encodeURIComponent(pairingId)}/confirm`, {
      method: 'POST',
      bearerToken,
      body: {
        protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
        authentication_string: authenticationString,
      },
      idempotencyKey: randomUUID(),
    });
  }

  async refreshProviderCredentials(
    pairingId: string,
    bearerToken: string,
    deviceId: string
  ): Promise<RemoteProviderCredentialProjection> {
    return this.request<RemoteProviderCredentialProjection>(`/pairings/${encodeURIComponent(pairingId)}/credentials`, {
      method: 'POST',
      bearerToken,
      body: { protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION, device_id: deviceId },
      idempotencyKey: randomUUID(),
    });
  }

  async revokePair(pairingId: string, bearerToken: string): Promise<BrokerRevokePairingResponse> {
    return this.request<BrokerRevokePairingResponse>(`/pairings/${encodeURIComponent(pairingId)}`, {
      method: 'DELETE',
      bearerToken,
      idempotencyKey: randomUUID(),
    });
  }

  async readRevocation(receiptId: string, receiptToken: string): Promise<BrokerRevocationResponse> {
    return this.request<BrokerRevocationResponse>(`/revocations/${encodeURIComponent(receiptId)}`, {
      method: 'GET',
      bearerToken: receiptToken,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE';
      bearerToken?: string;
      idempotencyKey?: string;
      body?: unknown;
    }
  ): Promise<T> {
    if (!this.config.baseUrl) throw new RemoteBrokerError('provider_unavailable', true, 503);
    const url = new URL(`${BROKER_BASE_PATH}${path}`, `${this.config.baseUrl}/`);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new RemoteBrokerError('provider_unavailable', true, 503);
    }
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      throw new RemoteBrokerError(
        typeof error.error_code === 'string' ? error.error_code : 'internal_error',
        error.retryable === true,
        response.status
      );
    }
    if (!parsed || typeof parsed !== 'object') throw new RemoteBrokerError('internal_error', false, response.status);
    return parsed as T;
  }
}

export const __remoteBrokerTest = { BROKER_BASE_PATH };
