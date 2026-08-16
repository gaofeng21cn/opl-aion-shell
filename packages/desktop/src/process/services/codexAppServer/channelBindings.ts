import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type ChannelConversationIdentity = Readonly<{
  provider_id: string;
  account_id: string;
  channel_session_id: string;
}>;

export type ChannelThreadBinding = ChannelConversationIdentity &
  Readonly<{
    canonical_thread_host: string;
    canonical_thread_id: string;
  }>;

export type ChannelThreadRef = Pick<ChannelThreadBinding, 'canonical_thread_host' | 'canonical_thread_id'>;

export type ChannelBindingStore = Readonly<{
  getOrCreate(
    identity: ChannelConversationIdentity,
    create: () => Promise<ChannelThreadRef>
  ): Promise<Readonly<{ binding: ChannelThreadBinding; created: boolean }>>;
  assertKnownThread(thread: ChannelThreadRef): Promise<void>;
}>;

type BindingDocument = Readonly<{
  schema: 'opl_app_transport_bindings_adapter_state.v1';
  bindings: readonly ChannelThreadBinding[];
}>;

const BINDING_SCHEMA = 'opl_app_transport_bindings_adapter_state.v1';

function requiredExactString(value: unknown, field: keyof ChannelThreadBinding): string {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new Error(`Invalid channel binding ${field}.`);
  }
  return value;
}

function parseBinding(value: unknown): ChannelThreadBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid channel binding record.');
  }
  const record = value as Record<string, unknown>;
  const providerId = requiredExactString(record.provider_id, 'provider_id');
  if (/\s/.test(providerId)) throw new Error('Invalid channel binding provider_id.');
  return {
    provider_id: providerId,
    account_id: requiredExactString(record.account_id, 'account_id'),
    channel_session_id: requiredExactString(record.channel_session_id, 'channel_session_id'),
    canonical_thread_host: requiredExactString(record.canonical_thread_host, 'canonical_thread_host'),
    canonical_thread_id: requiredExactString(record.canonical_thread_id, 'canonical_thread_id'),
  };
}

function bindingKey(identity: ChannelConversationIdentity): string {
  const providerId = requiredExactString(identity.provider_id, 'provider_id');
  if (/\s/.test(providerId)) throw new Error('Invalid channel binding provider_id.');
  return JSON.stringify([
    providerId,
    requiredExactString(identity.account_id, 'account_id'),
    requiredExactString(identity.channel_session_id, 'channel_session_id'),
  ]);
}

function threadKey(thread: ChannelThreadRef): string {
  return JSON.stringify([
    requiredExactString(thread.canonical_thread_host, 'canonical_thread_host'),
    requiredExactString(thread.canonical_thread_id, 'canonical_thread_id'),
  ]);
}

function parseDocument(value: unknown): BindingDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid channel binding document.');
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== BINDING_SCHEMA || !Array.isArray(record.bindings)) {
    throw new Error('Unsupported channel binding document.');
  }
  const bindings = record.bindings.map(parseBinding);
  const keys = new Set<string>();
  for (const binding of bindings) {
    const key = bindingKey(binding);
    if (keys.has(key)) throw new Error('Duplicate exact channel binding identity.');
    keys.add(key);
  }
  return { schema: BINDING_SCHEMA, bindings };
}

export class FileChannelBindingStore implements ChannelBindingStore {
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async getOrCreate(
    identity: ChannelConversationIdentity,
    create: () => Promise<ChannelThreadRef>
  ): Promise<Readonly<{ binding: ChannelThreadBinding; created: boolean }>> {
    const key = bindingKey(identity);
    const operation = this.writeTail.then(async () => {
      const document = await this.read();
      const existing = document.bindings.find((entry) => bindingKey(entry) === key);
      if (existing) return { binding: existing, created: false } as const;
      const thread = await create();
      const binding = parseBinding({ ...identity, ...thread });
      const canonicalThreadKey = threadKey(binding);
      if (document.bindings.some((entry) => threadKey(entry) === canonicalThreadKey)) {
        throw new Error('Canonical channel thread is already bound to another identity.');
      }
      await this.write({ schema: BINDING_SCHEMA, bindings: [...document.bindings, binding] });
      return { binding, created: true } as const;
    });
    this.writeTail = operation.then(
      (): void => undefined,
      (): void => undefined
    );
    return await operation;
  }

  async assertKnownThread(thread: ChannelThreadRef): Promise<void> {
    const expected = threadKey(thread);
    const operation = this.writeTail.then(async () => {
      const document = await this.read();
      if (!document.bindings.some((binding) => threadKey(binding) === expected)) {
        throw new Error('Canonical channel thread has no exact binding.');
      }
    });
    this.writeTail = operation.then(
      (): void => undefined,
      (): void => undefined
    );
    return await operation;
  }

  private async read(): Promise<BindingDocument> {
    try {
      return parseDocument(JSON.parse(await fs.readFile(this.filePath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schema: BINDING_SCHEMA, bindings: [] };
      }
      throw error;
    }
  }

  private async write(document: BindingDocument): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    const temporaryPath = path.join(directory, `.${path.basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, this.filePath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
}

export const __channelBindingsTest = {
  BINDING_SCHEMA,
  bindingKey,
  parseDocument,
  threadKey,
};
