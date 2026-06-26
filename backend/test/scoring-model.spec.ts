import {
  HeuristicScorecardModel,
  ratingForPd,
} from '../src/modules/credit-scoring/scoring-model';

describe('ScoringModel (mapeamento score -> PD, heurístico)', () => {
  const model = new HeuristicScorecardModel();

  it('PD é monotônica decrescente com o score', () => {
    const low = model.score({ score: 350 }).pd;
    const mid = model.score({ score: 650 }).pd;
    const high = model.score({ score: 900 }).pd;
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
  });

  it('PD fica dentro de [0.01, 0.5]', () => {
    expect(model.score({ score: 300 }).pd).toBeLessThanOrEqual(0.5);
    expect(model.score({ score: 1000 }).pd).toBeGreaterThanOrEqual(0.01);
  });

  it('marca o resultado como NÃO calibrado e expõe a versão', () => {
    const out = model.score({ score: 800 });
    expect(out.calibrated).toBe(false);
    expect(out.modelVersion).toBe('heuristic-1.0');
  });

  it('rating segue as faixas de PD', () => {
    expect(ratingForPd(0.01)).toBe('AA');
    expect(ratingForPd(0.03)).toBe('A');
    expect(ratingForPd(0.08)).toBe('BBB');
    expect(ratingForPd(0.15)).toBe('BB');
    expect(ratingForPd(0.3)).toBe('B');
    expect(ratingForPd(0.45)).toBe('C');
  });

  it('cash-flow saudável reduz a PD vs. sem cash-flow', () => {
    const base = model.score({ score: 700 }).pd;
    const comCashflow = model.score({
      score: 700,
      cashflow: { mesesPositivosPct: 100, volatilidade: 0, margemMedia: 0.5 },
    }).pd;
    expect(comCashflow).toBeLessThanOrEqual(base);
  });
});
