import { describe, expect, it } from 'vitest';
import {
  ENGINEER_HIRE_COST,
  ENGINEER_INITIAL_PARAMETERS,
  ENGINEER_PARAMETER_FALLBACK,
  ENGINEER_PARAMETER_MAX,
  ENGINEER_PARAMETER_MIN,
  ENGINEER_PERSONALITIES,
  ENGINEER_PERSONALITY_WEIGHTS,
  ENGINEER_RANKS,
  ENGINEER_SPAWN_CELLS,
  INITIAL_ENGINEER_RANKS,
  MAX_ENGINEER_ROUTES,
  MAX_ENGINEERS,
} from './config';
import {
  adjustEngineerParameter,
  assignEngineerRoute,
  clampEngineerParameter,
  createEngineerParameters,
  createInitialEngineers,
  createInitialFleet,
  findEngineerByRoute,
  findRouteIdOfEngineer,
  getPersonalityLabel,
  shouldAddRouteOnHire,
  formatEngineerCount,
  formatHireButton,
  formatHireMessage,
  hireEngineer,
  isEngineerRank,
  pickRandomPersonality,
  updateEngineerParameters,
} from './engineer';
import type {
  Engineer,
  EngineerParameterKey,
  EngineerPersonalityId,
  EngineerRank,
  HireRules,
} from './engineer';
import { addRoute, createRoutes, nextSpawnCell } from './route';
import { checkBankruptcy, INITIAL_GAME_OVER_STATE } from './gameOver';

const rules: HireRules = { max: MAX_ENGINEERS, costs: ENGINEER_HIRE_COST };
const makeEngineer = (id: number, rank: EngineerRank, routeId: number | null): Engineer => ({
  id,
  rank,
  routeId,
  personality: 'meticulous',
  ...createEngineerParameters(rank),
});
const makeEngineers = (count: number): Engineer[] =>
  Array.from({ length: count }, (_, id) => makeEngineer(id, 'junior', id));
const RICH = 100_000_000;

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
      expect(engineer).toMatchObject(ENGINEER_INITIAL_PARAMETERS[engineer.rank]);
    }
    const changed = updateEngineerParameters(fleet.engineers[0], { fatigue: 80 });
    expect(changed.fatigue).toBe(80);
    expect(fleet.engineers[0].fatigue).toBe(ENGINEER_INITIAL_PARAMETERS.junior.fatigue);
    expect(fleet.engineers[1].fatigue).toBe(ENGINEER_INITIAL_PARAMETERS.junior.fatigue);
  });
  it('createInitialEngineers はランク指定どおりの初期値', () => {
    const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0.5);
    const engineers = createInitialEngineers(routes, ['senior', 'middle', 'junior']);
    expect(engineers.map((e) => e.skill)).toEqual(
      (['senior', 'middle', 'junior'] as const).map((r) => ENGINEER_INITIAL_PARAMETERS[r].skill),
    );
  });
  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s を雇った人は設定表どおりで、毎回別オブジェクト', (rank) => {
    const state = { engineers: makeEngineers(3), funds: RICH, nextId: 3 };
    const first = hireEngineer(state, rank, rules);
    const second = hireEngineer(state, rank, rules);
    if (!first.ok || !second.ok) throw new Error('雇えるはず');
    expect(first.engineer).toMatchObject(ENGINEER_INITIAL_PARAMETERS[rank]);
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
    expect(ENGINEER_PERSONALITIES.map((p) => p.label)).toEqual([
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
    expect(new Set(ENGINEER_PERSONALITIES.map((p) => p.label)).size).toBe(COUNT);
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
  it('性格が違っても初期パラメータは設定表どおり', () => {
    for (const [i, id] of PERSONALITY_IDS.entries()) {
      const hired = hireEngineer(
        { engineers: [], funds: RICH, nextId: 0 },
        'middle',
        rules,
        () => (i + 0.5) / COUNT,
      );
      if (!hired.ok) throw new Error('雇えるはず');
      expect(hired.engineer.personality).toBe(id);
      const { personality: _personality, id: _id, rank: _rank, routeId: _routeId, ...parameters } = hired.engineer;
      expect(parameters).toEqual(ENGINEER_INITIAL_PARAMETERS.middle);
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
