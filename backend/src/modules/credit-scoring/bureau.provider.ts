export const BUREAU_PROVIDER = 'BUREAU_PROVIDER';

export interface BureauResult {
  status: 'OK' | 'NOT_CONNECTED';
  negativado?: boolean;
  protestos?: number;
  scoreBureau?: number;
  consultasRecentes?: number;
  scrEndividamento?: number; // BACEN SCR total exposure
  raw?: Record<string, unknown>;
}

/**
 * Integration boundary for credit bureaus / BACEN SCR
 * (Serasa, Quod, Boa Vista, SCR). No real provider is connected yet — a
 * concrete implementation plugs in here in a future phase, with the proper
 * regulatory consent flow. Bank-grade underwriting REQUIRES this data.
 */
export interface BureauProvider {
  readonly name: string;
  consultar(documento: string): Promise<BureauResult>;
}

/** Placeholder: reports "not connected" instead of throwing, so the
 * attestation can still be issued (clearly flagged bureauStatus=NOT_CONNECTED). */
export class NoopBureauProvider implements BureauProvider {
  readonly name = 'noop';

  async consultar(): Promise<BureauResult> {
    return { status: 'NOT_CONNECTED' };
  }
}
