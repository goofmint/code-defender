import { REVENUE_PER_NORMAL_CODE } from './config';
import type { CodeKind } from './code';
import { addFunds } from './funds';

// 売上の計算。Phaser に依存しない純粋関数だけを置く。

// リリースされたコード1件の売上。正常なコードで単価が正の有限数のときだけ単価、それ以外は 0。
export const getReleaseRevenue = (
  kind: CodeKind,
  revenuePerCode: number = REVENUE_PER_NORMAL_CODE,
): number => (kind === 'normal' && Number.isFinite(revenuePerCode) && revenuePerCode > 0 ? revenuePerCode : 0);

// リリースされたコード1件分の売上を加算した資金を返す。
export const sellReleasedCode = (
  funds: number,
  kind: CodeKind,
  revenuePerCode: number = REVENUE_PER_NORMAL_CODE,
): number => addFunds(funds, getReleaseRevenue(kind, revenuePerCode));
