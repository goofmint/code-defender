import { describe, expect, it } from 'vitest';
import type { CodeKind } from './code';
import { REVENUE_PER_NORMAL_CODE } from './config';
import { MALICIOUS_CODE_TYPES } from './maliciousCode';
import type { CodeVariant } from './maliciousCode';
import { getReleaseRevenue, sellReleasedCode } from './sales';

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
