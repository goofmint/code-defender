import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import {
  CODE_SPAWN_INTERVAL_MS,
  ENGINEER_ATTACHMENT_CHANGE,
  ENGINEER_HIRE_COST,
  ENGINEER_FATIGUE_RATE_MULTIPLIERS,
  ENGINEER_INITIAL_PARAMETERS,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  ENGINEER_PARAMETER_FALLBACK,
  ENGINEER_PARAMETER_MAX,
  ENGINEER_PARAMETER_MIN,
  ENGINEER_PERSONALITIES,
  ENGINEER_PERSONALITY_TENDENCIES,
  ENGINEER_PERSONALITY_WEIGHTS,
  ENGINEER_RANKS,
  ENGINEER_SALARY_MAX,
  ENGINEER_SALARY_MIN,
  ENGINEER_SALARY_STEP,
  ENGINEER_SPAWN_CELLS,
  ENGINEER_TENDENCY_OFFSETS,
  INITIAL_ENGINEER_RANKS,
  MAX_ENGINEER_ROUTES,
  MAX_ENGINEERS,
  VACATION_MALICIOUS_RATE_REDUCTION,
  VACATION_MALICIOUS_RATE_REDUCTION_MAX,
} from './config';
import {
  adjustEngineerParameter,
  adjustEngineerSalary,
  advanceEngineerAttachment,
  advanceEngineersAttachment,
  applyPersonalityTendencies,
  assignEngineerRoute,
  clampEngineerParameter,
  createEngineerParameters,
  createInitialEngineers,
  createInitialFleet,
  findEngineerByRoute,
  findRouteIdOfEngineer,
  getFatigueRateMultiplier,
  getPersonalityLabel,
  getRankLabel,
  shouldAddRouteOnHire,
  formatEngineerCount,
  formatEngineerPopoverLines,
  formatHireMessage,
  formatHireOption,
  formatSelectedEngineerLines,
  formatVacationButton,
  formatVacationHint,
  formatSalaryMessage,
  getInitialSalary,
  hireEngineer,
  isAssigneeOnVacation,
  isEngineerOnVacation,
  isEngineerRank,
  isRouteOnVacation,
  partitionResignedEngineers,
  pickRandomPersonality,
  selectAdjacentEngineerId,
  setEngineerVacation,
  shouldResign,
  formatResignedMessage,
  toggleEngineerVacation,
  updateEngineerParameters,
} from './engineer';
import type {
  Engineer,
  EngineerAttachmentChangeConfig,
  EngineerParameterKey,
  EngineerPersonalityId,
  EngineerRank,
  HireRules,
  SalaryAdjustResult,
  SalaryDirection,
} from './engineer';
import { addRoute, createRoutes, nextSpawnCell } from './route';
import { advanceCode, moveDistanceUnlessPaused, spawnCode, stepSpawnTimerUnlessPaused } from './codeFlow';
import { checkBankruptcy, INITIAL_GAME_OVER_STATE } from './gameOver';
import { MS_PER_GAME_DAY } from './gameTime';

const rules: HireRules = { max: MAX_ENGINEERS, costs: ENGINEER_HIRE_COST };
const makeEngineer = (id: number, rank: EngineerRank, routeId: number | null): Engineer => ({
  id,
  rank,
  routeId,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction: 0,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  aiAgent: null,
  ...createEngineerParameters(rank, 'meticulous'),
});
const makeEngineers = (count: number): Engineer[] =>
  Array.from({ length: count }, (_, id) => makeEngineer(id, 'junior', id));
const RICH = 100_000_000;
// 休暇による低下量(#39)以外の項目。休暇の切り替えで低下量だけが変わることを確かめるのに使う。
const withoutVacationRateReduction = ({ vacationRateReduction: _reduction, ...rest }: Engineer): Omit<Engineer, 'vacationRateReduction'> => rest;

describe('hireEngineer: ランクごとに雇える', () => {
  it.each<[EngineerRank, number]>([
    ['junior', 100000],
    ['middle', 200000],
    ['senior', 300000],
  ])('%s を雇うと費用 %i 円が引かれる', (rank, cost) => {
    const result = hireEngineer({ engineers: makeEngineers(3), funds: 1000000, nextId: 3 }, rank, rules, () => 0);
    expect(result).toEqual({
      ok: true,
      engineer: makeEngineer(3, rank, null),
      engineers: [...makeEngineers(3), makeEngineer(3, rank, null)],
      fundsAfter: 1000000 - cost,
      cost,
    });
  });
});

describe('hireEngineer: 存在しないランク', () => {
  it.each(['', 'Junior', 'lead', ' junior', 'JUNIOR', '__proto__', 'toString'])(
    '%j は unknownRank で状態が変わらない',
    (rank) => {
      const engineers = makeEngineers(3);
      expect(hireEngineer({ engineers, funds: RICH, nextId: 3 }, rank, rules)).toEqual({
        ok: false,
        reason: 'unknownRank',
      });
      expect(engineers).toEqual(makeEngineers(3));
    },
  );
});

describe('hireEngineer: 上限', () => {
  it(`${MAX_ENGINEERS - 1}人のとき ${MAX_ENGINEERS}人目は雇える`, () => {
    const result = hireEngineer(
      { engineers: makeEngineers(MAX_ENGINEERS - 1), funds: RICH, nextId: MAX_ENGINEERS - 1 },
      'junior',
      rules,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.engineers).toHaveLength(MAX_ENGINEERS);
    }
  });

  it.each([MAX_ENGINEERS, MAX_ENGINEERS + 1])('%i人のとき limit', (count) => {
    expect(
      hireEngineer({ engineers: makeEngineers(count), funds: RICH, nextId: count }, 'junior', rules),
    ).toEqual({ ok: false, reason: 'limit' });
  });

  it('上限はルートの上限と同じ', () => {
    expect(MAX_ENGINEERS).toBe(MAX_ENGINEER_ROUTES);
  });
});

describe('hireEngineer: 資金の境界', () => {
  const cost = ENGINEER_HIRE_COST.middle;
  const hire = (funds: number) =>
    hireEngineer({ engineers: makeEngineers(3), funds, nextId: 3 }, 'middle', rules);

  it('cost-1 は insufficientFunds', () => {
    expect(hire(cost - 1)).toEqual({ ok: false, reason: 'insufficientFunds' });
  });
  it('ちょうど cost は成功して資金 0', () => {
    const result = hire(cost);
    expect(result.ok && result.fundsAfter).toBe(0);
  });
  it('cost+1 は成功して資金 1', () => {
    const result = hire(cost + 1);
    expect(result.ok && result.fundsAfter).toBe(1);
  });
  it.each([0, -1, -1000000])('資金 %i は insufficientFunds', (funds) => {
    expect(hire(funds)).toEqual({ ok: false, reason: 'insufficientFunds' });
  });
  it('資金が NaN でも安全に insufficientFunds', () => {
    expect(hire(Number.NaN)).toEqual({ ok: false, reason: 'insufficientFunds' });
  });
});

describe('hireEngineer: 費用が不正な値でも安全', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '費用 %s は雇えず資金が増えない',
    (bad) => {
      const result = hireEngineer(
        { engineers: [], funds: 500, nextId: 0 },
        'junior',
        { max: 5, costs: { junior: bad, middle: bad, senior: bad } },
      );
      expect(result).toEqual({ ok: false, reason: 'insufficientFunds' });
    },
  );
  it('費用 0 は無料で雇える', () => {
    const result = hireEngineer(
      { engineers: [], funds: 0, nextId: 0 },
      'junior',
      { max: 5, costs: { junior: 0, middle: 0, senior: 0 } },
    );
    expect(result.ok && result.fundsAfter).toBe(0);
  });
});

describe('hireEngineer: 判定順', () => {
  it('不明なランクかつ上限かつ資金不足 → unknownRank', () => {
    const engineers = makeEngineers(MAX_ENGINEERS);
    expect(hireEngineer({ engineers, funds: 0, nextId: 0 }, 'lead', rules)).toEqual({
      ok: false,
      reason: 'unknownRank',
    });
  });
  it('上限かつ資金不足 → limit', () => {
    const engineers = makeEngineers(MAX_ENGINEERS);
    expect(hireEngineer({ engineers, funds: 0, nextId: 0 }, 'junior', rules)).toEqual({
      ok: false,
      reason: 'limit',
    });
  });
});

describe('hireEngineer: 副作用と id', () => {
  it('入力の配列を変更しない', () => {
    const engineers = makeEngineers(3);
    const snapshot = structuredClone(engineers);
    const state = Object.freeze({ engineers: Object.freeze(engineers), funds: RICH, nextId: 3 });
    const result = hireEngineer(state, 'senior', rules);
    expect(engineers).toEqual(snapshot);
    expect(result.ok && result.engineers).not.toBe(engineers);
  });

  it('続けて雇うと id が連番になる', () => {
    let state = { engineers: [] as readonly Engineer[], funds: RICH, nextId: 0 };
    const ids: number[] = [];
    for (const rank of ['junior', 'senior', 'middle'] as const) {
      const result = hireEngineer(state, rank, rules);
      if (!result.ok) {
        throw new Error('雇えるはず');
      }
      ids.push(result.engineer.id);
      state = { engineers: result.engineers, funds: result.fundsAfter, nextId: result.engineer.id + 1 };
    }
    expect(ids).toEqual([0, 1, 2]);
    expect(state.engineers.map((engineer) => engineer.rank)).toEqual(['junior', 'senior', 'middle']);
  });
});

describe('createInitialEngineers', () => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);

  it('初期ルートと同じ人数で、各ルートの routeId を持つ', () => {
    const engineers = createInitialEngineers(routes, INITIAL_ENGINEER_RANKS);
    expect(engineers).toHaveLength(ENGINEER_SPAWN_CELLS.length);
    expect(engineers.map((engineer) => engineer.routeId)).toEqual(routes.map((route) => route.id));
    expect(engineers.map((engineer) => engineer.id)).toEqual([0, 1, 2]);
  });
  it('初期ランクは全員ジュニア', () => {
    expect(createInitialEngineers(routes, INITIAL_ENGINEER_RANKS).every((e) => e.rank === 'junior')).toBe(true);
  });
  it('初期ランクの数は出現セルの数と同じ', () => {
    expect(INITIAL_ENGINEER_RANKS).toHaveLength(ENGINEER_SPAWN_CELLS.length);
  });
  it('ランクの指定どおりに割り当てる', () => {
    const engineers = createInitialEngineers(routes, ['senior', 'middle', 'junior']);
    expect(engineers.map((engineer) => engineer.rank)).toEqual(['senior', 'middle', 'junior']);
  });
  it('ルートが空なら空', () => {
    expect(createInitialEngineers([], INITIAL_ENGINEER_RANKS)).toEqual([]);
  });
});

describe('isEngineerRank', () => {
  it.each(['junior', 'middle', 'senior'])('%s は true', (value) => {
    expect(isEngineerRank(value)).toBe(true);
  });
  it.each(['', 'Junior', 'lead', 'constructor'])('%j は false', (value) => {
    expect(isEngineerRank(value)).toBe(false);
  });
});

