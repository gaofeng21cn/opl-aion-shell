import TencentCloudChat from '@tencentcloud/chat';
import {
  isValidRemoteSdkAppId,
  type RemoteProviderCredentialProjection,
  type RemoteTransportEnvelope,
} from '@/common/types/remoteCompanion';

export type RemoteTransportMessageListener = (input: {
  pair_id: string;
  sender_device_id: string;
  envelope: RemoteTransportEnvelope;
}) => void | Promise<void>;

/** Provider-neutral connector surface consumed by the OPL Link service. */
export interface RemoteTransportAdapter {
  readonly provider: 'tencent_cloud_im';
  connect(pairId: string, credentials: RemoteProviderCredentialProjection): Promise<void>;
  disconnect(pairId: string): Promise<void>;
  send(pairId: string, envelope: RemoteTransportEnvelope): Promise<void>;
  onMessage(listener: RemoteTransportMessageListener): () => void;
}

type TencentChatEvent = { data?: unknown };

type TencentChatMessage = {
  type?: unknown;
  from?: unknown;
  payload?: unknown;
};

type TencentChatInstance = {
  login(input: { userID: string; userSig: string }): Promise<unknown>;
  logout(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): boolean;
  on(eventName: string, handler: (event: TencentChatEvent) => void): void;
  off(eventName: string, handler: (event: TencentChatEvent) => void): void;
  createCustomMessage(input: {
    to: string;
    conversationType: string;
    payload: { data: string; description: string; extension: string };
  }): TencentChatMessage;
  sendMessage(message: TencentChatMessage): Promise<unknown>;
};

export type TencentCloudChatSdk = {
  create(input: { SDKAppID: number }): TencentChatInstance;
  TYPES: { MSG_CUSTOM: string; CONV_C2C: string };
  EVENT: { SDK_READY: string; SDK_NOT_READY: string; MESSAGE_RECEIVED: string };
};

const OFFICIAL_TENCENT_CLOUD_CHAT = TencentCloudChat as unknown as TencentCloudChatSdk;
const READY_TIMEOUT_MS = 15_000;

export interface TencentCloudImGateway {
  connect(input: RemoteProviderCredentialProjection & { pair_id: string }): Promise<void>;
  disconnect(pairId: string): Promise<void>;
  sendPairCustomMessage(input: { pair_id: string; body: string }): Promise<void>;
  onPairCustomMessage(
    listener: (input: { pair_id: string; sender_device_id: string; body: string }) => void | Promise<void>
  ): () => void;
}

export class TencentCloudImUnavailableError extends Error {
  constructor(message = 'Tencent Cloud Chat transport is unavailable on this desktop.') {
    super(message);
    this.name = 'TencentCloudImUnavailableError';
  }
}

/**
 * Thin main-process boundary around the official Tencent Cloud Chat SDK.
 * Pair identity and encrypted envelope handling stay outside this provider file.
 */
export class TencentCloudImSdkGateway implements TencentCloudImGateway {
  private readonly sessions = new Map<
    string,
    {
      sdkAppId: number;
      providerUserId: string;
      peerProviderUserId: string;
      chat: TencentChatInstance;
      messageHandler: (event: TencentChatEvent) => void;
    }
  >();

  private readonly listeners = new Set<
    (input: { pair_id: string; sender_device_id: string; body: string }) => void | Promise<void>
  >();

  constructor(private readonly sdk: TencentCloudChatSdk = OFFICIAL_TENCENT_CLOUD_CHAT) {}

  async connect(input: RemoteProviderCredentialProjection & { pair_id: string }): Promise<void> {
    if (input.provider !== 'tencent_cloud_im') throw new TencentCloudImUnavailableError('Unsupported IM provider.');
    if (!isValidRemoteSdkAppId(input.sdk_app_id)) {
      throw new TencentCloudImUnavailableError('Tencent Cloud SDKAppID is invalid.');
    }
    const sdkAppId = input.sdk_app_id;
    if (!input.provider_user_id.trim() || !input.peer_provider_user_id.trim() || !input.usersig.trim()) {
      throw new TencentCloudImUnavailableError('Tencent Cloud pair credentials are incomplete.');
    }

    await this.disconnect(input.pair_id);
    for (const session of this.sessions.values()) {
      if (session.sdkAppId === sdkAppId) {
        throw new TencentCloudImUnavailableError(
          'Tencent Cloud Chat permits one active SDK session per SDKAppID in this desktop process.'
        );
      }
    }

    const chat = this.sdk.create({ SDKAppID: sdkAppId });
    const messageHandler = (event: TencentChatEvent) => {
      void this.handleMessages({
        pairId: input.pair_id,
        peerProviderUserId: input.peer_provider_user_id,
        event,
      });
    };
    chat.on(this.sdk.EVENT.MESSAGE_RECEIVED, messageHandler);
    try {
      await this.waitUntilReady(chat, () => chat.login({ userID: input.provider_user_id, userSig: input.usersig }));
      this.sessions.set(input.pair_id, {
        sdkAppId,
        providerUserId: input.provider_user_id,
        peerProviderUserId: input.peer_provider_user_id,
        chat,
        messageHandler,
      });
    } catch (error) {
      chat.off(this.sdk.EVENT.MESSAGE_RECEIVED, messageHandler);
      await this.destroyChat(chat);
      throw error;
    }
  }

