// 愛着心が最低になったエンジニアの自主退職(#32)を、実際の MainScene の resignEngineers() / onEngineerResigned() で確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（vacationNeutrality.test.ts と同じ形）。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createEngineerParameters, ENGINEER_RESIGNED_EVENT, formatEngineerCount, formatSelectedEngineer } from './engineer';
import type { Engineer, EngineerRank, EngineerResignedPayload } from './engineer';
import type { GameOverState } from './gameOver';
import { ENGINEER_MONTHLY_SALARY_BY_RANK, ENGINEER_PARAMETER_MIN, ENGINEER_SPAWN_CELLS, MAX_ENGINEERS } from './config';
import { createRoutes } from './route';
import type { Route } from './route';

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

// 退職の処理が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeDestroyable = { readonly destroy: Mock<() => void> };
type FakeRouteDrawing = {
  readonly line: FakeDestroyable;
  readonly spawnMarker: FakeDestroyable;
  readonly spawnDecoration: FakeDestroyable;
};
type FakeVacationMarker = { readonly container: FakeDestroyable };
type FakeText = FakeDestroyable & { readonly setText: Mock<(text: string) => void> };
type FakeMessageText = FakeDestroyable & { readonly setDepth: Mock<(depth: number) => FakeMessageText> };
type FakeCode = { readonly id: number; readonly routeId: number; readonly graphics: FakeDestroyable };
type SceneUnderTest = {
  engineers: Engineer[];
  routes: Route[];
  routeDrawings: Map<number, FakeRouteDrawing>;
  vacationMarkers: Map<number, FakeVacationMarker>;
  spawnElapsed: Map<number, number>;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  funds: number;
  score: number;
  gameOver: GameOverState;
  selectedEngineerId: number | null;
  engineerCountText: FakeText;
  selectedEngineerText: FakeText;
  hireMessageText?: FakeMessageText;
  events: { readonly emit: Mock<(event: string, payload: EngineerResignedPayload) => boolean> };
  tweens: { readonly killTweensOf: Mock<(target: FakeDestroyable) => void> };
  add: { readonly text: Mock<(x: number, y: number, message: string) => FakeMessageText> };
  time: { readonly delayedCall: Mock<(delay: number, callback: () => void) => void> };
  resignEngineers(): void;
  onEngineerResigned(payload: EngineerResignedPayload): void;
  update(time: number, delta: number): void;
};

const makeEngineer = (id: number, rank: EngineerRank, routeId: number | null, attachment?: number): Engineer => ({
  id,
  rank,
  routeId,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction: 0,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  ...createEngineerParameters(rank, 'meticulous'),
  ...(attachment === undefined ? {} : { attachment }),
});

const destroyable = (): FakeDestroyable => ({ destroy: vi.fn<() => void>() });
const fakeText = (): FakeText => ({ destroy: vi.fn<() => void>(), setText: vi.fn<(text: string) => void>() });
const fakeMessageText = (): FakeMessageText => {
  const text: FakeMessageText = {
    destroy: vi.fn<() => void>(),
    setDepth: vi.fn<(depth: number) => FakeMessageText>(() => text),
  };
  return text;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const OVER: GameOverState = { over: true, at: 1000 };
const FUNDS = 1_000_000;
const SCORE = 500;

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

// 初期3ルート（id 0・1・2）とその担当エンジニア、各ルートに2個ずつ流れているコードを持つシーン。
const createScene = (engineers: Engineer[], gameOver: GameOverState = NOT_OVER): SceneUnderTest => {
  const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0);
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.engineers = engineers;
  scene.routes = routes;
  scene.routeDrawings = new Map(
    routes.map((route) => [route.id, { line: destroyable(), spawnMarker: destroyable(), spawnDecoration: destroyable() }]),
  );
  scene.vacationMarkers = new Map(routes.map((route) => [route.id, { container: destroyable() }]));
  scene.spawnElapsed = new Map(routes.map((route) => [route.id, 100]));
  scene.codes = routes.flatMap((route) => [0, 1].map((n) => ({ id: route.id * 10 + n, routeId: route.id, graphics: destroyable() })));
  scene.codeHp = new Map(scene.codes.map((code) => [code.id, 1]));
  scene.funds = FUNDS;
  scene.score = SCORE;
  scene.gameOver = gameOver;
  scene.selectedEngineerId = engineers[0]?.id ?? null;
  scene.engineerCountText = fakeText();
  scene.selectedEngineerText = fakeText();
  scene.hireMessageText = undefined;
  // 実際の scene.events と同じく、ENGINEER_RESIGNED_EVENT を購読処理へ届ける。
  scene.events = {
    emit: vi.fn<(event: string, payload: EngineerResignedPayload) => boolean>((event, payload) => {
      if (event === ENGINEER_RESIGNED_EVENT) {
        scene.onEngineerResigned(payload);
      }
      return true;
    }),
  };
  scene.tweens = { killTweensOf: vi.fn<(target: FakeDestroyable) => void>() };
  scene.add = { text: vi.fn<(x: number, y: number, message: string) => FakeMessageText>(() => fakeMessageText()) };
  scene.time = { delayedCall: vi.fn<(delay: number, callback: () => void) => void>() };
  return scene;
};

