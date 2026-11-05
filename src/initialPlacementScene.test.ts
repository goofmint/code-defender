// 初期配置フェーズ(#47)を、実際の MainScene の create() / update() / pointerdown / 開始キー / tryRestart() で確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（engineerResign.test.ts と同じ形）。
// 描画（render.ts）もモックして、Phaser の GameObject を作らずに create() を通す。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  GAME_OVER_RESTART_KEYS,
  INITIAL_FUNDS,
  INITIAL_PLACEMENT_START_KEYS,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_BUY_KEYS,
  ITEM_PAGE_KEYS,
  ITEM_PAGE_SIZE,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  STAGE_POINTS_INITIAL,
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import type { GameOverState } from './gameOver';
import { getStagePointCost } from './initialPlacement';
import type { InitialPlacementState } from './initialPlacement';
import { ITEM_TYPES } from './item';
import type { ItemType } from './item';
import { isPlaceableCell, itemFootprint, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import type { GridCell, Route } from './route';

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

// 描画のモック。どの関数も、MainScene が触るメソッド（destroy・setText・setPosition など）だけを持つ偽物を返す。
const fakes = vi.hoisted(() => {
  type FakeObject = {
    x: number;
    y: number;
    readonly destroy: () => void;
    readonly setText: (text: string | readonly string[]) => FakeObject;
    readonly setPosition: (x: number, y: number) => FakeObject;
    readonly setDepth: (depth: number) => FakeObject;
    readonly setOnVacation: (onVacation: boolean) => void;
  };
  const created: FakeObject[] = [];
  const make = (): FakeObject => {
    const object: FakeObject = {
      x: 0,
      y: 0,
      destroy: () => undefined,
      setText: () => object,
      setPosition: (x, y) => {
        object.x = x;
        object.y = y;
        return object;
      },
      setDepth: () => object,
      setOnVacation: () => undefined,
    };
    created.push(object);
    return object;
  };
  return { make, created };
});

vi.mock('./render', () => {
  const object = () => fakes.make();
  return {
    drawAttackEffect: vi.fn(),
    drawCode: vi.fn(object),
    drawDefeatEffect: vi.fn(),
    drawElapsedDays: vi.fn(object),
    drawField: vi.fn(),
    drawCumulativeSales: vi.fn(object),
    drawFunds: vi.fn(object),
    drawEngineerCount: vi.fn(object),
    drawGameOver: vi.fn(),
    drawHireButtons: vi.fn(() => []),
    drawHireMessage: vi.fn(object),
    drawInitialPlacementMessage: vi.fn(object),
    drawInitialPlacementPanel: vi.fn(object),
    drawInitialPlacementStartButton: vi.fn(object),
    drawItemAttackEffect: vi.fn(),
    drawItemButtons: vi.fn(() => ({ showPage: () => undefined })),
    drawAiAgentButtons: vi.fn(() => []),
    drawItemMessage: vi.fn(object),
    drawOutageText: vi.fn(),
    drawPlacedItem: vi.fn(object),
    drawPenaltyText: vi.fn(),
    drawPlayer: vi.fn(object),
    drawRefactoringRatioControl: vi.fn(object),
    drawReleasePoint: vi.fn(),
    drawRoutes: vi.fn(
      (_scene: object, routes: readonly { readonly id: number }[]) =>
        new Map(routes.map((route) => [route.id, { line: fakes.make(), spawnMarker: fakes.make() }])),
    ),
    drawSalaryButtons: vi.fn(() => []),
    drawSelectedEngineer: vi.fn(object),
    drawTechDebt: vi.fn(object),
    // 休暇の案内文(#150)。create() で1回描く。
    drawVacationHint: vi.fn(object),
    drawVacationMarker: vi.fn(() => ({ container: fakes.make(), setOnVacation: () => undefined })),
    flashCode: vi.fn(),
  };
});

const render = await import('./render');

type FakeKey = { readonly isDown: boolean; readonly on: (event: string, handler: () => void) => FakeKey };
type FakePointer = { readonly worldX: number; readonly worldY: number; isDown: boolean };
type PointerDownHandler = (pointer: FakePointer, currentlyOver: readonly object[]) => void;

// 初期配置の処理が触る MainScene の private メンバーと、create() が使う Phaser のプロパティだけを表す型。
type SceneUnderTest = {
  phase: 'setup' | 'playing';
  initialPlacement: InitialPlacementState;
  initialPlacementItemType: ItemType;
  placedItems: readonly PlacedItem[];
  nextItemId: number;
  itemPage: number;
  followItemViews: Map<number, object>;
  elapsedMs: number;
  funds: number;
  codes: readonly object[];
  spawnElapsed: Map<number, number>;
  routes: Route[];
  gameOver: GameOverState;
  attackPointerHeld: boolean;
  input: {
    readonly activePointer: FakePointer;
    readonly keyboard: { readonly addKey: (name: string) => FakeKey };
    readonly on: (event: string, handler: PointerDownHandler) => void;
  };
  events: {
    readonly on: Mock<(event: string) => void>;
    readonly once: Mock<(event: string) => void>;
    readonly off: Mock<(event: string) => void>;
    readonly emit: Mock<(event: string) => boolean>;
  };
  time: { now: number; readonly delayedCall: Mock<(delay: number, callback: () => void) => void> };
  scene: { readonly restart: Mock<() => void> };
  create(): void;
  update(time: number, delta: number): void;
};

type Harness = {
  readonly scene: SceneUnderTest;
  readonly pressKey: (name: string) => void;
  readonly pointerDown: (point: { readonly x: number; readonly y: number }, currentlyOver?: readonly object[]) => void;
};

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

// create() を実行したシーン。キーとポインターのハンドラーは記録して、テストから呼べるようにする。
// scene.restart() は create() をもう一度実行する（キー・ハンドラーは Phaser の SHUTDOWN で消えるので記録し直す）。
const createHarness = (): Harness => {
  let keyHandlers = new Map<string, (() => void)[]>();
  let pointerHandlers: PointerDownHandler[] = [];
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  const activePointer: FakePointer = { worldX: 0, worldY: 0, isDown: false };
  scene.input = {
    activePointer,
    keyboard: {
      addKey: (name) => {
        const key: FakeKey = {
          isDown: false,
          on: (_event, handler) => {
            keyHandlers.set(name, [...(keyHandlers.get(name) ?? []), handler]);
            return key;
          },
        };
        return key;
      },
    },
    on: (_event, handler) => {
      pointerHandlers.push(handler);
    },
  };
  scene.events = {
    on: vi.fn<(event: string) => void>(),
    once: vi.fn<(event: string) => void>(),
    off: vi.fn<(event: string) => void>(),
    emit: vi.fn<(event: string) => boolean>(() => true),
  };
  scene.time = { now: 0, delayedCall: vi.fn<(delay: number, callback: () => void) => void>() };
  // Phaser と同じく restart は予約だけして、押下の処理が終わってから create() をやり直す。
  let restartPending = false;
  scene.scene = {
    restart: vi.fn<() => void>(() => {
      restartPending = true;
    }),
  };
  scene.create();
  return {
    scene,
    pressKey: (name) => {
      const handlers = keyHandlers.get(name);
      if (handlers === undefined) throw new Error(`キーが登録されていません: ${name}`);
      handlers.forEach((handler) => handler());
      if (restartPending) {
        restartPending = false;
        keyHandlers = new Map();
        pointerHandlers = [];
        scene.create();
      }
    },
    pointerDown: (point, currentlyOver = []) => {
      pointerHandlers.forEach((handler) => handler({ worldX: point.x, worldY: point.y, isDown: true }, currentlyOver));
    },
  };
};

// 初期配置の間に置ける配置グリッド（16px #151）のセルを左上から n 個（ルート・HUD・初期配置UIの範囲と、先に選んだセルのフットプリントに重ならないセル）。
const placeableCells = (routes: readonly Route[], count: number): GridCell[] => {
  const cells: GridCell[] = [];
  for (let row = 0; row < PLACEMENT_ROWS && cells.length < count; row += 1) {
    for (let col = 0; col < PLACEMENT_COLS && cells.length < count; col += 1) {
      const cell = { col, row };
      const placedItems: PlacedItem[] = cells.map((chosen, id) => ({ id, itemType: 'linter', cell: chosen, lastAttackTime: null }));
      if (
        isPlaceableCell(cell, {
          routes,
          placedItems,
          blockedRects: [...ITEM_BLOCKED_RECTS, INITIAL_PLACEMENT_UI_BOUNDS],
        })
      ) {
        cells.push(cell);
      }
    }
  }
  if (cells.length < count) throw new Error('置けるセルが足りません');
  return cells;
};

// 押す位置は配置グリッドのセルの中心。
const centerOf = (cell: GridCell): { readonly x: number; readonly y: number } => placementCellCenter(cell);

const startKey = INITIAL_PLACEMENT_START_KEYS[0];

describe('MainScene: 初期配置フェーズ(#47)', () => {
  it('create() は setup・STAGE_POINTS_INITIAL・配置なしで始まり、パネルと開始ボタンを描く', () => {
    const { scene } = createHarness();
    expect(scene.phase).toBe('setup');
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    expect(scene.placedItems).toEqual([]);
    expect(render.drawInitialPlacementPanel).toHaveBeenCalledOnce();
    expect(render.drawInitialPlacementStartButton).toHaveBeenCalledOnce();
  });

  it('setup の間は update() で時間が進まず、コードも出ず、資金も変わらない', () => {
    const { scene } = createHarness();
    const spawnElapsed = new Map(scene.spawnElapsed);
    for (let i = 0; i < 10; i += 1) {
      scene.update(i * 1000, 1000);
    }
    expect(scene.elapsedMs).toBe(0);
    expect(scene.codes).toEqual([]);
    expect(scene.spawnElapsed).toEqual(spawnElapsed);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(render.drawCode).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('空のセルを押すと選択中のアイテムを置き、もう一度押すと撤去して全額返す。資金は変えない', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    const itemType = scene.initialPlacementItemType;

    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toEqual([
      { id: 0, itemType, cell, lastAttackTime: null },
    ]);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL - getStagePointCost(itemType));
    expect(render.drawPlacedItem).toHaveBeenCalledOnce();
    const drawing = vi.mocked(render.drawPlacedItem).mock.results[0];
    if (drawing === undefined || drawing.type !== 'return') throw new Error('描画の結果がありません');
    const view = vi.spyOn(drawing.value, 'destroy');

    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    expect(view).toHaveBeenCalledOnce();
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('ボタン・マーカー上の押下（currentlyOver あり）では置かない', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell), [{}]);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawInitialPlacementMessage).not.toHaveBeenCalled();
  });

  it('境界値: フィールド外（x=960・y=540・負）の押下では置かず、メッセージも出さない。フィールド内の端（959.99, 539.99）は判定する(#151)', () => {
    const { scene, pointerDown } = createHarness();
    pointerDown({ x: FIELD_WIDTH, y: 100 });
    pointerDown({ x: 100, y: FIELD_HEIGHT });
    pointerDown({ x: -0.01, y: 100 });
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawInitialPlacementMessage).not.toHaveBeenCalled();
    // 右下の端はフィールド内なので判定し、フットプリントがはみ出すため「そこには置けません」。
    pointerDown({ x: FIELD_WIDTH - 0.01, y: FIELD_HEIGHT - 0.01 });
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'そこには置けません');
  });

  it('置いたアイテムのフットプリント（セルと同じ 16px #154）内なら、セルの中心でなくても撤去する。フットプリントの右端ちょうど（隣のセル）は撤去せず新しく置く', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    const { x, y, width, height } = itemFootprint(cell);
    // 右下の角の 0.01px 内側（同じセルの中心ではない点）を押すと撤去する。
    pointerDown({ x: x + width - 0.01, y: y + height - 0.01 });
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    // 置き直してから右端ちょうど（フットプリントの外 = 右隣のセル）を押すと、撤去ではなく右隣に新しく置く（辺が接するだけなので重ならない）。
    pointerDown(centerOf(cell));
    pointerDown({ x: x + width, y });
    const neighbour: GridCell = { col: cell.col + 1, row: cell.row };
    expect(scene.initialPlacement.itemState.placedItems.map((item) => item.cell)).toEqual([cell, neighbour]);
  });

  it('購入キーは setup の間は現在のページの種類を選ぶだけで、買わない。ページ切り替え(#58)は setup の間も動く', () => {
    const { scene, pressKey } = createHarness();
    const catIndex = ITEM_TYPES.indexOf('cat');
    const catPage = Math.floor(catIndex / ITEM_PAGE_SIZE);
    for (let page = 0; page < catPage; page += 1) {
      pressKey(ITEM_PAGE_KEYS.next);
    }
    expect(scene.itemPage).toBe(catPage);
    pressKey(ITEM_BUY_KEYS[catIndex % ITEM_PAGE_SIZE]);
    expect(scene.initialPlacementItemType).toBe('cat');
    expect(scene.placedItems).toEqual([]);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(render.drawItemMessage).not.toHaveBeenCalled();
  });

  it('置かないアイテム（placement: none #58）は選べても置けず、「そこには置けません」を出す。資金は変えない', () => {
    const { scene, pressKey, pointerDown } = createHarness();
    const index = ITEM_TYPES.indexOf('codeFreeze');
    for (let page = 0; page < Math.floor(index / ITEM_PAGE_SIZE); page += 1) {
      pressKey(ITEM_PAGE_KEYS.next);
    }
    pressKey(ITEM_BUY_KEYS[index % ITEM_PAGE_SIZE]);
    expect(scene.initialPlacementItemType).toBe('codeFreeze');
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'そこには置けません');
    expect(render.drawItemMessage).not.toHaveBeenCalled();
    expect(scene.funds).toBe(INITIAL_FUNDS);
  });

  it('初期配置で置いた主人公についてまわるアイテム（ペアプロ相棒 #58）は、開始時に followItemViews へ登録する', () => {
    const { scene, pressKey, pointerDown } = createHarness();
    const index = ITEM_TYPES.indexOf('pairProgrammer');
    for (let page = 0; page < Math.floor(index / ITEM_PAGE_SIZE); page += 1) {
      pressKey(ITEM_PAGE_KEYS.next);
    }
    pressKey(ITEM_BUY_KEYS[index % ITEM_PAGE_SIZE]);
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    const drawing = vi.mocked(render.drawPlacedItem).mock.results[0];
    if (drawing === undefined || drawing.type !== 'return') throw new Error('描画の結果がありません');
    expect(scene.followItemViews.size).toBe(0);
    pressKey(startKey);
    expect(scene.followItemViews.get(0)).toBe(drawing.value);
  });

  it('ポイントが足りないときは置かずにメッセージを出す', () => {
    const { scene, pointerDown } = createHarness();
    const cells = placeableCells(scene.routes, STAGE_POINTS_INITIAL + 1);
    const cost = getStagePointCost(scene.initialPlacementItemType);
    const fits = Math.floor(STAGE_POINTS_INITIAL / cost);
    cells.slice(0, fits + 1).forEach((cell) => pointerDown(centerOf(cell)));
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(fits);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'ステージポイントが足りません');
  });

  it('開始キーで playing に移り、置いたアイテムと id を引き継ぐ。以降は時間が進み、押下で置かない', () => {
    const { scene, pointerDown, pressKey } = createHarness();
    const [first, second, third] = placeableCells(scene.routes, 3);
    pointerDown(centerOf(first));
    pointerDown(centerOf(second));
    pointerDown(centerOf(second));
    const placed = scene.initialPlacement.itemState.placedItems;
    scene.input.activePointer.isDown = true;

    pressKey(startKey);

    expect(scene.phase).toBe('playing');
    expect(scene.placedItems).toEqual(placed);
    // 撤去した id 1 は再利用せず、次は 2 から。
    expect(scene.nextItemId).toBe(2);
    expect(scene.attackPointerHeld).toBe(true);
    pointerDown(centerOf(third));
    expect(scene.placedItems).toEqual(placed);
    scene.update(0, 1000);
    expect(scene.elapsedMs).toBe(1000);
  });

  it('配置ゼロでも開始できる。開始後に開始キーを押しても何も変わらない', () => {
    const { scene, pressKey } = createHarness();
    pressKey(startKey);
    expect(scene.phase).toBe('playing');
    expect(scene.placedItems).toEqual([]);
    expect(scene.nextItemId).toBe(0);
    scene.placedItems = [{ id: 0, itemType: 'linter', cell: { col: 1, row: 6 }, lastAttackTime: null }];
    pressKey(startKey);
    expect(scene.placedItems).toHaveLength(1);
  });

  it('倒産後のリスタートで setup・STAGE_POINTS_INITIAL・配置なしに戻る', () => {
    const { scene, pointerDown, pressKey } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    pressKey(startKey);
    scene.gameOver = { over: true, at: 0 };
    scene.time.now = Number.MAX_SAFE_INTEGER;

    pressKey(GAME_OVER_RESTART_KEYS[0]);

    expect(scene.scene.restart).toHaveBeenCalledOnce();
    expect(scene.phase).toBe('setup');
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    expect(scene.initialPlacement.itemState).toEqual({ placedItems: [], nextId: 0 });
    expect(scene.placedItems).toEqual([]);
    expect(scene.nextItemId).toBe(0);
  });
});
