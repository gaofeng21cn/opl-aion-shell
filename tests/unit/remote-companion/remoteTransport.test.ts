import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  authenticationString,
  decryptPayload,
  deriveDirectionalKeys,
  encryptPayload,
  RemoteReplayGuard,
  RemoteRequestDedupe,
  toBase64Url,
} from '@/process/services/remote-companion/crypto';
import {
  associatedData,
  buildPairingQrUrl,
  parsePairingQrUrl,
  validateEnvelope,
} from '@/process/services/remote-companion/protocol';
import { REMOTE_COMPANION_PROTOCOL_VERSION } from '@/common/types/remoteCompanion';

const IOS_PRIVATE_KEY_HEX = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const IOS_PUBLIC_KEY = 'hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo';
const DESKTOP_PUBLIC_KEY = '3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08';
const DESKTOP_PRIVATE_KEY_HEX = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const PAIR_ID = 'pair-test-001';
const IOS_DEVICE_ID = 'ios-test-device';
const DESKTOP_DEVICE_ID = 'desktop-test-device';

const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

function keyMaterialFromRawPrivate(privateKeyHex: string, publicKey: string) {
  return {
    private_key: toBase64Url(Buffer.concat([X25519_PKCS8_PREFIX, Buffer.from(privateKeyHex, 'hex')])),
    public_key: publicKey,
  };
}

describe('OPL Link transport wire', () => {
  it('matches the approved SAS vector', () => {
    expect(authenticationString(PAIR_ID, DESKTOP_PUBLIC_KEY, IOS_PUBLIC_KEY)).toBe('867 604');
  });

  it('matches the approved HKDF and AAD vectors', () => {
    const keys = deriveDirectionalKeys(
      keyMaterialFromRawPrivate(IOS_PRIVATE_KEY_HEX, IOS_PUBLIC_KEY),
      DESKTOP_PUBLIC_KEY,
      PAIR_ID,
      1
    );
    expect(keys.ios_to_desktop.toString('hex')).toBe(
      '6017bf36ae1274c1168a217e69737e9792226ab555e0447dddec1b278f15de59'
    );

    const envelope = {
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      pair_id: PAIR_ID,
      sender_device_id: IOS_DEVICE_ID,
      recipient_device_id: DESKTOP_DEVICE_ID,
      key_epoch: 1,
    } as const;
    const aad = associatedData(envelope, 'ios_to_desktop');
    expect(aad.toString('utf8')).toBe(
      'protocol_version=23:opl_remote_transport.v1|pair_id=13:pair-test-001|sender_device_id=15:ios-test-device|recipient_device_id=19:desktop-test-device|key_epoch=1:1|channel_direction=14:ios_to_desktop'
    );

    const cipher = createCipheriv('aes-256-gcm', keys.ios_to_desktop, Buffer.from('000102030405060708090a0b', 'hex'));
    cipher.setAAD(aad);
    const ciphertextAndTag = Buffer.concat([
      cipher.update('OPL Link wire vector v1', 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    expect(ciphertextAndTag.toString('hex')).toBe(
      'c90ce480a4b58bf4d5c076ee419a3661510728dcf87443d9c258b16492e6dc1c57c856cced4851'
    );
  });

  it('round-trips an encrypted command with a strict envelope', () => {
    const desktopMaterial = keyMaterialFromRawPrivate(DESKTOP_PRIVATE_KEY_HEX, DESKTOP_PUBLIC_KEY);
    const keys = deriveDirectionalKeys(desktopMaterial, IOS_PUBLIC_KEY, PAIR_ID, 1);
    const envelope = encryptPayload({
      key: keys.desktop_to_ios,
      pair_id: PAIR_ID,
      sender_device_id: DESKTOP_DEVICE_ID,
      recipient_device_id: IOS_DEVICE_ID,
      key_epoch: 1,
      sender_sequence: 1,
      direction: 'desktop_to_ios',
      nonce: Buffer.from('0a0b0c0d0e0f101112131415', 'hex'),
      payload: {
        kind: 'command',
        request_id: 'request-001',
        action_id: 'canonical_task.refresh',
        payload: {},
      },
    });

    expect(Object.keys(envelope)).toEqual([
      'protocol_version',
      'pair_id',
      'sender_device_id',
      'recipient_device_id',
      'key_epoch',
      'sender_sequence',
      'nonce',
      'ciphertext',
    ]);
    expect(decryptPayload({ key: keys.desktop_to_ios, envelope, direction: 'desktop_to_ios' })).toEqual({
      kind: 'command',
      request_id: 'request-001',
      action_id: 'canonical_task.refresh',
      payload: {},
    });
    expect(() => validateEnvelope({ ...envelope, action_id: 'canonical_task.refresh' })).toThrow();
  });

  it('rejects duplicate and regressed sequences while marking a gap', () => {
    const guard = new RemoteReplayGuard();
    const base = {
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      pair_id: PAIR_ID,
      sender_device_id: IOS_DEVICE_ID,
      recipient_device_id: DESKTOP_DEVICE_ID,
      key_epoch: 1,
      nonce: toBase64Url(Buffer.from('000102030405060708090a0b', 'hex')),
      ciphertext: 'YQ',
    } as const;

    expect(guard.reserve({ ...base, sender_sequence: 1 })).toEqual({ gap: false });
    expect(() => guard.reserve({ ...base, sender_sequence: 1 })).toThrow('REMOTE_REPLAY_NONCE');
    expect(
      guard.reserve({
        ...base,
        sender_sequence: 3,
        nonce: toBase64Url(Buffer.from('0102030405060708090a0b0c', 'hex')),
      })
    ).toEqual({ gap: true });
    expect(() =>
      guard.reserve({
        ...base,
        sender_sequence: 2,
        nonce: toBase64Url(Buffer.from('02030405060708090a0b0c0d', 'hex')),
      })
    ).toThrow('REMOTE_REPLAY_SEQUENCE');
  });

  it('accepts only the exact pairing QR field set and includes the protocol version', () => {
    const url = buildPairingQrUrl({
      broker_url: 'https://broker.example.test',
      pairing_id: PAIR_ID,
      claim_secret: 'claim-secret-001',
      desktop_public_key: DESKTOP_PUBLIC_KEY,
      expires_at: '2026-08-17T12:00:00.000Z',
    });
    expect(parsePairingQrUrl(url)).toEqual({
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      broker_url: 'https://broker.example.test',
      pairing_id: PAIR_ID,
      claim_secret: 'claim-secret-001',
      desktop_public_key: DESKTOP_PUBLIC_KEY,
      expires_at: '2026-08-17T12:00:00.000Z',
    });
    expect(url).toContain('protocol_version=opl_remote_transport.v1');
    expect(url).not.toContain('desktop_pair_token');
    expect(() => parsePairingQrUrl(`${url}&unexpected=1`)).toThrow();
  });

  it('deduplicates requests by pair, key epoch, and request id', () => {
    const dedupe = new RemoteRequestDedupe();
    const response = { accepted: true, request_id: 'request-001' };
    dedupe.set(PAIR_ID, 1, 'request-001', response);
    expect(dedupe.get(PAIR_ID, 1, 'request-001')).toEqual(response);
    expect(dedupe.get(PAIR_ID, 2, 'request-001')).toBeUndefined();
    expect(dedupe.get('pair-other-001', 1, 'request-001')).toBeUndefined();
  });
});
