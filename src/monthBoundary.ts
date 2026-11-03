import { isBankrupt } from './gameOver';
import { getMonthlyItemFees, settleMonthlyItemFees, shouldChargeItemFees } from './itemFee';
import type { ItemFeePaidEvent } from './itemFee';
import type { PlacedItem } from './itemPlacement';
import { settleMonthlySalary } from './salary';
import type { SalaryPaidEvent } from './salary';

// 月の境界の精算（給料 → 月額アイテム費）。Phaser に依存しない純粋関数。main.ts の onMonthElapsed が使う。

export type MonthBoundarySettlement = {
  readonly salary: SalaryPaidEvent;
  // 引かないとき（ゲームオーバー中・給料で倒産・月額アイテム0個）は null。
  readonly itemFee: ItemFeePaidEvent | null;
};

// 給料を先に引き、その後の資金から月額アイテム費を引く。給料で倒産したらアイテム費は引かない。
export const settleMonthBoundary = (
  funds: number,
  month: number,
  salaries: readonly number[],
  placedItems: readonly PlacedItem[],
  gameOver: boolean,
): MonthBoundarySettlement => {
  const salary = settleMonthlySalary(funds, month, salaries);
  const over = gameOver || isBankrupt(salary.fundsAfter);
  const itemFee = shouldChargeItemFees(over, getMonthlyItemFees(placedItems).itemCount)
    ? settleMonthlyItemFees(salary.fundsAfter, month, placedItems)
    : null;
  return { salary, itemFee };
};
