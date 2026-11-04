import { describe, expect, it } from 'vitest';
import {
  CODE_MALICIOUS_RATE,
  CODE_MALICIOUS_RATE_INCREMENT,
  CODE_MALICIOUS_RATE_MAX,
  CODE_SPEED,
  CODE_SPEED_INCREMENT,
  CODE_SPEED_MAX,
  DIFFICULTY_STEP_MS,
  ENGINEER_HIRE_COST,
  ENGINEER_RANKS,
  MAX_ENGINEERS,
  PLAYER_SPEED,
} from './config';
import { pickCodeKind } from './codeFlow';
import { codeSpeedAt, maliciousRateAt, maliciousRateForRank } from './difficulty';
import {
  assignEngineerRoute,
  createEngineerParameters,
  createInitialFleet,
  findEngineerByRoute,
  getInitialSalary,
  hireEngineer,
} from './engineer';
import type { Engineer, EngineerRank } from './engineer';

const STEP = DIFFICULTY_STEP_MS;
// 上限に達する段階（切り上げ）。
const speedCapStep = Math.ceil((CODE_SPEED_MAX - CODE_SPEED) / CODE_SPEED_INCREMENT);
const rateCapStep = Math.ceil((CODE_MALICIOUS_RATE_MAX - CODE_MALICIOUS_RATE) / CODE_MALICIOUS_RATE_INCREMENT - 1e-9);

