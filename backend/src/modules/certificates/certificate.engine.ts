import { createHash, randomUUID } from 'crypto';
import { CertType } from '@prisma/client';

/**
 * Server-side port of the certificate rules
 * (LucromUnificado.jsx: EMIT_CERT 1793-1806, CCFV validity 6240/6249,
 * CERT_A1_PRICES 1409). Bonus values and validity windows are identical.
 */

/** Mirrors CERT_A1_PRICES. */
export const CERT_A1_PRICES: Record<string, number> = {
  '1ano': 119.9,
  '2anos': 199.9,
  '3anos': 269.9,
};

/** certBonus = CCFV ? 500 : A1 ? 800 : 200 (EMIT_CERT). */
export function certBonus(tipo: CertType): number {
  return tipo === CertType.CCFV ? 500 : tipo === CertType.A1 ? 800 : 200;
}

const DAY_MS = 86400000;

/**
 * CCFV expires 90 days after issue (front: emitidoEm + 90*86400000).
 * A1 expires 1 year after issue (front: setFullYear(+1)).
 * Other types: no explicit expiry.
 */
export function expiraEm(tipo: CertType, emitidoEm: Date): Date | null {
  if (tipo === CertType.CCFV) return new Date(emitidoEm.getTime() + 90 * DAY_MS);
  if (tipo === CertType.A1) {
    const d = new Date(emitidoEm);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  return null;
}

/**
 * Deterministic SHA-256 verification hash generated server-side — this is the
 * `active.hash` the frontend expects from /api/v1/certificates/:id.
 */
export function buildCertHash(params: {
  userId: string;
  tipo: CertType;
  emitidoEm: Date;
}): string {
  const nonce = randomUUID();
  return createHash('sha256')
    .update(`${params.userId}|${params.tipo}|${params.emitidoEm.toISOString()}|${nonce}`)
    .digest('hex');
}
