import { describe, expect, it } from 'vitest';
import { getCrossedMonths } from './gameTime';
import {
  createSalaryPaidEvent,
  getEngineerSalaries,
  getMonthlyPayroll,
  paySalary,
  SALARY_PAID_EVENT,
  settleMonthlySalary,
} from './salary';

describe('getMonthlyPayroll', () => {
  it.each([
    [[], 0],
    [[300000], 300000],
    [[300000, 300000, 300000], 900000],
    [[100, -50, 200], 300],
    [[100, NaN, 200], 300],
    [[100, Infinity, 200], 300],
    [[-1], 0],
  ])('getMonthlyPayroll(%j) = %d', (salaries, expected) => {
    expect(getMonthlyPayroll(salaries)).toBe(expected);
  });
});

describe('getEngineerSalaries', () => {
  it.each([
    [0, []],
    [1, [300]],
    [3, [300, 300, 300]],
  ])('%d人', (count, expected) => {
    expect(getEngineerSalaries(count, 300)).toEqual(expected);
  });
});

describe('paySalary', () => {
  it.each([
    [300000, 300000, 0],
    [300001, 300000, 1],
    [299999, 300000, -1],
    [0, 300000, -300000],
    [-100, 300000, -300100],
    [500, 0, 500],
  ])('paySalary(%d, %d) = %d', (funds, payroll, expected) => {
    expect(paySalary(funds, payroll)).toBe(expected);
  });

  it('イベント名と生成', () => {
    expect(SALARY_PAID_EVENT).toBe('salary-paid');
    expect(createSalaryPaidEvent(2, 300, 1000, 700)).toEqual({
      month: 2,
      amount: 300,
      fundsBefore: 1000,
      fundsAfter: 700,
    });
  });
});

describe('settleMonthlySalary', () => {
  it.each([
    [300, 300, 0],
    [301, 300, 1],
    [299, 300, -1],
  ])('資金 %d、給料 %d → 精算後 %d', (funds, salary, expected) => {
    expect(settleMonthlySalary(funds, 4, [salary])).toEqual({
      month: 4,
      amount: salary,
      fundsBefore: funds,
      fundsAfter: expected,
    });
  });

  it('0人なら資金は変わらない', () => {
    expect(settleMonthlySalary(1000, 1, [])).toEqual({
      month: 1,
      amount: 0,
      fundsBefore: 1000,
      fundsAfter: 1000,
    });
  });
});

describe('越えた月ごとに1回ずつ給料を引く（getCrossedMonths と組み合わせ）', () => {
  const settleAll = (months: number[], initial: number, salaries: readonly number[]) => {
    let funds = initial;
    return months.map((month) => {
      const paid = settleMonthlySalary(funds, month, salaries);
      funds = paid.fundsAfter;
      return paid;
    });
  };

  it('59999 → 180000 は月 1,2,3 を順に3か月分ちょうど引く', () => {
    const months = getCrossedMonths(59999, 180000);
    expect(months).toEqual([1, 2, 3]);
    const results = settleAll(months, 1000, [60, 40]);
    expect(results.map((r) => r.month)).toEqual([1, 2, 3]);
    expect(results.map((r) => r.fundsAfter)).toEqual([900, 800, 700]);
  });

  it('60000 → 60001 は0回', () => {
    const months = getCrossedMonths(60000, 60001);
    expect(months).toEqual([]);
    expect(settleAll(months, 1000, [100])).toEqual([]);
  });
});
