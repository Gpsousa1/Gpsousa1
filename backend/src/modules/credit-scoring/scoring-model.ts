/**
 * Versioned scoring-model abstraction. The API and the certificate depend on
 * this interface, NOT on a concrete model — so a credit-risk specialist can
 * later drop in a statistically calibrated scorecard / GBM (PD validated on
 * real default data) WITHOUT changing the certificate API.
 *
 * The model shipped today (HeuristicScorecardModel) is an explicit, documented
 * HEURISTIC placeholder. Its PD is NOT calibrated on real defaults and must be
 * replaced before a bank underwrites on it.
 */

export interface ScoringInput {
  score: number; // behavioural score 300..1000 (FASE 2 Score Engine)
  // Cash-flow / bureau features are available for calibrated models.
  cashflow?: {
    mesesPositivosPct?: number;
    volatilidade?: number;
    margemMedia?: number;
  };
}

export interface ScoringOutput {
  modelVersion: string;
  pd: number; // probability of default (0..1)
  rating: string;
  calibrated: boolean;
}

export interface ScoringModel {
  readonly version: string;
  score(input: ScoringInput): ScoringOutput;
}

/** Maps a PD to a transparent rating band. */
export function ratingForPd(pd: number): string {
  if (pd < 0.02) return 'AA';
  if (pd < 0.05) return 'A';
  if (pd < 0.1) return 'BBB';
  if (pd < 0.2) return 'BB';
  if (pd < 0.35) return 'B';
  return 'C';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Heuristic, monotonic score→PD curve (placeholder).
 * pd = clamp(0.5*(1 - s)^2 + 0.01, 0.01, 0.5), s = (score-300)/700.
 * Cash-flow signals nudge PD slightly (lower with more positive months /
 * higher margin, higher with volatility) — still heuristic, not calibrated.
 */
export class HeuristicScorecardModel implements ScoringModel {
  readonly version: string;

  constructor(version = 'heuristic-1.0') {
    this.version = version;
  }

  score(input: ScoringInput): ScoringOutput {
    const s = clamp((input.score - 300) / 700, 0, 1);
    let pd = 0.5 * Math.pow(1 - s, 2) + 0.01;

    const cf = input.cashflow;
    if (cf) {
      if (typeof cf.mesesPositivosPct === 'number') {
        pd *= 1 - (cf.mesesPositivosPct / 100) * 0.15; // até -15%
      }
      if (typeof cf.volatilidade === 'number') {
        pd *= 1 + Math.min(cf.volatilidade, 2) * 0.05; // até +10%
      }
    }
    pd = clamp(Math.round(pd * 10000) / 10000, 0.01, 0.5);

    return {
      modelVersion: this.version,
      pd,
      rating: ratingForPd(pd),
      calibrated: false,
    };
  }
}
