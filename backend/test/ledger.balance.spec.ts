import { LedgerEntryType } from '@prisma/client';
import { LedgerService } from '../src/modules/ledger/ledger.service';

describe('LedgerEngine balance (port fiel de validarBalanco)', () => {
  // validarBalanco is pure and does not touch Prisma.
  const ledger = new LedgerService(null as never);

  it('aprova quando débitos == créditos', () => {
    const r = ledger.validarBalanco([
      { accountCode: '1.1.2', tipo: LedgerEntryType.DEBITO, valor: 1000 },
      { accountCode: '1.1.1', tipo: LedgerEntryType.CREDITO, valor: 1000 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.debitos).toBe(1000);
    expect(r.creditos).toBe(1000);
  });

  it('reprova quando débitos != créditos', () => {
    const r = ledger.validarBalanco([
      { accountCode: '1.1.2', tipo: LedgerEntryType.DEBITO, valor: 1000 },
      { accountCode: '1.1.1', tipo: LedgerEntryType.CREDITO, valor: 999 },
    ]);
    expect(r.ok).toBe(false);
  });
});
