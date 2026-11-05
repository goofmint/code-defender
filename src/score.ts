import type { FundsChangedEvent } from './funds';
import { formatYen, getMessages, interpolate } from './i18n';

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

// ゲームオーバー画面のスコア行。3桁区切りで整形する。「スコア: 20,000円」（英語は「Score: ¥20,000」）の形(#158)。
export const formatScore = (score: number): string =>
  interpolate(getMessages().gameOver.score, { amount: formatYen(score) });

// プレイ中の常時表示用。3桁区切りで整形する。「累計売上: 20,000円」（英語は「Total sales: ¥20,000」#158）の形。
export const formatCumulativeSales = (score: number): string =>
  interpolate(getMessages().hud.cumulativeSales, { amount: formatYen(score) });
