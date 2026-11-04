import {
  SALARY_ATTACHMENT_CUT_PER_YEN,
  SALARY_ATTACHMENT_RAISE_MAX_GAIN,
  SALARY_ATTACHMENT_RAISE_SATURATION_PER_YEN,
} from './config';
import { adjustEngineerParameter } from './engineer';
import type { Engineer } from './engineer';

// 給料が愛着心に与える影響(#31)。Phaser に依存しない純粋関数だけを置く。main.ts の onMonthElapsed が月ごとに使う。
// 係数はすべて config.ts の仮の値（SALARY_ATTACHMENT_*）。

// 1か月あたりの愛着心の変化量。差額 = salary − initialSalary。小数は丸めない。throw しない。
// 昇給（差額 > 0）: 最大増加量 × (1 − e^(−k × 差額))。差額が大きいほど反応が薄くなり、最大増加量を超えない。
// 差額 0: 0。減給（差額 < 0）: −減給係数 × |差額|（直線）。salary = 0 も有効な減給として扱う。
// salary・initialSalary が NaN・±Infinity、initialSalary ≤ 0、salary < 0 のときは 0（変化なし）。
export const getSalaryAttachmentDelta = (salary: number, initialSalary: number): number => {
  if (!Number.isFinite(salary) || !Number.isFinite(initialSalary) || initialSalary <= 0 || salary < 0) {
    return 0;
  }
  const delta = salary - initialSalary;
  if (delta > 0) {
    return SALARY_ATTACHMENT_RAISE_MAX_GAIN * (1 - Math.exp(-SALARY_ATTACHMENT_RAISE_SATURATION_PER_YEN * delta));
  }
  if (delta < 0) {
    return -SALARY_ATTACHMENT_CUT_PER_YEN * -delta;
  }
  return 0;
};

// 全員の愛着心に1か月分の変化量を足した新しい配列を返す。順序・長さ・愛着心以外のフィールドは変えない。入力は変更しない。
// 0〜100 に収める処理と NaN の扱いは adjustEngineerParameter（clampEngineerParameter）に任せる。
export const applySalaryToAttachment = (engineers: readonly Engineer[]): Engineer[] =>
  engineers.map((engineer) =>
    adjustEngineerParameter(engineer, 'attachment', getSalaryAttachmentDelta(engineer.salary, engineer.initialSalary)),
  );