describe('codeSpeedAt（コード速度）', () => {
  it('0ms は開始値', () => {
    expect(codeSpeedAt(0)).toBe(CODE_SPEED);
  });

  it.each([
    ['直前(間隔-1ms)', STEP - 1, 0],
    ['ちょうど', STEP, 1],
    ['直後(+1ms)', STEP + 1, 1],
    ['2段階目の直前', STEP * 2 - 1, 1],
    ['2段階目の直後', STEP * 2 + 1, 2],
  ])('段階の切替: %s', (_label, ms, step) => {
    expect(codeSpeedAt(ms)).toBeCloseTo(CODE_SPEED + step * CODE_SPEED_INCREMENT);
  });

  it('上限に達する直前の段階は上限未満', () => {
    const v = codeSpeedAt(STEP * (speedCapStep - 1));
    expect(v).toBeCloseTo(CODE_SPEED + (speedCapStep - 1) * CODE_SPEED_INCREMENT);
    expect(v).toBeLessThan(CODE_SPEED_MAX);
  });

  it('上限ちょうどに達する', () => {
    expect(codeSpeedAt(STEP * speedCapStep)).toBeCloseTo(CODE_SPEED_MAX);
  });

  it('上限を超えた後は増えない', () => {
    expect(codeSpeedAt(STEP * (speedCapStep + 1))).toBeCloseTo(CODE_SPEED_MAX);
    expect(codeSpeedAt(STEP * (speedCapStep + 100))).toBeCloseTo(CODE_SPEED_MAX);
  });

  it('非常に大きい elapsedMs でも上限', () => {
    expect(codeSpeedAt(Number.MAX_SAFE_INTEGER)).toBeCloseTo(CODE_SPEED_MAX);
  });

  it.each([-1, -STEP, NaN, Infinity, -Infinity])('%s は開始値', (ms) => {
    expect(codeSpeedAt(ms)).toBe(CODE_SPEED);
  });

  it('単調非減少', () => {
    let prev = codeSpeedAt(0);
    for (let ms = 0; ms <= STEP * (speedCapStep + 3); ms += STEP / 3) {
      const v = codeSpeedAt(ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('省略可能引数で開始値・増加量・上限・間隔を差し替えられる', () => {
    expect(codeSpeedAt(1000, 10, 5, 100, 1000)).toBeCloseTo(15);
    expect(codeSpeedAt(999, 10, 5, 100, 1000)).toBeCloseTo(10);
    expect(codeSpeedAt(1000000, 10, 5, 100, 1000)).toBeCloseTo(100);
  });
});

describe('maliciousRateAt（不正コード率）', () => {
  it('0ms は開始値', () => {
    expect(maliciousRateAt(0)).toBe(CODE_MALICIOUS_RATE);
  });

  it.each([
    ['直前(間隔-1ms)', STEP - 1, 0],
    ['ちょうど', STEP, 1],
    ['直後(+1ms)', STEP + 1, 1],
    ['2段階目の直前', STEP * 2 - 1, 1],
    ['2段階目の直後', STEP * 2 + 1, 2],
  ])('段階の切替: %s', (_label, ms, step) => {
    expect(maliciousRateAt(ms)).toBeCloseTo(CODE_MALICIOUS_RATE + step * CODE_MALICIOUS_RATE_INCREMENT);
  });

  it('上限に達する直前の段階は上限未満', () => {
    const v = maliciousRateAt(STEP * (rateCapStep - 1));
    expect(v).toBeCloseTo(CODE_MALICIOUS_RATE + (rateCapStep - 1) * CODE_MALICIOUS_RATE_INCREMENT);
    expect(v).toBeLessThan(CODE_MALICIOUS_RATE_MAX);
  });

  it('上限ちょうどに達する', () => {
    expect(maliciousRateAt(STEP * rateCapStep)).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
  });

  it('上限を超えた後は増えない', () => {
    expect(maliciousRateAt(STEP * (rateCapStep + 1))).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
    expect(maliciousRateAt(STEP * (rateCapStep + 100))).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
  });

  it('非常に大きい elapsedMs でも上限', () => {
    expect(maliciousRateAt(Number.MAX_SAFE_INTEGER)).toBeCloseTo(CODE_MALICIOUS_RATE_MAX);
  });

  it.each([-1, -STEP, NaN, Infinity, -Infinity])('%s は開始値', (ms) => {
    expect(maliciousRateAt(ms)).toBe(CODE_MALICIOUS_RATE);
  });

  it('開始値 0%（引数で指定）から始まり、増えていく', () => {
    expect(maliciousRateAt(0, 0)).toBe(0);
    expect(maliciousRateAt(STEP - 1, 0)).toBe(0);
    expect(maliciousRateAt(STEP, 0)).toBeCloseTo(CODE_MALICIOUS_RATE_INCREMENT);
  });

  it('常に [0,1] に収まる', () => {
    for (const ms of [0, STEP, STEP * 5, STEP * 1000, Number.MAX_SAFE_INTEGER, -1, NaN, Infinity]) {
      const v = maliciousRateAt(ms);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // 引数で上限・開始値が範囲外でも [0,1] に収める。
    expect(maliciousRateAt(STEP * 100, 0.9, 0.5, 5)).toBe(1);
    expect(maliciousRateAt(0, -0.5, 0.1, 1)).toBe(0);
  });

  it('単調非減少', () => {
    let prev = maliciousRateAt(0);
    for (let ms = 0; ms <= STEP * (rateCapStep + 3); ms += STEP / 3) {
      const v = maliciousRateAt(ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('省略可能引数で開始値・増加量・上限・間隔を差し替えられる', () => {
    expect(maliciousRateAt(1000, 0.1, 0.05, 0.9, 1000)).toBeCloseTo(0.15);
    expect(maliciousRateAt(999, 0.1, 0.05, 0.9, 1000)).toBeCloseTo(0.1);
    expect(maliciousRateAt(1000000, 0.1, 0.05, 0.9, 1000)).toBeCloseTo(0.9);
  });
});

// ランク別の不正コード率(#12)。開始値・上限は ENGINEER_RANKS から取り、値をハードコードしない。
const RANKS = ENGINEER_RANKS.map((rank) => [rank.id, rank] as const);
// そのランクの上限に達する段階（切り上げ）。
const rankCapStep = (rank: (typeof ENGINEER_RANKS)[number]): number =>
  Math.ceil((rank.maliciousRateMax - rank.maliciousRate) / CODE_MALICIOUS_RATE_INCREMENT - 1e-9);

describe('maliciousRateForRank（ランク別の不正コード率・境界値）', () => {
  it.each(RANKS)('%s: 0ms は開始値', (id, rank) => {
    expect(maliciousRateForRank(id, 0)).toBeCloseTo(rank.maliciousRate);
  });

  it.each(RANKS)('%s: 段階の切替（間隔-1ms / ちょうど / +1ms）', (id, rank) => {
    expect(maliciousRateForRank(id, STEP - 1)).toBeCloseTo(rank.maliciousRate);
    expect(maliciousRateForRank(id, STEP)).toBeCloseTo(rank.maliciousRate + CODE_MALICIOUS_RATE_INCREMENT);
    expect(maliciousRateForRank(id, STEP + 1)).toBeCloseTo(rank.maliciousRate + CODE_MALICIOUS_RATE_INCREMENT);
  });

  it.each(RANKS)('%s: 上限到達の直前(-1ms)は上限未満、ちょうど・直後(+1ms)・十分後は上限', (id, rank) => {
    const capMs = STEP * rankCapStep(rank);
    const before = maliciousRateForRank(id, capMs - 1);
    expect(before).toBeCloseTo(rank.maliciousRate + (rankCapStep(rank) - 1) * CODE_MALICIOUS_RATE_INCREMENT);
    expect(before).toBeLessThan(rank.maliciousRateMax);
    expect(maliciousRateForRank(id, capMs)).toBeCloseTo(rank.maliciousRateMax);
    expect(maliciousRateForRank(id, capMs + 1)).toBeCloseTo(rank.maliciousRateMax);
    expect(maliciousRateForRank(id, STEP * (rankCapStep(rank) + 100))).toBeCloseTo(rank.maliciousRateMax);
    expect(maliciousRateForRank(id, Number.MAX_SAFE_INTEGER)).toBeCloseTo(rank.maliciousRateMax);
  });

  // 叩き台の値（企画書 6）での具体的な境界。値を変えたらこの表も見直す。
  it.each([
    ['junior', 299999, 0.58],
    ['junior', 300000, 0.6],
    ['middle', 299999, 0.43],
    ['middle', 300000, 0.45],
    ['senior', 209999, 0.22],
    ['senior', 210000, 0.24],
    ['senior', 239999, 0.24],
    // 段階 8 の計算値 0.26 は上限 0.25 で止まる。
    ['senior', 240000, 0.25],
  ] as const)('%s: %sms は %s', (id, ms, expected) => {
    expect(maliciousRateForRank(id, ms)).toBeCloseTo(expected);
  });

  it.each(RANKS.flatMap(([id, rank]) => [-1, -STEP, NaN, Infinity, -Infinity].map((ms) => [id, ms, rank] as const)))(
    '%s: %s ms は開始値',
    (id, ms, rank) => {
      expect(maliciousRateForRank(id, ms)).toBeCloseTo(rank.maliciousRate);
    },
  );

  it.each([
    ['0ms', 0],
    ['途中の段階', STEP * 3],
    ['全ランクが上限に達した後', STEP * Math.max(...ENGINEER_RANKS.map(rankCapStep))],
  ])('%s: ジュニア > ミドル > シニア', (_label, ms) => {
    const junior = maliciousRateForRank('junior', ms);
    const middle = maliciousRateForRank('middle', ms);
    const senior = maliciousRateForRank('senior', ms);
    expect(junior).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(senior);
  });

  it.each([
    0,
    STEP - 1,
    STEP,
    STEP * rateCapStep - 1,
    STEP * rateCapStep,
    STEP * (rateCapStep + 1),
    -1,
    NaN,
    Infinity,
    -Infinity,
  ])(
    'ランクなし（担当者がいない）: %s ms は既定の maliciousRateAt と同じ',
    (ms) => {
      expect(maliciousRateForRank(undefined, ms)).toBe(maliciousRateAt(ms));
    },
  );

  it('ランク表に存在しないランクは例外（共通率へフォールバックしない）', () => {
    expect(() => maliciousRateForRank('x' as never, 0)).toThrow(new Error('ランク表に存在しないランクです: x'));
  });
});

describe('ランク別の不正コード率で種類を決める（pickCodeKind との接続・境界値）', () => {
  const ms = STEP * 2;

  it.each(RANKS)('%s: random = rate - ε は不正、rate・rate + ε は正常', (id) => {
    const rate = maliciousRateForRank(id, ms);
    expect(pickCodeKind(() => rate - 1e-9, rate)).toBe('malicious');
    expect(pickCodeKind(() => rate, rate)).toBe('normal');
    expect(pickCodeKind(() => rate + 1e-9, rate)).toBe('normal');
  });

  // 時間軸上の境界。期待値は叩き台の値（企画書 6）。値を変えたらこの表も見直す。
  it.each([
    ['junior', '段階の切替の直前(間隔-1ms)', STEP - 1, 0.4],
    ['junior', '段階の切替ちょうど', STEP, 0.42],
    ...ENGINEER_RANKS.map(
      (rank) => [rank.id, '上限到達後', STEP * (rankCapStep(rank) + 1), rank.maliciousRateMax] as const,
    ),
  ] as const)('%s: %s（%s ms、率 %s）で rate - ε は不正、rate・rate + ε は正常', (id, _label, ms, expected) => {
    const rate = maliciousRateForRank(id, ms);
    expect(rate).toBeCloseTo(expected);
    expect(pickCodeKind(() => rate - 1e-9, rate)).toBe('malicious');
    expect(pickCodeKind(() => rate, rate)).toBe('normal');
    expect(pickCodeKind(() => rate + 1e-9, rate)).toBe('normal');
  });

  const makeEngineer = (id: number, rank: EngineerRank, routeId: number | null): Engineer => ({
    id,
    rank,
    routeId,
    personality: 'meticulous',
    salary: getInitialSalary(rank),
    ...createEngineerParameters(rank, 'meticulous'),
  });
  // ルート 0〜2 に別ランクの担当者、ルート 3 は担当者なし。routeId: null の人はどのルートにも影響しない。
  const engineers: readonly Engineer[] = [
    makeEngineer(1, 'junior', 0),
    makeEngineer(2, 'middle', 1),
    makeEngineer(3, 'senior', 2),
    makeEngineer(4, 'junior', null),
  ];
  const rateOfRoute = (routeId: number): number =>
    maliciousRateForRank(findEngineerByRoute(engineers, routeId)?.rank, ms);

  it.each([
    [0, 'junior'],
    [1, 'middle'],
    [2, 'senior'],
  ] as const)('ルート %s は担当(%s)のランク別の割合', (routeId, rank) => {
    expect(rateOfRoute(routeId)).toBe(maliciousRateForRank(rank, ms));
  });

  it('担当者がいないルートは既定の割合（routeId: null の人は影響しない）', () => {
    expect(rateOfRoute(3)).toBe(maliciousRateAt(ms));
  });

  it('担当者がいないルートの境界: rate - ε は不正、rate は正常', () => {
    const rate = rateOfRoute(3);
    expect(pickCodeKind(() => rate - 1e-9, rate)).toBe('malicious');
    expect(pickCodeKind(() => rate, rate)).toBe('normal');
    expect(pickCodeKind(() => rate + 1e-9, rate)).toBe('normal');
  });
});

// 生成経路（main.ts の updateCodes）と同じ順で既存関数を組み合わせる接続テスト。
// findEngineerByRoute → maliciousRateForRank → pickCodeKind の順に呼ぶ。
// 制限: main.ts（Phaser のシーン）自体がこの順で呼ぶことまでは保証しない。
describe('生成経路の接続（初期配置・追加雇用・割当解除）', () => {
  const EPS = 1e-9;
  // 乱数列ヘルパー（engineer.test.ts と同じ形式）。
  const sequence = (values: readonly number[]): (() => number) => {
    let index = 0;
    return () => values[index++ % values.length];
  };
  const rules = { max: MAX_ENGINEERS, costs: ENGINEER_HIRE_COST };
  const RICH = 100_000_000;
  // 0ms と、全ランク・共通率が上限に達した後の2点。
  const capMs = STEP * (Math.max(rateCapStep, ...ENGINEER_RANKS.map(rankCapStep)) + 1);
  const TIMES = [
    ['0ms', 0],
    ['上限到達後', capMs],
  ] as const;

  // ルートの割合を生成経路と同じ順で求め、rate - ε / rate / rate + ε の乱数列で種類を3回決める。
  const spawnKinds = (engineers: readonly Engineer[], routeId: number, elapsedMs: number) => {
    const rate = maliciousRateForRank(findEngineerByRoute(engineers, routeId)?.rank, elapsedMs);
    const random = sequence([rate - EPS, rate, rate + EPS]);
    return { rate, kinds: [pickCodeKind(random, rate), pickCodeKind(random, rate), pickCodeKind(random, rate)] };
  };

  // 新しいルート id は初期ルートと重複させない。エンジニア id とも一致させない。
  const hireAndAssign = () => {
    const fleet = createInitialFleet(() => 0);
    const maxRouteId = Math.max(...fleet.routes.map((route) => route.id));
    const middle = hireEngineer(
      { engineers: fleet.engineers, funds: RICH, nextId: fleet.nextEngineerId },
      'middle',
      rules,
      () => 0,
    );
    if (!middle.ok) throw new Error('middle を雇えない');
    const senior = hireEngineer(
      { engineers: middle.engineers, funds: middle.fundsAfter, nextId: middle.engineer.id + 1 },
      'senior',
      rules,
      () => 0,
    );
    if (!senior.ok) throw new Error('senior を雇えない');
    // middle（id 3）→ ルート 4、senior（id 4）→ ルート 3 のように id を入れ違えて割り当てる。
    const middleRouteId = maxRouteId + 2;
    const seniorRouteId = maxRouteId + 1;
    return {
      fleet,
      hired: senior.engineers,
      middle: middle.engineer,
      senior: senior.engineer,
      middleRouteId,
      seniorRouteId,
    };
  };

  it.each(TIMES)('初期配置（%s）: 全初期ルートが junior の割合で、共通率とは異なる', (_label, ms) => {
    const fleet = createInitialFleet(() => 0);
    const junior = maliciousRateForRank('junior', ms);
    for (const route of fleet.routes) {
      const { rate, kinds } = spawnKinds(fleet.engineers, route.id, ms);
      expect(rate).toBe(junior);
      expect(rate).not.toBeCloseTo(maliciousRateAt(ms));
      expect(kinds).toEqual(['malicious', 'normal', 'normal']);
    }
  });

  it('初期配置の 0ms は junior の開始値（叩き台 0.40、共通率 0.30 とは異なる）', () => {
    const fleet = createInitialFleet(() => 0);
    for (const route of fleet.routes) {
      expect(spawnKinds(fleet.engineers, route.id, 0).rate).toBeCloseTo(0.4);
    }
    expect(maliciousRateAt(0)).toBeCloseTo(0.3);
  });

  it.each(TIMES)('追加雇用（%s）: 雇った直後（routeId: null）は新しいルートで共通率', (_label, ms) => {
    const { hired, middle, senior, middleRouteId, seniorRouteId } = hireAndAssign();
    expect(middle.routeId).toBeNull();
    expect(senior.routeId).toBeNull();
    for (const routeId of [middleRouteId, seniorRouteId]) {
      const { rate, kinds } = spawnKinds(hired, routeId, ms);
      expect(rate).toBe(maliciousRateAt(ms));
      expect(kinds).toEqual(['malicious', 'normal', 'normal']);
    }
  });

  it.each(TIMES)('追加雇用（%s）: assignEngineerRoute で割り当てると middle・senior の割合', (_label, ms) => {
    const { fleet, hired, middle, senior, middleRouteId, seniorRouteId } = hireAndAssign();
    expect(middleRouteId).not.toBe(middle.id);
    expect(seniorRouteId).not.toBe(senior.id);
    const assigned = assignEngineerRoute(
      assignEngineerRoute(hired, middle.id, middleRouteId),
      senior.id,
      seniorRouteId,
    );
    const cases = [
      [middleRouteId, 'middle'],
      [seniorRouteId, 'senior'],
    ] as const;
    for (const [routeId, rank] of cases) {
      const { rate, kinds } = spawnKinds(assigned, routeId, ms);
      expect(rate).toBe(maliciousRateForRank(rank, ms));
      expect(kinds).toEqual(['malicious', 'normal', 'normal']);
    }
    // 初期ルートは junior のまま。
    for (const route of fleet.routes) {
      expect(spawnKinds(assigned, route.id, ms).rate).toBe(maliciousRateForRank('junior', ms));
    }
  });

  it.each(TIMES)('割当解除（%s）: assignEngineerRoute(..., null) で外すと共通率に戻る', (_label, ms) => {
    const { hired, middle, senior, middleRouteId, seniorRouteId } = hireAndAssign();
    const assigned = assignEngineerRoute(
      assignEngineerRoute(hired, middle.id, middleRouteId),
      senior.id,
      seniorRouteId,
    );
    const unassigned = assignEngineerRoute(assignEngineerRoute(assigned, middle.id, null), senior.id, null);
    for (const routeId of [middleRouteId, seniorRouteId]) {
      const { rate, kinds } = spawnKinds(unassigned, routeId, ms);
      expect(rate).toBe(maliciousRateAt(ms));
      expect(kinds).toEqual(['malicious', 'normal', 'normal']);
    }
  });
});

describe('config の整合性', () => {
  it('速度の上限は開始値以上で、主人公より遅い', () => {
    expect(CODE_SPEED_MAX).toBeGreaterThanOrEqual(CODE_SPEED);
    expect(CODE_SPEED_MAX).toBeLessThan(PLAYER_SPEED);
  });

  it('不正コード率の上限は開始値以上で 1 以下', () => {
    expect(CODE_MALICIOUS_RATE_MAX).toBeGreaterThanOrEqual(CODE_MALICIOUS_RATE);
    expect(CODE_MALICIOUS_RATE_MAX).toBeLessThanOrEqual(1);
  });

  it('間隔は正、増加量は 0 以上', () => {
    expect(DIFFICULTY_STEP_MS).toBeGreaterThan(0);
    expect(CODE_SPEED_INCREMENT).toBeGreaterThanOrEqual(0);
    expect(CODE_MALICIOUS_RATE_INCREMENT).toBeGreaterThanOrEqual(0);
  });
});
