import { describe, expect, it } from 'vitest';
import { getAiAgentMonthlyFee } from './aiAgent';
import { ENGINEER_MONTHLY_SALARY_BY_RANK } from './config';
import type { Engineer } from './engineer';
import { getItemMonthlyFee, isMonthlyItem } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { formatMonthEndPayment, getMonthEndPaymentForecast, settleMonthBoundary } from './monthBoundary';
import { getEngineerSalaries } from './salary';

// 月末に支払うお金の予告(#156)。給料・AIエージェントは状態（休暇中・未配属）に関係なく全員、アイテムは月額払いだけ。
type PaymentEngineer = Pick<Engineer, 'salary' | 'aiAgent' | 'onVacation' | 'routeId'>;

const junior = ENGINEER_MONTHLY_SALARY_BY_RANK.junior;
const working: PaymentEngineer = { salary: junior, aiAgent: null, onVacation: false, routeId: 0 };
const onVacation: PaymentEngineer = { salary: junior, aiAgent: null, onVacation: true, routeId: 1 };
const unassigned: PaymentEngineer = { salary: junior, aiAgent: null, onVacation: false, routeId: null };
const withAi: PaymentEngineer = { salary: junior, aiAgent: 'strong', onVacation: false, routeId: 2 };

const item = (id: number, itemType: PlacedItem['itemType']): PlacedItem => ({
  id,
  itemType,
  cell: { col: id, row: 10 },
  lastAttackTime: null,
});

describe('getMonthEndPaymentForecast(#156)', () => {
  it('誰もいない・何も置いていなければ 0', () => {
    expect(getMonthEndPaymentForecast([], [])).toBe(0);
  });

  it('給料は休暇中・未配属（routeId: null）のエンジニアも含めた全員の合計', () => {
    expect(getMonthEndPaymentForecast([working, onVacation, unassigned], [])).toBe(junior * 3);
  });

  it('付けている AIエージェントの月額を足す', () => {
    expect(getMonthEndPaymentForecast([withAi], [])).toBe(junior + getAiAgentMonthlyFee('strong'));
  });

  it('月額払いのアイテムだけを足し、1回払いは数えない', () => {
    expect(isMonthlyItem('codeRabbit')).toBe(true);
    expect(isMonthlyItem('linter')).toBe(false);
    expect(getMonthEndPaymentForecast([], [item(0, 'linter')])).toBe(0);
    expect(getMonthEndPaymentForecast([], [item(0, 'codeRabbit'), item(1, 'linter')])).toBe(getItemMonthlyFee('codeRabbit'));
  });

  it('すべてを合わせた額は、資金が十分なときの月の精算（settleMonthBoundary）で引く額と同じ', () => {
    const engineers = [working, onVacation, unassigned, withAi];
    const placedItems = [item(0, 'codeRabbit'), item(1, 'ci'), item(2, 'linter')];
    const forecast = getMonthEndPaymentForecast(engineers, placedItems);
    const funds = 100_000_000;
    const { salary, itemFee } = settleMonthBoundary(funds, 1, getEngineerSalaries(engineers), placedItems, false, engineers);
    if (itemFee === null) throw new Error('月額アイテム費が引かれていません');
    expect(forecast).toBe(salary.amount + itemFee.amount);
    expect(forecast).toBe(
      junior * 4 + getAiAgentMonthlyFee('strong') + getItemMonthlyFee('codeRabbit') + getItemMonthlyFee('ci'),
    );
  });

  it('資金は見ない（倒産する額でも額面の合計を出す）', () => {
    const engineers = [working, withAi];
    const placedItems = [item(0, 'codeRabbit')];
    expect(getMonthEndPaymentForecast(engineers, placedItems)).toBe(
      junior * 2 + getAiAgentMonthlyFee('strong') + getItemMonthlyFee('codeRabbit'),
    );
  });
});

describe('formatMonthEndPayment(#156)', () => {
  it('「月末支払: 900,000円」の形（3桁区切り）', () => {
    expect(formatMonthEndPayment(900000)).toBe('月末支払: 900,000円');
    expect(formatMonthEndPayment(0)).toBe('月末支払: 0円');
  });
});
