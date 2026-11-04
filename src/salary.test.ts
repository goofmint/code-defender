import { describe, expect, it } from 'vitest';
import {
  ENGINEER_HIRE_COST,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  ENGINEER_RANKS,
  ENGINEER_SALARY_MAX,
  ENGINEER_SALARY_MIN,
  ENGINEER_SALARY_STEP,
  MAX_ENGINEERS,
  MS_PER_GAME_MONTH,
} from './config';
import {
  adjustEngineerSalary,
  assignEngineerRoute,
  createEngineerParameters,
  getInitialSalary,
  hireEngineer,
  isEngineerOnVacation,
  setEngineerVacation,
  toggleEngineerVacation,
} from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { isBankrupt } from './gameOver';
import { getCrossedMonths } from './gameTime';
import { getItemMonthlyFee } from './itemFee';
import type { PlacedItem } from './itemPlacement';
import { settleMonthBoundary } from './monthBoundary';
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

  // 昇給・減給(#34)との互換性。調整後の額が次の精算から、以後の月も引かれる。
  const engineerOf = (id: number, rank: EngineerRank): Engineer => ({
    id,
    rank,
    routeId: id,
    personality: 'meticulous',
    onVacation: false,
    vacationRateReduction: 0,
    salary: getInitialSalary(rank),
    initialSalary: getInitialSalary(rank),
    aiAgent: null,
    ...createEngineerParameters(rank, 'meticulous'),
  });

  it('昇給 → getEngineerSalaries → settleMonthlySalary で新しい額が引かれ、以後の月も同じ額', () => {
    const roster = [engineerOf(0, 'junior'), engineerOf(1, 'senior')];
    const raised = adjustEngineerSalary(roster, 0, 'raise');
    if (!raised.ok) throw new Error(raised.reason);
    const salaries = getEngineerSalaries(raised.engineers);
    const expected = getInitialSalary('junior') + ENGINEER_SALARY_STEP + getInitialSalary('senior');
    expect(settleMonthlySalary(10_000_000, 1, salaries).amount).toBe(expected);
    const results = settleAll(getCrossedMonths(0, 180000), 10_000_000, salaries);
    expect(results.map((r) => r.amount)).toEqual([expected, expected, expected]);
    expect(results.map((r) => r.fundsAfter)).toEqual([1, 2, 3].map((n) => 10_000_000 - expected * n));
  });

  it('月の途中で減給すると、それ以前の月は元の額・以後の月は新しい額', () => {
    const roster = [engineerOf(0, 'middle')];
    const before = settleAll([1], 10_000_000, getEngineerSalaries(roster));
    const cut = adjustEngineerSalary(roster, 0, 'cut');
    if (!cut.ok) throw new Error(cut.reason);
    const after = settleAll([2, 3], before[0].fundsAfter, getEngineerSalaries(cut.engineers));
    const newSalary = getInitialSalary('middle') - ENGINEER_SALARY_STEP;
    expect(before.map((r) => r.amount)).toEqual([getInitialSalary('middle')]);
    expect(after.map((r) => r.amount)).toEqual([newSalary, newSalary]);
    expect(after[1].fundsAfter).toBe(10_000_000 - getInitialSalary('middle') - newSalary * 2);
  });
});

describe('昇給・減給の設定値の不変条件(#34)', () => {
  it('STEP は正の有限値', () => {
    expect(Number.isFinite(ENGINEER_SALARY_STEP)).toBe(true);
    expect(ENGINEER_SALARY_STEP).toBeGreaterThan(0);
  });
  it('MIN は MAX より小さい（どちらも有限値）', () => {
    expect(Number.isFinite(ENGINEER_SALARY_MIN)).toBe(true);
    expect(Number.isFinite(ENGINEER_SALARY_MAX)).toBe(true);
    expect(ENGINEER_SALARY_MIN).toBeLessThan(ENGINEER_SALARY_MAX);
  });
  it.each(ENGINEER_RANKS.map((r) => r.id))('%s の初期額は MIN〜MAX に入り、初期額 − MIN は STEP の倍数', (rank) => {
    const initial = getInitialSalary(rank);
    expect(initial).toBeGreaterThanOrEqual(ENGINEER_SALARY_MIN);
    expect(initial).toBeLessThanOrEqual(ENGINEER_SALARY_MAX);
    expect((initial - ENGINEER_SALARY_MIN) % ENGINEER_SALARY_STEP).toBe(0);
  });
});

// #37 休暇中も給料を引く。給料の対象は雇っているエンジニア全員（ルート未割当・休暇中も含む）。
// Engineer の全フィールドを持つフィクスチャ（engineer.test.ts の makeEngineer と同じ形）。salary は既定でランクの初期額。
const makeEngineer = (
  id: number,
  rank: EngineerRank,
  routeId: number | null,
  onVacation: boolean = false,
  salary: number = getInitialSalary(rank),
): Engineer => ({
  id,
  rank,
  routeId,
  personality: 'meticulous',
  onVacation,
  vacationRateReduction: 0,
  salary,
  initialSalary: getInitialSalary(rank),
  aiAgent: null,
  ...createEngineerParameters(rank, 'meticulous'),
});

