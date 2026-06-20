import { FraudNivel } from '@prisma/client';

/**
 * Server-side port of the frontend `FraudEngine` (LucromUnificado.jsx:733-778).
 * The 5 canonical rules, their points, the block (>=70) / alert (>=40)
 * thresholds and the level bands are replicated EXACTLY. Device-risk and
 * blacklist signals (FASE 3 requirements) are ADDITIVE and surfaced separately,
 * without altering the canonical 5-rule risk score.
 */

export interface FraudOperacao {
  status: string;
}

export interface FraudTx {
  tipo?: string;
  valor: number;
  data?: string;
  criadaEm?: string;
  ts?: string;
}

export function checkVelocity(txs: FraudTx[] = [], windowHours = 24, maxOps = 5) {
  const cutoff = Date.now() - windowHours * 3600000;
  const recent = txs.filter(
    (t) => new Date(t.data || t.criadaEm || t.ts || 0).getTime() > cutoff,
  );
  return { ok: recent.length < maxOps, count: recent.length, max: maxOps };
}

export function checkRoundNumbers(txs: FraudTx[] = []) {
  const rounds = txs.filter((t) => t.valor % 1000 === 0 && t.valor >= 5000);
  const pct = txs.length > 0 ? rounds.length / txs.length : 0;
  return { ok: pct < 0.5, roundPct: Math.round(pct * 100), suspeito: pct >= 0.5 };
}

export function checkMicroFarming(txs: FraudTx[] = []) {
  const rec = txs.filter((t) => t.tipo === 'RECEITA').slice(0, 20);
  const micro = rec.filter((t) => t.valor < 50);
  return { ok: micro.length < 10, microCount: micro.length };
}

export interface RiskResult {
  riskScore: number;
  flags: string[];
  bloqueado: boolean;
  alerta: boolean;
  nivel: 'CRÍTICO' | 'ALTO' | 'MÉDIO' | 'BAIXO';
}

export function calcRiskScore(
  operacoes: FraudOperacao[] = [],
  txs: FraudTx[] = [],
  faturamento = 0,
  tetoMEI = 81000,
): RiskResult {
  let score = 0;
  const flags: string[] = [];

  if (faturamento / tetoMEI > 0.8) {
    score += 20;
    flags.push('FAT_ALTO');
  }
  const emAnalise = operacoes.filter((o) =>
    ['SOLICITADA', 'EM_ANALISE'].includes(o.status),
  ).length;
  if (emAnalise > 1) {
    score += 30;
    flags.push('MULTIPLAS_SOLICITACOES');
  }
  if (!checkVelocity(txs, 24, 10).ok) {
    score += 25;
    flags.push('VELOCITY_ALTA');
  }
  if (!checkRoundNumbers(txs).ok) {
    score += 15;
    flags.push('ROUND_NUMBERS');
  }
  if (!checkMicroFarming(txs).ok) {
    score += 20;
    flags.push('MICRO_FARMING');
  }

  return {
    riskScore: Math.min(100, score),
    flags,
    bloqueado: score >= 70,
    alerta: score >= 40,
    nivel: score >= 70 ? 'CRÍTICO' : score >= 40 ? 'ALTO' : score >= 20 ? 'MÉDIO' : 'BAIXO',
  };
}

/** Maps the textual level to the persisted Prisma enum. */
export function nivelToEnum(nivel: RiskResult['nivel']): FraudNivel {
  switch (nivel) {
    case 'CRÍTICO':
      return FraudNivel.CRITICO;
    case 'ALTO':
      return FraudNivel.ALTO;
    case 'MÉDIO':
      return FraudNivel.MEDIO;
    default:
      return FraudNivel.BAIXO;
  }
}
