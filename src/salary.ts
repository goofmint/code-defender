import { subtractFunds } from './funds';

// 給料の計算。Phaser に依存しない純粋関数だけを置く。

// 月ごとの給料を引いたときに scene.events で発行するイベント名。
export const SALARY_PAID_EVENT = 'salary-paid';

export type SalaryPaidEvent = {
  // 何か月目の給料か（1始まり）。
  readonly month: number;
  // 引いた合計額。
  readonly amount: number;
  readonly fundsBefore: number;
  readonly fundsAfter: number;
};

// 給料の合計。空配列は 0。負・NaN・Infinity の要素は 0 として扱う。
export const getMonthlyPayroll = (salaries: readonly number[]): number =>
  salaries.reduce((sum, salary) => sum + (Number.isFinite(salary) && salary > 0 ? salary : 0), 0);

// エンジニアそれぞれの月給（Engineer.salary）の一覧。入力と同じ順序・同じ長さ。値は加工しない（不正な値は getMonthlyPayroll が 0 として扱う）。
// 初期額はランクで決まる(#33、getInitialSalary)。昇給・減給(#34)で変わった額もそのまま使う。
// 対象は雇っているエンジニア全員(#37)。ルート未割当（routeId: null）・休暇中（onVacation: true）のエンジニアも含め、状態で除外しない。
// 休暇中も給与は引かれる（docs/game_plan.md「休暇」、docs/tasks.md「7. 休暇」）。呼び出し側も給料計算の前に配列を絞らないこと。
export const getEngineerSalaries = (engineers: readonly { readonly salary: number }[]): number[] =>
  engineers.map((engineer) => engineer.salary);

// 1か月分の給料を引いた資金を返す。
export const paySalary = (funds: number, payroll: number): number => subtractFunds(funds, payroll);

export const createSalaryPaidEvent = (
  month: number,
  amount: number,
  fundsBefore: number,
  fundsAfter: number,
): SalaryPaidEvent => ({ month, amount, fundsBefore, fundsAfter });

// 1か月分の給料を精算する。給料合計を引き、month・amount・fundsBefore・fundsAfter を返す。
export const settleMonthlySalary = (
  funds: number,
  month: number,
  salaries: readonly number[],
): SalaryPaidEvent => {
  const amount = getMonthlyPayroll(salaries);
  return createSalaryPaidEvent(month, amount, funds, paySalary(funds, amount));
};
