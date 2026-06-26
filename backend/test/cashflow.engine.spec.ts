import { computeCashflowFeatures } from '../src/modules/credit-scoring/cashflow.engine';

describe('CashflowEngine (features de fluxo de caixa)', () => {
  it('retorna zeros sem transações', () => {
    const f = computeCashflowFeatures([]);
    expect(f.nMeses).toBe(0);
    expect(f.receitaMediaMensal).toBe(0);
  });

  it('agrega por mês e calcula médias/margem', () => {
    const f = computeCashflowFeatures([
      { tipo: 'RECEITA', valor: 10000, data: '2026-01-10' },
      { tipo: 'DESPESA', valor: 4000, data: '2026-01-20' },
      { tipo: 'RECEITA', valor: 6000, data: '2026-02-05' },
      { tipo: 'DESPESA', valor: 2000, data: '2026-02-15' },
    ]);
    expect(f.nMeses).toBe(2);
    expect(f.receitaMediaMensal).toBe(8000); // (10000+6000)/2
    expect(f.despesaMediaMensal).toBe(3000); // (4000+2000)/2
    expect(f.fluxoLiquidoMedio).toBe(5000);
    expect(f.mesesPositivosPct).toBe(100);
    expect(f.margemMedia).toBe(0.63); // round2(10000/16000)
  });

  it('detecta mês negativo (mesesPositivosPct < 100)', () => {
    const f = computeCashflowFeatures([
      { tipo: 'RECEITA', valor: 1000, data: '2026-01-10' },
      { tipo: 'DESPESA', valor: 3000, data: '2026-01-20' },
      { tipo: 'RECEITA', valor: 5000, data: '2026-02-05' },
    ]);
    expect(f.mesesPositivosPct).toBe(50);
    expect(f.volatilidade).toBeGreaterThan(0);
  });
});
