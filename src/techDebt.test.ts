import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFACTORING_RATIO,
  TECH_DEBT_MAX,
  TECH_DEBT_PER_FEATURE_WORK,
  TECH_DEBT_REPAY_PER_REFACTORING_WORK,
} from './config';
import {
  accumulateTechDebt,
  clampTechDebt,
  createTechDebtChangedEvent,
  formatTechDebt,
  repayTechDebt,
  resolveWorkTechDebt,
  sanitizeRefactoringRatio,
  TECH_DEBT_CHANGED_EVENT,
} from './techDebt';

// テストは引数で上限を渡して config の仮の値に依存しないようにする。
const MAX = 100;

describe('clampTechDebt', () => {
  it.each([
    [0, 0],
    [1, 1],
    [MAX - 1, MAX - 1],
    [MAX, MAX],
    [MAX + 1, MAX],
    [-1, 0],
    [-0.01, 0],
    [NaN, 0],
    [Infinity, MAX],
    [-Infinity, 0],
  ])('clampTechDebt(%d) = %d', (value, expected) => {
    expect(clampTechDebt(value, MAX)).toBe(expected);
  });

  it('上限の既定値は TECH_DEBT_MAX', () => {
    expect(clampTechDebt(Infinity)).toBe(TECH_DEBT_MAX);
  });
});

describe('accumulateTechDebt', () => {
  it.each([
    [0, 0, 0],
    [0, 1, 1],
    [MAX - 1, 1, MAX], // 上限にちょうど一致
    [MAX - 1, 2, MAX], // 超過は上限で止める
    [MAX, 1, MAX], // 上限から1足しても上限
    [MAX - 10, 10, MAX],
    [MAX - 10, 11, MAX],
    [10, -1, 10],
    [10, NaN, 10],
    [10, Infinity, 10],
    [10, -Infinity, 10],
  ])('accumulateTechDebt(%d, %d) = %d', (debt, amount, expected) => {
    expect(accumulateTechDebt(debt, amount, MAX)).toBe(expected);
  });
});

describe('repayTechDebt', () => {
  it.each([
    [10, 0, 10],
    [10, 1, 9],
    [10, 10, 0], // 0 にちょうど一致
    [10, 11, 0], // 1 超過しても 0 で止める
    [0, 1, 0], // すでに 0
    [0, 0, 0],
    [MAX, 1, MAX - 1],
    [10, -1, 10],
    [10, NaN, 10],
    [10, Infinity, 10],
    [10, -Infinity, 10],
  ])('repayTechDebt(%d, %d) = %d', (debt, amount, expected) => {
    expect(repayTechDebt(debt, amount, MAX)).toBe(expected);
  });
});

