import { NotImplementedException } from '@nestjs/common';

export const OPEN_FINANCE_PROVIDER = 'OPEN_FINANCE_PROVIDER';

export interface ConsentRequest {
  userId: string;
  scopes: string[];
}

export interface ProviderConsent {
  externalConsentId: string;
  redirectUrl: string;
  expiresAt: Date;
}

export interface ProviderAccount {
  accountRef: string;
  payload: Record<string, unknown>;
}

/**
 * Integration boundary for Open Finance aggregators (Pluggy/Belvo/etc).
 * No vendor is connected yet — concrete providers implement this in a future
 * phase. The OAuth/PKCE exchange must happen server-side per the blueprint.
 */
export interface OpenFinanceProvider {
  readonly name: string;
  createConsent(req: ConsentRequest): Promise<ProviderConsent>;
  fetchAccounts(externalConsentId: string): Promise<ProviderAccount[]>;
}

/**
 * Placeholder provider used until a real aggregator is wired. It keeps the
 * service contract usable while clearly signalling "not connected".
 */
export class NoopOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = 'noop';

  async createConsent(): Promise<ProviderConsent> {
    throw new NotImplementedException(
      'Open Finance provider not connected yet (integration layer only).',
    );
  }

  async fetchAccounts(): Promise<ProviderAccount[]> {
    throw new NotImplementedException(
      'Open Finance provider not connected yet (integration layer only).',
    );
  }
}
