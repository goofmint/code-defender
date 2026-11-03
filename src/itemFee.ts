import { ITEM_MONTHLY_FEE_RATIO } from './config';
import { subtractFunds } from './funds';
import { getItemMonthlyFee, getItemPayment, isMonthlyItem } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';

// 月額払いアイテムの費用。Phaser に依存しない純粋関数だけを置く。

// 月額アイテムの費用を引いたときに scene.events で発行するイベント名。
export const ITEM_FEE_PAID_EVENT = 'item-fee-paid';

export type ItemFeePaidEvent = {
  // 何か月目の費用か（1始まり）。
  readonly month: number;
  // 引いた合計額。
  readonly amount: number;
  // 費用の対象になった月額アイテムの個数。
  readonly itemCount: number;
  readonly fundsBefore: number;
  readonly fundsAfter: number;
};

// 区分と1個の月額は、ボタン表示と同じ計算を使うため itemPlacement.ts に置き、ここから再エクスポートする。
export { getItemMonthlyFee, getItemPayment, isMonthlyItem };

// 置いてあるアイテムのうち、月額アイテムの月額の合計と個数。1回払いは数えない。
export const getMonthlyItemFees = (
  placedItems: readonly PlacedItem[],
  ratio: number = ITEM_MONTHLY_FEE_RATIO,
): { readonly amount: number; readonly itemCount: number } => {
  const monthly = placedItems.filter((item) => isMonthlyItem(item.itemType));
  return {
    amount: monthly.reduce((sum, item) => sum + getItemMonthlyFee(item.itemType, ratio), 0),
    itemCount: monthly.length,
  };
};

// 月の境界で費用を引くか。ゲームオーバー中・月額アイテムが0個なら引かない。
export const shouldChargeItemFees = (gameOver: boolean, itemCount: number): boolean =>
  !gameOver && itemCount > 0;

// 1か月分の月額アイテム費を精算する。合計を1回で引き、month・amount・itemCount・fundsBefore・fundsAfter を返す。
// 月の途中で置いたアイテムも満額（日割りしない）。
export const settleMonthlyItemFees = (
  funds: number,
  month: number,
  placedItems: readonly PlacedItem[],
  ratio: number = ITEM_MONTHLY_FEE_RATIO,
): ItemFeePaidEvent => {
  const { amount, itemCount } = getMonthlyItemFees(placedItems, ratio);
  return { month, amount, itemCount, fundsBefore: funds, fundsAfter: subtractFunds(funds, amount) };
};