describe('ランク表', () => {
  it('3件で順序は ジュニア・ミドル・シニア', () => {
    expect(ENGINEER_RANKS.map((rank) => rank.id)).toEqual(['junior', 'middle', 'senior']);
    expect(ENGINEER_RANKS.map((rank) => getRankLabel(rank.id))).toEqual(['ジュニア', 'ミドル', 'シニア']);
  });
  it('id・表示名に重複がない', () => {
    expect(new Set(ENGINEER_RANKS.map((rank) => rank.id)).size).toBe(ENGINEER_RANKS.length);
    expect(new Set(ENGINEER_RANKS.map((rank) => getRankLabel(rank.id))).size).toBe(ENGINEER_RANKS.length);
  });
  it('全ランクに正の費用があり、ランクが上がるほど高い', () => {
    const costs = ENGINEER_RANKS.map((rank) => ENGINEER_HIRE_COST[rank.id]);
    expect(costs.every((cost) => cost > 0)).toBe(true);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
  it.each(ENGINEER_RANKS.map((rank) => [rank.id, rank] as const))(
    '%s の不正コード率は 0 ≦ 開始値 ≦ 上限 ≦ 1',
    (_id, rank) => {
      expect(rank.maliciousRate).toBeGreaterThanOrEqual(0);
      expect(rank.maliciousRate).toBeLessThanOrEqual(rank.maliciousRateMax);
      expect(rank.maliciousRateMax).toBeLessThanOrEqual(1);
    },
  );
  it('不正コード率は開始値・上限とも ジュニア > ミドル > シニア', () => {
    const [junior, middle, senior] = ENGINEER_RANKS;
    expect(junior.maliciousRate).toBeGreaterThan(middle.maliciousRate);
    expect(middle.maliciousRate).toBeGreaterThan(senior.maliciousRate);
    expect(junior.maliciousRateMax).toBeGreaterThan(middle.maliciousRateMax);
    expect(middle.maliciousRateMax).toBeGreaterThan(senior.maliciousRateMax);
  });
});

describe('表示用の文字列', () => {
  it('人数', () => {
    expect(formatEngineerCount(3, 9)).toBe('エンジニア: 3/9');
  });
  it('雇うボタン（エンジニアのメニュー #156。キー名は出さない）', () => {
    expect(formatHireOption('junior', 100000)).toBe('ジュニアを雇う 10万円');
    expect(formatHireOption('senior', 300000)).toBe('シニアを雇う 30万円');
  });
  it('メッセージ', () => {
    const state = { engineers: makeEngineers(3), funds: RICH, nextId: 3 };
    expect(formatHireMessage(hireEngineer(state, 'junior', rules), 'junior')).toBe('ジュニアを雇いました');
    expect(
      formatHireMessage(hireEngineer({ ...state, engineers: makeEngineers(9) }, 'junior', rules), 'junior'),
    ).toBe('これ以上雇えません');
    expect(formatHireMessage(hireEngineer({ ...state, funds: 0 }, 'junior', rules), 'junior')).toBe(
      '資金が足りません',
    );
  });
});

describe('assignEngineerRoute', () => {
  it('該当 id のエンジニアだけ routeId が変わり、他は同じ参照のまま', () => {
    const engineers: Engineer[] = [...makeEngineers(3), makeEngineer(3, 'senior', null)];
    const result = assignEngineerRoute(engineers, 3, 7);
    expect(result[3]).toEqual(makeEngineer(3, 'senior', 7));
    expect(result.slice(0, 3).every((e, i) => e === engineers[i])).toBe(true);
  });
  it('該当 id がなければ同じ内容の配列', () => {
    const engineers = makeEngineers(3);
    expect(assignEngineerRoute(engineers, 99, 5)).toEqual(engineers);
  });
  it('入力の配列とエンジニアを変更しない', () => {
    const engineers: Engineer[] = [makeEngineer(0, 'junior', null)];
    const snapshot = structuredClone(engineers);
    const result = assignEngineerRoute(engineers, 0, 4);
    expect(engineers).toEqual(snapshot);
    expect(result).not.toBe(engineers);
  });
});

describe('assignEngineerRoute: パラメータの保持', () => {
  const edge: Engineer = {
    ...makeEngineer(0, 'middle', null),
    fatigue: ENGINEER_PARAMETER_MAX,
    concentration: ENGINEER_PARAMETER_MIN,
    skill: ENGINEER_PARAMETER_MAX,
    attachment: ENGINEER_PARAMETER_MIN,
  };
  it('ルートを割り当ててもパラメータ（MIN/MAX の境界値）が保たれる', () => {
    const [assigned] = assignEngineerRoute([edge], 0, 3);
    expect(assigned).toEqual({ ...edge, routeId: 3 });
  });
  it('routeId を null に戻してもパラメータが保たれる', () => {
    const [assigned] = assignEngineerRoute([edge], 0, 3);
    const [cleared] = assignEngineerRoute([assigned], 0, null);
    expect(cleared).toEqual(edge);
  });
});

describe('休暇(#35): 初期状態', () => {
  it('初期フリートの全員が休暇中ではない', () => {
    const { engineers } = createInitialFleet(() => 0.5);
    expect(engineers.map(isEngineerOnVacation)).toEqual(engineers.map(() => false));
  });
  it.each(['junior', 'middle', 'senior'] as const)('%s を雇った直後は休暇中ではない', (rank) => {
    const hired = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, rank, rules, () => 0.5);
    if (!hired.ok) throw new Error('雇えるはず');
    expect(isEngineerOnVacation(hired.engineer)).toBe(false);
  });
});

describe('休暇(#35): setEngineerVacation', () => {
  const engineers: Engineer[] = makeEngineers(3);
  it.each<[string, boolean, boolean]>([
    ['休暇中でない → 開始', false, true],
    ['休暇中でない → 終了（変化なし）', false, false],
    ['休暇中 → 終了', true, false],
    ['休暇中 → 再度開始（変化なし）', true, true],
  ])('%s', (_name, before, onVacation) => {
    const start = setEngineerVacation(engineers, 1, before);
    const result = setEngineerVacation(start, 1, onVacation);
    expect(result.map(isEngineerOnVacation)).toEqual([false, onVacation, false]);
    expect(withoutVacationRateReduction(result[1])).toEqual(withoutVacationRateReduction({ ...engineers[1], onVacation }));
    // 休暇中にした時点（before=true の準備、または今回の開始）で1回分の低下量が付く(#39)。
    expect(result[1].vacationRateReduction).toBeCloseTo(before || onVacation ? VACATION_MALICIOUS_RATE_REDUCTION : 0, 12);
  });
  it('対象以外のエンジニアは同じ参照のまま', () => {
    const result = setEngineerVacation(engineers, 1, true);
    expect(result[0]).toBe(engineers[0]);
    expect(result[2]).toBe(engineers[2]);
  });
  // 先頭・末尾・範囲外（-1 と 末尾 +1）の境界。
  it.each<[number, boolean[]]>([
    [0, [true, false, false]],
    [2, [false, false, true]],
    [-1, [false, false, false]],
    [3, [false, false, false]],
  ])('id %i を休暇にすると %j', (engineerId, expected) => {
    expect(setEngineerVacation(engineers, engineerId, true).map(isEngineerOnVacation)).toEqual(expected);
  });
  it('該当 id がなければ同じ内容の配列', () => {
    expect(setEngineerVacation(engineers, 99, true)).toEqual(engineers);
  });
  it('空の配列は空のまま', () => {
    expect(setEngineerVacation([], 0, true)).toEqual([]);
  });
  it('入力の配列とエンジニアを変更しない', () => {
    const snapshot = structuredClone(engineers);
    const result = setEngineerVacation(engineers, 0, true);
    expect(engineers).toEqual(snapshot);
    expect(result).not.toBe(engineers);
  });
  it('routeId が null（ルートなし）のエンジニアも休暇にでき、routeId は null のまま', () => {
    const [result] = setEngineerVacation([makeEngineer(0, 'senior', null)], 0, true);
    expect(result).toEqual({
      ...makeEngineer(0, 'senior', null),
      onVacation: true,
      vacationRateReduction: VACATION_MALICIOUS_RATE_REDUCTION,
    });
  });
});

describe('休暇(#35): パラメータ・ルートの保持', () => {
  const edges: Engineer[] = [
    {
      ...makeEngineer(0, 'middle', 4),
      fatigue: ENGINEER_PARAMETER_MAX,
      concentration: ENGINEER_PARAMETER_MIN,
      skill: ENGINEER_PARAMETER_MAX,
      attachment: ENGINEER_PARAMETER_MIN,
    },
    {
      ...makeEngineer(0, 'senior', 0),
      fatigue: ENGINEER_PARAMETER_MIN,
      concentration: ENGINEER_PARAMETER_MAX,
      skill: ENGINEER_PARAMETER_MIN,
      attachment: ENGINEER_PARAMETER_MAX,
    },
  ];
  it.each(edges.map((edge, index) => [index, edge] as const))('境界値の組 %i: 開始しても休暇以外は変わらない', (_index, edge) => {
    const [result] = setEngineerVacation([edge], 0, true);
    expect(withoutVacationRateReduction(result)).toEqual(withoutVacationRateReduction({ ...edge, onVacation: true }));
    expect(result.vacationRateReduction).toBe(VACATION_MALICIOUS_RATE_REDUCTION);
  });
  it.each(edges.map((edge, index) => [index, edge] as const))('境界値の組 %i: 開始→終了で元に戻る', (_index, edge) => {
    const [result] = setEngineerVacation(setEngineerVacation([edge], 0, true), 0, false);
    expect(withoutVacationRateReduction(result)).toEqual(withoutVacationRateReduction(edge));
    // 低下量は復帰後も維持する(#39)。
    expect(result.vacationRateReduction).toBe(VACATION_MALICIOUS_RATE_REDUCTION);
  });
});

describe('休暇(#35): toggleEngineerVacation', () => {
  const engineers: Engineer[] = makeEngineers(3);
  // 切り替え回数 0・1・2・3 回の境界（偶数回で元に戻る）。
  it.each<[number, boolean]>([
    [0, false],
    [1, true],
    [2, false],
    [3, true],
  ])('%i 回切り替えると休暇中=%s', (times, expected) => {
    let result: readonly Engineer[] = engineers;
    for (let i = 0; i < times; i++) {
      result = toggleEngineerVacation(result, 1);
    }
    expect(result.map(isEngineerOnVacation)).toEqual([false, expected, false]);
  });
  it('2 回切り替えると低下量以外は元と同じ内容', () => {
    const result = toggleEngineerVacation(toggleEngineerVacation(engineers, 2), 2);
    expect(result.map(withoutVacationRateReduction)).toEqual(engineers.map(withoutVacationRateReduction));
    // 低下量は1回分（開始1回）が残る(#39)。対象以外は 0 のまま。
    expect(result.map((engineer) => engineer.vacationRateReduction)).toEqual([0, 0, VACATION_MALICIOUS_RATE_REDUCTION]);
  });
  it('対象以外のエンジニアは同じ参照のまま', () => {
    const result = toggleEngineerVacation(engineers, 1);
    expect(result[0]).toBe(engineers[0]);
    expect(result[2]).toBe(engineers[2]);
  });
  it.each([-1, 3, 99])('該当 id %i がなければ同じ内容の新しい配列', (engineerId) => {
    const result = toggleEngineerVacation(engineers, engineerId);
    expect(result).toEqual(engineers);
    expect(result).not.toBe(engineers);
  });
  it('空の配列は空のまま', () => {
    expect(toggleEngineerVacation([], 0)).toEqual([]);
  });
  it('入力の配列とエンジニアを変更しない', () => {
    const snapshot = structuredClone(engineers);
    toggleEngineerVacation(engineers, 0);
    expect(engineers).toEqual(snapshot);
  });
  it('別々のエンジニアを独立して切り替えられる', () => {
    const result = toggleEngineerVacation(toggleEngineerVacation(engineers, 0), 2);
    expect(result.map(isEngineerOnVacation)).toEqual([true, false, true]);
  });
});

// 休暇を与えると不正コード率が下がる(#39): 低下量(vacationRateReduction)の境界値。
describe('休暇(#39): 低下量の初期値', () => {
  it('初期フリートの全員の低下量は 0', () => {
    const { engineers } = createInitialFleet(() => 0.5);
    expect(engineers.length).toBeGreaterThan(0);
    expect(engineers.map((engineer) => engineer.vacationRateReduction)).toEqual(engineers.map(() => 0));
  });
  it.each(['junior', 'middle', 'senior'] as const)('%s を雇った直後の低下量は 0', (rank) => {
    const hired = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, rank, rules, () => 0.5);
    if (!hired.ok) throw new Error('雇えるはず');
    expect(hired.engineer.vacationRateReduction).toBe(0);
  });
});

describe('休暇(#39): setEngineerVacation の低下量', () => {
  const REDUCTION = VACATION_MALICIOUS_RATE_REDUCTION;
  const MAX = VACATION_MALICIOUS_RATE_REDUCTION_MAX;
  const EPS = 1e-9;
  const withState = (onVacation: boolean, vacationRateReduction: number): Engineer => ({
    ...makeEngineer(0, 'junior', 0),
    onVacation,
    vacationRateReduction,
  });

  // 遷移の全4通り（低下量 0 から）。加えるのは休暇中でない → 休暇 のときだけ。
  it.each<[string, boolean, boolean, number]>([
    ['休暇中でない → 開始', false, true, REDUCTION],
    ['休暇中でない → 休暇中でない', false, false, 0],
    ['休暇中 → 終了', true, false, 0],
    ['休暇中 → 休暇中', true, true, 0],
  ])('%s', (_name, before, onVacation, expected) => {
    const [result] = setEngineerVacation([withState(before, 0)], 0, onVacation);
    expect(result.onVacation).toBe(onVacation);
    expect(result.vacationRateReduction).toBe(expected);
  });

  // 正の低下量を持つ場合も、開始以外の遷移では変えない。
  it.each<[boolean, boolean]>([
    [false, false],
    [true, false],
    [true, true],
  ])('低下量が正のとき %s→%s では変わらない', (before, onVacation) => {
    const [result] = setEngineerVacation([withState(before, REDUCTION)], 0, onVacation);
    expect(result.vacationRateReduction).toBe(REDUCTION);
  });

  // 上限の境界。開始前の値に REDUCTION を加え、MAX で止める。
  it.each<[string, number, number]>([
    ['MAX - REDUCTION - ε', MAX - REDUCTION - EPS, MAX - REDUCTION - EPS + REDUCTION],
    ['MAX - REDUCTION', MAX - REDUCTION, MAX],
    ['MAX - REDUCTION + ε', MAX - REDUCTION + EPS, MAX],
    ['MAX - ε', MAX - EPS, MAX],
    ['MAX', MAX, MAX],
  ])('上限の境界: 開始前 %s', (_label, current, expected) => {
    const [result] = setEngineerVacation([withState(false, current)], 0, true);
    expect(result.vacationRateReduction).toBeCloseTo(expected, 12);
    expect(result.vacationRateReduction).toBeLessThanOrEqual(MAX);
  });
  it('上限の境界: MAX - REDUCTION - ε は MAX 未満、MAX - REDUCTION + ε は MAX ちょうど', () => {
    const [below] = setEngineerVacation([withState(false, MAX - REDUCTION - EPS)], 0, true);
    const [above] = setEngineerVacation([withState(false, MAX - REDUCTION + EPS)], 0, true);
    expect(below.vacationRateReduction).toBeLessThan(MAX);
    expect(above.vacationRateReduction).toBe(MAX);
  });

  // 不正な現在値は 0 として扱ってから加える。
  it.each([NaN, Infinity, -Infinity, -EPS, -REDUCTION, -1])('現在値 %s は 0 として扱い、開始で REDUCTION', (current) => {
    const [result] = setEngineerVacation([withState(false, current)], 0, true);
    expect(result.vacationRateReduction).toBe(REDUCTION);
  });

  it('対象以外の参照・対象 id なし・空配列・入力の不変性', () => {
    const engineers: Engineer[] = [
      { ...makeEngineer(0, 'junior', 0), vacationRateReduction: REDUCTION },
      makeEngineer(1, 'middle', 1),
      makeEngineer(2, 'senior', 2),
    ];
    const snapshot = structuredClone(engineers);
    const result = setEngineerVacation(engineers, 1, true);
    expect(result[0]).toBe(engineers[0]);
    expect(result[2]).toBe(engineers[2]);
    expect(result[1].vacationRateReduction).toBe(REDUCTION);
    expect(engineers).toEqual(snapshot);
    expect(setEngineerVacation(engineers, 99, true)).toEqual(engineers);
    expect(setEngineerVacation([], 0, true)).toEqual([]);
  });

  it('低下量と onVacation 以外の項目は変わらない', () => {
    const before = withState(false, 0);
    const [result] = setEngineerVacation([before], 0, true);
    expect(withoutVacationRateReduction(result)).toEqual(withoutVacationRateReduction({ ...before, onVacation: true }));
  });
});

