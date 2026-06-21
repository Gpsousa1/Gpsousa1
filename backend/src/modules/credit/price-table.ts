/**
 * Server-side port of the frontend `PriceTable` (LucromUnificado.jsx:549-590).
 * PMT, IOF and CET formulas are identical (BACEN Price Table).
 */

/** PMT = PV × i × (1+i)^n / ((1+i)^n − 1). */
export function calcPMT(pv: number, taxaMensal: number, parcelas: number): number {
  const i = taxaMensal / 100;
  const n = parcelas;
  if (i === 0) return pv / n;
  return (pv * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1);
}

/** IOF: 0,38% flat + 0,0082%/dia (limite 3%). */
export function calcIOF(principal: number, diasContrato: number): number {
  const flat = principal * 0.0038;
  const diario = Math.min(principal * 0.000082 * diasContrato, principal * 0.03);
  return Math.round((flat + diario) * 100) / 100;
}

/** CET (Custo Efetivo Total) simplificado. */
export function calcCET(
  pv: number,
  pmt: number,
  _n: number,
  iof: number,
  taxaMensal: number,
): number {
  const custosExtras = iof;
  const cetApprox = taxaMensal * (1 + custosExtras / pv);
  return Math.round(cetApprox * 100) / 100;
}

export interface AmortizationRow {
  parcela: number;
  pmt: number;
  juros: number;
  amortizacao: number;
  saldo: number;
}

export function tabelaAmortizacao(
  pv: number,
  taxaMensal: number,
  parcelas: number,
): AmortizationRow[] {
  const i = taxaMensal / 100;
  const pmt = calcPMT(pv, taxaMensal, parcelas);
  const tabela: AmortizationRow[] = [];
  let saldo = pv;
  for (let k = 1; k <= parcelas; k++) {
    const juros = saldo * i;
    const amortizacao = pmt - juros;
    saldo = Math.max(0, saldo - amortizacao);
    tabela.push({
      parcela: k,
      pmt: Math.round(pmt * 100) / 100,
      juros: Math.round(juros * 100) / 100,
      amortizacao: Math.round(amortizacao * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
    });
  }
  return tabela;
}
