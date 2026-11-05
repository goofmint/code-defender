// リファクタリングの割合(#41)が、実際の MainScene.maliciousRateModifiersFor() の補正一覧に入ることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（vacationNeutrality.test.ts と同じ）。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CODE_MALICIOUS_RATE_MIN,
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  REFACTORING_MALICIOUS_RATE_REDUCTION_MAX,
} from './config';
import { effectiveMaliciousRate, maliciousRateForRank } from './difficulty';
import { createEngineerParameters } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { refactoringMaliciousRateModifier, techDebtMaliciousRateModifier } from './techDebt';

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
// 補正一覧は [休暇の差分(#39)…, 負債の差分(#45), リファクタリングの差分] の順に並ぶ。
type SceneUnderTest = {
  techDebt: number;
  refactoringRatio: number;
  maliciousRateModifiersFor(engineer: Engineer | undefined): readonly number[];
};

// src/engineer.test.ts の makeEngineer と同じ形。
const makeEngineer = (rank: EngineerRank, vacationRateReduction: number): Engineer => ({
  id: 0,
  rank,
  routeId: 0,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  ...createEngineerParameters(rank, 'meticulous'),
});

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

// このファイルでは割合だけを動かし、技術的負債(#45)は 0（負債の差分 0）に固定する。
const TECH_DEBT = 0;
const DEBT_DELTA = techDebtMaliciousRateModifier(TECH_DEBT);

const createScene = (refactoringRatio: number): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.techDebt = TECH_DEBT;
  scene.refactoringRatio = refactoringRatio;
  return scene;
};

const RATIOS = [
  ['0', 0],
  ['既定', DEFAULT_REFACTORING_RATIO],
  ['1', 1],
] as const;

describe('MainScene.maliciousRateModifiersFor（リファクタリングの補正の接続, #41）', () => {
  it.each(RATIOS)('割合 %s: 担当者なしでもリファクタリングの差分が入る', (_label, ratio) => {
    const modifiers = createScene(ratio).maliciousRateModifiersFor(undefined);
    expect(modifiers).toEqual([DEBT_DELTA, refactoringMaliciousRateModifier(ratio)]);
  });

  it.each(RATIOS)('割合 %s: 休暇の差分（#39）と並んで入る', (_label, ratio) => {
    const modifiers = createScene(ratio).maliciousRateModifiersFor(makeEngineer('junior', 0.1));
    expect(modifiers).toEqual([-0.1, DEBT_DELTA, refactoringMaliciousRateModifier(ratio)]);
  });

  it.each(RATIOS)('割合 %s: 補正後の不正コード率は max(基礎率 + 負債の差分 − k × 割合, MIN)', (_label, ratio) => {
    const modifiers = createScene(ratio).maliciousRateModifiersFor(undefined);
    const expected = Math.max(
      maliciousRateForRank(undefined, 0) + DEBT_DELTA - REFACTORING_MALICIOUS_RATE_REDUCTION_MAX * ratio,
      CODE_MALICIOUS_RATE_MIN,
    );
    expect(effectiveMaliciousRate(undefined, 0, modifiers)).toBeCloseTo(expected, 12);
  });

  it('割合 1 の不正コード率は割合 0 より低い（係数が正のとき）', () => {
    expect(REFACTORING_MALICIOUS_RATE_REDUCTION_MAX).toBeGreaterThan(0);
    const rate0 = effectiveMaliciousRate(undefined, 0, createScene(0).maliciousRateModifiersFor(undefined));
    const rate1 = effectiveMaliciousRate(undefined, 0, createScene(1).maliciousRateModifiersFor(undefined));
    expect(rate1).toBeLessThan(rate0);
  });
});
