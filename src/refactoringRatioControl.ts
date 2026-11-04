import { REFACTORING_ALLOCATION_FORMAT, REFACTORING_RATIO_STEP_PERCENT } from './config';
import { sanitizeRefactoringRatio } from './techDebt';

// 機能開発とリファクタリングの割合UI(#40)の計算。Phaser に依存しない純粋関数だけを置く。
// 状態は MainScene.refactoringRatio（リファクタリングの割合、0〜1）だけ。機能開発の割合は表示のときにだけ 1 − 割合で求める。

// 割合を寄せる向き。feature は機能開発へ（リファクタリングを減らす）、refactoring はリファクタリングへ（増やす）。
export type RefactoringRatioDirection = 'feature' | 'refactoring';

const PERCENT = 100;

// 割合を整数パーセント（0〜100）にする。範囲外・NaN は sanitizeRefactoringRatio で丸める。
const toPercent = (ratio: number): number => Math.round(sanitizeRefactoringRatio(ratio) * PERCENT);

// 割合を1段階寄せる。結果は刻み（stepPercent）の倍数のパーセントを 100 で割った値だけ（0.1 を足し引きした誤差は出ない）。
// 刻みの上にない値（0.25 など）は、寄せる向きで次の刻みの値（0.3 / 0.2）にする。両端（0 / 1）では値を変えない。
// 刻みが 1〜100 の整数で 100 を割り切れないときは、刻みの上に 0 と 1 が乗らないためエラーにする。
export const stepRefactoringRatio = (
  ratio: number,
  direction: RefactoringRatioDirection,
  stepPercent: number = REFACTORING_RATIO_STEP_PERCENT,
): number => {
  if (!Number.isInteger(stepPercent) || stepPercent <= 0 || PERCENT % stepPercent !== 0) {
    throw new RangeError(`stepPercent は 100 を割り切る正の整数にする: ${stepPercent}`);
  }
  const percent = toPercent(ratio);
  const next =
    direction === 'refactoring'
      ? (Math.floor(percent / stepPercent) + 1) * stepPercent
      : (Math.ceil(percent / stepPercent) - 1) * stepPercent;
  return Math.min(PERCENT, Math.max(0, next)) / PERCENT;
};

// 「機能80:リファ20」の形。両方の割合は整数パーセントで、合計は常に 100。
export const formatRefactoringAllocation = (ratio: number): string => {
  const refactoringPercent = toPercent(ratio);
  const featurePercent = PERCENT - refactoringPercent;
  const { feature, separator, refactoring } = REFACTORING_ALLOCATION_FORMAT;
  return `${feature}${featurePercent}${separator}${refactoring}${refactoringPercent}`;
};
