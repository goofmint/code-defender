import { describe, expect, it, vi } from 'vitest';
import { ciSlowedDistance, getCiInterceptRate, hasActiveCi, rollCiInterception } from './ci';
import { CI_INTERCEPT_RATE, CI_SLOW_MULTIPLIER, ITEM_STRONG_AGAINST_MULTIPLIER } from './config';
import { getItemRange, ITEM_TYPES } from './item';
import type { ItemType } from './item';
import type { PlacedItem } from './itemPlacement';
import { MALICIOUS_CODE_TYPES } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';

const ZONE = getItemRange('ci');
const DISTANCE = 10;
const M = CI_SLOW_MULTIPLIER;

const placed = (id: number, itemType: ItemType): PlacedItem => ({
  id,
  itemType,
  cell: { col: id + 1, row: 2 },
  lastAttackTime: null,
});

// 呼ばれた順に値を返す乱数。呼び出し回数も検証できる。
const sequence = (...values: number[]) => {
  let index = 0;
  return vi.fn(() => {
    const value = values[index];
    index += 1;
    if (value === undefined) {
      throw new Error('想定より多く乱数が呼ばれました');
    }
    return value;
  });
};

describe('ciSlowedDistance（ゾーン境界の境界値）', () => {
  const cases: [string, number, number][] = [
    ['ゾーン外の残りが移動量より 1 大きい → 減速なし', ZONE + DISTANCE + 1, DISTANCE],
    ['ゾーン外の残りがちょうど移動量 → 減速なし', ZONE + DISTANCE, DISTANCE],
    ['ゾーン外の残りが移動量より 1 小さい → 最後の 1 だけ減速', ZONE + DISTANCE - 1, DISTANCE - 1 + 1 * M],
    ['ゾーンの入口ちょうど → 全量を減速', ZONE, DISTANCE * M],
    ['ゾーンの中 → 全量を減速', ZONE - 1, DISTANCE * M],
    ['残り 0 → 全量を減速', 0, DISTANCE * M],
  ];
  it.each(cases)('%s', (_label, remaining, expected) => {
    expect(ciSlowedDistance(remaining, DISTANCE, ZONE, M)).toBeCloseTo(expected);
  });

  it('既定の倍率は CI_SLOW_MULTIPLIER', () => {
    expect(ciSlowedDistance(0, DISTANCE, ZONE)).toBeCloseTo(DISTANCE * CI_SLOW_MULTIPLIER);
  });
});

describe('ciSlowedDistance（不正な入力）', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('移動量 %d はそのまま返す', (distance) => {
    expect(ciSlowedDistance(0, distance, ZONE, M)).toBe(distance);
  });

  it.each([0, -1, Number.NaN])('ゾーン長 %d は減速しない', (zone) => {
    expect(ciSlowedDistance(0, DISTANCE, zone, M)).toBe(DISTANCE);
  });

  it('残り距離が非有限なら減速しない', () => {
    expect(ciSlowedDistance(Number.NaN, DISTANCE, ZONE, M)).toBe(DISTANCE);
  });

  const multiplierCases: [string, number, number][] = [
    ['倍率 0 はゾーン内で止まる', 0, 0],
    ['倍率 1 は減速なし', 1, DISTANCE],
    ['倍率 NaN は減速なし', Number.NaN, DISTANCE],
    ['倍率 Infinity は減速なし', Number.POSITIVE_INFINITY, DISTANCE],
    ['倍率が 1 より大きいと 1 に収める', 2, DISTANCE],
    ['倍率が負だと 0 に収める', -1, 0],
  ];
  it.each(multiplierCases)('%s', (_label, multiplier, expected) => {
    expect(ciSlowedDistance(0, DISTANCE, ZONE, multiplier)).toBe(expected);
  });

  it('倍率 0 でも、ゾーン外の残りぶんは進む（入口で止まる）', () => {
    expect(ciSlowedDistance(ZONE + 3, DISTANCE, ZONE, 0)).toBe(3);
  });
});

