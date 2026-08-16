import { describe, expect, it, vi } from 'vitest';
import {
  RemoteBrokerClient,
  RemoteBrokerError,
  readRemoteBrokerConfig,
} from '@/process/services/remote-companion/brokerClient';
import { REMOTE_COMPANION_PROTOCOL_VERSION } from '@/common/types/remoteCompanion';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RemoteBrokerClient', () => {
  it('normalizes HTTPS configuration and rejects non-HTTPS endpoints', () => {
    expect(
      readRemoteBrokerConfig({
        OPL_REMOTE_COMPANION_BROKER_URL: 'https://broker.example.test/',
        OPL_TENCENT_SDK_APP_ID: 'sdk-001',
      } as NodeJS.ProcessEnv)
    ).toEqual({ baseUrl: 'https://broker.example.test' });
    expect(
      readRemoteBrokerConfig({
        OPL_REMOTE_COMPANION_BROKER_URL: 'http://broker.example.test',
        OPL_TENCENT_SDK_APP_ID: 'sdk-001',
      } as NodeJS.ProcessEnv).baseUrl
    ).toBeNull();
  });

  it('uses the canonical route, idempotency header, and body version for mutations', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
        pairing_id: 'pair-test-001',
        desktop_pair_token: 'desktop-token-001',
        claim_secret: 'claim-secret-001',
        manual_code: 'manual-001',
        expires_at: '2026-08-17T12:00:00.000Z',
        broker_url: 'https://broker.example.test',
      })
    );
    const client = new RemoteBrokerClient({
      config: { baseUrl: 'https://broker.example.test' },
      fetchImpl,
    });

    await client.createPairing({
      invitation_code: 'invitation-001',
      desktop_device_id: 'desktop-test-device',
      desktop_device_label: 'This desktop',
      desktop_public_key: '3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08',
    });

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) throw new Error('Expected the broker request to be captured.');
    const [url, init] = firstCall;
    expect(init).toBeDefined();
    if (!init) throw new Error('Expected the broker request init to be captured.');
    expect(String(url)).toBe('https://broker.example.test/v1/remote-companion/pairings');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      accept: 'application/json',
      'content-type': 'application/json',
    });
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/u);
    expect(JSON.parse(String(init.body))).toEqual({
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      invitation_code: 'invitation-001',
      desktop_device_id: 'desktop-test-device',
      desktop_device_label: 'This desktop',
      desktop_public_key: '3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08',
    });
    expect(String(url)).not.toContain('invitation-001');
  });

  it('keeps bearer tokens in the Authorization header and never in the URL', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
          pairing_id: 'pair-test-001',
          state: 'awaiting_desktop_confirmation',
          authentication_string: '867 604',
          expires_at: '2026-08-17T12:00:00.000Z',
        })
      )
      .mockResolvedValueOnce(
        response({
          protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
          pairing_id: 'pair-test-001',
          state: 'revoked',
          desktop_provider_identity_absent: true,
          ios_provider_identity_absent: true,
          seat_released: true,
        })
      );
    const client = new RemoteBrokerClient({
      config: { baseUrl: 'https://broker.example.test' },
      fetchImpl,
    });

    await client.readPairing('pair-test-001', 'desktop-token-001');
    await client.readRevocation('receipt-001', 'receipt-token-001');

    expect(fetchImpl.mock.calls).toHaveLength(2);
    const firstRequest = fetchImpl.mock.calls[0]?.[1];
    const secondRequest = fetchImpl.mock.calls[1]?.[1];
    expect(firstRequest).toBeDefined();
    expect(secondRequest).toBeDefined();
    if (!firstRequest || !secondRequest) throw new Error('Expected both broker requests to be captured.');
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://broker.example.test/v1/remote-companion/pairings/pair-test-001'
    );
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      'https://broker.example.test/v1/remote-companion/revocations/receipt-001'
    );
    expect((firstRequest.headers as Record<string, string>).authorization).toBe('Bearer desktop-token-001');
    expect((secondRequest.headers as Record<string, string>).authorization).toBe('Bearer receipt-token-001');
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain('desktop-token-001');
    expect(String(fetchImpl.mock.calls[1][0])).not.toContain('receipt-token-001');
  });

  it('reuses the supplied idempotency key across a mutation retry', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      response({
        protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
        pairing_id: 'pair-test-001',
        state: 'revoking',
        revocation_receipt_id: 'receipt-001',
        revocation_receipt_token: 'receipt-token-001',
      })
    );
    const client = new RemoteBrokerClient({
      config: { baseUrl: 'https://broker.example.test' },
      fetchImpl,
    });

    await client.revokePair('pair-test-001', 'desktop-token-001', 'revoke-operation-001');
    await client.revokePair('pair-test-001', 'desktop-token-001', 'revoke-operation-001');

    expect(fetchImpl.mock.calls).toHaveLength(2);
    const firstCall = fetchImpl.mock.calls[0];
    const secondCall = fetchImpl.mock.calls[1];
    if (!firstCall?.[1] || !secondCall?.[1]) throw new Error('Expected both broker mutation requests to include init.');
    const firstHeaders = firstCall[1].headers as Record<string, string>;
    const secondHeaders = secondCall[1].headers as Record<string, string>;
    expect(firstHeaders['idempotency-key']).toBe('revoke-operation-001');
    expect(secondHeaders['idempotency-key']).toBe('revoke-operation-001');
  });

  it('preserves broker error code and retryability without echoing secret request data', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        {
          protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
          error_code: 'invitation_invalid',
          retryable: false,
          request_id: 'request-001',
          invitation_code: 'must-not-be-echoed',
        },
        400
      )
    );
    const client = new RemoteBrokerClient({
      config: { baseUrl: 'https://broker.example.test' },
      fetchImpl,
    });

    const caught = await client.readPairing('pair-test-001', 'desktop-token-001').catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(RemoteBrokerError);
    expect(caught).toMatchObject({ errorCode: 'invitation_invalid', retryable: false, status: 400 });
    expect((caught as Error).message).not.toContain('must-not-be-echoed');
    expect((caught as Error).message).not.toContain('desktop-token-001');
  });
});