describe('sanitizeRefactoringRatio', () => {
  it.each([
    [-0.01, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [1.01, 1],
    [Infinity, 1],
    [-Infinity, 0],
  ])('sanitizeRefactoringRatio(%d) = %d', (ratio, expected) => {
    expect(sanitizeRefactoringRatio(ratio)).toBe(expected);
  });

  it('NaN は既定の割合', () => {
    expect(sanitizeRefactoringRatio(NaN)).toBe(DEFAULT_REFACTORING_RATIO);
    expect(sanitizeRefactoringRatio(NaN, 0.3)).toBe(0.3);
  });
});

describe('resolveWorkTechDebt', () => {
  const params = { perFeatureWork: 10, repayPerRefactoringWork: 20, max: MAX };

  it('r=0: すべて機能開発で perFeatureWork だけ溜まる', () => {
    expect(resolveWorkTechDebt(50, 0, params)).toEqual({ previous: 50, current: 60, accumulated: 10, repaid: 0 });
  });

  it('r=1: すべてリファクタリングで repayPerRefactoringWork だけ返す', () => {
    expect(resolveWorkTechDebt(50, 1, params)).toEqual({ previous: 50, current: 30, accumulated: 0, repaid: 20 });
  });

  it('r=0.5: 溜まる 5、返す 10 で正味 -5', () => {
    expect(resolveWorkTechDebt(50, 0.5, params)).toEqual({ previous: 50, current: 45, accumulated: 5, repaid: 10 });
  });

  it('正味 0 の割合では変化しない（溜まる量と返す量が同じ）', () => {
    expect(resolveWorkTechDebt(50, 0.5, { perFeatureWork: 10, repayPerRefactoringWork: 10, max: MAX })).toEqual({
      previous: 50,
      current: 50,
      accumulated: 5,
      repaid: 5,
    });
    // 10 と 20 では r=1/3 で正味 0（浮動小数の誤差はあり得る）。
    expect(resolveWorkTechDebt(50, 1 / 3, params).current).toBeCloseTo(50, 10);
  });

  it.each([
    [MAX - 10, MAX], // 上限にちょうど一致
    [MAX - 9, MAX], // 超過は上限で止める
    [MAX - 11, MAX - 1],
    [MAX, MAX], // 上限からはそれ以上溜まらない
  ])('上限付近: r=0 で %d → %d', (debt, expected) => {
    expect(resolveWorkTechDebt(debt, 0, params).current).toBe(expected);
  });

  it.each([
    [20, 0], // 0 にちょうど一致
    [19, 0], // 超過しても 0 で止める
    [21, 1],
    [0, 0], // すでに 0
  ])('0 付近: r=1 で %d → %d', (debt, expected) => {
    expect(resolveWorkTechDebt(debt, 1, params).current).toBe(expected);
  });

  it.each([
    [-0.01, 60], // 0 に丸めて r=0
    [1.01, 30], // 1 に丸めて r=1
    [Infinity, 30],
    [-Infinity, 60],
  ])('範囲外の割合 %d は丸めて精算する（50 → %d）', (ratio, expected) => {
    expect(resolveWorkTechDebt(50, ratio, params).current).toBe(expected);
  });

  it('NaN の割合は既定の割合で精算する', () => {
    expect(resolveWorkTechDebt(50, NaN, params)).toEqual(resolveWorkTechDebt(50, DEFAULT_REFACTORING_RATIO, params));
  });

  it.each([
    [0, 50], // 0 の量は 0
    [-1, 50],
    [NaN, 50],
    [Infinity, 50],
    [-Infinity, 50],
  ])('不正な perFeatureWork %d は 0 として扱う（r=0 で 50 → %d）', (perFeatureWork, expected) => {
    expect(resolveWorkTechDebt(50, 0, { ...params, perFeatureWork }).current).toBe(expected);
  });

  it.each([
    [0, 50],
    [-1, 50],
    [NaN, 50],
    [Infinity, 50],
    [-Infinity, 50],
  ])('不正な repayPerRefactoringWork %d は 0 として扱う（r=1 で 50 → %d）', (repayPerRefactoringWork, expected) => {
    expect(resolveWorkTechDebt(50, 1, { ...params, repayPerRefactoringWork }).current).toBe(expected);
  });

  it('params の既定値は config の値', () => {
    const result = resolveWorkTechDebt(0, 0);
    expect(result.accumulated).toBe(TECH_DEBT_PER_FEATURE_WORK);
    expect(resolveWorkTechDebt(TECH_DEBT_MAX, 1).repaid).toBe(TECH_DEBT_REPAY_PER_REFACTORING_WORK);
  });

  it('入力のオブジェクトを変更しない', () => {
    const input = { perFeatureWork: 10, repayPerRefactoringWork: 20, max: MAX };
    const snapshot = { ...input };
    resolveWorkTechDebt(50, 0.5, input);
    expect(input).toEqual(snapshot);
  });
});

describe('createTechDebtChangedEvent', () => {
  it('イベント名は tech-debt-changed', () => {
    expect(TECH_DEBT_CHANGED_EVENT).toBe('tech-debt-changed');
  });

  it('増加: delta は正', () => {
    expect(createTechDebtChangedEvent(10, 18, 'work')).toEqual({ previous: 10, current: 18, delta: 8, reason: 'work' });
  });

  it('減少: delta は負', () => {
    expect(createTechDebtChangedEvent(30, 10, 'refactoring')).toEqual({
      previous: 30,
      current: 10,
      delta: -20,
      reason: 'refactoring',
    });
  });

  it('変化なし: delta は 0', () => {
    expect(createTechDebtChangedEvent(MAX, MAX, 'feature').delta).toBe(0);
  });
});

describe('formatTechDebt', () => {
  it.each([
    [0, '技術的負債: 0'],
    [1, '技術的負債: 1'],
    [4.49, '技術的負債: 4'],
    [4.5, '技術的負債: 5'],
    [99.49, '技術的負債: 99'],
    [99.5, '技術的負債: 100'],
    [100, '技術的負債: 100'],
  ])('formatTechDebt(%d) = %s', (debt, expected) => {
    expect(formatTechDebt(debt)).toBe(expected);
  });
});
