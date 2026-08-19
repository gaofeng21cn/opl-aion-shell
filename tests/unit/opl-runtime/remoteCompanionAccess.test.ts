import { describe, expect, it } from 'vitest';
import {
  prepareOplRemoteCompanionAccessActionInput,
  readOplRemoteCompanionAccessResult,
} from '@/common/types/opl/remoteCompanionAccess';

function action(actionKind: string, input: Record<string, unknown> = {}) {
  return { action_kind: actionKind, command_id: `pair.${actionKind}`, input };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'opl-app-remote-companion-access.v1',
    status: 'available',
    state: 'qr_ready',
    actions: [action('confirm', { pairing_id: 'pair-001' })],
    pairing: {
      pairing_id: 'pair-001',
      expires_at_ms: 1_800_000_000_000,
      qr_payload: 'https://example.test/pairing/opaque',
      short_code: '01ARZ3NDEKTS',
    },
    ...overrides,
  };
}

describe('remote_companion_access result parser', () => {
  it('accepts the QR state and keeps pairing material in the returned interaction projection', () => {
    const parsed = readOplRemoteCompanionAccessResult(result());
    expect(parsed).toMatchObject({
      state: 'qr_ready',
      pairing: { pairingId: 'pair-001', shortCode: '01ARZ3NDEKTS' },
      actions: [{ actionKind: 'confirm', input: { pairing_id: 'pair-001' } }],
    });
  });

  it('accepts the six-digit authentication string only in awaiting_confirmation', () => {
    const parsed = readOplRemoteCompanionAccessResult({
      ...result(),
      state: 'awaiting_confirmation',
      pairing: {
        pairing_id: 'pair-001',
        expires_at_ms: 1_800_000_000_000,
        authentication_string: '123 456',
      },
      actions: [action('confirm', { pairing_id: 'pair-001' })],
    });
    expect(parsed).toMatchObject({ state: 'awaiting_confirmation', pairing: { authenticationString: '123 456' } });
    const confirmAction = parsed?.status === 'available' ? parsed.actions[0] : null;
    expect(confirmAction && prepareOplRemoteCompanionAccessActionInput(confirmAction, parsed.pairing)).toEqual({
      pairing_id: 'pair-001',
      authentication_string: '123 456',
    });
  });

  it('rejects secret fields in projected action input and malformed state shapes', () => {
    expect(
      readOplRemoteCompanionAccessResult(
        result({ actions: [action('confirm', { pairing_id: 'pair-001', authentication_string: '123 456' })] })
      )
    ).toBeNull();
    expect(readOplRemoteCompanionAccessResult(result({ state: 'unpaired', pairing: result().pairing }))).toBeNull();
    expect(
      readOplRemoteCompanionAccessResult({
        schema_version: 'opl-app-remote-companion-access.v1',
        status: 'unavailable',
        state: 'unavailable',
        actions: [action('confirm', { pairing_id: 'pair-001' })],
        unavailable_reason: 'safe_storage_unavailable',
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
      status: 'available',
      state: 'active',
      actions: [action('rename', { account_id: 'account-001' }), action('revoke', { account_id: 'account-001' })],
      account: { account_id: 'account-001', display_name: 'This desktop' },
    });
    expect(parsed?.status).toBe('available');
    const renameAction = parsed?.status === 'available' ? parsed.actions[0] : null;
    expect(renameAction && prepareOplRemoteCompanionAccessActionInput(renameAction, undefined, 'New desktop')).toEqual({
      account_id: 'account-001',
      display_name: 'New desktop',
    });
  });
});
