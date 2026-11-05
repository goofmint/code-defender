import { getMonthlyAiAgentFees } from './aiAgent';
import type { Engineer } from './engineer';
import { subtractFunds } from './funds';
import { isBankrupt } from './gameOver';
import { getMonthlyItemFees, shouldChargeItemFees } from './itemFee';
import type { ItemFeePaidEvent } from './itemFee';
import type { PlacedItem } from './itemPlacement';
import { settleMonthlySalary } from './salary';
import type { SalaryPaidEvent } from './salary';

// 月の境界の精算（給料 → 月額アイテム費）。Phaser に依存しない純粋関数。main.ts の onMonthElapsed が使う。

export type MonthBoundarySettlement = {
  readonly salary: SalaryPaidEvent;
  // 引かないとき（ゲームオーバー中・給料で倒産・月額アイテムとAIエージェントが0個）は null。
  readonly itemFee: ItemFeePaidEvent | null;
};

// 給料を先に引き、その後の資金から月額アイテム費を引く。給料で倒産したらアイテム費は引かない。
// 月額アイテム費には、エンジニアに付けた AIエージェント(#53)の月額も合算する（合計を1回で引く。amount・itemCount は合算後の値）。
// AIエージェントは engineers の全員（休暇中・ルート未割当も含む）の分を数える。
export const settleMonthBoundary = (
  funds: number,
  month: number,
  salaries: readonly number[],
  placedItems: readonly PlacedItem[],
  gameOver: boolean,
  engineers: readonly Pick<Engineer, 'aiAgent'>[],
): MonthBoundarySettlement => {
  const salary = settleMonthlySalary(funds, month, salaries);
  const over = gameOver || isBankrupt(salary.fundsAfter);
  const items = getMonthlyItemFees(placedItems);
  const aiAgents = getMonthlyAiAgentFees(engineers);
  const amount = items.amount + aiAgents.amount;
  const itemCount = items.itemCount + aiAgents.itemCount;
  const itemFee = shouldChargeItemFees(over, itemCount)
    ? {
        month,
        amount,
        itemCount,
        fundsBefore: salary.fundsAfter,
        fundsAfter: subtractFunds(salary.fundsAfter, amount),
      }
    : null;
  return { salary, itemFee };
};
