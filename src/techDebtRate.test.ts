// 技術的負債による不正コード率の補正が、実際の MainScene.maliciousRateModifiersFor() を通って effectiveMaliciousRate に届くことを確かめる(#45)。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（vacationNeutrality.test.ts と同じ構成）。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CODE_MALICIOUS_RATE_MIN,
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  TECH_DEBT_MALICIOUS_RATE_MAX_BONUS,
  TECH_DEBT_MAX,
} from './config';
import { effectiveMaliciousRate, maliciousRateForRank, vacationMaliciousRateModifiers } from './difficulty';
import { createEngineerParameters } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { refactoringMaliciousRateModifier } from './techDebt';

type SceneConstructor = { readonly prototype: object };
type RecordedGameConfig = { readonly scene: SceneConstructor | readonly SceneConstructor[] };

const recorded = vi.hoisted(() => ({ configs: [] as RecordedGameConfig[] }));

vi.mock('phaser', () => {
  class Scene {}
  class Game {
    constructor(config: RecordedGameConfig) {
      recorded.configs.push(config);
    }
  }
  return {
    default: {
      AUTO: 0,
      Scale: { FIT: 3, CENTER_BOTH: 1 },
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
      Scene,
      Game,
    },
  };
});

// maliciousRateModifiersFor() が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
// 補正一覧は [休暇の差分…, 負債の差分, リファクタリングの差分(#41)] の順に並ぶ。
type SceneUnderTest = {
  techDebt: number;
  refactoringRatio: number;
  maliciousRateModifiersFor(engineer: Engineer | undefined): readonly number[];
};

// src/vacationNeutrality.test.ts の makeEngineer と同じ形。休暇による低下量だけ指定できる。
const makeEngineer = (rank: EngineerRank, vacationRateReduction: number): Engineer => ({
  id: 0,
  rank,
  routeId: 0,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  aiAgent: null,
  ...createEngineerParameters(rank, 'meticulous'),
});

const RANKS: readonly EngineerRank[] = ['junior', 'middle', 'senior'];
// 経過時間 0（難易度の上昇がない状態）で比べる。
const ELAPSED_MS = 0;
// 休暇1回分を想定した正の低下量。基礎率から引いても CODE_MALICIOUS_RATE_MIN を下回らない大きさにする。
const VACATION_REDUCTION = 0.05;
const HALF_DEBT = TECH_DEBT_MAX / 2;
const HALF_BONUS = TECH_DEBT_MALICIOUS_RATE_MAX_BONUS / 2;
// このファイルでは負債だけを動かし、リファクタリングの割合(#41)は既定値に固定する。
const REFACTORING_RATIO = DEFAULT_REFACTORING_RATIO;
const REFACTORING_DELTA = refactoringMaliciousRateModifier(REFACTORING_RATIO);

// effectiveMaliciousRate と同じく合計後に [CODE_MALICIOUS_RATE_MIN, 1] へ収める。
const clampRate = (rate: number): number => Math.min(1, Math.max(CODE_MALICIOUS_RATE_MIN, rate));

let mainScenePrototype: object;

beforeAll(async () => {
  await import('./main');
  const config = recorded.configs[0];
  if (config === undefined) {
    throw new Error('Phaser.Game に渡された設定が見つかりません');
  }
  const scene = Array.isArray(config.scene) ? config.scene[0] : config.scene;
  if (scene === undefined) {
    throw new Error('MainScene が見つかりません');
  }
  mainScenePrototype = scene.prototype;
});

const createScene = (techDebt: number): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.techDebt = techDebt;
  scene.refactoringRatio = REFACTORING_RATIO;
  return scene;
};

// 負債の差分だけを除いた補正一覧（休暇とリファクタリングの差分）。
const modifiersWithoutDebt = (engineer: Engineer | undefined): readonly number[] => [
  ...vacationMaliciousRateModifiers(engineer),
  REFACTORING_DELTA,
];

