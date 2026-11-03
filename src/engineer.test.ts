import { describe, expect, it } from 'vitest';
import {
  ENGINEER_HIRE_COST,
  ENGINEER_RANKS,
  ENGINEER_SPAWN_CELLS,
  INITIAL_ENGINEER_RANKS,
  MAX_ENGINEER_ROUTES,
  MAX_ENGINEERS,
} from './config';
import {
  createInitialEngineers,
  formatEngineerCount,
  formatHireButton,
  formatHireMessage,
  hireEngineer,
  isEngineerRank,
} from './engineer';
import type { Engineer, EngineerRank, HireRules } from './engineer';
import { createRoutes } from './route';

const rules: HireRules = { max: MAX_ENGINEERS, costs: ENGINEER_HIRE_COST };
const makeEngineers = (count: number): Engineer[] =>
  Array.from({ length: count }, (_, id) => ({ id, rank: 'junior', routeId: id }));
const RICH = 100_000_000;

describe('hireEngineer: ランクごとに雇える', () => {
  it.each<[EngineerRank, number]>([
    ['junior', 100000],
    ['middle', 200000],
    ['senior', 300000],
  ])('%s を雇うと費用 %i 円が引かれる', (rank, cost) => {
    const result = hireEngineer({ engineers: makeEngineers(3), funds: 1000000, nextId: 3 }, rank, rules);
    expect(result).toEqual({
      ok: true,
      engineer: { id: 3, rank, routeId: null },
      engineers: [...makeEngineers(3), { id: 3, rank, routeId: null }],
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
    expect(ENGINEER_RANKS.map((rank) => rank.label)).toEqual(['ジュニア', 'ミドル', 'シニア']);
  });
  it('id・表示名に重複がない', () => {
    expect(new Set(ENGINEER_RANKS.map((rank) => rank.id)).size).toBe(ENGINEER_RANKS.length);
    expect(new Set(ENGINEER_RANKS.map((rank) => rank.label)).size).toBe(ENGINEER_RANKS.length);
  });
  it('全ランクに正の費用があり、ランクが上がるほど高い', () => {
    const costs = ENGINEER_RANKS.map((rank) => ENGINEER_HIRE_COST[rank.id]);
    expect(costs.every((cost) => cost > 0)).toBe(true);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe('表示用の文字列', () => {
  it('人数', () => {
    expect(formatEngineerCount(3, 9)).toBe('エンジニア: 3/9');
  });
  it('ボタン', () => {
    expect(formatHireButton(0, 'junior', 100000)).toBe('[1] ジュニア 10万円');
    expect(formatHireButton(2, 'senior', 300000)).toBe('[3] シニア 30万円');
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