describe('休暇(#39): toggleEngineerVacation の低下量', () => {
  const engineers: Engineer[] = makeEngineers(3);
  // 0〜5 回切り替え。開始回数は ceil(回数 / 2)。低下量は min(開始回数 × REDUCTION, MAX)。
  it.each([0, 1, 2, 3, 4, 5])('%i 回切り替え', (times) => {
    let result: readonly Engineer[] = engineers;
    for (let i = 0; i < times; i++) {
      result = toggleEngineerVacation(result, 1);
    }
    const starts = Math.ceil(times / 2);
    expect(result[1].vacationRateReduction).toBeCloseTo(
      Math.min(starts * VACATION_MALICIOUS_RATE_REDUCTION, VACATION_MALICIOUS_RATE_REDUCTION_MAX),
      12,
    );
    expect(result[1].vacationRateReduction).toBeLessThanOrEqual(VACATION_MALICIOUS_RATE_REDUCTION_MAX);
    expect(result[0].vacationRateReduction).toBe(0);
    expect(result[2].vacationRateReduction).toBe(0);
  });
});

describe('休暇(#39): 他の操作では低下量が変わらない', () => {
  const edge: Engineer = { ...makeEngineer(0, 'middle', 2), vacationRateReduction: VACATION_MALICIOUS_RATE_REDUCTION };
  it('ルートの割当・null への解除', () => {
    const [assigned] = assignEngineerRoute([edge], 0, 5);
    const [cleared] = assignEngineerRoute([assigned], 0, null);
    expect(assigned.vacationRateReduction).toBe(VACATION_MALICIOUS_RATE_REDUCTION);
    expect(cleared.vacationRateReduction).toBe(VACATION_MALICIOUS_RATE_REDUCTION);
  });
  it('updateEngineerParameters', () => {
    const result = updateEngineerParameters(edge, { fatigue: ENGINEER_PARAMETER_MAX, skill: ENGINEER_PARAMETER_MIN });
    expect(result.vacationRateReduction).toBe(VACATION_MALICIOUS_RATE_REDUCTION);
  });
  it('adjustEngineerParameter', () => {
    const result = adjustEngineerParameter(edge, 'concentration', 10);
    expect(result.vacationRateReduction).toBe(VACATION_MALICIOUS_RATE_REDUCTION);
  });
});

describe('findEngineerByRoute / findRouteIdOfEngineer', () => {
  const engineers: Engineer[] = [...makeEngineers(2), makeEngineer(2, 'middle', null)];
  it.each<[number, number | undefined]>([
    [0, 0],
    [1, 1],
    [2, undefined],
    [-1, undefined],
  ])('ルート%i の担当は id %s', (routeId, expected) => {
    expect(findEngineerByRoute(engineers, routeId)?.id).toBe(expected);
  });
  it.each<[number, number | null]>([
    [0, 0],
    [1, 1],
    [2, null],
    [99, null],
  ])('エンジニア%i のルートは %s', (engineerId, expected) => {
    expect(findRouteIdOfEngineer(engineers, engineerId)).toBe(expected);
  });
});

describe('休暇中はそのエンジニアのコードを止める(#36): isRouteOnVacation', () => {
  // ルート0: 休暇中、ルート1: 勤務中、ルート2: 担当なし、エンジニア2: ルートなし（routeId === null）で休暇中。
  const engineers: Engineer[] = [
    { ...makeEngineer(0, 'junior', 0), onVacation: true },
    makeEngineer(1, 'middle', 1),
    { ...makeEngineer(2, 'senior', null), onVacation: true },
  ];
  it.each<[string, readonly Engineer[], number, boolean]>([
    ['担当者が休暇中', engineers, 0, true],
    ['担当者が勤務中', engineers, 1, false],
    ['担当者がいない', engineers, 2, false],
    ['存在しないルート id', engineers, -1, false],
    ['エンジニア 0 人', [], 0, false],
  ])('%s（ルート%i） → %s', (_label, list, routeId, expected) => {
    expect(isRouteOnVacation(list, routeId)).toBe(expected);
  });
  it('ルートなし（routeId === null）の休暇中エンジニアはどのルートも止めない', () => {
    const onlyUnrouted = [engineers[2]];
    expect([0, 1, 2].map((routeId) => isRouteOnVacation(onlyUnrouted, routeId))).toEqual([false, false, false]);
  });
  it('複数エンジニアのうち休暇中の担当ルートだけが止まる', () => {
    const many = toggleEngineerVacation(makeEngineers(4), 2);
    expect([0, 1, 2, 3].map((routeId) => isRouteOnVacation(many, routeId))).toEqual([false, false, true, false]);
  });
  it('toggleEngineerVacation を 1 回で true、2 回で false', () => {
    const base = makeEngineers(2);
    const once = toggleEngineerVacation(base, 1);
    expect(isRouteOnVacation(once, 1)).toBe(true);
    expect(isRouteOnVacation(toggleEngineerVacation(once, 1), 1)).toBe(false);
  });
  it.each<[string, Engineer | undefined, boolean]>([
    ['休暇中', { ...makeEngineer(0, 'junior', 0), onVacation: true }, true],
    ['勤務中', makeEngineer(0, 'junior', 0), false],
    ['担当者なし(undefined)', undefined, false],
  ])('isAssigneeOnVacation: %s → %s', (_label, engineer, expected) => {
    expect(isAssigneeOnVacation(engineer)).toBe(expected);
  });
  it('入力を変更しない', () => {
    const snapshot = structuredClone(engineers);
    isRouteOnVacation(engineers, 0);
    expect(engineers).toEqual(snapshot);
  });
});

describe('休暇中はそのエンジニアのコードを止める(#36): 複数フレームの合成', () => {
  // main.ts の updateCodes と同じ順に、休暇の切替 → ルートの判定 → 生成タイマー・移動を組み合わせる。
  const interval = CODE_SPAWN_INTERVAL_MS;
  const route = createRoutes(ENGINEER_SPAWN_CELLS, () => 0)[0];
  const frame = (
    engineers: readonly Engineer[],
    elapsedMs: number,
    deltaMs: number,
  ): { readonly elapsedMs: number; readonly spawn: boolean } =>
    stepSpawnTimerUnlessPaused(elapsedMs, deltaMs, interval, isRouteOnVacation(engineers, route.id));

  it('休暇中は何フレームでも凍結し、解除後は保持値から再開する', () => {
    let engineers: readonly Engineer[] = [makeEngineer(0, 'junior', route.id)];
    // 勤務中に間隔 - 1 まで進める。
    let timer = frame(engineers, 0, interval - 1);
    expect(timer).toEqual({ elapsedMs: interval - 1, spawn: false });
    engineers = toggleEngineerVacation(engineers, 0);
    for (const delta of [1, interval, interval * 30]) {
      timer = frame(engineers, timer.elapsedMs, delta);
      expect(timer).toEqual({ elapsedMs: interval - 1, spawn: false });
    }
    engineers = toggleEngineerVacation(engineers, 0);
    expect(frame(engineers, timer.elapsedMs, 0)).toEqual({ elapsedMs: interval - 1, spawn: false });
    expect(frame(engineers, timer.elapsedMs, 1)).toEqual({ elapsedMs: 0, spawn: true });
  });

  it('休暇中のルートのコードは進まず、解除後に進む。他のルートは影響を受けない', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0);
    let engineers: readonly Engineer[] = toggleEngineerVacation(makeEngineers(2), 0);
    const paused = spawnCode(1, 'malicious', routes[0]);
    const working = spawnCode(2, 'normal', routes[1]);
    const step = (code: ReturnType<typeof spawnCode>) =>
      advanceCode(code, moveDistanceUnlessPaused(30, isRouteOnVacation(engineers, code.routeId)));
    expect(step(paused)).toBe(paused);
    expect(step(working).position).not.toEqual(working.position);
    engineers = toggleEngineerVacation(engineers, 0);
    expect(step(paused).position).not.toEqual(paused.position);
  });
});

describe('shouldAddRouteOnHire', () => {
  it.each([
    [false, true],
    [true, false],
  ])('gameOver=%s のとき追加する: %s', (gameOver, expected) => {
    expect(shouldAddRouteOnHire(gameOver)).toBe(expected);
  });
  it('倒産後は雇うことも既存どおり不可（雇ってもルートは増えない判定）', () => {
    // 資金ちょうどで雇うと倒産する（BANKRUPT_INCLUDES_ZERO）。
    const fleet = createInitialFleet(() => 0);
    const hired = hireEngineer(
      { engineers: fleet.engineers, funds: ENGINEER_HIRE_COST.junior, nextId: fleet.nextEngineerId },
      'junior',
      rules,
    );
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    const bankrupt = checkBankruptcy(INITIAL_GAME_OVER_STATE, hired.fundsAfter, 0);
    expect(shouldAddRouteOnHire(bankrupt.state.over)).toBe(!bankrupt.triggered);
    expect(bankrupt.triggered).toBe(true);
    // 雇った人は人数に入り、routeId は null のまま。
    expect(hired.engineers).toHaveLength(fleet.engineers.length + 1);
    expect(hired.engineer.routeId).toBeNull();
  });
});

describe('createInitialFleet（初期化・やり直し）', () => {
  it('エンジニア3人・ルート3本・routeId 0..2・ランク junior・ルート id と一致', () => {
    const fleet = createInitialFleet(() => 0);
    expect(fleet.engineers).toHaveLength(ENGINEER_SPAWN_CELLS.length);
    expect(fleet.routes).toHaveLength(ENGINEER_SPAWN_CELLS.length);
    expect(fleet.engineers.map((e) => e.routeId)).toEqual([0, 1, 2]);
    expect(fleet.engineers.map((e) => e.routeId)).toEqual(fleet.routes.map((r) => r.id));
    expect(fleet.engineers.every((e) => e.rank === 'junior')).toBe(true);
    expect(fleet.nextEngineerId).toBe(3);
  });
  it('雇ったあとに作り直しても前回の状態は残らず、2回呼んでも同じ形', () => {
    const first = createInitialFleet(() => 0);
    const hired = hireEngineer(
      { engineers: first.engineers, funds: RICH, nextId: first.nextEngineerId },
      'senior',
      rules,
    );
    expect(hired.ok).toBe(true);
    const again = createInitialFleet(() => 0);
    expect(again).toEqual(first);
    expect(again.engineers).toHaveLength(3);
  });
});

describe('雇う→ルート追加→routeId 割当（8・9・10人目）', () => {
  // 雇う → addRoute → assignEngineerRoute を main.ts と同じ順に組み合わせる。
  const hireAndRoute = (
    fleet: { routes: ReturnType<typeof createRoutes>; engineers: Engineer[]; nextEngineerId: number },
  ) => {
    const hired = hireEngineer(
      { engineers: fleet.engineers, funds: RICH, nextId: fleet.nextEngineerId },
      'junior',
      rules,
    );
    if (!hired.ok) return undefined;
    const route = addRoute(fleet.routes, () => 0);
    const engineers = route
      ? assignEngineerRoute([...hired.engineers], hired.engineer.id, route.id)
      : [...hired.engineers];
    return {
      route,
      engineer: engineers.find((e) => e.id === hired.engineer.id),
      next: {
        routes: route ? [...fleet.routes, route] : fleet.routes,
        engineers,
        nextEngineerId: hired.engineer.id + 1,
      },
    };
  };

  it('3人から9人まで順に雇うとルートが増え、routeId がそのルートの id になる', () => {
    let fleet = createInitialFleet(() => 0);
    for (let n = fleet.engineers.length + 1; n <= MAX_ENGINEERS; n++) {
      const step = hireAndRoute(fleet);
      expect(step?.route).toBeDefined();
      expect(step?.engineer?.routeId).toBe(step?.route?.id);
      if (!step) return;
      fleet = step.next;
      expect(fleet.routes).toHaveLength(n);
    }
    expect(fleet.engineers).toHaveLength(MAX_ENGINEERS);
  });

  it('10人目は雇えず、ルートも増えない', () => {
    let fleet = createInitialFleet(() => 0);
    while (fleet.engineers.length < MAX_ENGINEERS) {
      const step = hireAndRoute(fleet);
      if (!step) return;
      fleet = step.next;
    }
    expect(hireAndRoute(fleet)).toBeUndefined();
  });

  it('addRoute が undefined なら routeId は null のまま（人数だけ増えた状態）', () => {
    const fleet = createInitialFleet(() => 0);
    const full = { ...fleet, routes: createRoutes(Array.from({ length: MAX_ENGINEER_ROUTES }, (_, row) => ({ col: 0, row })), () => 0) };
    const step = hireAndRoute(full);
    expect(step?.route).toBeUndefined();
    expect(step?.engineer?.routeId).toBeNull();
  });

  it('追加したルートの出現セルは左の列を上から埋める順（nextSpawnCell と一致）', () => {
    let fleet = createInitialFleet(() => 0);
    while (fleet.engineers.length < MAX_ENGINEERS) {
      const expected = nextSpawnCell(fleet.routes.map((r) => r.spawn));
      const step = hireAndRoute(fleet);
      if (!step) return;
      expect(step.route?.spawn).toEqual(expected);
      fleet = step.next;
    }
  });
});

describe('パラメータの設定表', () => {
  const keys: EngineerParameterKey[] = ['fatigue', 'concentration', 'skill', 'attachment'];
  it('範囲は min < max で、既定値は範囲内', () => {
    expect(ENGINEER_PARAMETER_MIN).toBeLessThan(ENGINEER_PARAMETER_MAX);
    expect(ENGINEER_PARAMETER_FALLBACK).toBeGreaterThanOrEqual(ENGINEER_PARAMETER_MIN);
    expect(ENGINEER_PARAMETER_FALLBACK).toBeLessThanOrEqual(ENGINEER_PARAMETER_MAX);
  });
  it('初期値の表は全ランクを持つ', () => {
    expect(Object.keys(ENGINEER_INITIAL_PARAMETERS).sort()).toEqual(ENGINEER_RANKS.map((r) => r.id).sort());
  });
  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s は4キーすべてが範囲内の有限値', (rank) => {
    expect(Object.keys(ENGINEER_INITIAL_PARAMETERS[rank]).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const value = ENGINEER_INITIAL_PARAMETERS[rank][key];
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(ENGINEER_PARAMETER_MIN);
      expect(value).toBeLessThanOrEqual(ENGINEER_PARAMETER_MAX);
    }
  });
});

