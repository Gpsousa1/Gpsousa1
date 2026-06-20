import {
  calcRiskScore,
  checkMicroFarming,
  checkRoundNumbers,
  checkVelocity,
} from '../src/modules/fraud/fraud.engine';

describe('FraudEngine (port fiel das 5 regras)', () => {
  it('não acusa nada para atividade limpa', () => {
    const r = calcRiskScore([], [], 0, 81000);
    expect(r.riskScore).toBe(0);
    expect(r.flags).toEqual([]);
    expect(r.bloqueado).toBe(false);
    expect(r.nivel).toBe('BAIXO');
  });

  it('FAT_ALTO: +20 quando faturamento > 80% do teto', () => {
    const r = calcRiskScore([], [], 70000, 81000);
    expect(r.flags).toContain('FAT_ALTO');
    expect(r.riskScore).toBe(20);
  });

  it('MULTIPLAS_SOLICITACOES: +30 com >1 operação em análise', () => {
    const ops = [{ status: 'SOLICITADA' }, { status: 'EM_ANALISE' }];
    const r = calcRiskScore(ops, [], 0, 81000);
    expect(r.flags).toContain('MULTIPLAS_SOLICITACOES');
    expect(r.riskScore).toBe(30);
  });

  it('bloqueia em >=70 e alerta em >=40 (limiares preservados)', () => {
    // FAT_ALTO(20) + MULTIPLAS(30) + VELOCITY(25) = 75 -> bloqueado
    const ops = [{ status: 'SOLICITADA' }, { status: 'EM_ANALISE' }];
    const txs = Array.from({ length: 11 }, () => ({ valor: 100, data: new Date().toISOString() }));
    const r = calcRiskScore(ops, txs, 70000, 81000);
    expect(r.riskScore).toBe(75);
    expect(r.bloqueado).toBe(true);
    expect(r.nivel).toBe('CRÍTICO');
  });

  it('checkVelocity: >10 tx em 24h falha', () => {
    const txs = Array.from({ length: 11 }, () => ({ valor: 1, data: new Date().toISOString() }));
    expect(checkVelocity(txs, 24, 10).ok).toBe(false);
  });

  it('checkRoundNumbers: >=50% redondos >=5k é suspeito', () => {
    const txs = [{ valor: 5000 }, { valor: 6000 }];
    expect(checkRoundNumbers(txs).ok).toBe(false);
  });

  it('checkMicroFarming: >=10 receitas < 50 falha', () => {
    const txs = Array.from({ length: 10 }, () => ({ tipo: 'RECEITA', valor: 10 }));
    expect(checkMicroFarming(txs).ok).toBe(false);
  });
});
