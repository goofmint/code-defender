import { REFACTORING_ALLOCATION_FORMAT, REFACTORING_RATIO_STEP_PERCENT } from './config';
import { sanitizeRefactoringRatio } from './techDebt';

// 機能開発とリファクタリングの割合UI(#40)の計算。Phaser に依存しない純粋関数だけを置く。
// 状態は MainScene.refactoringRatio（リファクタリングの割合、0〜1）だけ。機能開発の割合は表示のときにだけ 1 − 割合で求める。

// 割合を寄せる向き。feature は機能開発へ（リファクタリングを減らす）、refactoring はリファクタリングへ（増やす）。
export type RefactoringRatioDirection = 'feature' | 'refactoring';

const PERCENT = 100;
// 刻みの上とみなすずれの幅（パーセント）。浮動小数点の誤差だけを吸収する大きさ。
const ON_GRID_TOLERANCE_PERCENT = 1e-6;

// 割合を整数パーセント（0〜100）にする。範囲外・NaN は sanitizeRefactoringRatio で丸める。
const toPercent = (ratio: number): number => Math.round(sanitizeRefactoringRatio(ratio) * PERCENT);

// 割合を1段階寄せる。結果は刻み（stepPercent）の倍数のパーセントを 100 で割った値だけ（0.1 を足し引きした誤差は出ない）。
// 刻みの上にない値（0.25 / 0.299 / 0.201 など）は、寄せる向きで丸める前の値より先にある最初の刻みの値（0.3 / 0.2）にする。両端（0 / 1）では値を変えない。
// 刻みが 1〜100 の整数で 100 を割り切れないときは、刻みの上に 0 と 1 が乗らないためエラーにする。
export const stepRefactoringRatio = (
  ratio: number,
  direction: RefactoringRatioDirection,
  stepPercent: number = REFACTORING_RATIO_STEP_PERCENT,
): number => {
  if (!Number.isInteger(stepPercent) || stepPercent <= 0 || PERCENT % stepPercent !== 0) {
    throw new RangeError(`stepPercent は 100 を割り切る正の整数にする: ${stepPercent}`);
  }
  // 丸める前のパーセントで向きを決める（先に整数へ丸めると 0.299 が 30 になり、リファクタリングへ寄せて 0.4 に飛ぶ）。
  const percent = sanitizeRefactoringRatio(ratio) * PERCENT;
  const steps = percent / stepPercent;
  const nearestStep = Math.round(steps);
  // 浮動小数点の誤差（(0.1 + 0.2) × 100 = 30.000…04 など）だけを許し、刻みからこの幅未満のずれは刻みの上として1段階進める。
  const onGrid = Math.abs(percent - nearestStep * stepPercent) < ON_GRID_TOLERANCE_PERCENT;
  const nextStep =
    direction === 'refactoring'
      ? (onGrid ? nearestStep : Math.floor(steps)) + 1
      : (onGrid ? nearestStep : Math.ceil(steps)) - 1;
  return Math.min(PERCENT, Math.max(0, nextStep * stepPercent)) / PERCENT;
};

// 「機能80:リファ20」の形。両方の割合は整数パーセントで、合計は常に 100。
export const formatRefactoringAllocation = (ratio: number): string => {
  const refactoringPercent = toPercent(ratio);
  const featurePercent = PERCENT - refactoringPercent;
  const { feature, separator, refactoring } = REFACTORING_ALLOCATION_FORMAT;
  return `${feature}${featurePercent}${separator}${refactoring}${refactoringPercent}`;
};

// 開発バランスのメニュー(#156)に縦に並べる選択肢。0 から 1 まで刻み（stepPercent）ごとの割合（10% 刻みなら 0, 0.1, …, 1 の 11 個）。
// 値はパーセントを 100 で割って作る（0.1 を足していく誤差は出ない）。刻みの検査は stepRefactoringRatio と同じ。
export const getRefactoringRatioOptions = (stepPercent: number = REFACTORING_RATIO_STEP_PERCENT): readonly number[] => {
  if (!Number.isInteger(stepPercent) || stepPercent <= 0 || PERCENT % stepPercent !== 0) {
    throw new RangeError(`stepPercent は 100 を割り切る正の整数にする: ${stepPercent}`);
  }
  return Array.from({ length: PERCENT / stepPercent + 1 }, (_, index) => (index * stepPercent) / PERCENT);
};

// 2つの割合が同じ選択肢か(#156、現在値の強調)。表示と同じく整数パーセントで比べる（0.30000000000000004 と 0.3 は同じ）。
export const isSameRefactoringOption = (a: number, b: number): boolean => toPercent(a) === toPercent(b);