describe('createEngineerParameters / 初期値', () => {
  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s は設定表どおり', (rank) => {
    expect(createEngineerParameters(rank)).toEqual(ENGINEER_INITIAL_PARAMETERS[rank]);
  });
  it('呼ぶたびに別オブジェクトで、設定表とも共有しない', () => {
    const a = createEngineerParameters('junior');
    const b = createEngineerParameters('junior');
    expect(a).not.toBe(b);
    expect(a).not.toBe(ENGINEER_INITIAL_PARAMETERS.junior);
  });
  it('初期エンジニアは設定表どおりで、人ごとに別オブジェクト（変更しても他に影響しない）', () => {
    const fleet = createInitialFleet(() => 0);
    for (const engineer of fleet.engineers) {
      expect(engineer).toMatchObject(createEngineerParameters(engineer.rank, engineer.personality));
    }
    const changed = updateEngineerParameters(fleet.engineers[0], { fatigue: 80 });
    expect(changed.fatigue).toBe(80);
    expect(fleet.engineers[0].fatigue).toBe(ENGINEER_INITIAL_PARAMETERS.junior.fatigue);
    expect(fleet.engineers[1].fatigue).toBe(ENGINEER_INITIAL_PARAMETERS.junior.fatigue);
  });
  it('createInitialEngineers はランク指定どおりの初期値', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
    const engineers = createInitialEngineers(routes, ['senior', 'middle', 'junior'], () => 0);
    expect(engineers.map((e) => e.skill)).toEqual(
      (['senior', 'middle', 'junior'] as const).map((r) => createEngineerParameters(r, 'meticulous').skill),
    );
  });
  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s を雇った人は設定表どおりで、毎回別オブジェクト', (rank) => {
    const state = { engineers: makeEngineers(3), funds: RICH, nextId: 3 };
    const first = hireEngineer(state, rank, rules);
    const second = hireEngineer(state, rank, rules);
    if (!first.ok || !second.ok) throw new Error('雇えるはず');
    expect(first.engineer).toMatchObject(createEngineerParameters(rank, first.engineer.personality));
    expect(first.engineer).not.toBe(second.engineer);
    expect(first.engineers[3]).toBe(first.engineer);
  });
});

describe('clampEngineerParameter', () => {
  const { MIN, MAX } = { MIN: ENGINEER_PARAMETER_MIN, MAX: ENGINEER_PARAMETER_MAX };
  it.each<[string, number, number]>([
    ['最小', MIN, MIN],
    ['最小-1', MIN - 1, MIN],
    ['最小+1', MIN + 1, MIN + 1],
    ['最大', MAX, MAX],
    ['最大+1', MAX + 1, MAX],
    ['最大-1', MAX - 1, MAX - 1],
    ['範囲の外側（負）', -1000, MIN],
    ['範囲の外側（正）', 1000, MAX],
    ['+Infinity', Number.POSITIVE_INFINITY, MAX],
    ['-Infinity', Number.NEGATIVE_INFINITY, MIN],
    ['小数 0.5 は保持', 0.5, 0.5],
    ['小数 99.5 は保持', 99.5, 99.5],
    ['-0.5 は最小', -0.5, MIN],
    ['100.5 は最大', 100.5, MAX],
  ])('%s: %s → %s', (_name, value, expected) => {
    expect(clampEngineerParameter(value, 30)).toBe(expected);
  });
  it('NaN は fallback を返す（最小にしない）', () => {
    expect(clampEngineerParameter(Number.NaN, 30)).toBe(30);
    expect(clampEngineerParameter(Number.NaN, 0.5)).toBe(0.5);
  });
  it.each<[string, number, number]>([
    ['fallback が NaN', Number.NaN, ENGINEER_PARAMETER_FALLBACK],
    ['fallback が範囲外（大）', 1000, MAX],
    ['fallback が範囲外（小）', -1, MIN],
    ['fallback が +Infinity', Number.POSITIVE_INFINITY, MAX],
    ['fallback が -Infinity', Number.NEGATIVE_INFINITY, MIN],
  ])('NaN で %s のとき %s → %s', (_name, fallback, expected) => {
    expect(clampEngineerParameter(Number.NaN, fallback)).toBe(expected);
  });
  it('throw しない', () => {
    expect(() => clampEngineerParameter(Number.NaN, Number.NaN)).not.toThrow();
  });
});

describe('updateEngineerParameters', () => {
  const base: Engineer = {
    ...makeEngineer(5, 'senior', 2),
    fatigue: 10,
    concentration: 20,
    skill: 30,
    attachment: 40,
  };
  it.each<[number, number]>([
    [ENGINEER_PARAMETER_MIN, ENGINEER_PARAMETER_MIN],
    [ENGINEER_PARAMETER_MIN - 1, ENGINEER_PARAMETER_MIN],
    [ENGINEER_PARAMETER_MAX, ENGINEER_PARAMETER_MAX],
    [ENGINEER_PARAMETER_MAX + 1, ENGINEER_PARAMETER_MAX],
    [Number.POSITIVE_INFINITY, ENGINEER_PARAMETER_MAX],
    [Number.NEGATIVE_INFINITY, ENGINEER_PARAMETER_MIN],
    [0.5, 0.5],
    [99.5, 99.5],
    [-0.5, ENGINEER_PARAMETER_MIN],
    [100.5, ENGINEER_PARAMETER_MAX],
  ])('値 %s は %s になる', (value, expected) => {
    expect(updateEngineerParameters(base, { attachment: value }).attachment).toBe(expected);
  });
  it('NaN のキーは現在値のまま', () => {
    expect(updateEngineerParameters(base, { attachment: Number.NaN })).toEqual(base);
  });
  it('指定外のキーと id/rank/routeId は変わらない', () => {
    const result = updateEngineerParameters(base, { fatigue: 99 });
    expect(result).toEqual({ ...base, fatigue: 99 });
  });
  it('複数キーを同時に設定でき、空の patch は同じ内容', () => {
    expect(updateEngineerParameters(base, { skill: 1 })).toMatchObject({ skill: 1 });
    expect(updateEngineerParameters(base, { concentration: 5, skill: 6 })).toEqual({
      ...base,
      concentration: 5,
      skill: 6,
    });
    expect(updateEngineerParameters(base, {})).toEqual(base);
  });
  it('入力を変更しない', () => {
    const frozen = Object.freeze({ ...base });
    const result = updateEngineerParameters(frozen, { fatigue: 50 });
    expect(frozen).toEqual(base);
    expect(result).not.toBe(frozen);
  });
});

describe('adjustEngineerParameter', () => {
  const base: Engineer = { ...makeEngineer(1, 'middle', null), fatigue: 50, attachment: 100 };
  it.each<[number, number]>([
    [10, 60],
    [-10, 40],
    [0, 50],
    [0.25, 50.25],
    [-50, ENGINEER_PARAMETER_MIN],
    [-51, ENGINEER_PARAMETER_MIN],
    [50, ENGINEER_PARAMETER_MAX],
    [51, ENGINEER_PARAMETER_MAX],
    [Number.POSITIVE_INFINITY, ENGINEER_PARAMETER_MAX],
    [Number.NEGATIVE_INFINITY, ENGINEER_PARAMETER_MIN],
    [Number.NaN, 50],
  ])('疲労度 50 に %s を足すと %s', (delta, expected) => {
    expect(adjustEngineerParameter(base, 'fatigue', delta).fatigue).toBe(expected);
  });
  it('最大の愛着心に正の値を足しても最大、最小に負の値でも最小', () => {
    expect(adjustEngineerParameter(base, 'attachment', 1).attachment).toBe(ENGINEER_PARAMETER_MAX);
    const low = { ...base, attachment: ENGINEER_PARAMETER_MIN };
    expect(adjustEngineerParameter(low, 'attachment', -1).attachment).toBe(ENGINEER_PARAMETER_MIN);
  });
  it('指定外のキーと id/rank/routeId は変わらず、入力も変更しない', () => {
    const snapshot = structuredClone(base);
    const result = adjustEngineerParameter(base, 'skill', 5);
    expect(result).toEqual({ ...base, skill: base.skill + 5 });
    expect(base).toEqual(snapshot);
    expect(result).not.toBe(base);
  });
});

const PERSONALITY_IDS = ENGINEER_PERSONALITIES.map((entry) => entry.id);
const COUNT = PERSONALITY_IDS.length;
const EPS = 1e-9;
const weightsOf = (values: readonly number[]): Record<EngineerPersonalityId, number> =>
  Object.fromEntries(PERSONALITY_IDS.map((id, i) => [id, values[i]])) as Record<
    EngineerPersonalityId,
    number
  >;
const sequence = (values: readonly number[]): (() => number) => {
  let index = 0;
  return () => values[index++ % values.length];
};
const counting = (value: number) => {
  let calls = 0;
  return { random: () => (calls++, value), calls: () => calls };
};

describe('性格の設定表', () => {
  it('8種で順序と表示名は企画書どおり', () => {
    expect(ENGINEER_PERSONALITIES.map((p) => p.id)).toEqual([
      'meticulous',
      'passive',
      'careless',
      'slacker',
      'earnest',
      'calm',
      'cheerful',
      'gloomy',
    ]);
    expect(ENGINEER_PERSONALITIES.map((p) => getPersonalityLabel(p.id))).toEqual([
      '几帳面',
      '消極的',
      '適当',
      'サボりがち',
      '真面目',
      '冷静沈着',
      '陽気',
      '根暗',
    ]);
  });
  it('id・表示名に重複がない', () => {
    expect(new Set(PERSONALITY_IDS).size).toBe(COUNT);
    expect(new Set(ENGINEER_PERSONALITIES.map((p) => getPersonalityLabel(p.id))).size).toBe(COUNT);
  });
  it('重みが全性格にあり、均等で正の有限値', () => {
    expect(Object.keys(ENGINEER_PERSONALITY_WEIGHTS).sort()).toEqual([...PERSONALITY_IDS].sort());
    const values = PERSONALITY_IDS.map((id) => ENGINEER_PERSONALITY_WEIGHTS[id]);
    expect(values.every((w) => Number.isFinite(w) && w > 0)).toBe(true);
    expect(new Set(values).size).toBe(1);
  });
  it('表示名を取得できる', () => {
    expect(getPersonalityLabel('gloomy')).toBe('根暗');
  });
});

describe('pickRandomPersonality: 均等な重み', () => {
  it('random 0 は先頭、0.999999 は最後', () => {
    expect(pickRandomPersonality(() => 0)).toBe('meticulous');
    expect(pickRandomPersonality(() => 0.999999)).toBe('gloomy');
  });
  it.each([1, 2, 3, 4, 5, 6, 7])('切れ目 %i/8: ちょうどは次の性格、少し前は前の性格、少し後は次の性格', (k) => {
    expect(pickRandomPersonality(() => k / COUNT)).toBe(PERSONALITY_IDS[k]);
    expect(pickRandomPersonality(() => k / COUNT - EPS)).toBe(PERSONALITY_IDS[k - 1]);
    expect(pickRandomPersonality(() => k / COUNT + EPS)).toBe(PERSONALITY_IDS[k]);
  });
  it.each([
    ['-0.1', -0.1],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['NaN', Number.NaN],
  ])('%s は先頭', (_name, value) => {
    expect(pickRandomPersonality(() => value)).toBe('meticulous');
  });
  it.each([
    ['1', 1],
    ['1.5', 1.5],
    ['+Infinity', Number.POSITIVE_INFINITY],
  ])('%s は最後', (_name, value) => {
    expect(pickRandomPersonality(() => value)).toBe('gloomy');
  });
  it('不正な値でも throw しない', () => {
    for (const value of [Number.NaN, -1, 2, Infinity, -Infinity]) {
      expect(() => pickRandomPersonality(() => value)).not.toThrow();
    }
  });
  it('random を1回だけ呼ぶ', () => {
    const counter = counting(0.5);
    pickRandomPersonality(counter.random);
    expect(counter.calls()).toBe(1);
  });
  it('同じ乱数列なら同じ結果', () => {
    const values = [0.1, 0.5, 0.99, 0.3, 0.7];
    const run = () => {
      const random = sequence(values);
      return values.map(() => pickRandomPersonality(random));
    };
    expect(run()).toEqual(run());
  });
});

describe('pickRandomPersonality: 重みを渡す', () => {
  it('不均等な重み [3,1,1,1,1,1,1,1]（合計10）の切れ目', () => {
    const w = weightsOf([3, 1, 1, 1, 1, 1, 1, 1]);
    expect(pickRandomPersonality(() => 0.2999, w)).toBe('meticulous');
    expect(pickRandomPersonality(() => 0.3, w)).toBe('passive');
    expect(pickRandomPersonality(() => 0.4, w)).toBe('careless');
    expect(pickRandomPersonality(() => 0.9999, w)).toBe('gloomy');
  });
  it('重み 0 の性格は選ばれない（切れ目ちょうども）', () => {
    const w = weightsOf([1, 0, 1, 0, 0, 0, 0, 1]);
    // 区間: meticulous [0,1/3) careless [1/3,2/3) gloomy [2/3,1)
    expect(pickRandomPersonality(() => 1 / 3, w)).toBe('careless');
    expect(pickRandomPersonality(() => 1 / 3 - EPS, w)).toBe('meticulous');
    expect(pickRandomPersonality(() => 2 / 3 + EPS, w)).toBe('gloomy');
    for (let i = 0; i < 100; i++) {
      expect(['meticulous', 'careless', 'gloomy']).toContain(pickRandomPersonality(() => i / 100, w));
    }
  });
  it('先頭の重みが 0 なら random 0 や不正値でも重み>0 の先頭、1 以上は重み>0 の最後', () => {
    const w = weightsOf([0, 0, 1, 1, 0, 0, 0, 0]);
    expect(pickRandomPersonality(() => 0, w)).toBe('careless');
    expect(pickRandomPersonality(() => Number.NaN, w)).toBe('careless');
    expect(pickRandomPersonality(() => 1, w)).toBe('slacker');
    expect(pickRandomPersonality(() => Number.POSITIVE_INFINITY, w)).toBe('slacker');
  });
  it('合計 0 は先頭', () => {
    expect(pickRandomPersonality(() => 0.9, weightsOf([0, 0, 0, 0, 0, 0, 0, 0]))).toBe('meticulous');
  });
  it('負・NaN・Infinity の重みは 0 扱い', () => {
    const w = weightsOf([-1, Number.NaN, Number.POSITIVE_INFINITY, 1, Number.NEGATIVE_INFINITY, 0, 0, 0]);
    for (const value of [0, 0.5, 0.999, 1, Number.NaN]) {
      expect(pickRandomPersonality(() => value, w)).toBe('slacker');
    }
  });
  it('不正な重みだけなら合計 0 として先頭', () => {
    expect(pickRandomPersonality(() => 0.5, weightsOf([-1, -1, Number.NaN, 0, 0, 0, 0, 0]))).toBe(
      'meticulous',
    );
  });
});

