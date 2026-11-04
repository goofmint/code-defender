import { CUMULATIVE_SALES_FORMAT, SCORE_FORMAT } from './config';
import type { FundsChangedEvent } from './funds';

// スコア = 倒産までの累計売上。Phaser に依存しない純粋関数だけを置く。
// 資金の増減ではなく、'funds-changed' イベントのうち理由が 'sales' のものの delta だけを累計する。

export const INITIAL_SCORE = 0;

// 'sales' かつゲームオーバー前で、delta が正の有限数のときだけ加算する。それ以外は score をそのまま返す。
export const accumulateScore = (
  score: number,
  event: FundsChangedEvent,
  gameOver: boolean,
): number => {
  if (gameOver || event.reason !== 'sales') {
    return score;
  }
  return Number.isFinite(event.delta) && event.delta > 0 ? score + event.delta : score;
};

// 3桁区切りで整形する。「スコア: 20,000円」の形。
export const formatScore = (score: number): string =>
  `${SCORE_FORMAT.prefix}${score.toLocaleString('ja-JP')}${SCORE_FORMAT.suffix}`;

// プレイ中の常時表示用。3桁区切りで整形する。「累計売上: 20,000円」の形。
export const formatCumulativeSales = (score: number): string =>
  `${CUMULATIVE_SALES_FORMAT.prefix}${score.toLocaleString('ja-JP')}${CUMULATIVE_SALES_FORMAT.suffix}`;
