// 猫(#57) が MainScene.updateItems に正しく接続されていることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（codeRabbit.test.ts と同じ形）。
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { CAT_DELETE_INTERVAL_MS, DEFAULT_MALICIOUS_CODE_HP, TECH_DEBT_INITIAL } from './config';
import { CODE_DELETED_BY_CAT_EVENT } from './cat';
import type { GameOverState } from './gameOver';
import type { ActiveEffect } from './itemEffect';
import type { PlacedItem } from './itemPlacement';
import { drawDefeatEffect, drawItemAttackEffect } from './render';
import { cellCenter } from './route';
import type { GridCell, Point } from './route';

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

// 描画は検証の対象外なので、テストで通る関数だけスタブにする。
vi.mock('./render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render')>()),
  drawItemAttackEffect: vi.fn(),
  flashCode: vi.fn(),
  drawDefeatEffect: vi.fn(),
}));

// テストで触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeGraphics = { readonly destroy: Mock<() => void> };
type FakeCode = {
  readonly id: number;
  readonly kind: 'normal' | 'malicious';
  readonly routeId: number;
  readonly path: readonly Point[];
  readonly segmentIndex: number;
  readonly position: Point;
  readonly released: boolean;
  readonly graphics: FakeGraphics;
};
type SceneUnderTest = {
  funds: number;
  score: number;
  techDebt: number;
  gameOver: GameOverState;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  codeHold: Map<number, number>;
  placedItems: readonly PlacedItem[];
  // 購入時に発動したアイテムの時限効果(#58)。updateItems が「動いてるからヨシ！」を読む。
  activeEffects: readonly ActiveEffect[];
  tweens: { readonly killTweensOf: Mock<(target: object) => void> };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  updateItems(now: number): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const T0 = 10_000;
const FUNDS = 123_456;
const SCORE = 7_890;
const ROUTE_ID = 0;
const CAT_CELL: GridCell = { col: 7, row: 4 };
const CAT_CENTER = cellCenter(CAT_CELL);

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const placedCat = (id: number, lastAttackTime: number | null = null): PlacedItem => ({
  id,
  itemType: 'cat',
  cell: { col: CAT_CELL.col + id, row: CAT_CELL.row },
  lastAttackTime,
});

// 猫の範囲に制限はないので、位置は猫から遠くてよい。
const makeCode = (id: number, kind: 'normal' | 'malicious'): FakeCode => ({
  id,
  kind,
  routeId: ROUTE_ID,
  path: [],
  segmentIndex: 0,
  position: { x: id * 100, y: 300 },
  released: false,
  graphics: { destroy: vi.fn<() => void>() },
});

const createScene = (codes: FakeCode[], placedItems: readonly PlacedItem[]): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = FUNDS;
  scene.score = SCORE;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.gameOver = NOT_OVER;
  scene.codes = codes;
  scene.codeHp = new Map(
    codes.filter((code) => code.kind === 'malicious').map((code) => [code.id, DEFAULT_MALICIOUS_CODE_HP]),
  );
  scene.codeHold = new Map();
  scene.placedItems = placedItems;
  scene.activeEffects = [];
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>() };
  scene.events = { emit: vi.fn<(event: string, payload: object) => boolean>(() => true) };
  return scene;
};

describe('MainScene.updateItems: 猫(#57) がコードを1つ消す', () => {
  it.each<[string, number, 'normal' | 'malicious', number]>([
    ['乱数 0 → 先頭の正常なコード', 0, 'normal', 1],
    ['乱数 0.5 → 2番目の不正なコード', 0.5, 'malicious', 2],
  ])('%s を HP を無視して消し、資金・スコア・技術的負債は変えない', (_name, random, kind, id) => {
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const codes = [makeCode(1, 'normal'), makeCode(2, 'malicious'), makeCode(3, 'normal')];
    const target = codes[id - 1];
    const scene = createScene([...codes], [placedCat(0)]);

    scene.updateItems(T0);

    expect(scene.codes.map((code) => code.id)).toEqual(codes.filter((code) => code.id !== id).map((code) => code.id));
    expect(scene.codeHp.has(id)).toBe(false);
    expect(target.graphics.destroy).toHaveBeenCalledTimes(1);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledExactlyOnceWith(target.graphics);
    expect(drawItemAttackEffect).toHaveBeenCalledExactlyOnceWith(scene, CAT_CENTER, target.position);
    expect(drawDefeatEffect).not.toHaveBeenCalled();
    expect(scene.events.emit).toHaveBeenCalledExactlyOnceWith(CODE_DELETED_BY_CAT_EVENT, {
      id,
      kind,
      routeId: ROUTE_ID,
      maliciousType: undefined,
    });
    expect(scene.placedItems[0]?.lastAttackTime).toBe(T0);
    expect(scene.funds).toBe(FUNDS);
    expect(scene.score).toBe(SCORE);
    expect(scene.techDebt).toBe(TECH_DEBT_INITIAL);
  });

  it('発動間隔の境界: 間隔 - 1ms 後は消さず、ちょうど間隔後に消す', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scene = createScene([makeCode(1, 'normal'), makeCode(2, 'malicious')], [placedCat(0, T0)]);

    scene.updateItems(T0 + CAT_DELETE_INTERVAL_MS - 1);
    expect(scene.codes.map((code) => code.id)).toEqual([1, 2]);
    expect(scene.placedItems[0]?.lastAttackTime).toBe(T0);
    expect(scene.events.emit).not.toHaveBeenCalled();

    scene.updateItems(T0 + CAT_DELETE_INTERVAL_MS);
    expect(scene.codes.map((code) => code.id)).toEqual([2]);
    expect(scene.placedItems[0]?.lastAttackTime).toBe(T0 + CAT_DELETE_INTERVAL_MS);
    expect(scene.events.emit).toHaveBeenCalledTimes(1);
  });

  it('コードがなければ何もせず、最後に消した時刻も変えない', () => {
    const random = vi.spyOn(Math, 'random');
    const scene = createScene([], [placedCat(0)]);

    scene.updateItems(T0);

    expect(scene.placedItems[0]?.lastAttackTime).toBeNull();
    expect(random).not.toHaveBeenCalled();
    expect(drawItemAttackEffect).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('同じフレームの猫2匹は、それぞれ最新のコード一覧から別のコードを消す', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scene = createScene([makeCode(1, 'normal'), makeCode(2, 'malicious')], [placedCat(0), placedCat(1)]);

    scene.updateItems(T0);

    expect(scene.codes).toEqual([]);
    expect(scene.events.emit.mock.calls.map(([, payload]) => payload)).toEqual([
      { id: 1, kind: 'normal', routeId: ROUTE_ID, maliciousType: undefined },
      { id: 2, kind: 'malicious', routeId: ROUTE_ID, maliciousType: undefined },
    ]);
  });

  it('ゲームオーバー中は何もしない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scene = createScene([makeCode(1, 'normal')], [placedCat(0)]);
    scene.gameOver = { over: true, at: T0 };

    scene.updateItems(T0);

    expect(scene.codes.map((code) => code.id)).toEqual([1]);
    expect(scene.placedItems[0]?.lastAttackTime).toBeNull();
    expect(scene.events.emit).not.toHaveBeenCalled();
  });
});