describe('性格の付与', () => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
  it('初期の3人に、渡した random どおりの性格が付く', () => {
    const engineers = createInitialEngineers(routes, INITIAL_ENGINEER_RANKS, sequence([0, 0.5, 0.999]));
    expect(engineers.map((e) => e.personality)).toEqual(['meticulous', 'earnest', 'gloomy']);
  });
  it('createInitialFleet も同じ乱数列で同じルートと性格', () => {
    const values = [0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.3, 0.7, 0.05, 0.95, 0.5, 0.15, 0.85, 0.25, 0.75];
    const a = createInitialFleet(sequence(values));
    const b = createInitialFleet(sequence(values));
    expect(a).toEqual(b);
    expect(a.routes).toEqual(createRoutes(ENGINEER_SPAWN_CELLS, sequence(values)));
  });
  it('createInitialFleet はルート生成の後に同じ random を使う（ルートは性格追加前と同じ）', () => {
    const fleet = createInitialFleet(() => 0);
    expect(fleet.routes).toEqual(createRoutes(ENGINEER_SPAWN_CELLS, () => 0));
    expect(fleet.engineers.every((e) => e.personality === 'meticulous')).toBe(true);
  });
  it('random を渡さなくても有効な性格が付く', () => {
    for (const engineer of createInitialEngineers(routes, INITIAL_ENGINEER_RANKS)) {
      expect(PERSONALITY_IDS).toContain(engineer.personality);
    }
    const hired = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, 'junior', rules);
    expect(hired.ok && PERSONALITY_IDS.includes(hired.engineer.personality)).toBe(true);
  });
  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s を雇った人に渡した random どおりの性格が付く', (rank) => {
    const hired = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, rank, rules, () => 0.999);
    expect(hired.ok && hired.engineer.personality).toBe('gloomy');
  });
  it.each<[string, { engineers: Engineer[]; funds: number }, string]>([
    ['unknownRank', { engineers: [], funds: RICH }, 'lead'],
    ['limit', { engineers: makeEngineers(MAX_ENGINEERS), funds: RICH }, 'junior'],
    ['insufficientFunds', { engineers: [], funds: 0 }, 'junior'],
  ])('雇うのに失敗（%s）したら random を呼ばない', (_name, base, rank) => {
    const counter = counting(0.5);
    const result = hireEngineer({ ...base, nextId: 0 }, rank, rules, counter.random);
    expect(result.ok).toBe(false);
    expect(counter.calls()).toBe(0);
  });
  it('雇えたときは random を1回だけ呼ぶ', () => {
    const counter = counting(0.5);
    hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, 'junior', rules, counter.random);
    expect(counter.calls()).toBe(1);
  });
  it('性格ごとに、ランクの初期値 + 性格の補正の初期パラメータが付く', () => {
    for (const [i, id] of PERSONALITY_IDS.entries()) {
      const hired = hireEngineer(
        { engineers: [], funds: RICH, nextId: 0 },
        'middle',
        rules,
        () => (i + 0.5) / COUNT,
      );
      if (!hired.ok) throw new Error('雇えるはず');
      expect(hired.engineer.personality).toBe(id);
      const { personality: _personality, id: _id, rank: _rank, routeId: _routeId, onVacation: _onVacation, vacationRateReduction: _vacationRateReduction, salary: _salary, initialSalary: _initialSalary, aiAgent: _aiAgent, ...parameters } = hired.engineer;
      expect(parameters).toEqual(createEngineerParameters('middle', id));
    }
  });
  it('パラメータは4キーだけで、性格を含まない', () => {
    expect(Object.keys(createEngineerParameters('junior')).sort()).toEqual(
      ['attachment', 'concentration', 'fatigue', 'skill'],
    );
  });
  it('ルート割り当て・パラメータ更新・調整で性格が保たれる', () => {
    const base: Engineer = { ...makeEngineer(0, 'senior', null), personality: 'calm' };
    expect(assignEngineerRoute([base], 0, 2)[0].personality).toBe('calm');
    expect(updateEngineerParameters(base, { fatigue: 70 }).personality).toBe('calm');
    expect(adjustEngineerParameter(base, 'skill', 5).personality).toBe('calm');
  });
});

describe('性格の傾向表（企画書(6)の表）', () => {
  const T = { high: 'high', normal: 'normal', low: 'low' } as const;
  const expected: Record<string, [string, string, string, string]> = {
    meticulous: [T.normal, T.normal, T.high, T.normal],
    passive: [T.normal, T.low, T.normal, T.normal],
    careless: [T.low, T.high, T.low, T.normal],
    slacker: [T.low, T.low, T.normal, T.low],
    earnest: [T.high, T.high, T.normal, T.high],
    calm: [T.low, T.normal, T.high, T.normal],
    cheerful: [T.low, T.normal, T.normal, T.high],
    gloomy: [T.high, T.high, T.high, T.low],
  };
  it('全性格が表にあり、キーは4つだけ', () => {
    expect(Object.keys(ENGINEER_PERSONALITY_TENDENCIES).sort()).toEqual([...PERSONALITY_IDS].sort());
    for (const id of PERSONALITY_IDS) {
      expect(Object.keys(ENGINEER_PERSONALITY_TENDENCIES[id]).sort()).toEqual(
        ['attachment', 'concentration', 'fatigue', 'skill'],
      );
    }
  });
  it.each(Object.entries(expected))('%s は企画書の表どおり', (id, [fatigue, concentration, skill, attachment]) => {
    expect(ENGINEER_PERSONALITY_TENDENCIES[id as EngineerPersonalityId]).toEqual({
      fatigue,
      concentration,
      skill,
      attachment,
    });
  });
  it('補正表: high > normal = 0 > low', () => {
    expect(ENGINEER_TENDENCY_OFFSETS.high).toBeGreaterThan(ENGINEER_TENDENCY_OFFSETS.normal);
    expect(ENGINEER_TENDENCY_OFFSETS.normal).toBe(0);
    expect(ENGINEER_TENDENCY_OFFSETS.normal).toBeGreaterThan(ENGINEER_TENDENCY_OFFSETS.low);
  });
  it('係数表: 正の有限値で high > normal > low', () => {
    const m = ENGINEER_FATIGUE_RATE_MULTIPLIERS;
    for (const v of [m.high, m.normal, m.low]) {
      expect(Number.isFinite(v) && v > 0).toBe(true);
    }
    expect(m.high).toBeGreaterThan(m.normal);
    expect(m.normal).toBeGreaterThan(m.low);
  });
});

describe('createEngineerParameters: 8性格 × 3ランク = 24通り（手計算の期待値）', () => {
  // 初期値は全ランク 疲労0・集中50・技術50・愛着50。高い=+20、普通=0、低い=-20。
  const byPersonality: Record<string, [number, number, number]> = {
    meticulous: [50, 70, 50],
    passive: [30, 50, 50],
    careless: [70, 30, 50],
    slacker: [30, 50, 30],
    earnest: [70, 50, 70],
    calm: [50, 70, 50],
    cheerful: [50, 50, 70],
    gloomy: [70, 70, 30],
  };
  const cases = Object.entries(byPersonality).flatMap(([id, [c, s, a]]) =>
    (['junior', 'middle', 'senior'] as const).map((rank): [string, EngineerRank, number, number, number] => [
      id,
      rank,
      c,
      s,
      a,
    ]),
  );
  it.each(cases)('%s / %s', (id, rank, concentration, skill, attachment) => {
    expect(createEngineerParameters(rank, id as EngineerPersonalityId)).toEqual({
      fatigue: 0,
      concentration,
      skill,
      attachment,
    });
  });
  it('全ランク×全性格で結果が範囲内', () => {
    for (const rank of ENGINEER_RANKS) {
      for (const id of PERSONALITY_IDS) {
        for (const value of Object.values(createEngineerParameters(rank.id, id))) {
          expect(value).toBeGreaterThanOrEqual(ENGINEER_PARAMETER_MIN);
          expect(value).toBeLessThanOrEqual(ENGINEER_PARAMETER_MAX);
        }
      }
    }
  });
  it('personality を省略したらランクの初期値のまま', () => {
    for (const rank of ENGINEER_RANKS) {
      expect(createEngineerParameters(rank.id)).toEqual(ENGINEER_INITIAL_PARAMETERS[rank.id]);
    }
  });
  it('呼ぶたびに別オブジェクトで、設定表を変更しない', () => {
    const before = JSON.stringify([ENGINEER_INITIAL_PARAMETERS, ENGINEER_PERSONALITY_TENDENCIES, ENGINEER_TENDENCY_OFFSETS]);
    const a = createEngineerParameters('junior', 'gloomy');
    const b = createEngineerParameters('junior', 'gloomy');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    expect(JSON.stringify([ENGINEER_INITIAL_PARAMETERS, ENGINEER_PERSONALITY_TENDENCIES, ENGINEER_TENDENCY_OFFSETS])).toBe(before);
  });
});

describe('applyPersonalityTendencies: 丸めと不正な補正値', () => {
  type Tendency = 'high' | 'normal' | 'low';
  // 全性格が同じ傾向になる表（実際の性格表に依存しない）
  const allTendency = (t: Tendency): Record<EngineerPersonalityId, Record<EngineerParameterKey, Tendency>> =>
    Object.fromEntries(
      PERSONALITY_IDS.map((id) => [id, { fatigue: t, concentration: t, skill: t, attachment: t }]),
    ) as Record<EngineerPersonalityId, Record<EngineerParameterKey, Tendency>>;
  const base = (v: number) => ({ fatigue: 10, concentration: v, skill: v, attachment: v });
  const run = (tendency: Tendency, v: number, offsets = ENGINEER_TENDENCY_OFFSETS) =>
    applyPersonalityTendencies(base(v), 'meticulous', { tendencies: allTendency(tendency), offsets });
  it.each<[Tendency, number, number]>([
    ['high', 79, 99],
    ['high', 80, 100],
    ['high', 81, 100],
    ['low', 21, 1],
    ['low', 20, 0],
    ['low', 19, 0],
  ])('%s: 基準値 %i → %i', (tendency, input, output) => {
    const result = run(tendency, input);
    expect([result.concentration, result.skill, result.attachment]).toEqual([output, output, output]);
  });
  it.each([0, 100])('普通なら基準値 %i そのまま', (v) => {
    const result = run('normal', v);
    expect([result.concentration, result.skill, result.attachment]).toEqual([v, v, v]);
  });
  it('疲労度は補正されず基準値のまま', () => {
    expect(run('high', 50).fatigue).toBe(10);
    expect(run('low', 50).fatigue).toBe(10);
  });
  it('小数の基準値は丸められない', () => {
    expect(run('high', 50.5).skill).toBe(70.5);
    expect(run('normal', 33.3).skill).toBe(33.3);
  });
  it.each([
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('補正値が %s なら補正なし', (_name, bad) => {
    const result = run('high', 50, { high: bad, normal: 0, low: -20 });
    expect(result).toEqual(base(50));
  });
  it('入力が Object.freeze でも変更せず、4キーだけの新しいオブジェクトを返す', () => {
    const frozen = Object.freeze(base(50));
    const result = applyPersonalityTendencies(frozen, 'gloomy');
    expect(result).not.toBe(frozen);
    expect(Object.keys(result).sort()).toEqual(['attachment', 'concentration', 'fatigue', 'skill']);
    expect(frozen).toEqual(base(50));
  });
});

describe('getFatigueRateMultiplier', () => {
  it.each<[EngineerPersonalityId, number]>([
    ['meticulous', 1],
    ['passive', 1],
    ['careless', 0.5],
    ['slacker', 0.5],
    ['earnest', 1.5],
    ['calm', 0.5],
    ['cheerful', 0.5],
    ['gloomy', 1.5],
  ])('%s の既定の係数は %f', (id, value) => {
    expect(getFatigueRateMultiplier(id)).toBe(value);
  });
  // 'earnest' の疲労は high
  it.each<[string, number, number]>([
    ['0 は有効（溜まらない）', 0, 0],
    ['小数 0.25', 0.25, 0.25],
    ['負 -1 は 1', -1, 1],
    ['負 -0.000001 は 1', -0.000001, 1],
    ['NaN は 1', Number.NaN, 1],
    ['+Infinity は 1', Number.POSITIVE_INFINITY, 1],
    ['-Infinity は 1', Number.NEGATIVE_INFINITY, 1],
  ])('差し替えた係数: %s', (_name, input, output) => {
    expect(getFatigueRateMultiplier('earnest', { high: input, normal: 1, low: 0.5 })).toBe(output);
  });
});

describe('性格の初期値と乱数', () => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
  it('最初の3人に性格どおりの初期値が付く', () => {
    const engineers = createInitialEngineers(routes, INITIAL_ENGINEER_RANKS, sequence([0, 0.5, 0.999]));
    expect(engineers.map((e) => [e.personality, e.concentration, e.skill, e.attachment, e.fatigue])).toEqual([
      ['meticulous', 50, 70, 50, 0],
      ['earnest', 70, 50, 70, 0],
      ['gloomy', 70, 70, 30, 0],
    ]);
  });
  it('createInitialFleet: 同じ乱数列で同じルート・性格・パラメータ', () => {
    const values = [0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.3, 0.7, 0.05, 0.95, 0.5, 0.15];
    expect(createInitialFleet(sequence(values))).toEqual(createInitialFleet(sequence(values)));
  });
  it('createInitialEngineers が random を呼ぶ回数は人数と同じ', () => {
    const counter = counting(0.5);
    createInitialEngineers(routes, INITIAL_ENGINEER_RANKS, counter.random);
    expect(counter.calls()).toBe(INITIAL_ENGINEER_RANKS.length);
  });
  it.each(['junior', 'middle', 'senior'] as const)('%s を雇った人に性格どおりの初期値が付く（根暗）', (rank) => {
    const hired = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, rank, rules, () => 0.999);
    if (!hired.ok) throw new Error('雇えるはず');
    expect(hired.engineer).toMatchObject({ personality: 'gloomy', fatigue: 0, concentration: 70, skill: 70, attachment: 30 });
  });
});

