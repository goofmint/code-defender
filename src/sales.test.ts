import { describe, expect, it } from 'vitest';
import type { CodeKind } from './code';
import { DEFAULT_REFACTORING_RATIO, REVENUE_PER_NORMAL_CODE } from './config';
import { accumulateScore } from './score';
import { createFundsChangedEvent } from './funds';
import { MALICIOUS_CODE_TYPES } from './maliciousCode';
import type { CodeVariant } from './maliciousCode';
import { getFeatureRevenueMultiplier, getReleaseRevenue, sellReleasedCode } from './sales';
import { resolveWorkTechDebt } from './techDebt';

const R = REVENUE_PER_NORMAL_CODE;

describe('REVENUE_PER_NORMAL_CODE', () => {
  it('正の整数', () => {
    expect(Number.isInteger(R)).toBe(true);
    expect(R).toBeGreaterThan(0);
  });
});

describe('getReleaseRevenue', () => {
  it.each<[CodeKind, number | undefined, number]>([
    ['normal', undefined, R],
    ['malicious', undefined, 0],
    ['normal', 1, 1],
    ['normal', 0, 0],
    ['normal', -1, 0],
    ['normal', NaN, 0],
    ['normal', Infinity, 0],
    ['normal', -Infinity, 0],
    ['malicious', 1, 0],
  ])('kind=%s 単価=%s → %d', (kind, price, expected) => {
    expect(price === undefined ? getReleaseRevenue(kind) : getReleaseRevenue(kind, price)).toBe(
      expected,
    );
  });
});

describe('sellReleasedCode（資金の境界）', () => {
  it.each([-300000, -1, 0, 1, 1000000])('資金 %d の正常コードで売上が加算される', (funds) => {
    expect(sellReleasedCode(funds, 'normal')).toBe(funds + R);
  });
});

describe('sellReleasedCode（不正コード）', () => {
  const variants: CodeVariant[] = MALICIOUS_CODE_TYPES.map((maliciousType) => ({
    kind: 'malicious',
    maliciousType,
  }));
  it.each(variants.map((v) => [v.kind === 'malicious' ? v.maliciousType : '', v.kind] as const))(
    '不正コード %s は資金が変わらない',
    (_type, kind) => {
      expect(sellReleasedCode(-300000, kind)).toBe(-300000);
      expect(sellReleasedCode(0, kind)).toBe(0);
      expect(sellReleasedCode(1000000, kind)).toBe(1000000);
    },
  );
});

describe('sellReleasedCode（単価の境界）', () => {
  it.each([
    [1, 101],
    [0, 100],
    [-1, 100],
    [NaN, 100],
    [Infinity, 100],
    [-Infinity, 100],
  ])('単価 %d で資金 100 → %d', (price, expected) => {
    expect(sellReleasedCode(100, 'normal', price)).toBe(expected);
  });
});

describe('同じフレームで複数件リリース', () => {
  const apply = (funds: number, kinds: readonly CodeKind[]): number =>
    kinds.reduce((acc, kind) => sellReleasedCode(acc, kind), funds);

  it.each<[string, CodeKind[], number]>([
    ['0件', [], 0],
    ['正常1件', ['normal'], R],
    ['正常3件', ['normal', 'normal', 'normal'], 3 * R],
    ['不正のみ2件', ['malicious', 'malicious'], 0],
    ['混在', ['normal', 'malicious', 'normal', 'malicious', 'normal'], 3 * R],
  ])('%s', (_label, kinds, expectedGain) => {
    expect(apply(-300000, kinds)).toBe(-300000 + expectedGain);
  });
});

describe('入力を変更しない', () => {
  it('同じ入力で同じ結果を返し、引数の配列なども変わらない', () => {
    const kinds: readonly CodeKind[] = Object.freeze(['normal', 'malicious']);
    expect(sellReleasedCode(10, kinds[0])).toBe(sellReleasedCode(10, kinds[0]));
    expect(kinds).toEqual(['normal', 'malicious']);
  });
});

describe('getFeatureRevenueMultiplier（#42）', () => {
  it.each([
    [0, 1.25],
    [DEFAULT_REFACTORING_RATIO, 1],
    [1, 0],
    [-0.01, 1.25],
    [-Infinity, 1.25],
    [1.01, 0],
    [Infinity, 0],
    [NaN, 1],
  ])('r=%s → 倍率 %s', (ratio, expected) => {
    expect(getFeatureRevenueMultiplier(ratio)).toBeCloseTo(expected, 10);
  });

  it('既定の配分ではちょうど 1（既存の売上が変わらない）', () => {
    expect(getFeatureRevenueMultiplier(DEFAULT_REFACTORING_RATIO)).toBe(1);
  });
});