const getOrThrow = <T>(map: Map<number, T>, key: number): T => {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`テスト用の値がありません: ${key}`);
  }
  return value;
};

describe('MainScene: 愛着心が最低になったら自主退職し、そのルートが消える(#32)', () => {
  it('中間ルートの担当者が退職すると、そのルートの描画・マーカー・タイマー・コードだけが片付く', () => {
    const scene = createScene([
      makeEngineer(0, 'junior', 0),
      makeEngineer(1, 'middle', 1, ENGINEER_PARAMETER_MIN),
      makeEngineer(2, 'senior', 2),
    ]);
    const drawing = getOrThrow(scene.routeDrawings, 1);
    const marker = getOrThrow(scene.vacationMarkers, 1);
    const removedCodes = scene.codes.filter((code) => code.routeId === 1);
    const keptCodes = scene.codes.filter((code) => code.routeId !== 1);

    scene.resignEngineers();

    expect(scene.engineers.map((engineer) => engineer.id)).toEqual([0, 2]);
    expect(scene.routes.map((route) => route.id)).toEqual([0, 2]);
    expect(drawing.line.destroy).toHaveBeenCalledOnce();
    expect(drawing.spawnMarker.destroy).toHaveBeenCalledOnce();
    expect(drawing.spawnDecoration.destroy).toHaveBeenCalledOnce();
    expect([...scene.routeDrawings.keys()]).toEqual([0, 2]);
    expect(marker.container.destroy).toHaveBeenCalledOnce();
    expect([...scene.vacationMarkers.keys()]).toEqual([0, 2]);
    expect([...scene.spawnElapsed.keys()]).toEqual([0, 2]);
    expect(scene.codes).toEqual(keptCodes);
    removedCodes.forEach((code) => {
      expect(code.graphics.destroy).toHaveBeenCalledOnce();
      expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(code.graphics);
      expect(scene.codeHp.has(code.id)).toBe(false);
    });
    keptCodes.forEach((code) => {
      expect(code.graphics.destroy).not.toHaveBeenCalled();
      expect(scene.codeHp.has(code.id)).toBe(true);
    });
    [0, 2].forEach((routeId) => {
      const kept = getOrThrow(scene.routeDrawings, routeId);
      expect(kept.line.destroy).not.toHaveBeenCalled();
      expect(kept.spawnDecoration.destroy).not.toHaveBeenCalled();
      expect(getOrThrow(scene.vacationMarkers, routeId).container.destroy).not.toHaveBeenCalled();
    });
    expect(scene.engineerCountText.setText).toHaveBeenLastCalledWith(formatEngineerCount(2, MAX_ENGINEERS));
  });

  it('退職者1人につき1回だけイベントを発行し、資金・スコアは変えず、他のイベントも出さない', () => {
    const scene = createScene([makeEngineer(0, 'junior', 0, ENGINEER_PARAMETER_MIN), makeEngineer(1, 'middle', 1)]);

    scene.resignEngineers();
    scene.resignEngineers();

    expect(scene.events.emit).toHaveBeenCalledOnce();
    expect(scene.events.emit).toHaveBeenCalledWith(ENGINEER_RESIGNED_EVENT, {
      engineer: expect.objectContaining({ id: 0 }),
      routeId: 0,
    });
    expect(scene.funds).toBe(FUNDS);
    expect(scene.score).toBe(SCORE);
  });

  it('退職者がいなければ何も変えない', () => {
    const scene = createScene([makeEngineer(0, 'junior', 0), makeEngineer(1, 'middle', 1), makeEngineer(2, 'senior', 2)]);
    const engineers = scene.engineers;

    scene.resignEngineers();

    expect(scene.engineers).toBe(engineers);
    expect(scene.routes).toHaveLength(3);
    expect(scene.codes).toHaveLength(6);
    expect(scene.events.emit).not.toHaveBeenCalled();
    expect(scene.engineerCountText.setText).not.toHaveBeenCalled();
  });

  it('全員が退職するとルートもコードも空になり、選択は null になる', () => {
    const scene = createScene([0, 1, 2].map((id) => makeEngineer(id, 'junior', id, ENGINEER_PARAMETER_MIN)));

    scene.resignEngineers();

    expect(scene.engineers).toEqual([]);
    expect(scene.routes).toEqual([]);
    expect(scene.routeDrawings.size).toBe(0);
    expect(scene.vacationMarkers.size).toBe(0);
    expect(scene.spawnElapsed.size).toBe(0);
    expect(scene.codes).toEqual([]);
    expect(scene.codeHp.size).toBe(0);
    expect(scene.events.emit).toHaveBeenCalledTimes(3);
    expect(scene.selectedEngineerId).toBeNull();
    expect(scene.selectedEngineerText.setText).toHaveBeenLastCalledWith(formatSelectedEngineer(null));
    expect(scene.engineerCountText.setText).toHaveBeenLastCalledWith(formatEngineerCount(0, MAX_ENGINEERS));
  });

  it('選択中のエンジニアが退職すると、残る先頭のエンジニアを選ぶ', () => {
    const remaining = makeEngineer(1, 'middle', 1);
    const scene = createScene([makeEngineer(0, 'junior', 0, ENGINEER_PARAMETER_MIN), remaining, makeEngineer(2, 'senior', 2)]);
    scene.selectedEngineerId = 0;

    scene.resignEngineers();

    expect(scene.selectedEngineerId).toBe(1);
    expect(scene.selectedEngineerText.setText).toHaveBeenLastCalledWith(formatSelectedEngineer(remaining));
  });

  it('選択中でないエンジニアが退職しても、選択は変わらない', () => {
    const scene = createScene([makeEngineer(0, 'junior', 0, ENGINEER_PARAMETER_MIN), makeEngineer(1, 'middle', 1), makeEngineer(2, 'senior', 2)]);
    scene.selectedEngineerId = 2;

    scene.resignEngineers();

    expect(scene.selectedEngineerId).toBe(2);
  });

  it('ルートを持たない（routeId: null）エンジニアが退職しても、ルートと関連状態は変わらない', () => {
    const scene = createScene([
      makeEngineer(0, 'junior', 0),
      makeEngineer(1, 'middle', 1),
      makeEngineer(2, 'senior', 2),
      makeEngineer(3, 'junior', null, ENGINEER_PARAMETER_MIN),
    ]);

    scene.resignEngineers();

    expect(scene.engineers.map((engineer) => engineer.id)).toEqual([0, 1, 2]);
    expect(scene.routes).toHaveLength(3);
    expect(scene.routeDrawings.size).toBe(3);
    expect(scene.vacationMarkers.size).toBe(3);
    expect(scene.spawnElapsed.size).toBe(3);
    expect(scene.codes).toHaveLength(6);
    expect(scene.engineerCountText.setText).toHaveBeenLastCalledWith(formatEngineerCount(3, MAX_ENGINEERS));
  });

  it('退職メッセージを雇用メッセージと同じ仕組みで出す', () => {
    const scene = createScene([makeEngineer(0, 'junior', 0, ENGINEER_PARAMETER_MIN), makeEngineer(1, 'middle', 1)]);

    scene.resignEngineers();

    expect(scene.add.text).toHaveBeenCalledOnce();
    expect(scene.add.text.mock.calls[0]?.[2]).toContain('退職しました');
    expect(scene.time.delayedCall).toHaveBeenCalledOnce();
  });

  it('描画ハンドルや休暇マーカーがなくても例外を投げずに片付ける', () => {
    const scene = createScene([makeEngineer(0, 'junior', 0, ENGINEER_PARAMETER_MIN), makeEngineer(1, 'middle', 1)]);
    scene.routeDrawings.delete(0);
    scene.vacationMarkers.delete(0);

    expect(() => scene.resignEngineers()).not.toThrow();

    expect(scene.routes.map((route) => route.id)).toEqual([1, 2]);
    expect(scene.codes.every((code) => code.routeId !== 0)).toBe(true);
  });

  it('ゲームオーバー中の update() では退職させない', () => {
    const scene = createScene([makeEngineer(0, 'junior', 0, ENGINEER_PARAMETER_MIN)], OVER);

    scene.update(0, 16);

    expect(scene.engineers.map((engineer) => engineer.id)).toEqual([0]);
    expect(scene.routes).toHaveLength(3);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });
});