  async disconnect(pairId: string): Promise<void> {
    const session = this.sessions.get(pairId);
    if (!session) return;
    this.sessions.delete(pairId);
    session.chat.off(this.sdk.EVENT.MESSAGE_RECEIVED, session.messageHandler);
    try {
      await session.chat.logout();
    } finally {
      await this.destroyChat(session.chat);
    }
  }

  async sendPairCustomMessage(input: { pair_id: string; body: string }): Promise<void> {
    const session = this.sessions.get(input.pair_id);
    if (!session || !session.chat.isReady()) throw new TencentCloudImUnavailableError();
    const message = session.chat.createCustomMessage({
      to: session.peerProviderUserId,
      conversationType: this.sdk.TYPES.CONV_C2C,
      payload: {
        data: input.body,
        description: 'opl_remote_transport.v1',
        extension: input.pair_id,
      },
    });
    await session.chat.sendMessage(message);
  }

  onPairCustomMessage(
    listener: (input: { pair_id: string; sender_device_id: string; body: string }) => void | Promise<void>
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async waitUntilReady(chat: TencentChatInstance, login: () => Promise<unknown>): Promise<void> {
    if (chat.isReady()) return;
    let readyHandler: ((event: TencentChatEvent) => void) | null = null;
    let notReadyHandler: ((event: TencentChatEvent) => void) | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const ready = new Promise<void>((resolve, reject) => {
      readyHandler = () => resolve();
      notReadyHandler = () => reject(new TencentCloudImUnavailableError('Tencent Cloud Chat did not become ready.'));
      chat.on(this.sdk.EVENT.SDK_READY, readyHandler);
      chat.on(this.sdk.EVENT.SDK_NOT_READY, notReadyHandler);
      timeout = setTimeout(
        () => reject(new TencentCloudImUnavailableError('Tencent Cloud Chat readiness timed out.')),
        READY_TIMEOUT_MS
      );
    });
    try {
      await login();
      if (!chat.isReady()) await ready;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (readyHandler) chat.off(this.sdk.EVENT.SDK_READY, readyHandler);
      if (notReadyHandler) chat.off(this.sdk.EVENT.SDK_NOT_READY, notReadyHandler);
    }
  }

  private async handleMessages(input: {
    pairId: string;
    peerProviderUserId: string;
    event: TencentChatEvent;
  }): Promise<void> {
    if (!Array.isArray(input.event.data)) return;
    for (const candidate of input.event.data) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const message = candidate as TencentChatMessage;
      if (message.type !== this.sdk.TYPES.MSG_CUSTOM || message.from !== input.peerProviderUserId) continue;
      if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) continue;
      const payload = message.payload as Record<string, unknown>;
      if (payload.extension !== input.pairId || typeof payload.data !== 'string') continue;
      let envelope: unknown;
      try {
        envelope = JSON.parse(payload.data);
      } catch {
        continue;
      }
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) continue;
      const senderDeviceId = (envelope as Record<string, unknown>).sender_device_id;
      if (typeof senderDeviceId !== 'string' || !senderDeviceId) continue;
      for (const listener of this.listeners) {
        await listener({ pair_id: input.pairId, sender_device_id: senderDeviceId, body: payload.data });
      }
    }
  }

  private async destroyChat(chat: TencentChatInstance): Promise<void> {
    try {
      await chat.destroy();
    } catch {
      // A failed provider cleanup must not hide the original connection result.
    }
  }
}

/** Explicit test/degraded boundary; production bridge uses the official SDK gateway above. */
export class UnavailableTencentCloudImGateway implements TencentCloudImGateway {
  async connect(): Promise<void> {
    throw new TencentCloudImUnavailableError();
  }

  async disconnect(): Promise<void> {
    return undefined;
  }

  async sendPairCustomMessage(): Promise<void> {
    throw new TencentCloudImUnavailableError();
  }

  onPairCustomMessage(): () => void {
    return () => undefined;
  }
}

export class TencentCloudImAdapter implements RemoteTransportAdapter {
  readonly provider = 'tencent_cloud_im' as const;
  private readonly gateway: TencentCloudImGateway;

  constructor(gateway: TencentCloudImGateway = new TencentCloudImSdkGateway()) {
    this.gateway = gateway;
  }

  async connect(pairId: string, credentials: RemoteProviderCredentialProjection): Promise<void> {
    await this.gateway.connect({ pair_id: pairId, ...credentials });
  }

  async disconnect(pairId: string): Promise<void> {
    await this.gateway.disconnect(pairId);
  }

  async send(pairId: string, envelope: RemoteTransportEnvelope): Promise<void> {
    await this.gateway.sendPairCustomMessage({ pair_id: pairId, body: JSON.stringify(envelope) });
  }

  onMessage(listener: RemoteTransportMessageListener): () => void {
    return this.gateway.onPairCustomMessage(async ({ pair_id, sender_device_id, body }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      await listener({
        pair_id,
        sender_device_id,
        envelope: parsed as RemoteTransportEnvelope,
      });
    });
  }
}
