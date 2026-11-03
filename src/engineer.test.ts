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
  assignEngineerRoute,
  createInitialEngineers,
  createInitialFleet,
  findEngineerByRoute,
  findRouteIdOfEngineer,
  shouldAddRouteOnHire,
  formatEngineerCount,
  formatHireButton,
  formatHireMessage,
  hireEngineer,
  isEngineerRank,
} from './engineer';
import type { Engineer, EngineerRank, HireRules } from './engineer';
import { addRoute, createRoutes, nextSpawnCell } from './route';
import { checkBankruptcy, INITIAL_GAME_OVER_STATE } from './gameOver';
import { getEngineerSalaries } from './salary';
import { ENGINEER_MONTHLY_SALARY } from './config';

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

describe('assignEngineerRoute', () => {
  it('該当 id のエンジニアだけ routeId が変わり、他は同じ参照のまま', () => {
    const engineers: Engineer[] = [...makeEngineers(3), { id: 3, rank: 'senior', routeId: null }];
    const result = assignEngineerRoute(engineers, 3, 7);
    expect(result[3]).toEqual({ id: 3, rank: 'senior', routeId: 7 });
    expect(result.slice(0, 3).every((e, i) => e === engineers[i])).toBe(true);
  });
  it('該当 id がなければ同じ内容の配列', () => {
    const engineers = makeEngineers(3);
    expect(assignEngineerRoute(engineers, 99, 5)).toEqual(engineers);
  });
  it('入力の配列とエンジニアを変更しない', () => {
    const engineers: Engineer[] = [{ id: 0, rank: 'junior', routeId: null }];
    const snapshot = structuredClone(engineers);
    const result = assignEngineerRoute(engineers, 0, 4);
    expect(engineers).toEqual(snapshot);
    expect(result).not.toBe(engineers);
  });
});

describe('findEngineerByRoute / findRouteIdOfEngineer', () => {
  const engineers: Engineer[] = [...makeEngineers(2), { id: 2, rank: 'middle', routeId: null }];
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

  it.each([
    [3, 900000],
    [4, 1200000],
    [9, 2700000],
  ])('ルート%i本の月給の合計は %i 円', (count, total) => {
    const sum = getEngineerSalaries(count, ENGINEER_MONTHLY_SALARY).reduce((a, b) => a + b, 0);
    expect(sum).toBe(total);
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
