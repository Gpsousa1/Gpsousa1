import { NotImplementedException } from '@nestjs/common';

export const PIX_PROVIDER = 'PIX_PROVIDER';

export interface CreateChargeRequest {
  txid: string;
  valor: number;
}

export interface ProviderCharge {
  brcode: string;
  e2eId?: string;
}

export interface CreateTransferRequest {
  valor: number;
  pixKey: string;
}

export interface ProviderTransfer {
  e2eId: string;
}

/**
 * Integration boundary for a PIX PSP (Celcoin/Gerencianet/PJBank/etc).
 * No PSP is connected yet — concrete providers implement this in a future
 * phase. Charges/transfers must reconcile against the Ledger when wired.
 */
export interface PixProvider {
  readonly name: string;
  createCharge(req: CreateChargeRequest): Promise<ProviderCharge>;
  createTransfer(req: CreateTransferRequest): Promise<ProviderTransfer>;
}

export class NoopPixProvider implements PixProvider {
  readonly name = 'noop';

  async createCharge(): Promise<ProviderCharge> {
    throw new NotImplementedException('PIX PSP not connected yet (integration layer only).');
  }

  async createTransfer(): Promise<ProviderTransfer> {
    throw new NotImplementedException('PIX PSP not connected yet (integration layer only).');
  }
}
