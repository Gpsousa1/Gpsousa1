import {
  evaluateMissions,
  INIT_MISSIONS,
  MissionState,
} from '../src/modules/missions/mission.engine';

const fresh = (): MissionState[] =>
  INIT_MISSIONS.map((m) => ({ code: m.code, xp: m.xp, done: false }));

const noActivity = {
  receitaCount: 0,
  txCount: 0,
  dasnCount: 0,
  dasPagamentosCount: 0,
  ccfvEmitted: false,
  nfCount: 0,
};

describe('MissionEngine (port fiel de withAutoMissions / INIT_MISSIONS)', () => {
  it('mantém o catálogo das 6 missões com XP idêntico', () => {
    expect(INIT_MISSIONS.map((m) => [m.code, m.xp])).toEqual([
      [1, 50],
      [2, 25],
      [3, 100],
      [4, 75],
      [5, 80],
      [6, 60],
    ]);
  });

  it('dispara cada trigger exatamente como o frontend', () => {
    expect(evaluateMissions(fresh(), { ...noActivity, receitaCount: 1 }, 'Crescer').completedCodes).toContain(1);
    expect(evaluateMissions(fresh(), { ...noActivity, txCount: 3 }, 'Crescer').completedCodes).toContain(2);
    expect(evaluateMissions(fresh(), { ...noActivity, dasnCount: 1 }, 'Crescer').completedCodes).toContain(3);
    expect(evaluateMissions(fresh(), { ...noActivity, dasPagamentosCount: 1 }, 'Crescer').completedCodes).toContain(4);
    expect(evaluateMissions(fresh(), { ...noActivity, ccfvEmitted: true }, 'Crescer').completedCodes).toContain(5);
    expect(evaluateMissions(fresh(), { ...noActivity, nfCount: 1 }, 'Crescer').completedCodes).toContain(6);
  });

  it('não dispara abaixo dos limiares (txCount 2 não completa missão 2)', () => {
    const r = evaluateMissions(fresh(), { ...noActivity, txCount: 2 }, 'Crescer');
    expect(r.completedCodes).not.toContain(2);
  });

  it('limita o plano Gratuito a no máximo 3 missões concluídas', () => {
    const all = {
      receitaCount: 1,
      txCount: 3,
      dasnCount: 1,
      dasPagamentosCount: 1,
      ccfvEmitted: true,
      nfCount: 1,
    };
    const gratuito = evaluateMissions(fresh(), all, 'Gratuito');
    expect(gratuito.completedCodes.length).toBe(3);

    const pago = evaluateMissions(fresh(), all, 'Crescer');
    expect(pago.completedCodes.length).toBe(6);
  });

  it('acumula XP somente das missões recém-concluídas', () => {
    const r = evaluateMissions(fresh(), { ...noActivity, receitaCount: 1, txCount: 3 }, 'Crescer');
    expect(r.xpGained).toBe(50 + 25);
  });
});