describe('給料の初期額をランクで決める(#33)', () => {
  // 仮・要確認(#25): 金額は ENGINEER_MONTHLY_SALARY_BY_RANK の仮値。
  it.each<[EngineerRank, number]>([
    ['junior', 300000],
    ['middle', 400000],
    ['senior', 500000],
  ])('getInitialSalary(%s) = %i 円（設定表どおり）', (rank, salary) => {
    expect(getInitialSalary(rank)).toBe(salary);
    expect(getInitialSalary(rank)).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK[rank]);
  });

  it.each(ENGINEER_RANKS.map((r) => r.id))('%s を雇うと salary はランクの初期額', (rank) => {
    const hired = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, rank, rules, () => 0);
    if (!hired.ok) throw new Error('雇えるはず');
    expect(hired.engineer.salary).toBe(getInitialSalary(rank));
    expect(hired.engineers.at(-1)?.salary).toBe(getInitialSalary(rank));
  });

  describe('資金の境界（雇用費とは別に月給が入る）', () => {
    const cost = ENGINEER_HIRE_COST.senior;
    const hire = (funds: number) =>
      hireEngineer({ engineers: makeEngineers(3), funds, nextId: 3 }, 'senior', rules);

    it('cost-1 はエンジニアを作らない', () => {
      expect(hire(cost - 1)).toEqual({ ok: false, reason: 'insufficientFunds' });
    });
    it.each([
      ['ちょうど cost', cost, 0],
      ['cost+1', cost + 1, 1],
    ])('%s は salary 付きで雇え、資金 %i → %i', (_name, funds, fundsAfter) => {
      const result = hire(funds);
      if (!result.ok) throw new Error('雇えるはず');
      expect(result.fundsAfter).toBe(fundsAfter);
      expect(result.engineer.salary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK.senior);
      // 雇用費（一時費用）と月給は別の値。
      expect(result.cost).toBe(cost);
    });
  });

  it.each(['', 'Junior', 'lead', '__proto__', 'toString'])('不正なランク %j ではエンジニアを作らない', (rank) => {
    const result = hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, rank, rules);
    expect(result).toEqual({ ok: false, reason: 'unknownRank' });
  });

  it(`上限の境界: ${MAX_ENGINEERS - 1}人なら salary 付きで雇え、${MAX_ENGINEERS}人なら limit`, () => {
    const below = hireEngineer(
      { engineers: makeEngineers(MAX_ENGINEERS - 1), funds: RICH, nextId: MAX_ENGINEERS - 1 },
      'middle',
      rules,
    );
    if (!below.ok) throw new Error('雇えるはず');
    expect(below.engineer.salary).toBe(getInitialSalary('middle'));
    expect(
      hireEngineer({ engineers: makeEngineers(MAX_ENGINEERS), funds: RICH, nextId: MAX_ENGINEERS }, 'middle', rules),
    ).toEqual({ ok: false, reason: 'limit' });
  });

  it.each([0, 1, ENGINEER_HIRE_COST.junior, ENGINEER_HIRE_COST.senior])(
    'ジュニアの雇用費が %i 円でも salary はジュニアの初期額',
    (juniorCost) => {
      const hired = hireEngineer(
        { engineers: [], funds: RICH, nextId: 0 },
        'junior',
        { max: MAX_ENGINEERS, costs: { ...ENGINEER_HIRE_COST, junior: juniorCost } },
      );
      if (!hired.ok) throw new Error('雇えるはず');
      expect(hired.cost).toBe(juniorCost);
      expect(hired.engineer.salary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK.junior);
    },
  );

  it('createInitialEngineers: 各エンジニアの salary は指定したランクの初期額', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
    const engineers = createInitialEngineers(routes, ['senior', 'middle', 'junior'], () => 0);
    expect(engineers.map((e) => e.salary)).toEqual([
      ENGINEER_MONTHLY_SALARY_BY_RANK.senior,
      ENGINEER_MONTHLY_SALARY_BY_RANK.middle,
      ENGINEER_MONTHLY_SALARY_BY_RANK.junior,
    ]);
  });

  it('createInitialEngineers: ルートが0件なら空配列', () => {
    expect(createInitialEngineers([], INITIAL_ENGINEER_RANKS, () => 0)).toEqual([]);
  });

  it('createInitialFleet: 初期の全員が初期ランクの初期額を持つ', () => {
    const fleet = createInitialFleet(() => 0);
    expect(fleet.engineers.map((e) => e.salary)).toEqual(INITIAL_ENGINEER_RANKS.map((rank) => getInitialSalary(rank)));
  });

  it('月給の設定で random を余分に呼ばない（雇用1回・初期編成は人数ぶん）', () => {
    const hireCounter = counting(0.5);
    hireEngineer({ engineers: [], funds: RICH, nextId: 0 }, 'senior', rules, hireCounter.random);
    expect(hireCounter.calls()).toBe(1);
    const initialCounter = counting(0.5);
    const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
    createInitialEngineers(routes, ['junior', 'middle', 'senior'], initialCounter.random);
    expect(initialCounter.calls()).toBe(3);
  });

  it('assignEngineerRoute のあとも salary は変わらない', () => {
    const engineers: Engineer[] = [{ ...makeEngineer(0, 'junior', null), salary: 350000 }];
    expect(assignEngineerRoute(engineers, 0, 4)[0].salary).toBe(350000);
  });
});

describe('adjustEngineerSalary: 上限の境界(#34)', () => {
  const MAX = ENGINEER_SALARY_MAX;
  const STEP = ENGINEER_SALARY_STEP;
  it.each<[string, number, SalaryDirection, number]>([
    ['MAX−STEP の昇給は MAX', MAX - STEP, 'raise', MAX],
    ['MAX−1 の昇給は MAX に収める', MAX - 1, 'raise', MAX],
    ['MAX の減給は MAX−STEP', MAX, 'cut', MAX - STEP],
  ])('%s', (_name, salary, direction, expected) => {
    const result = adjustEngineerSalary([{ ...makeEngineer(0, 'junior', 0), salary }], 0, direction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.salaryBefore).toBe(salary);
    expect(result.salaryAfter).toBe(expected);
    expect(result.engineer.salary).toBe(expected);
    expect(result.engineers.map((e) => e.salary)).toEqual([expected]);
  });

  it.each([
    ['MAX', MAX],
    ['MAX+1', MAX + 1],
  ])('%s の昇給は at-max で拒否', (_name, salary) => {
    expect(adjustEngineerSalary([{ ...makeEngineer(0, 'junior', 0), salary }], 0, 'raise')).toEqual({
      ok: false,
      direction: 'raise',
      engineerId: 0,
      reason: 'at-max',
    });
  });
});

describe('adjustEngineerSalary: 下限の境界(#34)', () => {
  const MIN = ENGINEER_SALARY_MIN;
  const STEP = ENGINEER_SALARY_STEP;
  it.each<[string, number, SalaryDirection, number]>([
    ['MIN+STEP の減給は MIN', MIN + STEP, 'cut', MIN],
    ['MIN+1 の減給は MIN に収める', MIN + 1, 'cut', MIN],
    ['MIN の昇給は MIN+STEP', MIN, 'raise', MIN + STEP],
  ])('%s', (_name, salary, direction, expected) => {
    const result = adjustEngineerSalary([{ ...makeEngineer(0, 'junior', 0), salary }], 0, direction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.salaryBefore).toBe(salary);
    expect(result.salaryAfter).toBe(expected);
  });

  it.each([
    ['MIN', MIN],
    ['MIN−1', MIN - 1],
  ])('%s の減給は at-min で拒否', (_name, salary) => {
    expect(adjustEngineerSalary([{ ...makeEngineer(0, 'junior', 0), salary }], 0, 'cut')).toEqual({
      ok: false,
      direction: 'cut',
      engineerId: 0,
      reason: 'at-min',
    });
  });
});

describe('adjustEngineerSalary: 連続操作(#34)', () => {
  it('ジュニアの初期額から昇給を繰り返すと MAX に届き、その後の昇給は at-max、減給は成功', () => {
    const initial = getInitialSalary('junior');
    const times = (ENGINEER_SALARY_MAX - initial) / ENGINEER_SALARY_STEP;
    expect(Number.isInteger(times)).toBe(true);
    let engineers: readonly Engineer[] = [makeEngineer(0, 'junior', 0)];
    for (let i = 1; i <= times; i += 1) {
      const result = adjustEngineerSalary(engineers, 0, 'raise');
      if (!result.ok) throw new Error(`raise ${i} failed: ${result.reason}`);
      expect(result.salaryAfter).toBe(initial + ENGINEER_SALARY_STEP * i);
      engineers = result.engineers;
    }
    expect(engineers[0].salary).toBe(ENGINEER_SALARY_MAX);
    expect(adjustEngineerSalary(engineers, 0, 'raise')).toMatchObject({ ok: false, reason: 'at-max' });
    const cut = adjustEngineerSalary(engineers, 0, 'cut');
    expect(cut).toMatchObject({ ok: true, salaryAfter: ENGINEER_SALARY_MAX - ENGINEER_SALARY_STEP });
  });

  it('ジュニアの初期額から減給を繰り返すと MIN に届き、その後の減給は at-min', () => {
    const initial = getInitialSalary('junior');
    const times = (initial - ENGINEER_SALARY_MIN) / ENGINEER_SALARY_STEP;
    let engineers: readonly Engineer[] = [makeEngineer(0, 'junior', 0)];
    for (let i = 1; i <= times; i += 1) {
      const result = adjustEngineerSalary(engineers, 0, 'cut');
      if (!result.ok) throw new Error(`cut ${i} failed: ${result.reason}`);
      engineers = result.engineers;
    }
    expect(engineers[0].salary).toBe(ENGINEER_SALARY_MIN);
    expect(adjustEngineerSalary(engineers, 0, 'cut')).toMatchObject({ ok: false, reason: 'at-min' });
  });
});

describe('adjustEngineerSalary: 不正な月給・対象なし(#34)', () => {
  it.each<[number, SalaryDirection]>([
    [Number.NaN, 'raise'],
    [Number.NaN, 'cut'],
    [Number.POSITIVE_INFINITY, 'raise'],
    [Number.POSITIVE_INFINITY, 'cut'],
    [Number.NEGATIVE_INFINITY, 'raise'],
    [Number.NEGATIVE_INFINITY, 'cut'],
  ])('salary %d の %s は invalid-salary で拒否', (salary, direction) => {
    expect(adjustEngineerSalary([{ ...makeEngineer(0, 'junior', 0), salary }], 0, direction)).toEqual({
      ok: false,
      direction,
      engineerId: 0,
      reason: 'invalid-salary',
    });
  });

  it.each<[string, readonly Engineer[], number | null]>([
    ['存在しない id', makeEngineers(3), 99],
    ['空の名簿', [], 0],
    ['選択なし（null）', makeEngineers(3), null],
  ])('%s は not-found で拒否', (_name, engineers, engineerId) => {
    expect(adjustEngineerSalary(engineers, engineerId, 'raise')).toEqual({
      ok: false,
      direction: 'raise',
      engineerId,
      reason: 'not-found',
    });
  });

  it('not-found は invalid-salary より先に判定する（他人の月給が不正でも対象なし）', () => {
    const engineers = [{ ...makeEngineer(0, 'junior', 0), salary: Number.NaN }];
    expect(adjustEngineerSalary(engineers, 1, 'raise')).toMatchObject({ ok: false, reason: 'not-found' });
  });
});

describe('adjustEngineerSalary: 対象の特定と不変性(#34)', () => {
  it('配列の位置と異なる id でも正しいエンジニアが変わり、同じランクの他のエンジニアは変わらない', () => {
    const engineers = [makeEngineer(5, 'junior', 0), makeEngineer(2, 'junior', 1), makeEngineer(9, 'junior', 2)];
    const result = adjustEngineerSalary(engineers, 2, 'raise');
    if (!result.ok) throw new Error(result.reason);
    expect(result.engineers.map((e) => [e.id, e.salary])).toEqual([
      [5, getInitialSalary('junior')],
      [2, getInitialSalary('junior') + ENGINEER_SALARY_STEP],
      [9, getInitialSalary('junior')],
    ]);
    expect(result.engineers[0]).toBe(engineers[0]);
    expect(result.engineers[2]).toBe(engineers[2]);
    expect(result.engineer).toBe(result.engineers[1]);
  });

  it('対象以外のフィールドは変わらず、凍結した入力も変更しない', () => {
    const target = Object.freeze({
      ...makeEngineer(1, 'middle', 4),
      personality: 'cheerful' as EngineerPersonalityId,
      salary: 450000,
      fatigue: 12.5,
      concentration: 34,
      skill: 56,
      attachment: 78,
    });
    const other = Object.freeze(makeEngineer(0, 'senior', 3));
    const engineers = Object.freeze([other, target]);
    const result = adjustEngineerSalary(engineers, 1, 'cut');
    if (!result.ok) throw new Error(result.reason);
    expect(result.engineer).toEqual({ ...target, salary: 450000 - ENGINEER_SALARY_STEP });
    expect(result.engineers[0]).toBe(other);
    expect(target.salary).toBe(450000);
    expect(engineers).toEqual([other, target]);
    expect(result.engineers).not.toBe(engineers);
  });

  it('失敗時は名簿を返さない', () => {
    const result = adjustEngineerSalary([{ ...makeEngineer(0, 'junior', 0), salary: ENGINEER_SALARY_MAX }], 0, 'raise');
    expect('engineers' in result).toBe(false);
  });
});

