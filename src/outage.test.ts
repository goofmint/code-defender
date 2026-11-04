import { describe, expect, it } from 'vitest';
import {
  INCIDENT_DAMAGE_UNIT_YEN,
  INCIDENT_DEFAULT_DAMAGE_POINTS,
  TECH_DEBT_MAX,
  TECH_DEBT_OUTAGE_DAMAGE,
  TECH_DEBT_OUTAGE_DAMAGE_POINTS,
  TECH_DEBT_OUTAGE_GRACE_MS,
  TECH_DEBT_OUTAGE_THRESHOLD,
} from './config';
import { checkBankruptcy, INITIAL_GAME_OVER_STATE } from './gameOver';
import {
  advanceTechDebtNeglect,
  isTechDebtOverOutageThreshold,
  MAJOR_OUTAGE_EVENT,
  settleMajorOutage,
} from './outage';
import type { MajorOutageEvent } from './outage';

const THRESHOLD = TECH_DEBT_OUTAGE_THRESHOLD;
const GRACE = TECH_DEBT_OUTAGE_GRACE_MS;
const OVER = THRESHOLD + 1;

const outageEvent = (
  techDebt: number,
  neglectedMs: number,
  damage: number,
  fundsBefore: number,
  fundsAfter: number,
): MajorOutageEvent => ({ techDebt, neglectedMs, damage, fundsBefore, fundsAfter });

describe('大障害の設定値', () => {
  it('閾値は 0 より大きく上限より小さい', () => {
    expect(THRESHOLD).toBeGreaterThan(0);
    expect(THRESHOLD).toBeLessThan(TECH_DEBT_MAX);
  });

  it('放置時間の猶予は正', () => {
    expect(GRACE).toBeGreaterThan(0);
  });

  it('損害額は損害ポイント × 単位円で、種別なしの不正コードの損害より大きい', () => {
    expect(TECH_DEBT_OUTAGE_DAMAGE).toBe(TECH_DEBT_OUTAGE_DAMAGE_POINTS * INCIDENT_DAMAGE_UNIT_YEN);
    expect(TECH_DEBT_OUTAGE_DAMAGE).toBeGreaterThan(INCIDENT_DEFAULT_DAMAGE_POINTS * INCIDENT_DAMAGE_UNIT_YEN);
  });
});

describe('MAJOR_OUTAGE_EVENT', () => {
  it('イベント名', () => {
    expect(MAJOR_OUTAGE_EVENT).toBe('major-outage-occurred');
  });
});

describe('isTechDebtOverOutageThreshold', () => {
  it.each([
    [THRESHOLD - 0.001, false],
    [THRESHOLD, false],
    [THRESHOLD + 0.001, true],
    [0, false],
    [TECH_DEBT_MAX, true],
    [NaN, false],
  ])('負債 %d は超過 %s', (debt, expected) => {
    expect(isTechDebtOverOutageThreshold(debt)).toBe(expected);
  });

  it('閾値を上書きできる', () => {
    expect(isTechDebtOverOutageThreshold(10, 9)).toBe(true);
    expect(isTechDebtOverOutageThreshold(10, 10)).toBe(false);
  });
});

describe('advanceTechDebtNeglect: 放置時間の境界', () => {
  it.each([
    ['猶予 - 1 ms は起きない', GRACE - 1, { neglectMs: GRACE - 1, outage: false, neglectedMs: GRACE - 1 }],
    ['猶予ちょうどで起きて 0 に戻る', GRACE, { neglectMs: 0, outage: true, neglectedMs: GRACE }],
    ['猶予 + 1 ms で起きて超過分は持ち越さない', GRACE + 1, { neglectMs: 0, outage: true, neglectedMs: GRACE + 1 }],
  ])('%s', (_name, delta, expected) => {
    expect(advanceTechDebtNeglect(0, OVER, delta)).toEqual(expected);
  });

  it('フレームをまたいで累積し、猶予に達したフレームで起きる', () => {
    const first = advanceTechDebtNeglect(0, OVER, GRACE - 1);
    expect(first.outage).toBe(false);
    expect(advanceTechDebtNeglect(first.neglectMs, OVER, 1)).toEqual({
      neglectMs: 0,
      outage: true,
      neglectedMs: GRACE,
    });
  });

  it('猶予の数倍の delta でも大障害は1回', () => {
    expect(advanceTechDebtNeglect(0, OVER, GRACE * 5)).toEqual({
      neglectMs: 0,
      outage: true,
      neglectedMs: GRACE * 5,
    });
  });

  it('超過を続けると、発生後さらに猶予ぶん経ったときに再発する', () => {
    const occurred = advanceTechDebtNeglect(0, OVER, GRACE);
    expect(occurred.outage).toBe(true);
    const almost = advanceTechDebtNeglect(occurred.neglectMs, OVER, GRACE - 1);
    expect(almost).toEqual({ neglectMs: GRACE - 1, outage: false, neglectedMs: GRACE - 1 });
    expect(advanceTechDebtNeglect(almost.neglectMs, OVER, 1).outage).toBe(true);
  });
});

