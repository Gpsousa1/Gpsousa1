/**
 * Cash-flow feature engineering for bank-grade scoring. Computes the
 * behavioural/transactional features banks expect ("cash-flow underwriting")
 * from a series of dated bank movements. Pure & deterministic (testable).
 *
 * Source of truth in production: Open Finance synced transactions. Until that
 * is connected, the same features can be computed from a provided series.
 */

export interface CashflowTx {
  tipo: 'RECEITA' | 'DESPESA';
  valor: number;
  data: string; // ISO date
}

export interface CashflowFeatures {
  nMeses: number;
  receitaMediaMensal: number;
  despesaMediaMensal: number;
  fluxoLiquidoMedio: number;
  margemMedia: number; // (receita-despesa)/receita
  mesesPositivosPct: number; // % de meses com fluxo líquido >= 0
  volatilidade: number; // coef. de variação do fluxo líquido mensal (0..n)
  receitaTotal: number;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCashflowFeatures(txs: CashflowTx[] = []): CashflowFeatures {
  if (txs.length === 0) {
    return {
      nMeses: 0,
      receitaMediaMensal: 0,
      despesaMediaMensal: 0,
      fluxoLiquidoMedio: 0,
      margemMedia: 0,
      mesesPositivosPct: 0,
      volatilidade: 0,
      receitaTotal: 0,
    };
  }

  const byMonth = new Map<string, { rec: number; desp: number }>();
  for (const t of txs) {
    const k = monthKey(t.data);
    const m = byMonth.get(k) ?? { rec: 0, desp: 0 };
    if (t.tipo === 'RECEITA') m.rec += t.valor;
    else m.desp += t.valor;
    byMonth.set(k, m);
  }

  const months = [...byMonth.values()];
  const nMeses = months.length;
  const recTotal = months.reduce((a, m) => a + m.rec, 0);
  const despTotal = months.reduce((a, m) => a + m.desp, 0);
  const receitaMediaMensal = recTotal / nMeses;
  const despesaMediaMensal = despTotal / nMeses;
  const liquidos = months.map((m) => m.rec - m.desp);
  const fluxoLiquidoMedio = liquidos.reduce((a, v) => a + v, 0) / nMeses;
  const mesesPositivos = liquidos.filter((v) => v >= 0).length;

  // Coeficiente de variação (desvio-padrão / |média|), estável quando média ~ 0.
  const variancia = liquidos.reduce((a, v) => a + Math.pow(v - fluxoLiquidoMedio, 2), 0) / nMeses;
  const desvio = Math.sqrt(variancia);
  const volatilidade = desvio / (Math.abs(fluxoLiquidoMedio) + 1);

  return {
    nMeses,
    receitaMediaMensal: round2(receitaMediaMensal),
    despesaMediaMensal: round2(despesaMediaMensal),
    fluxoLiquidoMedio: round2(fluxoLiquidoMedio),
    margemMedia: recTotal > 0 ? round2((recTotal - despTotal) / recTotal) : 0,
    mesesPositivosPct: Math.round((mesesPositivos / nMeses) * 100),
    volatilidade: round2(volatilidade),
    receitaTotal: round2(recTotal),
  };
}
