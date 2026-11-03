import { describe, expect, it } from 'vitest';
import {
  CODE_MALICIOUS_RATE,
  CODE_MALICIOUS_RATE_INCREMENT,
  CODE_MALICIOUS_RATE_MAX,
  CODE_SPEED,
  CODE_SPEED_INCREMENT,
  CODE_SPEED_MAX,
  DIFFICULTY_STEP_MS,
  PLAYER_SPEED,
} from './config';
import { codeSpeedAt, maliciousRateAt } from './difficulty';

const STEP = DIFFICULTY_STEP_MS;
// 上限に達する段階（切り上げ）。
const speedCapStep = Math.ceil((CODE_SPEED_MAX - CODE_SPEED) / CODE_SPEED_INCREMENT);
const rateCapStep = Math.ceil((CODE_MALICIOUS_RATE_MAX - CODE_MALICIOUS_RATE) / CODE_MALICIOUS_RATE_INCREMENT - 1e-9);

describe('codeSpeedAt（コード速度）', () => {
  it('0ms は開始値', () => {
    expect(codeSpeedAt(0)).toBe(CODE_SPEED);
  });

  it.each([
    ['直前(間隔-1ms)', STEP - 1, 0],
    ['ちょうど', STEP, 1],
    ['直後(+1ms)', STEP + 1, 1],
    ['2段階目の直前', STEP * 2 - 1, 1],
    ['2段階目の直後', STEP * 2 + 1, 2],
  ])('段階の切替: %s', (_label, ms, step) => {
    expect(codeSpeedAt(ms)).toBeCloseTo(CODE_SPEED + step * CODE_SPEED_INCREMENT);
  });

  it('上限に達する直前の段階は上限未満', () => {
    const v = codeSpeedAt(STEP * (speedCapStep - 1));
    expect(v).toBeCloseTo(CODE_SPEED + (speedCapStep - 1) * CODE_SPEED_INCREMENT);
    expect(v).toBeLessThan(CODE_SPEED_MAX);
  });

  it('上限ちょうどに達する', () => {
    expect(codeSpeedAt(STEP * speedCapStep)).toBeCloseTo(CODE_SPEED_MAX);
  });

  it('上限を超えた後は増えない', () => {
    expect(codeSpeedAt(STEP * (speedCapStep + 1))).toBeCloseTo(CODE_SPEED_MAX);
    expect(codeSpeedAt(STEP * (speedCapStep + 100))).toBeCloseTo(CODE_SPEED_MAX);
  });

  it('非常に大きい elapsedMs でも上限', () => {
    expect(codeSpeedAt(Number.MAX_SAFE_INTEGER)).toBeCloseTo(CODE_SPEED_MAX);
  });

  it.each([-1, -STEP, NaN, Infinity, -Infinity])('%s は開始値', (ms) => {
    expect(codeSpeedAt(ms)).toBe(CODE_SPEED);
  });

  it('単調非減少', () => {
    let prev = codeSpeedAt(0);
    for (let ms = 0; ms <= STEP * (speedCapStep + 3); ms += STEP / 3) {
      const v = codeSpeedAt(ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('省略可能引数で開始値・増加量・上限・間隔を差し替えられる', () => {
    expect(codeSpeedAt(1000, 10, 5, 100, 1000)).toBeCloseTo(15);
    expect(codeSpeedAt(999, 10, 5, 100, 1000)).toBeCloseTo(10);
    expect(codeSpeedAt(1000000, 10, 5, 100, 1000)).toBeCloseTo(100);
  });
});

describe('maliciousRateAt（不正コード率）', () => {
  it('0ms は開始値', () => {
    expect(maliciousRateAt(0)).toBe(CODE_MALICIOUS_RATE);
  });

  it.each([
    ['直前(間隔-1ms)', STEP - 1, 0],
    ['ちょうど', STEP, 1],
    ['直後(+1ms)', STEP + 1, 1],
    ['2段階目の直前', STEP * 2 - 1, 1],
    ['2段階目の直後', STEP * 2 + 1, 2],
  ])('段階の切替: %s', (_label, ms, step) => {
    expect(maliciousRateAt(ms)).toBeCloseTo(CODE_MALICIOUS_RATE + step * CODE_MALICIOUS_RATE_INCREMENT);
  });

  it('上限に達する直前の段階は上限未満', () => {
    const v = maliciousRateAt(STEP * (rateCapStep - 1));
    expect(v).toBeCloseTo(CODE_MALICIOUS_RATE + (rateCapStep - 1) * CODE_MALICIOUS_RATE_INCREMENT);
    expect(v).toBeLessThan(CODE_MALICIOUS_RATE_MAX);
  });

  it('上限ちょうどに達する', () => {
    expect(maliciousRateAt(STEP * rateCapStep)).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
  });

  it('上限を超えた後は増えない', () => {
    expect(maliciousRateAt(STEP * (rateCapStep + 1))).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
    expect(maliciousRateAt(STEP * (rateCapStep + 100))).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
  });

  it('非常に大きい elapsedMs でも上限', () => {
    expect(maliciousRateAt(Number.MAX_SAFE_INTEGER)).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
  });

  it.each([-1, -STEP, NaN, Infinity, -Infinity])('%s は開始値', (ms) => {
    expect(maliciousRateAt(ms)).toBe(CODE_MALICIOUS_RATE);
  });

  it('開始値 0%（引数で指定）から始まり、増えていく', () => {
    expect(maliciousRateAt(0, 0)).toBe(0);
    expect(maliciousRateAt(STEP - 1, 0)).toBe(0);
    expect(maliciousRateAt(STEP, 0)).toBeCloseTo(CODE_MALICIOUS_RATE_INCREMENT);
  });

  it('常に [0,1] に収まる', () => {
    for (const ms of [0, STEP, STEP * 5, STEP * 1000, Number.MAX_SAFE_INTEGER, -1, NaN, Infinity]) {
      const v = maliciousRateAt(ms);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // 引数で上限・開始値が範囲外でも [0,1] に収める。
    expect(maliciousRateAt(STEP * 100, 0.9, 0.5, 5)).toBe(1);
    expect(maliciousRateAt(0, -0.5, 0.1, 1)).toBe(0);
  });

  it('単調非減少', () => {
    let prev = maliciousRateAt(0);
    for (let ms = 0; ms <= STEP * (rateCapStep + 3); ms += STEP / 3) {
      const v = maliciousRateAt(ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('省略可能引数で開始値・増加量・上限・間隔を差し替えられる', () => {
    expect(maliciousRateAt(1000, 0.1, 0.05, 0.9, 1000)).toBeCloseTo(0.15);
    expect(maliciousRateAt(999, 0.1, 0.05, 0.9, 1000)).toBeCloseTo(0.1);
    expect(maliciousRateAt(1000000, 0.1, 0.05, 0.9, 1000)).toBeCloseTo(0.9);
  });
});

describe('config の整合性', () => {
  it('速度の上限は開始値以上で、主人公より遅い', () => {
    expect(CODE_SPEED_MAX).toBeGreaterThanOrEqual(CODE_SPEED);
    expect(CODE_SPEED_MAX).toBeLessThan(PLAYER_SPEED);
  });

  it('不正コード率の上限は開始値以上で 1 以下', () => {
    expect(CODE_MALICIOUS_RATE_MAX).toBeGreaterThanOrEqual(CODE_MALICIOUS_RATE);
    expect(CODE_MALICIOUS_RATE_MAX).toBeLessThanOrEqual(1);
  });

  it('間隔は正、増加量は 0 以上', () => {
    expect(DIFFICULTY_STEP_MS).toBeGreaterThan(0);
    expect(CODE_SPEED_INCREMENT).toBeGreaterThanOrEqual(0);
    expect(CODE_MALICIOUS_RATE_INCREMENT).toBeGreaterThanOrEqual(0);
  });
});
