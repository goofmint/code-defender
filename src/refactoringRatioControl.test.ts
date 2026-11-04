import { describe, expect, it } from 'vitest';
import { DEFAULT_REFACTORING_RATIO, REFACTORING_RATIO_STEP_PERCENT } from './config';
import { formatRefactoringAllocation, stepRefactoringRatio } from './refactoringRatioControl';
import type { RefactoringRatioDirection } from './refactoringRatioControl';
import { sanitizeRefactoringRatio } from './techDebt';

const STEPS = 100 / REFACTORING_RATIO_STEP_PERCENT;
const gridValues = Array.from({ length: STEPS + 1 }, (_, k) => k / STEPS);
const directions: readonly RefactoringRatioDirection[] = ['feature', 'refactoring'];

describe('stepRefactoringRatio', () => {
  it('両端: 0.1→0（機能開発へ）、0→0 で止まる', () => {
    expect(stepRefactoringRatio(0.1, 'feature')).toBe(0);
    expect(stepRefactoringRatio(0, 'feature')).toBe(0);
  });

  it('両端: 0.9→1（リファクタリングへ）、1→1 で止まる', () => {
    expect(stepRefactoringRatio(0.9, 'refactoring')).toBe(1);
    expect(stepRefactoringRatio(1, 'refactoring')).toBe(1);
  });

  it('中間値: 0.2 からリファクタリングへ 0.3、機能開発へ 0.1', () => {
    expect(stepRefactoringRatio(0.2, 'refactoring')).toBe(0.3);
    expect(stepRefactoringRatio(0.2, 'feature')).toBe(0.1);
  });

  it('誤差: 0 から10回リファクタリングへ寄せると、各段階が k/10 と一致し、10回目で 1 になる', () => {
    let ratio = 0;
    for (let k = 1; k <= STEPS; k += 1) {
      ratio = stepRefactoringRatio(ratio, 'refactoring');
      expect(ratio).toBe(k / STEPS);
    }
    expect(ratio).toBe(1);
  });

  it('誤差: 1 から10回機能開発へ寄せると、各段階が k/10 と一致し、10回目で 0 になる', () => {
    let ratio = 1;
    for (let k = STEPS - 1; k >= 0; k -= 1) {
      ratio = stepRefactoringRatio(ratio, 'feature');
      expect(ratio).toBe(k / STEPS);
    }
    expect(ratio).toBe(0);
  });

  it('刻みの上にない値は、寄せる向きの次の刻みの値になる', () => {
    expect(stepRefactoringRatio(0.25, 'refactoring')).toBe(0.3);
    expect(stepRefactoringRatio(0.25, 'feature')).toBe(0.2);
    expect(stepRefactoringRatio(0.29, 'refactoring')).toBe(0.3);
    expect(stepRefactoringRatio(0.29, 'feature')).toBe(0.2);
    expect(stepRefactoringRatio(0.31, 'refactoring')).toBe(0.4);
    expect(stepRefactoringRatio(0.31, 'feature')).toBe(0.3);
  });

  it('境界値: 整数パーセントへ丸める前の値で向きを決める（0.299→0.3、0.201→0.2）', () => {
    expect(stepRefactoringRatio(0.299, 'refactoring')).toBe(0.3);
    expect(stepRefactoringRatio(0.299, 'feature')).toBe(0.2);
    expect(stepRefactoringRatio(0.201, 'feature')).toBe(0.2);
    expect(stepRefactoringRatio(0.201, 'refactoring')).toBe(0.3);
    expect(stepRefactoringRatio(0.3 - 1e-7, 'refactoring')).toBe(0.3);
    expect(stepRefactoringRatio(0.2 + 1e-7, 'feature')).toBe(0.2);
  });

  it('境界値: 刻みから浮動小数点の誤差程度（±1e-9）ずれた値は刻みの上として1段階進む', () => {
    for (const ratio of [0.2 + 1e-9, 0.2 - 1e-9]) {
      expect(stepRefactoringRatio(ratio, 'refactoring')).toBe(0.3);
      expect(stepRefactoringRatio(ratio, 'feature')).toBe(0.1);
    }
    expect(stepRefactoringRatio(0.1 + 0.2, 'refactoring')).toBe(0.4);
    expect(stepRefactoringRatio(0.1 + 0.2, 'feature')).toBe(0.2);
  });

  it('正規化との接続: 範囲外は 0 / 1、NaN は DEFAULT_REFACTORING_RATIO から寄せる', () => {
    expect(stepRefactoringRatio(-0.5, 'feature')).toBe(0);
    expect(stepRefactoringRatio(-0.5, 'refactoring')).toBe(0.1);
    expect(stepRefactoringRatio(1.5, 'refactoring')).toBe(1);
    expect(stepRefactoringRatio(1.5, 'feature')).toBe(0.9);
    expect(stepRefactoringRatio(Infinity, 'refactoring')).toBe(1);
    expect(stepRefactoringRatio(Infinity, 'feature')).toBe(0.9);
    expect(stepRefactoringRatio(-Infinity, 'feature')).toBe(0);
    expect(stepRefactoringRatio(-Infinity, 'refactoring')).toBe(0.1);
    expect(stepRefactoringRatio(NaN, 'refactoring')).toBe(stepRefactoringRatio(DEFAULT_REFACTORING_RATIO, 'refactoring'));
    expect(stepRefactoringRatio(NaN, 'feature')).toBe(stepRefactoringRatio(DEFAULT_REFACTORING_RATIO, 'feature'));
  });

  it('冪等性: すべての結果は sanitizeRefactoringRatio で変わらない', () => {
    const inputs = [...gridValues, 0.25, 0.29, 0.31, -0.5, 1.5, Infinity, -Infinity, NaN];
    for (const input of inputs) {
      for (const direction of directions) {
        const result = stepRefactoringRatio(input, direction);
        expect(sanitizeRefactoringRatio(result)).toBe(result);
      }
    }
  });

  it('刻みが 100 を割り切る正の整数でなければエラーにする', () => {
    for (const step of [0, -10, 3, 2.5, NaN, Infinity]) {
      expect(() => stepRefactoringRatio(0.2, 'refactoring', step)).toThrow(RangeError);
    }
    expect(stepRefactoringRatio(0.2, 'refactoring', 25)).toBe(0.25);
  });
});

describe('formatRefactoringAllocation', () => {
  const percents = (label: string): readonly number[] => (label.match(/\d+/g) ?? []).map(Number);

  it.each([
    [0, '機能100:リファ0'],
    [0.2, '機能80:リファ20'],
    [0.5, '機能50:リファ50'],
    [1, '機能0:リファ100'],
  ])('%s → %s（2つの割合の合計は 100）', (ratio, expected) => {
    const label = formatRefactoringAllocation(ratio);
    expect(label).toBe(expected);
    const values = percents(label);
    expect(values).toHaveLength(2);
    expect(values[0] + values[1]).toBe(100);
  });
});

describe('設定の整合性', () => {
  it('DEFAULT_REFACTORING_RATIO は刻みの上にある', () => {
    expect(Math.round(DEFAULT_REFACTORING_RATIO * 100) % REFACTORING_RATIO_STEP_PERCENT).toBe(0);
    expect(gridValues).toContain(DEFAULT_REFACTORING_RATIO);
  });

  it('100 は刻みで割り切れる', () => {
    expect(100 % REFACTORING_RATIO_STEP_PERCENT).toBe(0);
  });
});
