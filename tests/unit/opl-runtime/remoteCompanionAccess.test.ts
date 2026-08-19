import { describe, expect, it } from 'vitest';
import {
  prepareOplRemoteCompanionAccessActionInput,
  readOplRemoteCompanionAccessResult,
} from '@/common/types/opl/remoteCompanionAccess';

function action(commandId: string, input: Record<string, unknown> = {}) {
  return { command_id: commandId, input };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'qr_ready',
    actions: [action('pair.confirm', { pairing_id: 'pair-001', authentication_digits: '123456' })],
    pairing: {
      pairing_id: 'pair-001',
      expires_at: '2026-08-19T01:00:00.000Z',
      qr_payload: 'https://example.test/pairing/opaque',
      manual_code: '01ARZ3NDEKTS',
    },
    ...overrides,
  };
}

describe('remote_companion_access result parser', () => {
  it('accepts the QR state and keeps pairing material in the returned interaction projection', () => {
    const parsed = readOplRemoteCompanionAccessResult(result());
    expect(parsed).toMatchObject({
      status: 'qr_ready',
      pairing: { pairingId: 'pair-001', manualCode: '01ARZ3NDEKTS' },
      actions: [{ commandId: 'pair.confirm', input: { pairing_id: 'pair-001', authentication_digits: '123456' } }],
    });
  });

  it('accepts six authentication digits only in awaiting_confirmation', () => {
    const parsed = readOplRemoteCompanionAccessResult({
      ...result(),
      status: 'awaiting_confirmation',
      pairing: {
        pairing_id: 'pair-001',
        expires_at: '2026-08-19T01:00:00.000Z',
        authentication_digits: '123456',
      },
      actions: [action('pair.confirm', { pairing_id: 'pair-001', authentication_digits: '123456' })],
    });
    expect(parsed).toMatchObject({ status: 'awaiting_confirmation', pairing: { authenticationDigits: '123456' } });
    const confirmAction = parsed?.status === 'awaiting_confirmation' ? parsed.actions[0] : null;
    expect(confirmAction && prepareOplRemoteCompanionAccessActionInput(confirmAction, parsed.pairing)).toEqual({
      pairing_id: 'pair-001',
      authentication_digits: '123456',
    });
  });

  it('rejects secret fields in projected action input and malformed state shapes', () => {
    expect(
      readOplRemoteCompanionAccessResult(
        result({ actions: [action('pair.confirm', { pairing_id: 'pair-001', authentication_string: '123 456' })] })
      )
    ).toBeNull();
    const unpairedWithPairing = { ...result(), status: 'unpaired' } as Record<string, unknown>;
    delete unpairedWithPairing.pairing;
    expect(readOplRemoteCompanionAccessResult({ ...unpairedWithPairing, pairing: result().pairing })).toBeNull();
    expect(
      readOplRemoteCompanionAccessResult({
        schema_version: 'opl-app-remote-companion-access.v1',
        status: 'unavailable',
        actions: [],
        unavailable_reason: 'safe_storage_unavailable',
        state: 'unavailable',
      })
    ).toBeNull();
    expect(
      readOplRemoteCompanionAccessResult({
        ...result(),
        unexpected: true,
      })
    ).toBeNull();
  });

  it('validates active rename input without adding it to the projection', () => {
    const parsed = readOplRemoteCompanionAccessResult({
      schema_version: 'opl-app-remote-companion-access.v1',
      status: 'active',
      pairing: { pairing_id: 'pair-001', expires_at: '2026-08-19T01:00:00.000Z' },
      actions: [
        action('device.rename', { device_id: 'device-001', display_name: 'This desktop' }),
        action('pair.revoke', { pairing_id: 'pair-001' }),
      ],
      devices: [
        {
          device_id: 'device-001',
          device_type: 'desktop',
          display_name: 'This desktop',
          authorization_state: 'authorized',
          last_activity_at: null,
        },
      ],
    });
    expect(parsed?.status).toBe('active');
    const renameAction = parsed?.status === 'active' ? parsed.actions[0] : null;
    expect(
      renameAction && prepareOplRemoteCompanionAccessActionInput(renameAction, { displayName: 'New desktop' })
    ).toEqual({
      device_id: 'device-001',
      display_name: 'New desktop',
    });
  });
});
