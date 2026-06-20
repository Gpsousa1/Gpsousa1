import { CertType } from '@prisma/client';
import {
  buildCertHash,
  certBonus,
  CERT_A1_PRICES,
  expiraEm,
} from '../src/modules/certificates/certificate.engine';

describe('CertificateEngine (port fiel de EMIT_CERT)', () => {
  it('mantém os bônus de crédito por tipo', () => {
    expect(certBonus(CertType.CCFV)).toBe(500);
    expect(certBonus(CertType.A1)).toBe(800);
    expect(certBonus(CertType.OUTRO)).toBe(200);
  });

  it('mantém os preços do A1 (CERT_A1_PRICES)', () => {
    expect(CERT_A1_PRICES).toEqual({ '1ano': 119.9, '2anos': 199.9, '3anos': 269.9 });
  });

  it('define validade do CCFV em emissão + 90 dias', () => {
    const emitido = new Date('2026-01-01T00:00:00.000Z');
    const exp = expiraEm(CertType.CCFV, emitido)!;
    expect(exp.getTime() - emitido.getTime()).toBe(90 * 86400000);
  });

  it('define validade do A1 em emissão + 1 ano', () => {
    const emitido = new Date('2026-01-01T00:00:00.000Z');
    const exp = expiraEm(CertType.A1, emitido)!;
    expect(exp.getUTCFullYear()).toBe(2027);
  });

  it('gera hash SHA-256 (64 hex) determinístico no formato', () => {
    const hash = buildCertHash({
      userId: 'u1',
      tipo: CertType.CCFV,
      emitidoEm: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