describe('MainScene.maliciousRateModifiersFor（技術的負債の補正が生成経路に届く）', () => {
  it.each(RANKS)('%s: 負債 0 なら負債の差分は 0 で、負債を除いた率のまま', (rank) => {
    const engineer = makeEngineer(rank, 0);
    const modifiers = createScene(0).maliciousRateModifiersFor(engineer);
    expect(modifiers).toEqual([0, REFACTORING_DELTA]);
    expect(effectiveMaliciousRate(rank, ELAPSED_MS, modifiers)).toBe(
      effectiveMaliciousRate(rank, ELAPSED_MS, modifiersWithoutDebt(engineer)),
    );
  });

  it.each(RANKS)('%s: 負債 TECH_DEBT_MAX なら基礎率 + TECH_DEBT_MALICIOUS_RATE_MAX_BONUS + リファクタリングの差分', (rank) => {
    const engineer = makeEngineer(rank, 0);
    const modifiers = createScene(TECH_DEBT_MAX).maliciousRateModifiersFor(engineer);
    expect(modifiers).toHaveLength(2);
    expect(modifiers[0]).toBeCloseTo(TECH_DEBT_MALICIOUS_RATE_MAX_BONUS, 12);
    expect(modifiers[1]).toBe(REFACTORING_DELTA);
    expect(effectiveMaliciousRate(rank, ELAPSED_MS, modifiers)).toBeCloseTo(
      clampRate(maliciousRateForRank(rank, ELAPSED_MS) + TECH_DEBT_MALICIOUS_RATE_MAX_BONUS + REFACTORING_DELTA),
      12,
    );
  });

  it.each(RANKS)('%s: 負債 TECH_DEBT_MAX / 2 なら基礎率 + 最大加算量の半分 + リファクタリングの差分', (rank) => {
    const engineer = makeEngineer(rank, 0);
    const modifiers = createScene(HALF_DEBT).maliciousRateModifiersFor(engineer);
    expect(modifiers).toHaveLength(2);
    expect(modifiers[0]).toBeCloseTo(HALF_BONUS, 12);
    expect(modifiers[1]).toBe(REFACTORING_DELTA);
    expect(effectiveMaliciousRate(rank, ELAPSED_MS, modifiers)).toBeCloseTo(
      clampRate(maliciousRateForRank(rank, ELAPSED_MS) + HALF_BONUS + REFACTORING_DELTA),
      12,
    );
  });

  it.each(RANKS)('%s: 休暇の低下量があれば休暇（負）・負債（正）・リファクタリング（負）の差分を合算する', (rank) => {
    const engineer = makeEngineer(rank, VACATION_REDUCTION);
    const modifiers = createScene(TECH_DEBT_MAX).maliciousRateModifiersFor(engineer);
    expect(modifiers).toHaveLength(3);
    expect(modifiers[0]).toBe(-VACATION_REDUCTION);
    expect(modifiers[1]).toBeCloseTo(TECH_DEBT_MALICIOUS_RATE_MAX_BONUS, 12);
    expect(modifiers[2]).toBe(REFACTORING_DELTA);
    expect(effectiveMaliciousRate(rank, ELAPSED_MS, modifiers)).toBeCloseTo(
      clampRate(
        maliciousRateForRank(rank, ELAPSED_MS) -
          VACATION_REDUCTION +
          TECH_DEBT_MALICIOUS_RATE_MAX_BONUS +
          REFACTORING_DELTA,
      ),
      12,
    );
  });

  it('担当エンジニアがいない（undefined）なら負債とリファクタリングの差分だけ', () => {
    const modifiers = createScene(TECH_DEBT_MAX).maliciousRateModifiersFor(undefined);
    expect(modifiers).toHaveLength(2);
    expect(modifiers[0]).toBeCloseTo(TECH_DEBT_MALICIOUS_RATE_MAX_BONUS, 12);
    expect(modifiers[1]).toBe(REFACTORING_DELTA);
    expect(effectiveMaliciousRate(undefined, ELAPSED_MS, modifiers)).toBeCloseTo(
      clampRate(maliciousRateForRank(undefined, ELAPSED_MS) + TECH_DEBT_MALICIOUS_RATE_MAX_BONUS + REFACTORING_DELTA),
      12,
    );
  });

  it.each([
    ['休暇なし', 0],
    ['休暇あり', VACATION_REDUCTION],
  ])('%s: 負債の差分を除くと結果が変わる（負債の補正が実際に効いている）', (_label, reduction) => {
    for (const rank of RANKS) {
      const engineer = makeEngineer(rank, reduction);
      for (const debt of [HALF_DEBT, TECH_DEBT_MAX]) {
        const withDebt = effectiveMaliciousRate(rank, ELAPSED_MS, createScene(debt).maliciousRateModifiersFor(engineer));
        const withoutDebt = effectiveMaliciousRate(rank, ELAPSED_MS, modifiersWithoutDebt(engineer));
        expect(withDebt).toBeGreaterThan(withoutDebt);
      }
    }
  });

  it('負債 0 なら負債の差分を除いた結果と一致する', () => {
    for (const rank of RANKS) {
      const engineer = makeEngineer(rank, VACATION_REDUCTION);
      expect(effectiveMaliciousRate(rank, ELAPSED_MS, createScene(0).maliciousRateModifiersFor(engineer))).toBe(
        effectiveMaliciousRate(rank, ELAPSED_MS, modifiersWithoutDebt(engineer)),
      );
    }
  });
});