const rankAt = (index: number): EngineerRank => ENGINEER_RANKS[index % ENGINEER_RANKS.length].id;

// total 人のうち先頭 count 人を「未割当」または「休暇中」にした編成。
const makeRoster = (total: number, count: number, state: 'unassigned' | 'vacation'): Engineer[] =>
  Array.from({ length: total }, (_, id) =>
    makeEngineer(
      id,
      rankAt(id),
      state === 'unassigned' && id < count ? null : id,
      state === 'vacation' && id < count,
    ),
  );

const sumSalaries = (engineers: readonly Engineer[]): number =>
  engineers.reduce((sum, engineer) => sum + engineer.salary, 0);

const payrollOf = (engineers: readonly Engineer[]): number => getMonthlyPayroll(getEngineerSalaries(engineers));

describe('休暇中・未割当でも給料対象(#37)', () => {
  const cases: [string, number, number][] = [
    ['0人', 3, 0],
    ['1人', 3, 1],
    ['全員', 3, 3],
    [`上限${MAX_ENGINEERS}人全員`, MAX_ENGINEERS, MAX_ENGINEERS],
  ];

  it.each(cases)('未割当が%sでも全員の給料を引く', (_name, total, count) => {
    const engineers = makeRoster(total, count, 'unassigned');
    const salaries = getEngineerSalaries(engineers);
    expect(engineers.filter((e) => e.routeId === null)).toHaveLength(count);
    expect(salaries).toHaveLength(total);
    expect(salaries).toEqual(engineers.map((e) => e.salary));
    expect(getMonthlyPayroll(salaries)).toBe(sumSalaries(engineers));
  });

  it.each(cases)('休暇中が%sでも全員の給料を引く', (_name, total, count) => {
    const engineers = makeRoster(total, count, 'vacation');
    const salaries = getEngineerSalaries(engineers);
    expect(engineers.filter(isEngineerOnVacation)).toHaveLength(count);
    expect(salaries).toHaveLength(total);
    expect(salaries).toEqual(engineers.map((e) => e.salary));
    expect(getMonthlyPayroll(salaries)).toBe(sumSalaries(engineers));
  });

  it('setEngineerVacation で休暇にする前後・戻した後で給料合計は同じ', () => {
    const working = makeRoster(3, 0, 'vacation');
    const onVacation = setEngineerVacation(working, 1, true);
    const back = setEngineerVacation(onVacation, 1, false);
    expect(isEngineerOnVacation(onVacation[1])).toBe(true);
    expect(payrollOf(onVacation)).toBe(payrollOf(working));
    expect(payrollOf(back)).toBe(payrollOf(working));
  });

  it(`toggleEngineerVacation で${MAX_ENGINEERS}人全員を休暇にしても給料合計は同じ`, () => {
    const working = makeRoster(MAX_ENGINEERS, 0, 'vacation');
    const allOff = working.reduce((engineers, engineer) => toggleEngineerVacation(engineers, engineer.id), working);
    expect(allOff.every(isEngineerOnVacation)).toBe(true);
    expect(payrollOf(allOff)).toBe(payrollOf(working));
  });

  it('休暇中のエンジニアの個人の salary（ランクの初期額以外）も合計に入る', () => {
    const custom = getInitialSalary('senior') + 1;
    const engineers = setEngineerVacation(
      [makeEngineer(0, 'junior', 0, false, custom), makeEngineer(1, 'middle', 1)],
      0,
      true,
    );
    expect(getEngineerSalaries(engineers)).toEqual([custom, getInitialSalary('middle')]);
    expect(payrollOf(engineers)).toBe(custom + getInitialSalary('middle'));
  });

  it('休暇中のエンジニアを除くと給料合計はその人の給料の分だけ減る（＝含まれている）', () => {
    const engineers = setEngineerVacation(makeRoster(3, 0, 'vacation'), 2, true);
    const vacationer = engineers[2];
    const others = engineers.filter((e) => e.id !== vacationer.id);
    expect(payrollOf(engineers) - payrollOf(others)).toBe(vacationer.salary);
  });

  it('assignEngineerRoute で未割当にした前後・再割当後で給料合計は同じ', () => {
    const assigned = makeRoster(3, 0, 'unassigned');
    const unassigned = assignEngineerRoute(assigned, 1, null);
    const reassigned = assignEngineerRoute(unassigned, 1, 1);
    expect(unassigned[1].routeId).toBeNull();
    expect(payrollOf(unassigned)).toBe(payrollOf(assigned));
    expect(payrollOf(reassigned)).toBe(payrollOf(assigned));
  });

  it('雇った直後（routeId: null）のエンジニアも、休暇にしても給料対象', () => {
    const result = hireEngineer(
      { engineers: makeRoster(2, 0, 'unassigned'), funds: ENGINEER_HIRE_COST.senior, nextId: 2 },
      'senior',
      { max: MAX_ENGINEERS, costs: ENGINEER_HIRE_COST },
      () => 0,
    );
    if (!result.ok) throw new Error(`雇えませんでした: ${result.reason}`);
    expect(result.engineer.routeId).toBeNull();
    const before = makeRoster(2, 0, 'unassigned');
    expect(payrollOf(result.engineers) - payrollOf(before)).toBe(getInitialSalary('senior'));
    const onVacation = setEngineerVacation(result.engineers, result.engineer.id, true);
    expect(payrollOf(onVacation)).toBe(payrollOf(result.engineers));
  });
});

