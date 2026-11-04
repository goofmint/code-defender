import { describe, expect, it } from 'vitest';
import { ENGINEER_MONTHLY_SALARY_BY_RANK, ENGINEER_SPAWN_CELLS, INITIAL_ENGINEER_RANKS, MS_PER_GAME_MONTH } from './config';
import { isBankrupt } from './gameOver';
import { createMonthElapsedEvent, getCrossedMonths } from './gameTime';
import { ITEM_TYPES } from './item';
import type { ItemType } from './item';
import {
  getItemMonthlyFee,
  getItemPayment,
  getMonthlyItemFees,
  isMonthlyItem,
  ITEM_FEE_PAID_EVENT,
  settleMonthlyItemFees,
  shouldChargeItemFees,
} from './itemFee';
import type { ItemFeePaidEvent } from './itemFee';
import type { PlacedItem } from './itemPlacement';
import { settleMonthBoundary } from './monthBoundary';
import { createInitialEngineers, getInitialSalary, setEngineerVacation } from './engineer';
import type { Engineer } from './engineer';
import { AI_AGENT_TYPES, equipAiAgent, getAiAgentMonthlyFee, getMonthlyAiAgentFees } from './aiAgent';
import type { AiAgentType } from './aiAgent';
import { createRoutes } from './route';
import { getEngineerSalaries } from './salary';

const placed = (id: number, itemType: ItemType): PlacedItem => ({
  id,
  itemType,
  cell: { col: id + 1, row: 3 },
  lastAttackTime: null,
});

// 月額: CodeRabbit 200000 / CI 100000 / セキュリティスキャナー 200000 / ペアプロ 100000。1回払い: Linter 50000 / テストツール 100000。
describe('支払い区分（企画書 8 のとおり）', () => {
  it.each([
    ['codeRabbit', 'monthly'],
    ['linter', 'oneTime'],
    ['testTool', 'oneTime'],
    ['ci', 'monthly'],
    ['securityScanner', 'monthly'],
    ['pairProgrammer', 'monthly'],
  ] as const)('%s は %s', (itemType, expected) => {
    expect(getItemPayment(itemType)).toBe(expected);
    expect(isMonthlyItem(itemType)).toBe(expected === 'monthly');
  });

  it('6アイテムすべて区分を持つ', () => {
    expect(ITEM_TYPES.map(getItemPayment).sort()).toEqual(
      ['monthly', 'monthly', 'monthly', 'monthly', 'oneTime', 'oneTime'],
    );
  });
});

describe('getItemMonthlyFee: 月額', () => {
  it.each([
    ['codeRabbit', 200000],
    ['ci', 100000],
    ['securityScanner', 200000],
    ['pairProgrammer', 100000],
    ['linter', 0],
    ['testTool', 0],
  ] as const)('%s の月額は %d', (itemType, expected) => {
    expect(getItemMonthlyFee(itemType)).toBe(expected);
  });

  it.each([
    [0, 0],
    [1, 200000],
    [0.5, 100000],
    [1.5, 300000],
    [-1, 0],
    [NaN, 0],
    [Infinity, 0],
  ])('ratio %d の CodeRabbit は %d', (ratio, expected) => {
    expect(getItemMonthlyFee('codeRabbit', ratio)).toBe(expected);
  });

  it('端数は四捨五入する（100000 × 0.000005 = 0.5 → 1）', () => {
    expect(getItemMonthlyFee('ci', 0.000005)).toBe(1);
    expect(getItemMonthlyFee('ci', 0.0000049)).toBe(0);
  });

  it('1回払いは ratio に関わらず 0', () => {
    expect(getItemMonthlyFee('linter', 10)).toBe(0);
  });
});

