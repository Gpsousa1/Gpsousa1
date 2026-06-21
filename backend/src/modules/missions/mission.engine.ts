/**
 * Server-side port of the frontend mission auto-completion logic
 * (`withAutoMissions`, LucromUnificado.jsx:1636-1663) and `INIT_MISSIONS`
 * (1390-1397). Triggers, XP values and the Gratuito 3-mission cap are identical.
 */

/** Canonical mission catalog — mirrors INIT_MISSIONS exactly. */
export const INIT_MISSIONS = [
  { code: 1, title: 'Registre sua primeira receita', xp: 50, icon: '💰', cat: 'Finanças', recompensaCredito: 500 },
  { code: 2, title: 'Organize seu fluxo de caixa', xp: 25, icon: '📊', cat: 'Finanças', recompensaCredito: 300 },
  { code: 3, title: 'Declare a DASN em dia', xp: 100, icon: '📋', cat: 'Impostos', recompensaCredito: 1200 },
  { code: 4, title: 'Pague seu primeiro DAS', xp: 75, icon: '✅', cat: 'Impostos', recompensaCredito: 800 },
  { code: 5, title: 'Emita seu Certificado CCFV', xp: 80, icon: '🏆', cat: 'Certificados', recompensaCredito: 900 },
  { code: 6, title: 'Emita sua primeira Nota Fiscal', xp: 60, icon: '📄', cat: 'Docs', recompensaCredito: 700 },
] as const;

/** Activity snapshot used by the triggers (mirrors the frontend state shape). */
export interface MissionActivity {
  receitaCount: number; // transactions tipo RECEITA
  txCount: number; // transactions.length
  dasnCount: number; // dasnDecs.length
  dasPagamentosCount: number; // dasPagamentos.length
  ccfvEmitted: boolean; // certs.some(c => c.tipo === 'CCFV')
  nfCount: number; // notasFiscais.length
}

export interface MissionState {
  code: number;
  xp: number;
  done: boolean;
}

const TRIGGERS: Record<number, (a: MissionActivity) => boolean> = {
  1: (a) => a.receitaCount >= 1,
  2: (a) => a.txCount >= 3,
  3: (a) => a.dasnCount > 0,
  4: (a) => a.dasPagamentosCount >= 1,
  5: (a) => a.ccfvEmitted === true,
  6: (a) => a.nfCount >= 1,
};

export interface EvaluateResult {
  missions: MissionState[];
  xpGained: number;
  completedCodes: number[];
}

/**
 * Evaluates triggers against the current activity, completing missions and
 * accruing XP. On the Gratuito plan, at most 3 missions can be completed in
 * total (same cap and counting strategy as the frontend).
 */
export function evaluateMissions(
  missions: MissionState[],
  activity: MissionActivity,
  plano: string,
): EvaluateResult {
  const isGratuito = plano === 'Gratuito';
  const jaConcluidasCount = missions.filter((m) => m.done).length;
  let xpGained = 0;
  let novasConcluidas = 0;
  const completedCodes: number[] = [];

  const updated = missions.map((m) => {
    if (m.done) return m;
    if (isGratuito && jaConcluidasCount + novasConcluidas >= 3) return m;
    const trigger = TRIGGERS[m.code];
    if (trigger && trigger(activity)) {
      xpGained += m.xp;
      novasConcluidas++;
      completedCodes.push(m.code);
      return { ...m, done: true };
    }
    return m;
  });

  return { missions: updated, xpGained, completedCodes };
}