describe('formatSalaryMessage(#34)', () => {
  const ok = (direction: SalaryDirection): SalaryAdjustResult =>
    adjustEngineerSalary([makeEngineer(3, 'junior', 0)], 3, direction);
  it.each<[string, SalaryAdjustResult, string]>([
    ['昇給', ok('raise'), '#3 昇給: 300,000円→350,000円'],
    ['減給', ok('cut'), '#3 減給: 300,000円→250,000円'],
    ['上限', { ok: false, direction: 'raise', engineerId: 3, reason: 'at-max' }, 'これ以上昇給できません（上限 1,000,000円）'],
    ['下限', { ok: false, direction: 'cut', engineerId: 3, reason: 'at-min' }, 'これ以上減給できません（下限 100,000円）'],
    ['不正な月給', { ok: false, direction: 'raise', engineerId: 3, reason: 'invalid-salary' }, '#3 の月給が不正です'],
    ['対象なし', { ok: false, direction: 'raise', engineerId: null, reason: 'not-found' }, '対象のエンジニアがいません'],
  ])('%s', (_name, result, expected) => {
    expect(formatSalaryMessage(result)).toBe(expected);
  });

  it('結果の種類ごとに異なる文言', () => {
    const messages = [
      formatSalaryMessage(ok('raise')),
      formatSalaryMessage(ok('cut')),
      ...(['at-max', 'at-min', 'invalid-salary', 'not-found'] as const).map((reason) =>
        formatSalaryMessage({ ok: false, direction: 'raise', engineerId: 3, reason }),
      ),
    ];
    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe('selectAdjacentEngineerId(#34)', () => {
  const engineers = [makeEngineer(4, 'junior', 0), makeEngineer(7, 'junior', 1), makeEngineer(2, 'junior', 2)];
  it.each<[string, readonly Engineer[], number | null, 'previous' | 'next', number | null]>([
    ['空の名簿・次へ', [], null, 'next', null],
    ['空の名簿・前へ（id あり）', [], 4, 'previous', null],
    ['1人・次へ', [makeEngineer(4, 'junior', 0)], 4, 'next', 4],
    ['1人・前へ', [makeEngineer(4, 'junior', 0)], 4, 'previous', 4],
    ['中間から次へ', engineers, 7, 'next', 2],
    ['中間から前へ', engineers, 7, 'previous', 4],
    ['先頭から前へは末尾', engineers, 4, 'previous', 2],
    ['末尾から次へは先頭', engineers, 2, 'next', 4],
    ['先頭から次へ', engineers, 4, 'next', 7],
    ['末尾から前へ', engineers, 2, 'previous', 7],
    ['null・次へは先頭', engineers, null, 'next', 4],
    ['null・前へも先頭', engineers, null, 'previous', 4],
    ['存在しない id・次へは先頭', engineers, 99, 'next', 4],
    ['存在しない id・前へも先頭', engineers, 99, 'previous', 4],
  ])('%s', (_name, list, currentId, direction, expected) => {
    expect(selectAdjacentEngineerId(list, currentId, direction)).toBe(expected);
  });
});

describe('formatSelectedEngineerLines(#34, #156)', () => {
  it('通常の表示は2行（エンジニアのメニューの幅に収める）', () => {
    expect(formatSelectedEngineerLines(makeEngineer(3, 'junior', 0))).toEqual(['選択: #3 ジュニア', '月給 300,000円 AI: なし']);
    expect(formatSelectedEngineerLines({ ...makeEngineer(12, 'senior', 0), salary: ENGINEER_SALARY_MAX })).toEqual([
      '選択: #12 シニア',
      '月給 1,000,000円 AI: なし',
    ]);
  });
  it.each([
    ['strong', '強い'],
    ['normal', '普通'],
    ['cheap', '安い'],
  ] as const)('AIエージェント %s を付けていれば短い名前「%s」を出す(#53)', (aiAgent, name) => {
    expect(formatSelectedEngineerLines({ ...makeEngineer(3, 'junior', 0), aiAgent })).toEqual([
      '選択: #3 ジュニア',
      `月給 300,000円 AI: ${name}`,
    ]);
  });
  it('null は対象なしの1行', () => {
    expect(formatSelectedEngineerLines(null)).toEqual(['選択: 対象なし']);
  });
});

describe('エンジニアのポップオーバーの文言(#156)', () => {
  it('見出しは「#id ランク AI: 種類」、2行目は休暇の状態', () => {
    expect(formatEngineerPopoverLines(makeEngineer(5, 'middle', 0))).toEqual(['#5 ミドル AI: なし', '状態: 勤務中']);
    expect(formatEngineerPopoverLines({ ...makeEngineer(5, 'middle', 0), aiAgent: 'cheap', onVacation: true })).toEqual([
      '#5 ミドル AI: 安い',
      '状態: 休暇中',
    ]);
  });
  it('休暇ボタンは勤務中なら「休暇にする」、休暇中なら「復帰する」', () => {
    expect(formatVacationButton(makeEngineer(0, 'junior', 0))).toBe('休暇にする');
    expect(formatVacationButton({ ...makeEngineer(0, 'junior', 0), onVacation: true })).toBe('復帰する');
  });
});

describe('愛着心の時間変化(#30): advanceEngineerAttachment', () => {
  const THRESHOLD = ENGINEER_ATTACHMENT_CHANGE.highFatigueThreshold;
  const GAIN = ENGINEER_ATTACHMENT_CHANGE.vacationAttachmentGainPerGameDay;
  const LOSS = ENGINEER_ATTACHMENT_CHANGE.highFatigueAttachmentLossPerGameDay;
  const START = 50;
  const make = (
    overrides: Partial<Pick<Engineer, 'fatigue' | 'attachment' | 'onVacation' | 'routeId'>> = {},
  ): Engineer => ({ ...makeEngineer(0, 'junior', 0), attachment: START, ...overrides });

  it('仮の設定値（閾値 70、上昇・低下ともに 1/日）', () => {
    expect(ENGINEER_ATTACHMENT_CHANGE).toEqual({
      highFatigueThreshold: 70,
      vacationAttachmentGainPerGameDay: 1,
      highFatigueAttachmentLossPerGameDay: 1,
    });
    expect(MS_PER_GAME_DAY).toBe(2000);
  });

  it.each<[string, number, number]>([
    ['疲労度 0', 0, START],
    ['疲労度 69', 69, START],
    ['閾値 - 0.5', THRESHOLD - 0.5, START],
    ['閾値ちょうど（70）', THRESHOLD, START - LOSS],
    ['疲労度 71', 71, START - LOSS],
    ['疲労度 100', 100, START - LOSS],
  ])('配属済み・勤務中で %s なら 1 日後の愛着心は %s', (_label, fatigue, expected) => {
    const result = advanceEngineerAttachment(make({ fatigue }), MS_PER_GAME_DAY);
    expect(result.attachment).toBeCloseTo(expected, 10);
  });

  it.each([0, THRESHOLD - 1, THRESHOLD, 100])('休暇中は疲労度 %s でも上がる（休暇が優先）', (fatigue) => {
    const result = advanceEngineerAttachment(make({ fatigue, onVacation: true }), MS_PER_GAME_DAY);
    expect(result.attachment).toBeCloseTo(START + GAIN, 10);
  });

  it('未配属（routeId: null）なら高疲労・勤務中でも変わらない', () => {
    const engineer = make({ routeId: null, fatigue: 100 });
    expect(advanceEngineerAttachment(engineer, MS_PER_GAME_DAY)).toBe(engineer);
  });

  it('未配属でも休暇中なら上がる', () => {
    const result = advanceEngineerAttachment(make({ routeId: null, fatigue: 100, onVacation: true }), MS_PER_GAME_DAY);
    expect(result.attachment).toBeCloseTo(START + GAIN, 10);
  });

  it.each<[string, Partial<Pick<Engineer, 'fatigue' | 'attachment' | 'onVacation'>>, number]>([
    ['上昇で 99 → 100', { attachment: ENGINEER_PARAMETER_MAX - 1, onVacation: true }, ENGINEER_PARAMETER_MAX],
    ['上昇で 100 は超えない', { attachment: ENGINEER_PARAMETER_MAX, onVacation: true }, ENGINEER_PARAMETER_MAX],
    ['低下で 1 → 0', { attachment: ENGINEER_PARAMETER_MIN + 1, fatigue: 100 }, ENGINEER_PARAMETER_MIN],
    ['低下で 0 は負にならない', { attachment: ENGINEER_PARAMETER_MIN, fatigue: 100 }, ENGINEER_PARAMETER_MIN],
  ])('%s', (_label, overrides, expected) => {
    expect(advanceEngineerAttachment(make(overrides), MS_PER_GAME_DAY).attachment).toBe(expected);
  });

  it('愛着心 0 でも例外を出さずエンジニアを返す（退職は #32）', () => {
    const engineer = make({ attachment: ENGINEER_PARAMETER_MIN, fatigue: 100 });
    expect(() => advanceEngineerAttachment(engineer, MS_PER_GAME_DAY * 10)).not.toThrow();
    const result = advanceEngineerAttachment(engineer, MS_PER_GAME_DAY * 10);
    expect(result.id).toBe(engineer.id);
    expect(result.attachment).toBe(ENGINEER_PARAMETER_MIN);
  });

  it.each([0, -1, -MS_PER_GAME_DAY, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '経過時間 %s は変化なし（同じ engineer）',
    (elapsedMs) => {
      const vacation = make({ onVacation: true });
      const tired = make({ fatigue: 100 });
      expect(advanceEngineerAttachment(vacation, elapsedMs)).toBe(vacation);
      expect(advanceEngineerAttachment(tired, elapsedMs)).toBe(tired);
    },
  );

  it.each<[number, number]>([
    [1, 1 / MS_PER_GAME_DAY],
    [MS_PER_GAME_DAY / 2, 0.5],
    [MS_PER_GAME_DAY, 1],
  ])('%s ms は %s 日分の変化', (elapsedMs, days) => {
    expect(advanceEngineerAttachment(make({ onVacation: true }), elapsedMs).attachment).toBeCloseTo(START + GAIN * days, 10);
    expect(advanceEngineerAttachment(make({ fatigue: 100 }), elapsedMs).attachment).toBeCloseTo(START - LOSS * days, 10);
  });

  it.each([true, false])('2000 ms の 1 回更新と 1000 ms の 2 回更新は同じ結果（休暇中: %s）', (onVacation) => {
    const engineer = make({ onVacation, fatigue: 100 });
    const once = advanceEngineerAttachment(engineer, MS_PER_GAME_DAY);
    const twice = advanceEngineerAttachment(advanceEngineerAttachment(engineer, MS_PER_GAME_DAY / 2), MS_PER_GAME_DAY / 2);
    expect(twice.attachment).toBeCloseTo(once.attachment, 10);
  });

  it('愛着心以外のフィールドは変えず、入力も変更しない', () => {
    const engineer = make({ fatigue: 100 });
    const snapshot = { ...engineer };
    const result = advanceEngineerAttachment(engineer, MS_PER_GAME_DAY);
    expect(result).not.toBe(engineer);
    expect(engineer).toEqual(snapshot);
    const { attachment: _after, ...restAfter } = result;
    const { attachment: _before, ...restBefore } = snapshot;
    expect(restAfter).toEqual(restBefore);
  });

  it('注入した config で閾値と速度を変えられる', () => {
    const config: EngineerAttachmentChangeConfig = {
      highFatigueThreshold: 30,
      vacationAttachmentGainPerGameDay: 5,
      highFatigueAttachmentLossPerGameDay: 3,
    };
    expect(advanceEngineerAttachment(make({ fatigue: 30 }), MS_PER_GAME_DAY, config).attachment).toBeCloseTo(START - 3, 10);
    const below = make({ fatigue: 29 });
    expect(advanceEngineerAttachment(below, MS_PER_GAME_DAY, config)).toBe(below);
    expect(advanceEngineerAttachment(make({ onVacation: true }), MS_PER_GAME_DAY, config).attachment).toBeCloseTo(START + 5, 10);
  });
});

describe('愛着心の時間変化(#30): advanceEngineersAttachment', () => {
  const GAIN = ENGINEER_ATTACHMENT_CHANGE.vacationAttachmentGainPerGameDay;
  const LOSS = ENGINEER_ATTACHMENT_CHANGE.highFatigueAttachmentLossPerGameDay;

  it('空配列は空の新しい配列', () => {
    const engineers: Engineer[] = [];
    const result = advanceEngineersAttachment(engineers, MS_PER_GAME_DAY);
    expect(result).toEqual([]);
    expect(result).not.toBe(engineers);
  });

  it('休暇中・高疲労の勤務中・低疲労の勤務中・未配属を独立に更新し、順序と長さを保つ', () => {
    const engineers: Engineer[] = [
      { ...makeEngineer(0, 'junior', 0), attachment: 50, onVacation: true },
      { ...makeEngineer(1, 'middle', 1), attachment: 50, fatigue: 100 },
      { ...makeEngineer(2, 'senior', 2), attachment: 50, fatigue: 0 },
      { ...makeEngineer(3, 'junior', null), attachment: 50, fatigue: 100 },
    ];
    const snapshot = engineers.map((engineer) => ({ ...engineer }));
    const result = advanceEngineersAttachment(engineers, MS_PER_GAME_DAY);
    expect(result).not.toBe(engineers);
    expect(result.map((engineer) => engineer.id)).toEqual([0, 1, 2, 3]);
    expect(result[0].attachment).toBeCloseTo(50 + GAIN, 10);
    expect(result[1].attachment).toBeCloseTo(50 - LOSS, 10);
    expect(result[2]).toBe(engineers[2]);
    expect(result[3]).toBe(engineers[3]);
    expect(engineers).toEqual(snapshot);
  });
});

describe('愛着心の時間変化(#30): 休暇の開始・終了との組み合わせ', () => {
  const GAIN = ENGINEER_ATTACHMENT_CHANGE.vacationAttachmentGainPerGameDay;
  const LOSS = ENGINEER_ATTACHMENT_CHANGE.highFatigueAttachmentLossPerGameDay;

  it('休暇開始後は上がり、休暇終了後に高疲労なら下がる', () => {
    const start: Engineer[] = [{ ...makeEngineer(0, 'junior', 0), attachment: 50, fatigue: 100 }];
    const working = advanceEngineersAttachment(start, MS_PER_GAME_DAY);
    expect(working[0].attachment).toBeCloseTo(50 - LOSS, 10);
    const onVacation = advanceEngineersAttachment(setEngineerVacation(working, 0, true), MS_PER_GAME_DAY);
    expect(onVacation[0].attachment).toBeCloseTo(50 - LOSS + GAIN, 10);
    const back = advanceEngineersAttachment(setEngineerVacation(onVacation, 0, false), MS_PER_GAME_DAY);
    expect(back[0].attachment).toBeCloseTo(50 - LOSS + GAIN - LOSS, 10);
  });
});

describe('月給の初期額 initialSalary(#31)', () => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
  const ranks: EngineerRank[] = ['junior', 'middle', 'senior'];

  it('初期エンジニアの initialSalary と salary はランクの月給と同じ', () => {
    const engineers = createInitialEngineers(routes, ranks);
    engineers.forEach((engineer, index) => {
      expect(engineer.initialSalary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK[ranks[index]]);
      expect(engineer.salary).toBe(engineer.initialSalary);
    });
  });
  it.each(ranks)('雇った %s の initialSalary と salary はランクの月給と同じ', (rank) => {
    const result = hireEngineer({ engineers: [], funds: ENGINEER_HIRE_COST[rank], nextId: 0 }, rank, rules, () => 0.5);
    if (!result.ok) throw new Error(result.reason);
    expect(result.engineer.initialSalary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK[rank]);
    expect(result.engineer.salary).toBe(result.engineer.initialSalary);
    expect(result.engineer.initialSalary).toBe(getInitialSalary(rank));
  });
  it.each(['raise', 'cut'] as const)('adjustEngineerSalary(%s) は initialSalary を変えない', (direction) => {
    const engineer = makeEngineer(0, 'middle', 0);
    const result = adjustEngineerSalary([engineer], 0, direction);
    if (!result.ok) throw new Error(result.reason);
    expect(result.engineer.salary).not.toBe(engineer.salary);
    expect(result.engineer.initialSalary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK.middle);
  });
});

// 愛着心だけを差し替えたエンジニア（退職 #32 の判定用）。clamp を通さずに範囲外・NaN も作れる。
const withAttachment = (engineer: Engineer, attachment: number): Engineer => ({ ...engineer, attachment });

describe('自主退職(#32): shouldResign（境界値）', () => {
  it.each([ENGINEER_PARAMETER_MIN, -0.0001, -1, -Infinity])('愛着心 %d なら退職する', (attachment) => {
    expect(shouldResign(withAttachment(makeEngineer(0, 'junior', 0), attachment))).toBe(true);
  });

  it.each([Number.MIN_VALUE, 0.0001, 1, 50, ENGINEER_PARAMETER_MAX, NaN])('愛着心 %d なら退職しない', (attachment) => {
    expect(shouldResign(withAttachment(makeEngineer(0, 'junior', 0), attachment))).toBe(false);
  });

  it('最低値は 0（新しいしきい値は作らず ENGINEER_PARAMETER_MIN を使う）', () => {
    expect(ENGINEER_PARAMETER_MIN).toBe(0);
  });

  it('adjustEngineerParameter で正の値からちょうど 0 に下げると退職する', () => {
    const engineer = adjustEngineerParameter(withAttachment(makeEngineer(0, 'junior', 0), 10), 'attachment', -10);
    expect(engineer.attachment).toBe(ENGINEER_PARAMETER_MIN);
    expect(shouldResign(engineer)).toBe(true);
  });

  it('adjustEngineerParameter で 0 未満まで下げても 0 に止まり、退職する', () => {
    const engineer = adjustEngineerParameter(withAttachment(makeEngineer(0, 'junior', 0), 10), 'attachment', -11);
    expect(engineer.attachment).toBe(ENGINEER_PARAMETER_MIN);
    expect(shouldResign(engineer)).toBe(true);
  });

  it('adjustEngineerParameter で最低値の直前（0.0001）までなら退職しない', () => {
    const engineer = adjustEngineerParameter(withAttachment(makeEngineer(0, 'junior', 0), 10), 'attachment', -9.9999);
    expect(engineer.attachment).toBeGreaterThan(ENGINEER_PARAMETER_MIN);
    expect(shouldResign(engineer)).toBe(false);
  });

  it('入力を変更しない', () => {
    const engineer = withAttachment(makeEngineer(0, 'junior', 0), 0);
    const snapshot = structuredClone(engineer);
    shouldResign(engineer);
    expect(engineer).toEqual(snapshot);
  });
});

describe('自主退職(#32): partitionResignedEngineers', () => {
  const resigning = (id: number, routeId: number | null = id): Engineer =>
    withAttachment(makeEngineer(id, 'junior', routeId), ENGINEER_PARAMETER_MIN);

  it('空配列なら両方とも空', () => {
    expect(partitionResignedEngineers([])).toEqual({ remaining: [], resigned: [] });
  });

  it('退職者がいなければ全員が残り、参照と順序を保つ', () => {
    const engineers = makeEngineers(3);
    const result = partitionResignedEngineers(engineers);
    expect(result.resigned).toEqual([]);
    expect(result.remaining).toHaveLength(3);
    result.remaining.forEach((engineer, i) => expect(engineer).toBe(engineers[i]));
    expect(result.remaining).not.toBe(engineers);
  });

  it.each([
    ['先頭', 0],
    ['中間', 1],
    ['末尾', 2],
  ])('%sの1人だけ退職する', (_label, index) => {
    const engineers = makeEngineers(3).map((engineer, i) => (i === index ? resigning(engineer.id) : engineer));
    const result = partitionResignedEngineers(engineers);
    expect(result.resigned).toEqual([engineers[index]]);
    expect(result.resigned[0]).toBe(engineers[index]);
    const expected = engineers.filter((_, i) => i !== index);
    expect(result.remaining).toHaveLength(2);
    result.remaining.forEach((engineer, i) => expect(engineer).toBe(expected[i]));
  });

  it('複数人が退職すると、どちらも元の順序を保つ', () => {
    const engineers = [makeEngineer(0, 'junior', 0), resigning(1), makeEngineer(2, 'middle', 2), resigning(3), resigning(4)];
    const result = partitionResignedEngineers(engineers);
    expect(result.resigned.map((engineer) => engineer.id)).toEqual([1, 3, 4]);
    expect(result.remaining.map((engineer) => engineer.id)).toEqual([0, 2]);
  });

  it('全員が退職すると残りは空', () => {
    const engineers = [resigning(0), resigning(1), resigning(2)];
    const result = partitionResignedEngineers(engineers);
    expect(result.remaining).toEqual([]);
    expect(result.resigned.map((engineer) => engineer.id)).toEqual([0, 1, 2]);
  });

  it('最後の1人が退職すると残りは空', () => {
    const result = partitionResignedEngineers([resigning(5)]);
    expect(result.remaining).toEqual([]);
    expect(result.resigned.map((engineer) => engineer.id)).toEqual([5]);
  });

  it('ルートを持たない（routeId: null）エンジニアも退職し、routeId は null のまま', () => {
    const result = partitionResignedEngineers([makeEngineer(0, 'junior', 0), resigning(1, null)]);
    expect(result.resigned).toHaveLength(1);
    expect(result.resigned[0]?.routeId).toBeNull();
    expect(result.remaining.map((engineer) => engineer.id)).toEqual([0]);
  });

  it('入力の配列とエンジニアを変更しない', () => {
    const engineers = [makeEngineer(0, 'junior', 0), resigning(1), makeEngineer(2, 'senior', 2)];
    const snapshot = structuredClone(engineers);
    const before = [...engineers];
    partitionResignedEngineers(engineers);
    expect(engineers).toEqual(snapshot);
    engineers.forEach((engineer, i) => expect(engineer).toBe(before[i]));
  });

  it(`上限（${MAX_ENGINEERS}人）から1人退職すると、また雇える`, () => {
    const engineers = makeEngineers(MAX_ENGINEERS).map((engineer, i) => (i === 0 ? resigning(engineer.id) : engineer));
    expect(hireEngineer({ engineers, funds: RICH, nextId: MAX_ENGINEERS }, 'junior', rules)).toEqual({
      ok: false,
      reason: 'limit',
    });
    const { remaining } = partitionResignedEngineers(engineers);
    expect(remaining).toHaveLength(MAX_ENGINEERS - 1);
    const result = hireEngineer({ engineers: remaining, funds: RICH, nextId: MAX_ENGINEERS }, 'junior', rules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.engineers).toHaveLength(MAX_ENGINEERS);
      expect(result.engineer.id).toBe(MAX_ENGINEERS);
    }
  });

  it('全員が退職して0人になっても雇える', () => {
    const { remaining } = partitionResignedEngineers([resigning(0), resigning(1)]);
    const result = hireEngineer({ engineers: remaining, funds: RICH, nextId: 2 }, 'senior', rules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.engineers).toHaveLength(1);
      expect(result.engineer.id).toBe(2);
    }
  });
});

describe('自主退職(#32): formatResignedMessage', () => {
  it('id とランク名を出す', () => {
    expect(formatResignedMessage(makeEngineer(3, 'senior', 3))).toBe(`#3 ${getRankLabel('senior')}が退職しました`);
  });
});

describe('ランク・性格の表示名（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('ランクの表示名', () => {
    expect(ENGINEER_RANKS.map((rank) => getRankLabel(rank.id))).toEqual(['Junior', 'Mid', 'Senior']);
  });

  it('性格の表示名は8種で重複がない', () => {
    const labels = ENGINEER_PERSONALITIES.map((p) => getPersonalityLabel(p.id));
    expect(labels).toEqual(['Meticulous', 'Passive', 'Careless', 'Slacker', 'Earnest', 'Composed', 'Cheerful', 'Gloomy']);
    expect(new Set(labels).size).toBe(ENGINEER_PERSONALITIES.length);
  });
});