describe('getReleaseRevenue（配分の指定 #42）', () => {
  it.each([
    [0, 25000],
    [0.01, 24750],
    [0.2, 20000],
    [0.99, 250],
    [1, 0],
    [-0.01, 25000],
    [-Infinity, 25000],
    [1.01, 0],
    [Infinity, 0],
    [NaN, 20000],
  ])('単価 20000 円・r=%s → %d 円', (ratio, expected) => {
    expect(getReleaseRevenue('normal', 20000, ratio)).toBe(expected);
  });

  it('既定の単価と配分では REVENUE_PER_NORMAL_CODE ちょうど', () => {
    expect(getReleaseRevenue('normal', R, DEFAULT_REFACTORING_RATIO)).toBe(R);
  });

  it('機能開発の割合が大きいほど売上は同じか大きい（結果は整数）', () => {
    const ratios = [1, 0.99, 0.9, 0.75, 0.5, 1 / 3, 0.2, 0.1, 0.01, 0];
    const revenues = ratios.map((ratio) => getReleaseRevenue('normal', R, ratio));
    revenues.forEach((revenue) => expect(Number.isInteger(revenue)).toBe(true));
    revenues.slice(1).forEach((revenue, i) => expect(revenue).toBeGreaterThanOrEqual(revenues[i]));
  });

  it.each([
    // 単価 1 円: 倍率 1.25 → 1.25 → 1、倍率 0.5 → 0.5 → 1（四捨五入）、倍率 0.0125 → 0
    [1, 0, 1],
    [1, 0.6, 1],
    [1, 0.99, 0],
    [2, 0, 3],
    [1, DEFAULT_REFACTORING_RATIO, 1],
    // 1 に極めて近い配分は 0 円に丸まる
    [R, 1 - 1e-9, 0],
  ])('単価 %d 円・r=%s → %d 円（四捨五入）', (price, ratio, expected) => {
    expect(getReleaseRevenue('normal', price, ratio)).toBe(expected);
  });

  it('r=0 でも不正コードの売上は 0', () => {
    expect(getReleaseRevenue('malicious', R, 0)).toBe(0);
    expect(sellReleasedCode(100, 'malicious', R, 0)).toBe(100);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('単価 %s は配分によらず 0', (price) => {
    [0, DEFAULT_REFACTORING_RATIO, 1, NaN].forEach((ratio) => {
      expect(getReleaseRevenue('normal', price, ratio)).toBe(0);
    });
  });

  it.each([0, 0.01, 0.2, 0.99, 1, NaN])('sellReleasedCode は r=%s の売上額を資金に加算する', (ratio) => {
    expect(sellReleasedCode(-300000, 'normal', R, ratio)).toBe(
      -300000 + getReleaseRevenue('normal', R, ratio),
    );
  });
});

// シーンと同じ順序（onCodeReleased → funds-changed → onFundsChanged）: 売上が正なら資金と累計売上に反映し、
// 売上とは別に、正常コードかつゲームオーバー前なら作業1単位として負債を精算する。シーンは起動しない。
describe('売上と負債精算の連携（#42）', () => {
  const release = (
    state: { readonly funds: number; readonly score: number; readonly debt: number; readonly over: boolean },
    kind: CodeKind,
    ratio: number,
  ) => {
    let { funds, score, debt } = state;
    if (getReleaseRevenue(kind, R, ratio) > 0) {
      const next = sellReleasedCode(funds, kind, R, ratio);
      score = accumulateScore(score, createFundsChangedEvent(funds, next, 'sales'), state.over);
      funds = next;
    }
    if (kind === 'normal' && !state.over) {
      debt = resolveWorkTechDebt(debt, ratio).current;
    }
    return { funds, score, debt, over: state.over };
  };
  const start = { funds: 1000000, score: 0, debt: 50, over: false };

  it.each([
    ['r=1: 売上 0 で資金・累計売上は変わらず、負債だけ返す', 1, 1000000, 0, 30],
    ['r=0: 売上 25,000 円、負債 +10', 0, 1025000, 25000, 60],
    ['既定の配分: 売上 20,000 円、負債 +4', DEFAULT_REFACTORING_RATIO, 1020000, 20000, 54],
  ])('%s', (_label, ratio, funds, score, debt) => {
    const result = release(start, 'normal', ratio);
    expect(result.funds).toBe(funds);
    expect(result.score).toBe(score);
    expect(result.debt).toBeCloseTo(debt, 10);
  });

  it('不正コードでは売上も負債精算もない', () => {
    expect(release(start, 'malicious', 0)).toEqual(start);
  });

  it('ゲームオーバー後は累計売上も負債も変わらない', () => {
    const over = { ...start, over: true };
    [0, DEFAULT_REFACTORING_RATIO, 1].forEach((ratio) => {
      const result = release(over, 'normal', ratio);
      expect(result.score).toBe(0);
      expect(result.debt).toBe(50);
    });
  });
});
