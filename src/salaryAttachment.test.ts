import { describe, expect, it } from 'vitest';
import {
  ENGINEER_PARAMETER_MAX,
  ENGINEER_PARAMETER_MIN,
  MAX_ENGINEERS,
  MS_PER_GAME_MONTH,
  SALARY_ATTACHMENT_CUT_PER_YEN,
  SALARY_ATTACHMENT_RAISE_MAX_GAIN,
  SALARY_ATTACHMENT_RAISE_SATURATION_PER_YEN,
} from './config';
import { createEngineerParameters, getInitialSalary } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { checkBankruptcy, INITIAL_GAME_OVER_STATE } from './gameOver';
import type { GameOverState } from './gameOver';
import { getCrossedMonths } from './gameTime';
import { settleMonthBoundary } from './monthBoundary';
import { getEngineerSalaries } from './salary';
import { applySalaryToAttachment, getSalaryAttachmentDelta } from './salaryAttachment';

const INITIAL = getInitialSalary('junior');
const raiseOf = (delta: number): number =>
  SALARY_ATTACHMENT_RAISE_MAX_GAIN * (1 - Math.exp(-SALARY_ATTACHMENT_RAISE_SATURATION_PER_YEN * delta));

const makeEngineer = (id: number, rank: EngineerRank, overrides: Partial<Engineer> = {}): Engineer => ({
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
  ...overrides,
});

describe('getSalaryAttachmentDelta（差額の境界）', () => {
  it('初期額 − 1 円は −減給係数', () => {
    expect(getSalaryAttachmentDelta(INITIAL - 1, INITIAL)).toBeCloseTo(-SALARY_ATTACHMENT_CUT_PER_YEN, 12);
  });
  it('初期額ちょうどは 0', () => {
    expect(getSalaryAttachmentDelta(INITIAL, INITIAL)).toBe(0);
  });
  it('初期額 + 1 円は小さな正の値', () => {
    const value = getSalaryAttachmentDelta(INITIAL + 1, INITIAL);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeCloseTo(raiseOf(1), 12);
    expect(value).toBeLessThan(SALARY_ATTACHMENT_CUT_PER_YEN);
  });
});

describe('getSalaryAttachmentDelta（昇給）', () => {
  const deltas = [1, 1000, 50000, 100000, 200000, 500000, 1000000, 10000000];
  it('差額が大きいほど増える（単調増加）', () => {
    const values = deltas.map((delta) => getSalaryAttachmentDelta(INITIAL + delta, INITIAL));
    values.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(values[index]));
  });
  it.each(deltas)('+%i 円は最大増加量を超えない', (delta) => {
    const value = getSalaryAttachmentDelta(INITIAL + delta, INITIAL);
    expect(value).toBeCloseTo(raiseOf(delta), 12);
    expect(value).toBeLessThanOrEqual(SALARY_ATTACHMENT_RAISE_MAX_GAIN);
  });
  it('大きな昇給では最大増加量に近づく', () => {
    expect(getSalaryAttachmentDelta(INITIAL + 10000000, INITIAL)).toBeCloseTo(SALARY_ATTACHMENT_RAISE_MAX_GAIN, 6);
  });
  it.each([1000, 50000, 100000, 300000])('逓減: f(2x) − f(x) < f(x)（x = %i）', (delta) => {
    const once = getSalaryAttachmentDelta(INITIAL + delta, INITIAL);
    const twice = getSalaryAttachmentDelta(INITIAL + 2 * delta, INITIAL);
    expect(twice - once).toBeLessThan(once);
  });
});

