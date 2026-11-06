import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import { DEFAULT_REFACTORING_RATIO, MENU_PANEL_PADDING, MENU_PANEL_WIDTH, REFACTORING_RATIO_STEP_PERCENT } from './config';
import { formatRefactoringAllocation, gaugeSegmentWidths, stepRefactoringRatio } from './refactoringRatioControl';
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

describe('gaugeSegmentWidths: 開発バランスのゲージの2色の幅(#165)', () => {
  // メニューの内側の幅（実際のゲージの幅）。
  const gaugeWidth = MENU_PANEL_WIDTH.balance - MENU_PANEL_PADDING * 2;

  it.each([
    [0, { feature: 144, refactoring: 0 }],
    [0.2, { feature: 115, refactoring: 29 }],
    [1, { feature: 0, refactoring: 144 }],
  ])('境界値: 割合 %d の幅は %j（左が機能開発）', (ratio, expected) => {
    expect(gaugeWidth).toBe(144);
    expect(gaugeSegmentWidths(ratio, gaugeWidth)).toEqual(expected);
  });

  it.each(gridValues)('割合 %d（11段階）でも2つの幅は整数で、和はゲージの幅と同じ', (ratio) => {
    const { feature, refactoring } = gaugeSegmentWidths(ratio, gaugeWidth);
    expect(Number.isInteger(feature)).toBe(true);
    expect(Number.isInteger(refactoring)).toBe(true);
    expect(feature).toBeGreaterThanOrEqual(0);
    expect(refactoring).toBeGreaterThanOrEqual(0);
    expect(feature + refactoring).toBe(gaugeWidth);
  });

  it('11段階では割合が増えるほどリファクタリングの幅が広がる（単調）', () => {
    const widths = gridValues.map((ratio) => gaugeSegmentWidths(ratio, gaugeWidth).refactoring);
    expect(widths).toHaveLength(11);
    widths.slice(1).forEach((width, index) => expect(width).toBeGreaterThan(widths[index]));
  });

  it('割合は表示と同じ整数パーセントで丸める（0.1 + 0.2 は 0.3 と同じ幅、範囲外は端に寄せる）', () => {
    expect(gaugeSegmentWidths(0.1 + 0.2, 100)).toEqual(gaugeSegmentWidths(0.3, 100));
    expect(gaugeSegmentWidths(-1, 100)).toEqual({ feature: 100, refactoring: 0 });
    expect(gaugeSegmentWidths(2, 100)).toEqual({ feature: 0, refactoring: 100 });
  });

  it('境界値: 幅 0 は両方 0。負・整数でない・NaN の幅は例外', () => {
    expect(gaugeSegmentWidths(0.5, 0)).toEqual({ feature: 0, refactoring: 0 });
    for (const width of [-1, 10.5, Number.NaN]) expect(() => gaugeSegmentWidths(0.5, width)).toThrow(RangeError);
  });

  it('既定の割合（DEFAULT_REFACTORING_RATIO）でも和は幅と同じ', () => {
    const { feature, refactoring } = gaugeSegmentWidths(DEFAULT_REFACTORING_RATIO, gaugeWidth);
    expect(feature + refactoring).toBe(gaugeWidth);
  });
});

describe('formatRefactoringAllocation（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it.each([
    [0, 'Feat 100:Refac 0'],
    [0.2, 'Feat 80:Refac 20'],
    [1, 'Feat 0:Refac 100'],
  ])('formatRefactoringAllocation(%d) = %s', (ratio, expected) => {
    expect(formatRefactoringAllocation(ratio)).toBe(expected);
  });
});
