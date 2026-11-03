import { describe, expect, it } from 'vitest';
import { getCrossedMonths } from './gameTime';
import {
  createSalaryPaidEvent,
  getEngineerSalaries,
  getMonthlyPayroll,
  paySalary,
  SALARY_PAID_EVENT,
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

describe('複数月を1フレームでまたぐ', () => {
  it('59999 → 180000 は3か月分引かれる', () => {
    const months = getCrossedMonths(59999, 180000);
    expect(months).toHaveLength(3);
    const funds = months.reduce((current) => paySalary(current, 100), 1000);
    expect(funds).toBe(700);
  });

  it('60000 → 60001 は0回', () => {
    const months = getCrossedMonths(60000, 60001);
    expect(months).toHaveLength(0);
    expect(months.reduce((current) => paySalary(current, 100), 1000)).toBe(1000);
  });
});