describe('getMonthlyItemFees: 個数', () => {
  it('0個は amount 0・itemCount 0', () => {
    expect(getMonthlyItemFees([])).toEqual({ amount: 0, itemCount: 0 });
  });

  it('1個', () => {
    expect(getMonthlyItemFees([placed(0, 'codeRabbit')])).toEqual({ amount: 200000, itemCount: 1 });
  });

  it('複数個は合計する', () => {
    expect(getMonthlyItemFees([placed(0, 'codeRabbit'), placed(1, 'codeRabbit'), placed(2, 'ci')])).toEqual({
      amount: 500000,
      itemCount: 3,
    });
  });

  it('1回払いだけなら 0個と同じ', () => {
    expect(getMonthlyItemFees([placed(0, 'linter'), placed(1, 'testTool')])).toEqual({ amount: 0, itemCount: 0 });
  });

  it('月額と1回払いが混在しても月額だけ合計する', () => {
    expect(getMonthlyItemFees([placed(0, 'linter'), placed(1, 'ci'), placed(2, 'testTool'), placed(3, 'pairProgrammer')])).toEqual({
      amount: 200000,
      itemCount: 2,
    });
  });

  it('ratio 0 は amount 0（itemCount は数える）、ratio 1 は購入価格と同額', () => {
    expect(getMonthlyItemFees([placed(0, 'ci')], 0)).toEqual({ amount: 0, itemCount: 1 });
    expect(getMonthlyItemFees([placed(0, 'ci')], 1)).toEqual({ amount: 100000, itemCount: 1 });
  });

  it('入力配列を変更しない', () => {
    const items = [placed(0, 'ci'), placed(1, 'linter')];
    const snapshot = structuredClone(items);
    getMonthlyItemFees(items);
    settleMonthlyItemFees(1000000, 1, items);
    expect(items).toEqual(snapshot);
  });
});

describe('settleMonthlyItemFees: 資金の境界', () => {
  const ci = [placed(0, 'ci')]; // 月額 100000

  it.each([
    [100000, 0],
    [100001, 1],
    [99999, -1],
    [0, -100000],
    [-100, -100100],
  ])('資金 %d → 精算後 %d', (funds, expected) => {
    expect(settleMonthlyItemFees(funds, 3, ci)).toEqual({
      month: 3,
      amount: 100000,
      itemCount: 1,
      fundsBefore: funds,
      fundsAfter: expected,
    });
  });

  it('月額アイテム 0個なら資金は変わらない', () => {
    expect(settleMonthlyItemFees(1000, 1, [placed(0, 'linter')])).toEqual({
      month: 1,
      amount: 0,
      itemCount: 0,
      fundsBefore: 1000,
      fundsAfter: 1000,
    });
  });

  it('買った直後の月の境界でも満額（日割りしない）', () => {
    expect(settleMonthlyItemFees(500000, 1, [placed(0, 'codeRabbit')]).amount).toBe(200000);
  });

  // 既存の bankruptcy 判定（BANKRUPT_INCLUDES_ZERO = true）: 0 で倒産・1円で継続・マイナスで倒産。
  it.each([
    [100000, true],
    [100001, false],
    [99999, true],
  ])('資金 %d で精算すると倒産 = %s', (funds, bankrupt) => {
    expect(isBankrupt(settleMonthlyItemFees(funds, 1, ci).fundsAfter)).toBe(bankrupt);
  });
});

describe('shouldChargeItemFees', () => {
  it.each([
    [false, 1, true],
    [false, 5, true],
    [false, 0, false],
    [true, 1, false],
    [true, 0, false],
  ])('gameOver=%s, itemCount=%d → %s', (gameOver, itemCount, expected) => {
    expect(shouldChargeItemFees(gameOver, itemCount)).toBe(expected);
  });
});

// main.ts の advanceClock → onMonthElapsed と同じ手順を純粋関数で再現する。
const settleMonths = (months: number[], initial: number, items: readonly PlacedItem[]): ItemFeePaidEvent[] => {
  let funds = initial;
  const paid: ItemFeePaidEvent[] = [];
  for (const month of months) {
    if (!shouldChargeItemFees(isBankrupt(funds), getMonthlyItemFees(items).itemCount)) break;
    const result = settleMonthlyItemFees(funds, month, items);
    funds = result.fundsAfter;
    paid.push(result);
  }
  return paid;
};

describe('1フレームで複数月をまたぐ', () => {
  const items = [placed(0, 'ci')]; // 月額 100000

  it.each([
    [0, 2 * MS_PER_GAME_MONTH, [1, 2]],
    [0, 3 * MS_PER_GAME_MONTH, [1, 2, 3]],
    [MS_PER_GAME_MONTH - 1, 3 * MS_PER_GAME_MONTH, [1, 2, 3]],
  ])('%d → %d ms で月 %j', (prev, next, months) => {
    expect(getCrossedMonths(prev, next)).toEqual(months);
  });

  it('月ごとに fundsBefore / fundsAfter が連鎖する', () => {
    const paid = settleMonths(getCrossedMonths(0, 3 * MS_PER_GAME_MONTH), 1000000, items);
    expect(paid.map((p) => [p.month, p.fundsBefore, p.fundsAfter])).toEqual([
      [1, 1000000, 900000],
      [2, 900000, 800000],
      [3, 800000, 700000],
    ]);
  });

  it('途中で倒産したら以降の月は引かない', () => {
    const paid = settleMonths(getCrossedMonths(0, 3 * MS_PER_GAME_MONTH), 200000, items);
    expect(paid.map((p) => [p.month, p.fundsBefore, p.fundsAfter])).toEqual([
      [1, 200000, 100000],
      [2, 100000, 0],
    ]);
  });

  it('2か月目で資金が1円残るなら3か月目も引く', () => {
    const paid = settleMonths(getCrossedMonths(0, 3 * MS_PER_GAME_MONTH), 200001, items);
    expect(paid.map((p) => p.fundsAfter)).toEqual([100001, 1, -99999]);
  });
});

