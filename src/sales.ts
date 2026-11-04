import { DEFAULT_REFACTORING_RATIO, REVENUE_PER_NORMAL_CODE } from './config';
import type { CodeKind } from './code';
import { addFunds } from './funds';
import { sanitizeRefactoringRatio } from './techDebt';

// 売上の計算。Phaser に依存しない純粋関数だけを置く。

// 機能開発の割合に応じた売上の倍率。既定の配分（DEFAULT_REFACTORING_RATIO）を 1 とし、機能開発の割合 (1 − r) に比例させる。
// r は sanitizeRefactoringRatio で 0〜1 に丸める（NaN は既定の割合）。r=0 で 1.25、既定で 1、r=1 で 0。
export const getFeatureRevenueMultiplier = (refactoringRatio: number): number =>
  (1 - sanitizeRefactoringRatio(refactoringRatio)) / (1 - DEFAULT_REFACTORING_RATIO);

// リリースされたコード1件の売上。正常なコードで単価が正の有限数のときだけ、単価に配分の倍率を掛けて四捨五入した額。それ以外は 0。
export const getReleaseRevenue = (
  kind: CodeKind,
  revenuePerCode: number = REVENUE_PER_NORMAL_CODE,
  refactoringRatio: number = DEFAULT_REFACTORING_RATIO,
): number =>
  kind === 'normal' && Number.isFinite(revenuePerCode) && revenuePerCode > 0
    ? Math.round(revenuePerCode * getFeatureRevenueMultiplier(refactoringRatio))
    : 0;

// リリースされたコード1件分の売上を加算した資金を返す。
export const sellReleasedCode = (
  funds: number,
  kind: CodeKind,
  revenuePerCode: number = REVENUE_PER_NORMAL_CODE,
  refactoringRatio: number = DEFAULT_REFACTORING_RATIO,
): number => addFunds(funds, getReleaseRevenue(kind, revenuePerCode, refactoringRatio));