describe('advanceTechDebtNeglect: リセット', () => {
  it.each([
    ['閾値ちょうど', THRESHOLD],
    ['閾値未満', THRESHOLD - 0.001],
    ['0', 0],
    ['NaN', NaN],
  ])('負債が%sなら放置時間は 0 に戻り起きない', (_name, debt) => {
    expect(advanceTechDebtNeglect(GRACE - 1, debt, GRACE)).toEqual({
      neglectMs: 0,
      outage: false,
      neglectedMs: 0,
    });
  });

  it('一度下がると累積はやり直し', () => {
    const before = advanceTechDebtNeglect(0, OVER, GRACE - 1);
    const reset = advanceTechDebtNeglect(before.neglectMs, THRESHOLD, 1);
    expect(reset.neglectMs).toBe(0);
    expect(advanceTechDebtNeglect(reset.neglectMs, OVER, 1)).toEqual({
      neglectMs: 1,
      outage: false,
      neglectedMs: 1,
    });
  });
});

describe('advanceTechDebtNeglect: 不正な delta', () => {
  it.each([0, -1, NaN, Infinity, -Infinity])('delta %d では時間が進まない', (delta) => {
    expect(advanceTechDebtNeglect(GRACE - 1, OVER, delta)).toEqual({
      neglectMs: GRACE - 1,
      outage: false,
      neglectedMs: GRACE - 1,
    });
  });

  it.each([-1, NaN, Infinity])('不正な放置時間 %d は 0 から数える', (neglect) => {
    expect(advanceTechDebtNeglect(neglect, OVER, 1)).toEqual({ neglectMs: 1, outage: false, neglectedMs: 1 });
  });
});

describe('advanceTechDebtNeglect: 上書き', () => {
  it('閾値と猶予を上書きできる', () => {
    expect(advanceTechDebtNeglect(0, 11, 99, { threshold: 10, graceMs: 100 }).outage).toBe(false);
    expect(advanceTechDebtNeglect(0, 11, 100, { threshold: 10, graceMs: 100 }).outage).toBe(true);
    expect(advanceTechDebtNeglect(0, 10, 100, { threshold: 10, graceMs: 100 }).outage).toBe(false);
  });
});

describe('settleMajorOutage', () => {
  const D = TECH_DEBT_OUTAGE_DAMAGE;

  it.each([
    ['1 円残る', D + 1, 1],
    ['ちょうど 0 になる', D, 0],
    ['負になる', D - 1, -1],
    ['すでに負', -500, -500 - D],
  ])('資金が%s', (_name, funds, expected) => {
    expect(settleMajorOutage(funds, OVER, GRACE, INITIAL_GAME_OVER_STATE)).toEqual(
      outageEvent(OVER, GRACE, D, funds, expected),
    );
  });

  it.each([
    [1, D + 1, false],
    [0, D, true],
    [-1, D - 1, true],
  ])('精算後 %d 円の倒産判定は %s', (expected, funds, bankrupt) => {
    const event = settleMajorOutage(funds, OVER, GRACE, INITIAL_GAME_OVER_STATE);
    expect(event?.fundsAfter).toBe(expected);
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, expected, 100).triggered).toBe(bankrupt);
  });

  it('ゲームオーバー後は null', () => {
    expect(settleMajorOutage(1000000, OVER, GRACE, { over: true, at: 50 })).toBeNull();
  });

  it('損害額を上書きできる', () => {
    expect(settleMajorOutage(1000, OVER, GRACE, INITIAL_GAME_OVER_STATE, 300)).toEqual(
      outageEvent(OVER, GRACE, 300, 1000, 700),
    );
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('不正な損害額 %d は 0 として扱う', (damage) => {
    expect(settleMajorOutage(1000, OVER, GRACE, INITIAL_GAME_OVER_STATE, damage)).toEqual(
      outageEvent(OVER, GRACE, 0, 1000, 1000),
    );
  });
});