describe('給料と同じ月: 給料 → アイテム費の順', () => {
  const items = [placed(0, 'codeRabbit')]; // 月額 200000
  const salaries = getEngineerSalaries([{ salary: getInitialSalary('junior') }]);

  // main.ts の onMonthElapsed が使う精算と同じ関数（settleMonthBoundary）を呼ぶ。
  const monthBoundary = (funds: number, over: boolean, placedItems: readonly PlacedItem[] = items) => {
    const { salary, itemFee } = settleMonthBoundary(
      funds,
      createMonthElapsedEvent(1).month,
      salaries,
      placedItems,
      over,
      [],
    );
    return { salary, fee: itemFee };
  };

  it('給料後の資金からアイテム費を引く', () => {
    const { salary, fee } = monthBoundary(1000000, false);
    expect(salary.fundsAfter).toBe(700000);
    expect(fee).toEqual({ month: 1, amount: 200000, itemCount: 1, fundsBefore: 700000, fundsAfter: 500000 });
  });

  it('給料で倒産したらアイテム費は引かない', () => {
    const { salary, fee } = monthBoundary(ENGINEER_MONTHLY_SALARY_BY_RANK.junior, false);
    expect(salary.fundsAfter).toBe(0);
    expect(fee).toBeNull();
  });

  it('給料で1円残ればアイテム費を引く', () => {
    const { fee } = monthBoundary(ENGINEER_MONTHLY_SALARY_BY_RANK.junior + 1, false);
    expect(fee?.fundsBefore).toBe(1);
    expect(fee?.fundsAfter).toBe(-199999);
  });

  it('ゲームオーバー中なら給料は精算してもアイテム費は null', () => {
    expect(monthBoundary(10000000, true).fee).toBeNull();
  });

  it('月額アイテムが0個ならアイテム費は null（1回払いだけでも同じ）', () => {
    expect(monthBoundary(10000000, false, []).fee).toBeNull();
    expect(monthBoundary(10000000, false, [placed(0, 'linter')]).fee).toBeNull();
  });
});

describe('ゲームオーバー後は引かない', () => {
  it('gameOver=true なら月額アイテムがあっても引かない', () => {
    expect(shouldChargeItemFees(true, getMonthlyItemFees([placed(0, 'ci')]).itemCount)).toBe(false);
  });
});

describe('イベント名', () => {
  it('item-fee-paid', () => {
    expect(ITEM_FEE_PAID_EVENT).toBe('item-fee-paid');
  });
});

