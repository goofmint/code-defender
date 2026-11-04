import { describe, expect, it } from 'vitest';
import { initialSpawnElapsed, stepSpawnTimer } from './codeFlow';
import {
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_REFACTORING_RATIO,
  TECH_DEBT_MALICIOUS_RATE_MAX_BONUS,
  TECH_DEBT_MAX,
  TECH_DEBT_PER_FEATURE_WORK,
  TECH_DEBT_REPAY_PER_REFACTORING_WORK,
  TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER,
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
  techDebtMaliciousRateModifier,
  techDebtSpawnIntervalMs,
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

describe('techDebtMaliciousRateModifier（技術的負債による不正コード率の補正・境界値）', () => {
  // 上限・最大加算量は引数で渡して config の仮の値に依存しないようにする。
  const BONUS = 0.2;
  const options = { max: MAX, maxBonus: BONUS };

  it.each([
    [0, 0],
    [1, BONUS / MAX],
    [MAX / 2, BONUS / 2],
    [MAX - 1, (BONUS * (MAX - 1)) / MAX],
    [MAX, BONUS],
    [MAX + 1, BONUS],
    [-1, 0],
    [-0.01, 0],
    [NaN, 0],
    [Infinity, BONUS],
    [-Infinity, 0],
  ])('負債 %d の差分は %d', (debt, expected) => {
    expect(techDebtMaliciousRateModifier(debt, options)).toBeCloseTo(expected, 12);
  });

  it('負債 0 と負の負債の差分は 0（-0 を返さない）', () => {
    for (const debt of [0, -1, -0.01, NaN, -Infinity]) {
      expect(Object.is(techDebtMaliciousRateModifier(debt, options), 0)).toBe(true);
    }
  });

  it('負債 MAX - 1 は MAX より小さく、MAX と MAX + 1 は同じ', () => {
    expect(techDebtMaliciousRateModifier(MAX - 1, options)).toBeLessThan(techDebtMaliciousRateModifier(MAX, options));
    expect(techDebtMaliciousRateModifier(MAX + 1, options)).toBe(techDebtMaliciousRateModifier(MAX, options));
  });

  it('負債が増えても差分は減らない（-1〜MAX + 1 で単調非減少）', () => {
    let previous = techDebtMaliciousRateModifier(-1, options);
    for (let debt = 0; debt <= MAX + 1; debt += 0.5) {
      const current = techDebtMaliciousRateModifier(debt, options);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it.each([0, -0.1, NaN, Infinity, -Infinity])('maxBonus が %d なら負債に関係なく 0', (maxBonus) => {
    for (const debt of [0, MAX / 2, MAX, Infinity]) {
      expect(Object.is(techDebtMaliciousRateModifier(debt, { max: MAX, maxBonus }), 0)).toBe(true);
    }
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('max が %d なら負債に関係なく 0', (max) => {
    for (const debt of [0, MAX / 2, MAX, Infinity]) {
      expect(Object.is(techDebtMaliciousRateModifier(debt, { max, maxBonus: BONUS }), 0)).toBe(true);
    }
  });

  it('既定引数は config の TECH_DEBT_MAX と TECH_DEBT_MALICIOUS_RATE_MAX_BONUS', () => {
    expect(techDebtMaliciousRateModifier(0)).toBe(0);
    expect(techDebtMaliciousRateModifier(TECH_DEBT_MAX)).toBeCloseTo(TECH_DEBT_MALICIOUS_RATE_MAX_BONUS, 12);
    expect(techDebtMaliciousRateModifier(TECH_DEBT_MAX / 2)).toBeCloseTo(TECH_DEBT_MALICIOUS_RATE_MAX_BONUS / 2, 12);
    expect(techDebtMaliciousRateModifier(TECH_DEBT_MAX + 1)).toBeCloseTo(TECH_DEBT_MALICIOUS_RATE_MAX_BONUS, 12);
  });
});

describe('techDebtSpawnIntervalMs', () => {
  // 基準間隔・倍率・上限は引数で固定し、config の仮の値に依存しないようにする。
  const BASE = 2000;
  const MULT = 2;
  const opts = { maxMultiplier: MULT, max: MAX };

  it.each([
    [-1, 2000],
    [-0.01, 2000],
    [0, 2000],
    [1, 2020],
    [50, 3000],
    [MAX - 1, 3980],
    [MAX, 4000],
    [MAX + 1, 4000],
    [Number.NaN, 2000],
    [Number.POSITIVE_INFINITY, 4000],
    [Number.NEGATIVE_INFINITY, 2000],
  ])('負債 %d → %d ms', (debt, expected) => {
    expect(techDebtSpawnIntervalMs(debt, BASE, opts)).toBeCloseTo(expected, 9);
  });

  it.each([1, 0.99, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '倍率 %d は1として扱う（負債上限でも基準間隔のまま）',
    (maxMultiplier) => {
      expect(techDebtSpawnIntervalMs(MAX, BASE, { maxMultiplier, max: MAX })).toBe(BASE);
      expect(techDebtSpawnIntervalMs(50, BASE, { maxMultiplier, max: MAX })).toBe(BASE);
    },
  );

  it.each([
    [2, 4000],
    [3, 6000],
  ])('倍率 %d: 負債上限で %d ms、負債0で基準間隔', (maxMultiplier, expected) => {
    expect(techDebtSpawnIntervalMs(MAX, BASE, { maxMultiplier, max: MAX })).toBeCloseTo(expected, 9);
    expect(techDebtSpawnIntervalMs(0, BASE, { maxMultiplier, max: MAX })).toBe(BASE);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '上限 %d は不正なので基準間隔のまま',
    (max) => {
      expect(techDebtSpawnIntervalMs(50, BASE, { maxMultiplier: MULT, max })).toBe(BASE);
    },
  );

  it('単調非減少', () => {
    let prev = techDebtSpawnIntervalMs(-1, BASE, opts);
    for (let debt = -1; debt <= MAX + 3; debt += 1 / 3) {
      const v = techDebtSpawnIntervalMs(debt, BASE, opts);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('引数省略時は config の既定値（倍率・上限）を使う', () => {
    expect(techDebtSpawnIntervalMs(0, BASE)).toBe(BASE);
    expect(techDebtSpawnIntervalMs(TECH_DEBT_MAX, BASE)).toBeCloseTo(BASE * TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER, 9);
    expect(techDebtSpawnIntervalMs(TECH_DEBT_MAX / 2, BASE)).toBeCloseTo(
      BASE * (1 + (TECH_DEBT_SPAWN_INTERVAL_MAX_MULTIPLIER - 1) / 2),
      9,
    );
  });
});

// main.ts の updateCodes と同じ手順を再現する合成テスト（Phaser は使わない）。
// フレーム開始時の負債で実効間隔を1回計算し、初期値（initialSpawnElapsed）と stepSpawnTimer の両方に渡す。
describe('技術的負債と生成タイマーの合成（main.ts の updateCodes と同じ手順）', () => {
  const BASE = 2000;
  const opts = { maxMultiplier: 2, max: MAX };

  // 1フレーム分。elapsed が undefined なら新規ルート（initialSpawnElapsed を使う）。
  const frame = (elapsed: number | undefined, delta: number, debt: number) => {
    const intervalMs = techDebtSpawnIntervalMs(debt, BASE, opts);
    return stepSpawnTimer(elapsed ?? initialSpawnElapsed(intervalMs), delta, intervalMs);
  };

  it.each([0, 50, MAX])('新規ルートは負債 %d でも最初の更新ですぐ1個生成する', (debt) => {
    expect(frame(undefined, 0, debt)).toEqual({ elapsedMs: 0, spawn: true });
  });

  it.each([
    [0, 1999, false],
    [0, 2000, true],
    [0, 2001, true],
    [50, 2999, false],
    [50, 3000, true],
    [50, 3001, true],
    [MAX, 3999, false],
    [MAX, 4000, true],
    [MAX, 4001, true],
  ])('負債 %d: 生成後 %d ms 経過で生成=%s', (debt, elapsed, spawn) => {
    expect(frame(0, elapsed, debt).spawn).toBe(spawn);
  });

  it('負債0では既存の挙動（CODE_SPAWN_INTERVAL_MS をそのまま渡す）と一致する', () => {
    let current: number | undefined;
    let existing: number | undefined;
    for (let i = 0; i < 1000; i += 1) {
      const a = stepSpawnTimer(
        current ?? initialSpawnElapsed(techDebtSpawnIntervalMs(0, CODE_SPAWN_INTERVAL_MS)),
        16.7,
        techDebtSpawnIntervalMs(0, CODE_SPAWN_INTERVAL_MS),
      );
      const b = stepSpawnTimer(
        existing ?? initialSpawnElapsed(CODE_SPAWN_INTERVAL_MS),
        16.7,
        CODE_SPAWN_INTERVAL_MS,
      );
      expect(a).toEqual(b);
      current = a.elapsedMs;
      existing = b.elapsedMs;
    }
  });

  it.each([
    // 16.7ms × 1200 = 20040ms。初回の即生成 + floor(20040 / 間隔)。端数は持ち越す。
    [0, 1 + 10],
    [50, 1 + 6],
    [MAX, 1 + 5],
  ])('負債 %d: 16.7ms 刻みで 1200 フレーム回すと %d 個生成する', (debt, expected) => {
    let elapsed: number | undefined;
    let count = 0;
    for (let i = 0; i < 1200; i += 1) {
      const step = frame(elapsed, 16.7, debt);
      elapsed = step.elapsedMs;
      if (step.spawn) count += 1;
    }
    expect(count).toBe(expected);
  });

  it('負債が増えて間隔が延びたら、累積時間を保ったまま新しい間隔まで生成しない', () => {
    // 負債0で 1500ms 溜める。
    const a = frame(0, 1500, 0);
    expect(a).toEqual({ elapsedMs: 1500, spawn: false });
    // 負債上限（間隔 4000ms）に増えた。2000ms を超えても生成しない。
    const b = frame(a.elapsedMs, 2499, MAX);
    expect(b.spawn).toBe(false);
    expect(b.elapsedMs).toBeCloseTo(3999, 9);
    const c = frame(b.elapsedMs, 1, MAX);
    expect(c.spawn).toBe(true);
    expect(c.elapsedMs).toBeCloseTo(0, 9);
  });

  it('負債を返して間隔が縮み、累積時間が新しい間隔以上なら次の更新で1個だけ生成する', () => {
    // 負債上限で 3500ms 溜める（間隔 4000ms なので生成しない）。
    const a = frame(0, 3500, MAX);
    expect(a.spawn).toBe(false);
    // 負債0（間隔 2000ms）に戻った。delta 0 でも累積 3500 ≥ 2000 なので1個だけ生成し、端数 1500 を持ち越す。
    const b = frame(a.elapsedMs, 0, 0);
    expect(b).toEqual({ elapsedMs: 1500, spawn: true });
    const c = frame(b.elapsedMs, 0, 0);
    expect(c.spawn).toBe(false);
  });

  it.each([0, 50, MAX])('負債 %d: 巨大な delta でも1回の更新で1個だけ生成する', (debt) => {
    const step = frame(0, 1_000_000, debt);
    expect(step.spawn).toBe(true);
    expect(step.elapsedMs).toBeLessThan(techDebtSpawnIntervalMs(debt, BASE, opts));
  });
});
