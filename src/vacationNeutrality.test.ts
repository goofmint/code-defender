// 休暇の付与・解除そのものでは資金・スコアが増減しないことを、実際の MainScene.toggleVacation() で確かめる(#38)。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createEngineerParameters } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { GameOverState } from './gameOver';
import { ENGINEER_MONTHLY_SALARY_BY_RANK, INITIAL_FUNDS } from './config';

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

// toggleVacation() が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeVacationMarker = { readonly setOnVacation: Mock<(onVacation: boolean) => void> };
type SceneUnderTest = {
  funds: number;
  score: number;
  engineers: Engineer[];
  gameOver: GameOverState;
  vacationMarkers: Map<number, FakeVacationMarker>;
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  fundsText: { readonly setText: Mock<(text: string) => void> };
  toggleVacation(routeId: number): void;
};

type SceneOptions = {
  readonly funds?: number;
  readonly score?: number;
  readonly engineers?: Engineer[];
  readonly gameOver?: GameOverState;
  // マーカーを作るルート ID。省略時はエンジニアの担当ルートすべてに作る。
  readonly markerRouteIds?: readonly number[];
};

// src/engineer.test.ts の makeEngineer と同じ形。
const makeEngineer = (
  id: number,
  rank: EngineerRank,
  routeId: number | null,
  onVacation = false,
): Engineer => ({
  id,
  rank,
  routeId,
  personality: 'meticulous',
  onVacation,
  vacationRateReduction: 0,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  ...createEngineerParameters(rank, 'meticulous'),
});

const LARGE_FUNDS = 1_000_000_000;
const LARGE_SCORE = 1_000_000_000;
const NORMAL_FUNDS = INITIAL_FUNDS;
const NOT_OVER: GameOverState = { over: false, at: null };
const OVER: GameOverState = { over: true, at: 1000 };

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

const createScene = (options: SceneOptions = {}): SceneUnderTest => {
  const engineers = options.engineers ?? [makeEngineer(0, 'junior', 0)];
  const markerRouteIds =
    options.markerRouteIds ??
    engineers.flatMap((engineer) => (engineer.routeId === null ? [] : [engineer.routeId]));
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = options.funds ?? NORMAL_FUNDS;
  scene.score = options.score ?? 0;
  scene.engineers = engineers;
  scene.gameOver = options.gameOver ?? NOT_OVER;
  scene.vacationMarkers = new Map(
    markerRouteIds.map((routeId) => [routeId, { setOnVacation: vi.fn<(onVacation: boolean) => void>() }]),
  );
  scene.events = { emit: vi.fn<(event: string, payload: object) => boolean>(() => true) };
  scene.fundsText = { setText: vi.fn<(text: string) => void>() };
  return scene;
};

const getMarker = (scene: SceneUnderTest, routeId: number): FakeVacationMarker => {
  const marker = scene.vacationMarkers.get(routeId);
  if (marker === undefined) {
    throw new Error(`テスト用の休暇マーカーがありません: routeId=${routeId}`);
  }
  return marker;
};

const expectNoFundsSideEffects = (scene: SceneUnderTest, funds: number, score: number): void => {
  expect(scene.funds).toBe(funds);
  expect(scene.score).toBe(score);
  expect(scene.events.emit).not.toHaveBeenCalledWith(FUNDS_CHANGED_EVENT, expect.anything());
  expect(scene.fundsText.setText).not.toHaveBeenCalled();
};

const vacationStates = (scene: SceneUnderTest): boolean[] => scene.engineers.map((engineer) => engineer.onVacation);

