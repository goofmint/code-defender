import { describe, expect, it } from 'vitest';
import {
  ENERGY_DRINK_BOOST_DURATION_MS,
  ENERGY_DRINK_BOOST_SPEED_MULTIPLIER,
  ENERGY_DRINK_SLUMP_DURATION_MS,
  ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER,
  FRIDAY_DEPLOY_INCIDENT_PROBABILITY,
  PIZZA_SPAWN_INTERVAL_MULTIPLIER,
  WORKS_FINE_CODE_SPEED_MULTIPLIER,
} from './config';
import {
  canRollback,
  codeMoveMultiplier,
  expireEffects,
  isEffectActive,
  playerSpeedMultiplier,
  recordIncident,
  rollbackIncident,
  rollFridayDeployIncident,
  scheduleIncident,
  spawnIntervalMultiplier,
  startEffect,
  startEnergyDrink,
  takeDueIncidents,
} from './itemEffect';
import type { ActiveEffect } from './itemEffect';

const T0 = 10_000;
const DURATION = 3_000;

describe('startEffect: 開始とリフレッシュ', () => {
  it('開始時刻から継続時間ぶんの効果を足す', () => {
    expect(startEffect([], 'codeFreeze', T0, DURATION)).toEqual([
      { kind: 'codeFreeze', startMs: T0, endMs: T0 + DURATION },
    ]);
  });

  it('同じ種類を買い直すと1つのまま、終了時刻だけ買い直した時点から数え直す（効果量は足さない）', () => {
    const first = startEffect([], 'pizza', T0, DURATION);
    const refreshed = startEffect(first, 'pizza', T0 + 1_000, DURATION);
    expect(refreshed).toEqual([{ kind: 'pizza', startMs: T0 + 1_000, endMs: T0 + 1_000 + DURATION }]);
    expect(spawnIntervalMultiplier(refreshed, T0 + 1_000)).toBe(PIZZA_SPAWN_INTERVAL_MULTIPLIER);
  });

  it('別の種類は残す。入力は変更しない', () => {
    const input: readonly ActiveEffect[] = [{ kind: 'codeFreeze', startMs: 0, endMs: 100 }];
    const snapshot = JSON.stringify(input);
    const next = startEffect(input, 'worksFine', T0, DURATION);
    expect(next.map((effect) => effect.kind)).toEqual(['codeFreeze', 'worksFine']);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('期限切れの境界（終了時刻ちょうどで切れる）', () => {
  const effects = startEffect([], 'codeFreeze', T0, DURATION);

  it.each([
    [T0 - 1, false],
    [T0, true],
    [T0 + DURATION - 1, true],
    [T0 + DURATION, false],
  ])('時刻 %i で有効か: %s', (now, active) => {
    expect(isEffectActive(effects, 'codeFreeze', now)).toBe(active);
  });

  it('expireEffects は終了時刻以上の効果を除く', () => {
    expect(expireEffects(effects, T0 + DURATION - 1)).toEqual(effects);
    expect(expireEffects(effects, T0 + DURATION)).toEqual([]);
  });
});

describe('倍率', () => {
  it('効果がなければすべて 1', () => {
    expect(spawnIntervalMultiplier([], T0)).toBe(1);
    expect(codeMoveMultiplier([], T0)).toBe(1);
    expect(playerSpeedMultiplier([], T0)).toBe(1);
  });

  it('ピザは生成間隔、「動いてるからヨシ！」はコードの移動に効き、互いに影響しない', () => {
    const effects = startEffect(startEffect([], 'pizza', T0, DURATION), 'worksFine', T0, DURATION);
    expect(spawnIntervalMultiplier(effects, T0)).toBe(PIZZA_SPAWN_INTERVAL_MULTIPLIER);
    expect(codeMoveMultiplier(effects, T0)).toBe(WORKS_FINE_CODE_SPEED_MULTIPLIER);
    expect(playerSpeedMultiplier(effects, T0)).toBe(1);
  });

  it('仮の値の向き: ピザは間隔を短く、ヨシはコードを速く', () => {
    expect(PIZZA_SPAWN_INTERVAL_MULTIPLIER).toBeLessThan(1);
    expect(WORKS_FINE_CODE_SPEED_MULTIPLIER).toBe(2);
  });
});

describe('startEnergyDrink: 加速の後に鈍化が続く2段階', () => {
  const effects = startEnergyDrink([], T0);
  const boostEnd = T0 + ENERGY_DRINK_BOOST_DURATION_MS;
  const slumpEnd = boostEnd + ENERGY_DRINK_SLUMP_DURATION_MS;

  it.each([
    ['購入時', T0, ENERGY_DRINK_BOOST_SPEED_MULTIPLIER],
    ['加速の終わり - 1ms', boostEnd - 1, ENERGY_DRINK_BOOST_SPEED_MULTIPLIER],
    ['加速の終わりちょうど（鈍化の始まり）', boostEnd, ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER],
    ['鈍化の終わり - 1ms', slumpEnd - 1, ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER],
    ['鈍化の終わりちょうど', slumpEnd, 1],
  ])('%s の主人公の速度倍率は %s', (_name, now, multiplier) => {
    expect(playerSpeedMultiplier(effects, now)).toBe(multiplier);
  });

  it('仮の値の向き: 加速は 1 より大きく、鈍化は 1 より小さい', () => {
    expect(ENERGY_DRINK_BOOST_SPEED_MULTIPLIER).toBeGreaterThan(1);
    expect(ENERGY_DRINK_SLUMP_SPEED_MULTIPLIER).toBeLessThan(1);
  });

  it('鈍化中に買い直すと、加速から数え直す', () => {
    const again = startEnergyDrink(effects, boostEnd + 1);
    expect(playerSpeedMultiplier(again, boostEnd + 1)).toBe(ENERGY_DRINK_BOOST_SPEED_MULTIPLIER);
    expect(again).toHaveLength(2);
  });
});

describe('予約した障害（金曜日の夕方デプロイ）', () => {
  it('時刻ちょうどで due になり、まだのものは pending に残る', () => {
    const scheduled = scheduleIncident(scheduleIncident([], T0, 100), T0 + 1, 200);
    expect(takeDueIncidents(scheduled, T0 - 1)).toEqual({ due: [], pending: scheduled });
    expect(takeDueIncidents(scheduled, T0)).toEqual({
      due: [{ atMs: T0, damage: 100 }],
      pending: [{ atMs: T0 + 1, damage: 200 }],
    });
    expect(takeDueIncidents(scheduled, T0 + 1).due).toHaveLength(2);
  });

  it.each([
    [0, true],
    [FRIDAY_DEPLOY_INCIDENT_PROBABILITY - 0.001, true],
    [FRIDAY_DEPLOY_INCIDENT_PROBABILITY, false],
    [0.999, false],
  ])('乱数 %s → 大障害が起きるか: %s', (random, expected) => {
    expect(rollFridayDeployIncident(() => random)).toBe(expected);
  });
});

describe('直前の障害の記録とロールバック', () => {
  it('記録がなければ・取り消し済みならロールバックできない', () => {
    expect(canRollback(null)).toBe(false);
    expect(canRollback(recordIncident(100))).toBe(true);
    expect(canRollback({ damage: 100, rolledBack: true })).toBe(false);
  });

  it('損害額を返金し、取り消し済みにする（1回だけ）', () => {
    const result = rollbackIncident(1_000, recordIncident(300));
    expect(result).toEqual({ fundsAfter: 1_300, record: { damage: 300, rolledBack: true } });
    expect(canRollback(result.record)).toBe(false);
    expect(() => rollbackIncident(result.fundsAfter, result.record)).toThrow();
    expect(() => rollbackIncident(1_000, null)).toThrow();
  });
});