describe('getCiInterceptRate', () => {
  const strong: readonly MaliciousCodeType[] = ['bug', 'lowPerformance'];

  it.each(MALICIOUS_CODE_TYPES.filter((type) => !strong.includes(type)))('得意でない %s は基本確率', (type) => {
    expect(getCiInterceptRate(type)).toBe(CI_INTERCEPT_RATE);
  });

  it.each(strong)('得意な %s は基本確率 × 得意倍率', (type) => {
    expect(getCiInterceptRate(type)).toBeCloseTo(Math.min(1, CI_INTERCEPT_RATE * ITEM_STRONG_AGAINST_MULTIPLIER));
  });

  it('種類なしは基本確率', () => {
    expect(getCiInterceptRate(undefined)).toBe(CI_INTERCEPT_RATE);
  });

  it('得意倍率を掛けて 1 を超えたら 1 に収める', () => {
    expect(getCiInterceptRate('bug', 0.9)).toBe(1);
  });

  it.each([
    [0, 0],
    [1, 1],
    [-0.1, 0],
    [1.5, 1],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('基本確率 %d は %d になる', (base, expected) => {
    expect(getCiInterceptRate(undefined, base)).toBe(expected);
  });
});

describe('rollCiInterception（確率の閾値の境界値）', () => {
  const ci = placed(0, 'ci');
  const malicious = { kind: 'malicious' as const };
  const rate = CI_INTERCEPT_RATE;

  it.each([
    ['乱数 0 は阻止', 0, true],
    ['乱数 rate − ε は阻止', rate - 1e-9, true],
    ['乱数 rate ちょうどは阻止しない', rate, false],
    ['乱数 NaN は阻止しない', Number.NaN, false],
    ['乱数 1 は阻止しない', 1, false],
  ])('%s', (_label, value, intercepted) => {
    expect(rollCiInterception([ci], malicious, sequence(value), rate)).toBe(intercepted ? ci : null);
  });

  it('確率 0 は乱数 0 でも阻止しない', () => {
    expect(rollCiInterception([ci], malicious, sequence(0), 0)).toBeNull();
  });

  it('確率 1 は乱数 1 − ε で阻止し、乱数 1 では阻止しない', () => {
    expect(rollCiInterception([ci], malicious, sequence(1 - 1e-9), 1)).toBe(ci);
    expect(rollCiInterception([ci], malicious, sequence(1), 1)).toBeNull();
  });

  it('得意な種類は得意倍率ぶん閾値が上がる', () => {
    const value = rate + 1e-9;
    expect(rollCiInterception([ci], { kind: 'malicious', maliciousType: 'bug' }, sequence(value), rate)).toBe(ci);
    expect(rollCiInterception([ci], { kind: 'malicious', maliciousType: 'typo' }, sequence(value), rate)).toBeNull();
  });

  it('種類なしの不正コードは基本確率で判定する', () => {
    expect(rollCiInterception([ci], { kind: 'malicious' }, sequence(rate - 1e-9), rate)).toBe(ci);
  });
});

describe('rollCiInterception（対象と乱数の呼び出し回数）', () => {
  it('正常なコードは乱数を呼ばずに null', () => {
    const random = sequence();
    expect(rollCiInterception([placed(0, 'ci')], { kind: 'normal' }, random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it('CI が0個（CI 以外だけ）なら乱数を呼ばずに null', () => {
    const random = sequence();
    const others = ITEM_TYPES.filter((type) => type !== 'ci').map((type, index) => placed(index, type));
    expect(rollCiInterception(others, { kind: 'malicious' }, random)).toBeNull();
    expect(rollCiInterception([], { kind: 'malicious' }, random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it('CI 2個: 1個目が阻止したら2個目は判定しない', () => {
    const items = [placed(0, 'ci'), placed(1, 'ci')];
    const random = sequence(0);
    expect(rollCiInterception(items, { kind: 'malicious' }, random)).toBe(items[0]);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('CI 2個: 1個目が失敗したら2個目を独立に判定する', () => {
    const items = [placed(0, 'linter'), placed(1, 'ci'), placed(2, 'ci')];
    const random = sequence(0.99, 0);
    expect(rollCiInterception(items, { kind: 'malicious' }, random)).toBe(items[2]);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('CI 2個: 両方失敗したら null で、乱数は2回', () => {
    const items = [placed(0, 'ci'), placed(1, 'ci')];
    const random = sequence(0.99, Number.NaN);
    expect(rollCiInterception(items, { kind: 'malicious' }, random)).toBeNull();
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('入力を変更しない', () => {
    const items = [placed(0, 'ci')];
    const snapshot = JSON.parse(JSON.stringify(items));
    rollCiInterception(items, { kind: 'malicious' }, sequence(0));
    expect(JSON.parse(JSON.stringify(items))).toEqual(snapshot);
  });
});

describe('hasActiveCi', () => {
  it('CI が1個以上あれば true', () => {
    expect(hasActiveCi([placed(0, 'linter'), placed(1, 'ci')])).toBe(true);
  });

  it('CI がなければ false', () => {
    expect(hasActiveCi([])).toBe(false);
    expect(hasActiveCi(ITEM_TYPES.filter((type) => type !== 'ci').map((type, index) => placed(index, type)))).toBe(false);
  });
});