describe('エンジニアの文言（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('人数・雇うボタン・雇用メッセージ', () => {
    expect(formatEngineerCount(3, 9)).toBe('Engineers: 3/9');
    expect(formatHireOption('junior', 100000)).toBe('Hire Junior ¥100K');
    expect(formatHireOption('senior', 300000)).toBe('Hire Senior ¥300K');
    const state = { engineers: makeEngineers(3), funds: RICH, nextId: 3 };
    expect(formatHireMessage(hireEngineer(state, 'junior', rules), 'junior')).toBe('Hired a Junior');
    expect(formatHireMessage(hireEngineer({ ...state, engineers: makeEngineers(9) }, 'junior', rules), 'junior')).toBe(
      "Can't hire any more",
    );
    expect(formatHireMessage(hireEngineer({ ...state, funds: 0 }, 'junior', rules), 'junior')).toBe('Not enough funds');
    expect(formatHireMessage(hireEngineer(state, 'lead', rules), 'lead')).toBe('Unknown rank: lead');
  });

  it('退職のメッセージ', () => {
    expect(formatResignedMessage(makeEngineer(3, 'senior', 3))).toBe('#3 Senior resigned');
  });

  it.each<[string, SalaryAdjustResult, string]>([
    ['昇給', adjustEngineerSalary([makeEngineer(3, 'junior', 0)], 3, 'raise'), '#3 Raise: ¥300,000→¥350,000'],
    ['減給', adjustEngineerSalary([makeEngineer(3, 'junior', 0)], 3, 'cut'), '#3 Cut: ¥300,000→¥250,000'],
    ['上限', { ok: false, direction: 'raise', engineerId: 3, reason: 'at-max' }, "Can't raise any further (max ¥1,000,000)"],
    ['下限', { ok: false, direction: 'cut', engineerId: 3, reason: 'at-min' }, "Can't cut any further (min ¥100,000)"],
    ['不正な月給', { ok: false, direction: 'raise', engineerId: 3, reason: 'invalid-salary' }, "#3's salary is invalid"],
    ['対象なし', { ok: false, direction: 'raise', engineerId: null, reason: 'not-found' }, 'No engineer selected'],
  ])('昇給・減給の結果: %s', (_name, result, expected) => {
    expect(formatSalaryMessage(result)).toBe(expected);
  });

  it('選択中のエンジニアの2行と、対象なしの1行', () => {
    expect(formatSelectedEngineerLines(makeEngineer(3, 'junior', 0))).toEqual(['Selected: #3 Junior', 'Salary ¥300,000 AI: None']);
    expect(formatSelectedEngineerLines({ ...makeEngineer(3, 'junior', 0), aiAgent: 'strong' })[1]).toBe(
      'Salary ¥300,000 AI: Strong',
    );
    expect(formatSelectedEngineerLines(null)).toEqual(['Selected: none']);
  });

  it('ポップオーバーの見出し・状態・休暇ボタン', () => {
    expect(formatEngineerPopoverLines(makeEngineer(5, 'middle', 0))).toEqual(['#5 Mid AI: None', 'Status: Working']);
    const resting: Engineer = { ...makeEngineer(5, 'middle', 0), aiAgent: 'cheap', onVacation: true };
    expect(formatEngineerPopoverLines(resting)).toEqual(['#5 Mid AI: Budget', 'Status: On vacation']);
    expect(formatVacationButton(makeEngineer(0, 'junior', 0))).toBe('Send on vacation');
    expect(formatVacationButton(resting)).toBe('Back to work');
  });

  it('休暇の案内文は3行で、数値は四捨五入した整数（0.004 → 0、0.005 → 1）', () => {
    expect(formatVacationHint()).toEqual([
      'Vacation button: leave/return (paid)',
      'Bad code -10pts each, max -20, min 5%',
      'Effect stays; no code while on leave',
    ]);
    expect(formatVacationHint(0.004, 0.004, 0.004)[1]).toBe('Bad code -0pts each, max -0, min 0%');
    expect(formatVacationHint(0.005, 0.005, 0.005)[1]).toBe('Bad code -1pts each, max -1, min 1%');
  });
});