describe('休暇中・未割当を含む給料と資金の境界（settleMonthBoundary）(#37)', () => {
  // 通常・未割当・休暇中の3人。P はこの3人の給料合計。
  const engineers = setEngineerVacation(
    [makeEngineer(0, 'junior', 0), makeEngineer(1, 'middle', null), makeEngineer(2, 'senior', 2)],
    2,
    true,
  );
  const salaries = getEngineerSalaries(engineers);
  const payroll = sumSalaries(engineers);
  // itemFee.test.ts と同じ形の月額アイテム（CodeRabbit 1個）。
  const items: PlacedItem[] = [{ id: 0, itemType: 'codeRabbit', cell: { col: 1, row: 3 }, lastAttackTime: null }];
  const fee = getItemMonthlyFee('codeRabbit');

  it('P は通常・未割当・休暇中の3人全員の給料合計', () => {
    expect(getMonthlyPayroll(salaries)).toBe(payroll);
  });

  it('資金 P+1 なら給料後 1 円残り、アイテム費を引く', () => {
    const { salary, itemFee } = settleMonthBoundary(payroll + 1, 1, salaries, items, false, engineers);
    expect(salary).toEqual({ month: 1, amount: payroll, fundsBefore: payroll + 1, fundsAfter: 1 });
    expect(isBankrupt(salary.fundsAfter)).toBe(false);
    expect(itemFee).toEqual({ month: 1, amount: fee, itemCount: 1, fundsBefore: 1, fundsAfter: 1 - fee });
  });

  it.each([
    ['P', 0, 0],
    ['P-1', -1, -1],
  ])('資金 %s なら給料後 %d 円で倒産し、アイテム費は引かない', (_name, offset, expected) => {
    const { salary, itemFee } = settleMonthBoundary(payroll + offset, 1, salaries, items, false, engineers);
    expect(salary.amount).toBe(payroll);
    expect(salary.fundsAfter).toBe(expected);
    expect(isBankrupt(salary.fundsAfter)).toBe(true);
    expect(itemFee).toBeNull();
  });
});

describe('休暇中・未割当を含む給料を越えた月ごとに引く（getCrossedMonths × settleMonthBoundary）(#37)', () => {
  const engineers = setEngineerVacation(
    [makeEngineer(0, 'junior', 0), makeEngineer(1, 'middle', null), makeEngineer(2, 'senior', 2)],
    2,
    true,
  );
  const salaries = getEngineerSalaries(engineers);
  const payroll = sumSalaries(engineers);

  const settleAll = (months: readonly number[], initial: number) => {
    let funds = initial;
    const settled = [];
    // MainScene.onMonthElapsed と同じく、倒産したらそれ以降の月は精算しない。
    for (const month of months) {
      const { salary } = settleMonthBoundary(funds, month, salaries, [], false, engineers);
      settled.push(salary);
      funds = salary.fundsAfter;
      if (isBankrupt(funds)) {
        break;
      }
    }
    return settled;
  };

  it.each([
    [MS_PER_GAME_MONTH - 1, MS_PER_GAME_MONTH, [1]],
    [MS_PER_GAME_MONTH, MS_PER_GAME_MONTH + 1, []],
    [0, MS_PER_GAME_MONTH - 1, []],
    [MS_PER_GAME_MONTH - 1, 3 * MS_PER_GAME_MONTH, [1, 2, 3]],
  ])('%d → %d ms は月 %j の分だけ P ずつ引く', (prev, next, expectedMonths) => {
    const months = getCrossedMonths(prev, next);
    expect(months).toEqual(expectedMonths);
    const initial = payroll * (months.length + 1);
    const paid = settleAll(months, initial);
    expect(paid.map((p) => p.month)).toEqual(expectedMonths);
    expect(paid.map((p) => p.amount)).toEqual(months.map(() => payroll));
    expect(paid.map((p) => p.fundsAfter)).toEqual(months.map((_, i) => initial - payroll * (i + 1)));
  });

  it('複数月の途中で倒産した月の fundsAfter は倒産の値', () => {
    const paid = settleAll(getCrossedMonths(MS_PER_GAME_MONTH - 1, 3 * MS_PER_GAME_MONTH), payroll * 2 - 1);
    expect(paid.map((p) => p.month)).toEqual([1, 2]);
    expect(paid[1].fundsAfter).toBe(-1);
    expect(isBankrupt(paid[1].fundsAfter)).toBe(true);
  });
});
