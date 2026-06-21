import { ScoreTier } from '@prisma/client';

/**
 * Server-side port of the frontend `ScoreEngine` (LucromUnificado.jsx:812-905).
 * The formula, the 12 factors and their weights, the tiers and the risk bands
 * are replicated EXACTLY — no values were changed. Only presentation-only data
 * (hex colors) is omitted, as it does not affect any numeric result.
 */

export interface ScoreTx {
  tipo: 'RECEITA' | 'DESPESA';
  valor: number;
}

export interface ScoreMission {
  done?: boolean;
}

export interface ScoreExtra {
  xp?: number;
  dasPagamentos?: unknown[];
  createdAt?: string | Date | null;
  openFinance?: { connected?: boolean } | null;
  fraudFlags?: unknown[];
}

export interface ScoreResult {
  total: number;
  raw: number;
  components: Record<string, number>;
  pesos: Record<string, number>;
  limiteCalculado: number;
  explicacao: { fator: string; contribuicao: number; valor: number }[];
  version: string;
}

export const SCORE_VERSION = '5.0-enterprise';

export const SCORE_PESOS: Record<string, number> = {
  volumeReceita: 0.12,
  margemLiquida: 0.1,
  regularidadeTx: 0.08,
  missoesConcluidas: 0.1,
  xpAcumulado: 0.1,
  dasnDeclarada: 0.1,
  dasPago: 0.1,
  certificados: 0.08,
  notasFiscais: 0.08,
  antiguidade: 0.06,
  openFinance: 0.04,
  semFraudes: 0.04,
};

export function calcScore(
  txs: ScoreTx[] = [],
  missions: ScoreMission[] = [],
  dasnDecs: unknown[] = [],
  certs: { active?: boolean }[] = [],
  nfs: unknown[] = [],
  extra: ScoreExtra = {},
): ScoreResult {
  const rec = txs.filter((t) => t.tipo === 'RECEITA').reduce((a, t) => a + t.valor, 0);
  const desp = txs.filter((t) => t.tipo === 'DESPESA').reduce((a, t) => a + t.valor, 0);
  const nTxs = txs.length;
  const margem = rec > 0 ? (rec - desp) / rec : 0;

  const vars: Record<string, number> = {
    volumeReceita: Math.min(
      100,
      rec > 10000 ? 100 : rec > 5000 ? 80 : rec > 2000 ? 60 : rec > 500 ? 40 : 20,
    ),
    margemLiquida: Math.min(
      100,
      margem > 0.5 ? 100 : margem > 0.3 ? 75 : margem > 0.1 ? 50 : 25,
    ),
    regularidadeTx: Math.min(
      100,
      nTxs >= 10 ? 100 : nTxs >= 5 ? 70 : nTxs >= 2 ? 40 : 10,
    ),
    missoesConcluidas: Math.min(
      100,
      Math.round((missions.filter((m) => m.done).length / Math.max(missions.length, 1)) * 100),
    ),
    xpAcumulado: Math.min(100, ((extra.xp || 0) / 500) * 100),
    dasnDeclarada: dasnDecs.length > 0 ? 100 : 20,
    dasPago:
      (extra.dasPagamentos || []).length >= 3
        ? 100
        : (extra.dasPagamentos || []).length >= 1
          ? 60
          : 20,
    certificados: Math.min(100, certs.filter((c) => c.active).length * 50),
    notasFiscais: Math.min(100, nfs.length * 20),
    antiguidade: (() => {
      const dias = extra.createdAt
        ? Math.floor((Date.now() - new Date(extra.createdAt).getTime()) / 86400000)
        : 0;
      return Math.min(100, dias > 180 ? 100 : dias > 90 ? 70 : dias > 30 ? 40 : 15);
    })(),
    openFinance: extra.openFinance?.connected ? 80 : 20,
    semFraudes:
      (extra.fraudFlags || []).length === 0
        ? 100
        : Math.max(0, 100 - (extra.fraudFlags || []).length * 30),
  };

  const pesos = SCORE_PESOS;
  const raw = Object.keys(vars).reduce((acc, k) => acc + vars[k] * (pesos[k] || 0), 0);
  const temAtividade =
    txs.length > 0 ||
    missions.some((m) => m.done) ||
    dasnDecs.length > 0 ||
    nfs.length > 0 ||
    certs.length > 0;
  const total = !temAtividade
    ? 300
    : Math.min(1000, Math.max(301, Math.round(300 + (raw / 100) * 700)));

  const limiteBase = Math.min(rec * 0.3, 50000);

  const fin =
    Math.round(
      ((vars.volumeReceita * 0.12 + vars.margemLiquida * 0.1 + vars.regularidadeTx * 0.08) /
        (0.12 + 0.1 + 0.08)) *
        100,
    ) / 100;
  const mis =
    Math.round(
      ((vars.missoesConcluidas * 0.1 + vars.xpAcumulado * 0.1) / (0.1 + 0.1)) * 100,
    ) / 100;
  const fis =
    Math.round(((vars.dasnDeclarada * 0.1 + vars.dasPago * 0.1) / (0.1 + 0.1)) * 100) / 100;
  const cer = Math.round(vars.certificados * 100) / 100;
  const beh =
    Math.round(
      ((vars.antiguidade * 0.06 + vars.openFinance * 0.04 + vars.semFraudes * 0.04) /
        (0.06 + 0.04 + 0.04)) *
        100,
    ) / 100;
  const nf = Math.round(vars.notasFiscais * 100) / 100;

  return {
    total,
    raw,
    components: { ...vars, fin, mis, fis, cer, beh, nf },
    pesos,
    limiteCalculado: Math.round(limiteBase / 100) * 100,
    explicacao: Object.entries(vars)
      .sort((a, b) => b[1] * pesos[b[0]] - a[1] * pesos[a[0]])
      .map(([k, v]) => ({
        fator: k,
        contribuicao: Math.round(v * pesos[k] * 10) / 10,
        valor: Math.round(v),
      })),
    version: SCORE_VERSION,
  };
}

export interface NivelResult {
  label: string;
  tier: ScoreTier;
}

export function nivel(score: number): NivelResult {
  if (score >= 900) return { label: 'Diamante', tier: ScoreTier.DIAMANTE };
  if (score >= 750) return { label: 'Ouro', tier: ScoreTier.OURO };
  if (score >= 600) return { label: 'Prata', tier: ScoreTier.PRATA };
  return { label: 'Bronze', tier: ScoreTier.BRONZE };
}

export interface RiskResult {
  level: string;
  limit: number;
  rate: string;
  approved: boolean;
}

export function risk(score: number, faturamento = 0): RiskResult {
  const limFat = Math.min(faturamento * 0.3, 50000);
  if (score >= 750)
    return { level: 'Baixo', limit: Math.min(50000, limFat || 50000), rate: '0,99% a.m.', approved: true };
  if (score >= 650)
    return { level: 'Médio', limit: Math.min(20000, limFat || 20000), rate: '1,99% a.m.', approved: true };
  if (score >= 500)
    return { level: 'Alto', limit: Math.min(5000, limFat || 5000), rate: '3,5% a.m.', approved: true };
  return { level: 'Crítico', limit: 0, rate: 'N/A', approved: false };
}
