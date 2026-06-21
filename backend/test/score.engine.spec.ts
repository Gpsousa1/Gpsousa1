import { ScoreTier } from '@prisma/client';
import {
  calcScore,
  nivel,
  risk,
  SCORE_PESOS,
  SCORE_VERSION,
} from '../src/modules/score/score.engine';

describe('ScoreEngine (port fiel do frontend)', () => {
  it('mantém os 12 pesos exatamente como no frontend (soma = 1.00)', () => {
    expect(SCORE_PESOS).toEqual({
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
    });
    const soma = Object.values(SCORE_PESOS).reduce((a, b) => a + b, 0);
    expect(Math.round(soma * 100) / 100).toBe(1);
    expect(SCORE_VERSION).toBe('5.0-enterprise');
  });

  it('retorna 300 quando não há atividade alguma', () => {
    expect(calcScore([], [], [], [], [], {}).total).toBe(300);
  });

  it('calcula o total exatamente pela fórmula 300 + (raw/100)*700', () => {
    const createdAt = new Date(Date.now() - 200 * 86400000).toISOString();
    const r = calcScore(
      [{ tipo: 'RECEITA', valor: 12000 }],
      [],
      [],
      [],
      [],
      { xp: 0, dasPagamentos: [], createdAt, openFinance: null, fraudFlags: [] },
    );
    // raw = 12 + 10 + 0.8 + 0 + 0 + 2 + 2 + 0 + 0 + 6 + 0.8 + 4 = 37.6
    expect(r.raw).toBeCloseTo(37.6, 5);
    expect(r.total).toBe(563); // round(300 + 37.6/100*700)
    expect(r.components.volumeReceita).toBe(100);
    expect(r.components.margemLiquida).toBe(100);
    expect(r.components.semFraudes).toBe(100);
  });

  it('aplica os limiares de nível idênticos ao frontend', () => {
    expect(nivel(900).tier).toBe(ScoreTier.DIAMANTE);
    expect(nivel(899).tier).toBe(ScoreTier.OURO);
    expect(nivel(750).tier).toBe(ScoreTier.OURO);
    expect(nivel(749).tier).toBe(ScoreTier.PRATA);
    expect(nivel(600).tier).toBe(ScoreTier.PRATA);
    expect(nivel(599).tier).toBe(ScoreTier.BRONZE);
  });

  it('aplica as faixas de risco/limite idênticas ao frontend', () => {
    expect(risk(750).level).toBe('Baixo');
    expect(risk(750).limit).toBe(50000);
    expect(risk(650).level).toBe('Médio');
    expect(risk(650).limit).toBe(20000);
    expect(risk(500).level).toBe('Alto');
    expect(risk(500).limit).toBe(5000);
    expect(risk(499).approved).toBe(false);
    expect(risk(499).limit).toBe(0);
    // limite por faturamento real
    expect(risk(800, 100000).limit).toBe(30000); // min(50000, 100000*0.3)
  });

  it('penaliza semFraudes em -30 por flag (sem alterar a regra)', () => {
    const base = { createdAt: new Date(Date.now() - 200 * 86400000).toISOString() };
    expect(calcScore([{ tipo: 'RECEITA', valor: 100 }], [], [], [], [], { ...base, fraudFlags: [] }).components.semFraudes).toBe(100);
    expect(calcScore([{ tipo: 'RECEITA', valor: 100 }], [], [], [], [], { ...base, fraudFlags: [1, 2] }).components.semFraudes).toBe(40);
  });
});