describe('getSalaryAttachmentDelta（減給）', () => {
  it.each([1, 50000, 100000])('2 倍の減給で減少量も 2 倍（%i 円）', (delta) => {
    const once = getSalaryAttachmentDelta(INITIAL - delta, INITIAL);
    const twice = getSalaryAttachmentDelta(INITIAL - 2 * delta, INITIAL);
    expect(once).toBeCloseTo(-SALARY_ATTACHMENT_CUT_PER_YEN * delta, 12);
    expect(twice).toBeCloseTo(2 * once, 12);
  });
  it.each([1, 1000, 50000, 100000, 200000])('同じ差額 %i 円なら減給の減少量が昇給の増加量より大きい', (delta) => {
    const cut = getSalaryAttachmentDelta(INITIAL - delta, INITIAL);
    const raise = getSalaryAttachmentDelta(INITIAL + delta, INITIAL);
    expect(Math.abs(cut)).toBeGreaterThan(raise);
  });
  it('salary = 0 は有効な減給（−減給係数 × 初期額）', () => {
    expect(getSalaryAttachmentDelta(0, INITIAL)).toBeCloseTo(-SALARY_ATTACHMENT_CUT_PER_YEN * INITIAL, 12);
  });
});

describe('getSalaryAttachmentDelta（不正な入力は 0、throw しない）', () => {
  it.each([
    ['salary NaN', Number.NaN, INITIAL],
    ['salary +Infinity', Number.POSITIVE_INFINITY, INITIAL],
    ['salary −Infinity', Number.NEGATIVE_INFINITY, INITIAL],
    ['salary 負', -1, INITIAL],
    ['initialSalary NaN', INITIAL, Number.NaN],
    ['initialSalary +Infinity', INITIAL, Number.POSITIVE_INFINITY],
    ['initialSalary −Infinity', INITIAL, Number.NEGATIVE_INFINITY],
    ['initialSalary 0', INITIAL, 0],
    ['initialSalary 負', INITIAL, -1],
    ['salary 0・initialSalary 0', 0, 0],
  ])('%s → 0', (_label, salary, initialSalary) => {
    expect(() => getSalaryAttachmentDelta(salary, initialSalary)).not.toThrow();
    expect(getSalaryAttachmentDelta(salary, initialSalary)).toBe(0);
  });
});

describe('applySalaryToAttachment', () => {
  it('愛着心 100 で昇給しても 100 のまま', () => {
    const [result] = applySalaryToAttachment([makeEngineer(0, 'junior', { attachment: ENGINEER_PARAMETER_MAX, salary: INITIAL + 100000 })]);
    expect(result.attachment).toBe(ENGINEER_PARAMETER_MAX);
  });
  it('愛着心 0 で減給しても 0 のまま', () => {
    const [result] = applySalaryToAttachment([makeEngineer(0, 'junior', { attachment: ENGINEER_PARAMETER_MIN, salary: INITIAL - 100000 })]);
    expect(result.attachment).toBe(ENGINEER_PARAMETER_MIN);
  });
  it('愛着心 1 で大きな減給をすると 0', () => {
    const [result] = applySalaryToAttachment([makeEngineer(0, 'junior', { attachment: 1, salary: 0 })]);
    expect(result.attachment).toBe(ENGINEER_PARAMETER_MIN);
  });
  it('小数を丸めずに保持する', () => {
    const [same, raised] = applySalaryToAttachment([
      makeEngineer(0, 'junior', { attachment: 99.5 }),
      makeEngineer(1, 'junior', { attachment: 12.25, salary: INITIAL + 1 }),
    ]);
    expect(same.attachment).toBe(99.5);
    expect(raised.attachment).toBeCloseTo(12.25 + raiseOf(1), 12);
  });
  it('初期額のままなら愛着心は変わらない', () => {
    const engineer = makeEngineer(0, 'senior');
    expect(applySalaryToAttachment([engineer])[0]).toEqual(engineer);
  });
  it('空配列は空配列', () => {
    expect(applySalaryToAttachment([])).toEqual([]);
  });
  it('MAX_ENGINEERS 人を順序どおりに扱い、愛着心以外は変えず、入力を変更しない', () => {
    const ranks: EngineerRank[] = ['junior', 'middle', 'senior'];
    const engineers = Object.freeze(
      Array.from({ length: MAX_ENGINEERS }, (_, id) => {
        const rank = ranks[id % ranks.length];
        return Object.freeze(makeEngineer(id, rank, { salary: getInitialSalary(rank) + (id - 2) * 50000 }));
      }),
    );
    const snapshot = engineers.map((engineer) => ({ ...engineer }));
    const result = applySalaryToAttachment(engineers);
    expect(result).not.toBe(engineers);
    expect(result).toHaveLength(MAX_ENGINEERS);
    result.forEach((engineer, index) => {
      const input = engineers[index];
      const { attachment, ...rest } = engineer;
      const { attachment: inputAttachment, ...inputRest } = input;
      expect(rest).toEqual(inputRest);
      expect(attachment).toBeCloseTo(
        Math.min(
          ENGINEER_PARAMETER_MAX,
          Math.max(ENGINEER_PARAMETER_MIN, inputAttachment + getSalaryAttachmentDelta(input.salary, input.initialSalary)),
        ),
        12,
      );
    });
    expect(engineers).toEqual(snapshot);
  });
});

