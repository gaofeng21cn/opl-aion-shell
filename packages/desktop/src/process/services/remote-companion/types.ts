import type {
  BrokerConfirmPairingResponse,
  BrokerCreatePairingRequest,
  BrokerCreatePairingResponse,
  BrokerReadPairingResponse,
  BrokerRevocationResponse,
  BrokerRevokePairingResponse,
} from './brokerClient';

export type RemoteBrokerPort = {
  configured: boolean;
  createPairing(request: BrokerCreatePairingRequest): Promise<BrokerCreatePairingResponse>;
  readPairing(pairingId: string, bearerToken: string): Promise<BrokerReadPairingResponse>;
  confirmPairing(
    pairingId: string,
    bearerToken: string,
    authenticationString: string
  ): Promise<BrokerConfirmPairingResponse>;
  revokePair(pairingId: string, bearerToken: string): Promise<BrokerRevokePairingResponse>;
  readRevocation(receiptId: string, receiptToken: string): Promise<BrokerRevocationResponse>;
  refreshProviderCredentials(
    pairingId: string,
    bearerToken: string,
    deviceId: string
  ): Promise<{
    provider: 'tencent_cloud_im';
    sdk_app_id: string;
    provider_user_id: string;
    peer_provider_user_id: string;
    usersig: string;
    usersig_expires_at: string;
  }>;
};
