import { calcCET, calcIOF, calcPMT, tabelaAmortizacao } from '../src/modules/credit/price-table';

describe('PriceTable (port fiel)', () => {
  it('PMT com taxa zero divide igualmente', () => {
    expect(calcPMT(1200, 0, 12)).toBe(100);
  });

  it('PMT pela fórmula Price (10000 a 1,99% em 12x)', () => {
    const pmt = calcPMT(10000, 1.99, 12);
    expect(pmt).toBeCloseTo(945.02, 1);
  });

  it('IOF = 0,38% flat + 0,0082%/dia, limitado a 3%', () => {
    const iof = calcIOF(10000, 360);
    // flat 38 + diario min(10000*0.000082*360=295.2, 300) = 333.2
    expect(iof).toBeCloseTo(333.2, 1);
  });

  it('IOF respeita o teto de 3% do principal', () => {
    const iof = calcIOF(10000, 100000); // diário estouraria, capado em 300
    expect(iof).toBeCloseTo(338, 1); // 38 + 300
  });

  it('CET = taxa * (1 + iof/pv)', () => {
    expect(calcCET(10000, 945.02, 12, 333.2, 1.99)).toBeCloseTo(2.06, 2);
  });

  it('amortização soma corretamente e zera o saldo', () => {
    const tabela = tabelaAmortizacao(1200, 0, 12);
    expect(tabela).toHaveLength(12);
    expect(tabela[11].saldo).toBe(0);
  });
});