// main.ts の updateElapsedTime → onMonthElapsed の順序を純粋関数で合成する（シーンの購読はブラウザで確認）。
// 越えた月ごとに 給料（settleMonthBoundary）→ 倒産判定 → 倒産していなければ愛着心を動かす。倒産したら残りの月は処理しない。
describe('月の境界との合成（getCrossedMonths → settleMonthBoundary → applySalaryToAttachment）', () => {
  type Simulation = { readonly engineers: readonly Engineer[]; readonly applied: number; readonly gameOver: GameOverState };
  const simulate = (prevMs: number, nextMs: number, funds: number, engineers: readonly Engineer[]): Simulation => {
    let state: Simulation = { engineers, applied: 0, gameOver: INITIAL_GAME_OVER_STATE };
    let current = funds;
    for (const month of getCrossedMonths(prevMs, nextMs)) {
      if (state.gameOver.over) break;
      const { salary } = settleMonthBoundary(current, month, getEngineerSalaries(state.engineers), [], state.gameOver.over, state.engineers);
      current = salary.fundsAfter;
      const gameOver = checkBankruptcy(state.gameOver, current, month).state;
      state = gameOver.over
        ? { ...state, gameOver }
        : { engineers: applySalaryToAttachment(state.engineers), applied: state.applied + 1, gameOver };
    }
    return state;
  };
  const cutEngineer = makeEngineer(0, 'junior', { salary: INITIAL - 50000, attachment: 50 });
  const perMonth = getSalaryAttachmentDelta(cutEngineer.salary, cutEngineer.initialSalary);
  const rich = cutEngineer.salary * 100;

  it('59999 → 180000 では 3 回適用する', () => {
    const result = simulate(MS_PER_GAME_MONTH - 1, 3 * MS_PER_GAME_MONTH, rich, [cutEngineer]);
    expect(result.applied).toBe(3);
    expect(result.engineers[0].attachment).toBeCloseTo(50 + 3 * perMonth, 12);
  });
  it('60000 → 60001 では適用しない', () => {
    const result = simulate(MS_PER_GAME_MONTH, MS_PER_GAME_MONTH + 1, rich, [cutEngineer]);
    expect(result.applied).toBe(0);
    expect(result.engineers[0]).toBe(cutEngineer);
  });
  it('支払い後の資金が 1 円なら適用する', () => {
    const result = simulate(0, MS_PER_GAME_MONTH, cutEngineer.salary + 1, [cutEngineer]);
    expect(result.gameOver.over).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.engineers[0].attachment).toBeCloseTo(50 + perMonth, 12);
  });
  it('支払い後の資金が 0 円なら倒産として適用せず、以降の月も適用しない', () => {
    const result = simulate(0, 3 * MS_PER_GAME_MONTH, cutEngineer.salary, [cutEngineer]);
    expect(result.gameOver.over).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.engineers[0]).toBe(cutEngineer);
  });
  it('2 か月目に倒産したら 1 回だけ適用する', () => {
    const result = simulate(0, 3 * MS_PER_GAME_MONTH, cutEngineer.salary * 1.5, [cutEngineer]);
    expect(result.gameOver.over).toBe(true);
    expect(result.applied).toBe(1);
  });
});