describe('MainScene.toggleVacation: 休暇の付与・解除で資金とスコアが変わらない', () => {
  const fundsCases = [1, 2, NORMAL_FUNDS, LARGE_FUNDS];
  const scoreCases = [0, 1, LARGE_SCORE];
  const transitions: readonly [string, boolean][] = [
    ['付与', false],
    ['解除', true],
  ];
  const cases = fundsCases.flatMap((funds) =>
    scoreCases.flatMap((score) =>
      transitions.map(([label, before]): [number, number, string, boolean] => [funds, score, label, before]),
    ),
  );

  it.each(cases)('資金 %d・スコア %d で%sしても資金・スコアは変わらない', (funds, score, _label, before) => {
    const scene = createScene({ funds, score, engineers: [makeEngineer(0, 'junior', 0, before)] });

    scene.toggleVacation(0);

    expectNoFundsSideEffects(scene, funds, score);
    expect(scene.engineers[0]?.onVacation).toBe(!before);
    expect(getMarker(scene, 0).setOnVacation).toHaveBeenCalledExactlyOnceWith(!before);
  });

  it.each([1, 2, 3])('%d 回続けて切り替えても資金・スコアは毎回変わらない', (times) => {
    const scene = createScene({ funds: NORMAL_FUNDS, score: 1 });

    for (let i = 1; i <= times; i += 1) {
      scene.toggleVacation(0);
      expectNoFundsSideEffects(scene, NORMAL_FUNDS, 1);
      expect(scene.engineers[0]?.onVacation).toBe(i % 2 === 1);
    }
    expect(getMarker(scene, 0).setOnVacation).toHaveBeenCalledTimes(times);
    expect(getMarker(scene, 0).setOnVacation).toHaveBeenLastCalledWith(times % 2 === 1);
  });

  it('2 回切り替えると休暇状態が元に戻る', () => {
    const scene = createScene();

    scene.toggleVacation(0);
    scene.toggleVacation(0);

    expect(scene.engineers[0]?.onVacation).toBe(false);
    expectNoFundsSideEffects(scene, NORMAL_FUNDS, 0);
  });

  it('エンジニアが 1 人なら、その人だけが切り替わる', () => {
    const scene = createScene({ engineers: [makeEngineer(0, 'senior', 0)] });

    scene.toggleVacation(0);

    expect(vacationStates(scene)).toEqual([true]);
    expectNoFundsSideEffects(scene, NORMAL_FUNDS, 0);
  });

  it('エンジニアが複数いても、対象以外の休暇状態とマーカーは変わらない', () => {
    const scene = createScene({
      engineers: [makeEngineer(0, 'junior', 0), makeEngineer(1, 'middle', 1, true), makeEngineer(2, 'senior', 2)],
    });

    scene.toggleVacation(1);

    expect(vacationStates(scene)).toEqual([false, false, false]);
    expect(getMarker(scene, 1).setOnVacation).toHaveBeenCalledExactlyOnceWith(false);
    expect(getMarker(scene, 0).setOnVacation).not.toHaveBeenCalled();
    expect(getMarker(scene, 2).setOnVacation).not.toHaveBeenCalled();
    expectNoFundsSideEffects(scene, NORMAL_FUNDS, 0);
  });
});

describe('MainScene.toggleVacation: 切り替えないときも資金とスコアは変わらない', () => {
  const overCases: [number, boolean][] = [
    [0, false],
    [0, true],
    [-1, false],
    [-1, true],
  ];

  it.each(overCases)('ゲームオーバー中（資金 %d・休暇中 %s）は何もしない', (funds, before) => {
    const scene = createScene({ funds, score: 1, gameOver: OVER, engineers: [makeEngineer(0, 'junior', 0, before)] });

    scene.toggleVacation(0);

    expect(scene.engineers[0]?.onVacation).toBe(before);
    expect(getMarker(scene, 0).setOnVacation).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalled();
    expectNoFundsSideEffects(scene, funds, 1);
  });

  it('担当エンジニアがいないルートでは何もしない', () => {
    const scene = createScene({ score: 1, markerRouteIds: [0, 5] });

    scene.toggleVacation(5);

    expect(vacationStates(scene)).toEqual([false]);
    expect(getMarker(scene, 5).setOnVacation).not.toHaveBeenCalled();
    expect(getMarker(scene, 0).setOnVacation).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalled();
    expectNoFundsSideEffects(scene, NORMAL_FUNDS, 1);
  });

  it('休暇マーカーがなければ例外を投げ、資金・スコア・休暇状態は変わらない', () => {
    const scene = createScene({ score: 1, markerRouteIds: [] });

    expect(() => scene.toggleVacation(0)).toThrow('休暇マーカーが見つかりません');

    expect(vacationStates(scene)).toEqual([false]);
    expect(scene.events.emit).not.toHaveBeenCalled();
    expectNoFundsSideEffects(scene, NORMAL_FUNDS, 1);
  });
});