// AIエージェント(#53)の月額は、月額アイテム費に合算して1回で引く。
describe('AIエージェントの月額（settleMonthBoundary に合算）(#53)', () => {
  // 初期編成（固定の乱数）。
  const fixedRandom = (): number => 0;
  const baseEngineers: readonly Engineer[] = createInitialEngineers(
    createRoutes(ENGINEER_SPAWN_CELLS, fixedRandom),
    INITIAL_ENGINEER_RANKS,
    fixedRandom,
  );
  const withAgents = (agents: readonly (AiAgentType | null)[]): Engineer[] =>
    baseEngineers.map((engineer, index) => ({ ...engineer, aiAgent: agents[index] ?? null }));
  const salariesOf = (engineers: readonly Engineer[]): readonly number[] => getEngineerSalaries(engineers);
  const payrollOf = (engineers: readonly Engineer[]): number => salariesOf(engineers).reduce((sum, v) => sum + v, 0);
  const settle = (funds: number, engineers: readonly Engineer[], placedItems: readonly PlacedItem[] = [], over = false) =>
    settleMonthBoundary(funds, 1, salariesOf(engineers), placedItems, over, engineers);

  it('3種の月額は価格の段階（強い=高い・普通=普通・安い=安い）× ITEM_MONTHLY_FEE_RATIO', () => {
    expect(AI_AGENT_TYPES.map((type) => getAiAgentMonthlyFee(type))).toEqual([200000, 100000, 50000]);
  });

  it('誰も付けていなければ件数 0 で、月額アイテムもなければ itemFee は null', () => {
    const engineers = withAgents([]);
    expect(getMonthlyAiAgentFees(engineers)).toEqual({ amount: 0, itemCount: 0 });
    expect(settle(10000000, engineers).itemFee).toBeNull();
  });

  it('AIエージェントだけでも引く（月額アイテム 0 個）', () => {
    const engineers = withAgents(['cheap']);
    const funds = 10000000;
    const afterSalary = funds - payrollOf(engineers);
    expect(settle(funds, engineers).itemFee).toEqual({
      month: 1,
      amount: 50000,
      itemCount: 1,
      fundsBefore: afterSalary,
      fundsAfter: afterSalary - 50000,
    });
  });

  it('AIエージェントと置いた月額アイテムを合算して1回で引く（1回払いは数えない）', () => {
    const engineers = withAgents(['strong', 'normal', 'cheap']);
    const funds = 10000000;
    const afterSalary = funds - payrollOf(engineers);
    const fee = settle(funds, engineers, [placed(0, 'ci'), placed(1, 'linter')]).itemFee;
    expect(fee).toEqual({
      month: 1,
      amount: 200000 + 100000 + 50000 + 100000,
      itemCount: 4,
      fundsBefore: afterSalary,
      fundsAfter: afterSalary - 450000,
    });
  });

  // 合計 T = 給料 + AI(強い 200000) + CI 100000。
  it.each([
    ['T-1', -1, -1, true],
    ['T', 0, 0, true],
    ['T+1', 1, 1, false],
  ])('資金 %s なら精算後 %d 円（倒産 = %s）', (_name, offset, expected, bankrupt) => {
    const engineers = withAgents(['strong']);
    const total = payrollOf(engineers) + 200000 + 100000;
    const fee = settle(total + offset, engineers, [placed(0, 'ci')]).itemFee;
    expect(fee?.fundsAfter).toBe(expected);
    expect(isBankrupt(fee?.fundsAfter ?? Number.NaN)).toBe(bankrupt);
  });

  it.each([
    ['ちょうど給料', 0],
    ['給料-1', -1],
  ])('資金が%sで給料で倒産したら AIエージェントの月額は引かない', (_name, offset) => {
    const engineers = withAgents(['strong']);
    expect(settle(payrollOf(engineers) + offset, engineers).itemFee).toBeNull();
  });

  it('ゲームオーバー中は AIエージェントを付けていても引かない', () => {
    expect(settle(10000000, withAgents(['strong']), [], true).itemFee).toBeNull();
  });

  it('休暇中・ルート未割当のエンジニアの AIエージェントも引く', () => {
    const onVacation = setEngineerVacation(withAgents(['normal']), baseEngineers[0].id, true);
    const unassigned = withAgents([null, 'cheap']).map((engineer) =>
      engineer.id === baseEngineers[1].id ? { ...engineer, routeId: null } : engineer,
    );
    expect(getMonthlyAiAgentFees(onVacation)).toEqual({ amount: 100000, itemCount: 1 });
    expect(getMonthlyAiAgentFees(unassigned)).toEqual({ amount: 50000, itemCount: 1 });
    expect(settle(10000000, onVacation).itemFee?.amount).toBe(100000);
    expect(settle(10000000, unassigned).itemFee?.amount).toBe(50000);
  });

  it('付け替えた後は新しい種類の月額だけを引く（前の種類は引かない）', () => {
    const first = equipAiAgent(baseEngineers, baseEngineers[0].id, 'strong', { funds: 10000000, gameOver: false });
    if (!first.ok) throw new Error('1回目の装着に失敗した');
    const second = equipAiAgent(first.engineers, baseEngineers[0].id, 'cheap', { funds: first.fundsAfter, gameOver: false });
    if (!second.ok) throw new Error('付け替えに失敗した');
    expect(getMonthlyAiAgentFees(second.engineers)).toEqual({ amount: 50000, itemCount: 1 });
    expect(settle(10000000, [...second.engineers]).itemFee?.amount).toBe(50000);
  });

  it('ratio 0・負・NaN は月額 0（件数は数える）', () => {
    const engineers = withAgents(['strong', 'cheap']);
    for (const ratio of [0, -1, Number.NaN]) {
      expect(getMonthlyAiAgentFees(engineers, ratio)).toEqual({ amount: 0, itemCount: 2 });
    }
  });
});
