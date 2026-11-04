import { describe, expect, it } from 'vitest';
import { ENGINEER_MONTHLY_SALARY_BY_RANK, ENGINEER_RANKS, MAX_ENGINEERS } from './config';
import { getInitialSalary } from './engineer';
import type { EngineerRank } from './engineer';
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

// ランクの初期額の月給を持つエンジニア（getEngineerSalaries が見るのは salary だけ）。
const staff = (...ranks: EngineerRank[]) => ranks.map((rank) => ({ rank, salary: getInitialSalary(rank) }));

describe('ENGINEER_MONTHLY_SALARY_BY_RANK', () => {
  it('全ランクが定義され、正の有限値', () => {
    expect(Object.keys(ENGINEER_MONTHLY_SALARY_BY_RANK).sort()).toEqual(ENGINEER_RANKS.map((r) => r.id).sort());
    for (const rank of ENGINEER_RANKS) {
      const salary = ENGINEER_MONTHLY_SALARY_BY_RANK[rank.id];
      expect(Number.isFinite(salary)).toBe(true);
      expect(salary).toBeGreaterThan(0);
    }
  });
  it('ランクが上がるほど高い（ジュニア < ミドル < シニア）', () => {
    const salaries = ENGINEER_RANKS.map((rank) => ENGINEER_MONTHLY_SALARY_BY_RANK[rank.id]);
    for (let i = 1; i < salaries.length; i += 1) {
      expect(salaries[i]).toBeGreaterThan(salaries[i - 1]);
    }
  });
});

describe('getEngineerSalaries', () => {
  it.each(ENGINEER_RANKS.map((r) => r.id))('%s 単独の額は設定表どおり', (rank) => {
    expect(getEngineerSalaries(staff(rank))).toEqual([ENGINEER_MONTHLY_SALARY_BY_RANK[rank]]);
  });

  it('0人は空配列で、給料合計は0・資金は変わらない', () => {
    expect(getEngineerSalaries([])).toEqual([]);
    expect(settleMonthlySalary(1000, 1, getEngineerSalaries([]))).toEqual({
      month: 1,
      amount: 0,
      fundsBefore: 1000,
      fundsAfter: 1000,
    });
  });

  it('ランク混在は入力と同じ順序で、合計は各ランクの月給の和', () => {
    const salaries = getEngineerSalaries(staff('senior', 'junior', 'middle', 'junior'));
    const { junior, middle, senior } = ENGINEER_MONTHLY_SALARY_BY_RANK;
    expect(salaries).toEqual([senior, junior, middle, junior]);
    expect(getMonthlyPayroll(salaries)).toBe(senior + middle + junior * 2);
  });

  it(`${MAX_ENGINEERS}人（上限）の合計`, () => {
    const ranks: EngineerRank[] = Array.from({ length: MAX_ENGINEERS }, (_, i) => ENGINEER_RANKS[i % ENGINEER_RANKS.length].id);
    const salaries = getEngineerSalaries(staff(...ranks));
    expect(salaries).toHaveLength(MAX_ENGINEERS);
    expect(getMonthlyPayroll(salaries)).toBe(ranks.reduce((sum, rank) => sum + ENGINEER_MONTHLY_SALARY_BY_RANK[rank], 0));
  });

  it('全員ジュニア9人は 300000×9 円', () => {
    expect(getMonthlyPayroll(getEngineerSalaries(staff(...Array<EngineerRank>(9).fill('junior'))))).toBe(2700000);
  });

  it('入力を変更しない', () => {
    const input = staff('junior', 'senior');
    getEngineerSalaries(input);
    expect(input).toEqual([
      { rank: 'junior', salary: ENGINEER_MONTHLY_SALARY_BY_RANK.junior },
      { rank: 'senior', salary: ENGINEER_MONTHLY_SALARY_BY_RANK.senior },
    ]);
  });

  it('ランクではなく個人の salary を使う（ジュニアでも salary 350000 なら 350000）', () => {
    const [junior, senior] = staff('junior', 'senior');
    const salaries = getEngineerSalaries([
      { ...junior, salary: 350000 },
      { ...senior, salary: ENGINEER_MONTHLY_SALARY_BY_RANK.junior },
    ]);
    expect(salaries).toEqual([350000, ENGINEER_MONTHLY_SALARY_BY_RANK.junior]);
    expect(getMonthlyPayroll(salaries)).toBe(350000 + ENGINEER_MONTHLY_SALARY_BY_RANK.junior);
  });

  it.each([
    [1, 1],
    [0, 0],
    [-1, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
  ])('salary %d はそのまま返し、合計では %d 円として扱う', (salary, payroll) => {
    const salaries = getEngineerSalaries([{ salary }]);
    expect(salaries).toEqual([salary]);
    expect(getMonthlyPayroll(salaries)).toBe(payroll);
  });

  it.each([
    ['ちょうど0円', 1200000, 0],
    ['1円残る', 1200001, 1],
    ['マイナスになる', 1199999, -1],
  ])('ランク混在の支払後の資金が%s', (_name, funds, expected) => {
    // junior + middle + senior = 1,200,000 円
    const paid = settleMonthlySalary(funds, 1, getEngineerSalaries(staff('junior', 'middle', 'senior')));
    expect(paid.amount).toBe(1200000);
    expect(paid.fundsAfter).toBe(expected);
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
