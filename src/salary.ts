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

// 仮の給料一覧（全員同額）。将来 #23 以降でランク別の給料に置き換える前提。
export const getEngineerSalaries = (engineerCount: number, salary: number): number[] =>
  Array.from({ length: Math.max(0, Math.floor(engineerCount)) }, () => salary);

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
