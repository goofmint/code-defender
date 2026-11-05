// 初期配置フェーズ(#47)を、実際の MainScene の create() / update() / pointerdown / 開始キー / tryRestart() で確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（engineerResign.test.ts と同じ形）。
// 描画（render.ts）もモックして、Phaser の GameObject を作らずに create() を通す。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CELL_SIZE,
  ENGINEER_SPAWN_COL,
  FIELD_ROWS,
  GAME_OVER_RESTART_KEYS,
  INITIAL_FUNDS,
  INITIAL_PLACEMENT_START_BUTTON_ALPHA,
  INITIAL_PLACEMENT_START_KEYS,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_BUY_KEYS,
  ITEM_PAGE_KEYS,
  ITEM_PAGE_SIZE,
  ITEM_SHORT_NAMES,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  STAGE_POINTS_INITIAL,
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import type { Engineer } from './engineer';
import type { GameOverState } from './gameOver';
import {
  engineerRemoveButtonCenter,
  formatInitialPlacementItemButton,
  getStagePointCost,
  itemRemoveButtonCenter,
  listEngineerCandidateCells,
} from './initialPlacement';
import type { InitialPlacementSelection, InitialPlacementState } from './initialPlacement';
import { ITEM_TYPES } from './item';
import type { ItemType } from './item';
import { isPlaceableCell, itemFootprint, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { cellCenter } from './route';
import type { GridCell, Point, Route } from './route';
import type { ItemMenuView } from './render';

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
    readonly setAlpha: (alpha: number) => FakeObject;
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
      setAlpha: () => object,
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
    drawGameOver: vi.fn(),
    drawHireMessage: vi.fn(object),
    // エンジニアを置ける床の色分け(#157)。置く・外すたびに描き直す。
    drawEngineerCandidateOverlay: vi.fn(object),
    // エンジニアの選択ボタン(#157)。コールバックは mock.calls の3番目の引数から呼ぶ。
    drawInitialPlacementEngineerButton: vi.fn(() => ({
      container: fakes.make(),
      setLabel: vi.fn(),
      setSelected: vi.fn(),
    })),
    drawInitialPlacementMessage: vi.fn(object),
    drawInitialPlacementPanel: vi.fn(object),
    drawInitialPlacementStartButton: vi.fn(object),
    drawItemAttackEffect: vi.fn(),
    // 右上のアイコン(#156)。押したときのコールバックは mock.calls の2番目の引数。
    drawMenuIcons: vi.fn(() => ({ setOpen: vi.fn(), setDimmed: vi.fn() })),
    // アイテムのメニュー(#156)。中身（文言・ページ・強調する枠）は mock.calls の2番目、枠・ページ切替のコールバックは3番目の引数。
    drawItemMenu: vi.fn(object),
    drawEngineerMenu: vi.fn(object),
    drawBalanceMenu: vi.fn(object),
    drawEngineerPopover: vi.fn(object),
    // 右下の指標(#156)。
    drawStatusPanel: vi.fn(() => ({
      setFunds: vi.fn(),
      setScore: vi.fn(),
      setMonthEndPayment: vi.fn(),
      setTechDebtLevel: vi.fn(),
    })),
    drawItemMessage: vi.fn(object),
    drawOutageText: vi.fn(),
    drawPlacedItem: vi.fn(object),
    drawPenaltyText: vi.fn(),
    drawPlayer: vi.fn(object),
    drawReleasePoint: vi.fn(),
    // 取消（×）ボタン(#157)。中心とコールバックは mock.calls の2・3番目の引数から読む。
    drawRemoveButton: vi.fn(object),
    drawRoutes: vi.fn(
      (_scene: object, routes: readonly { readonly id: number }[]) =>
        new Map(
          routes.map((route) => [route.id, { line: fakes.make(), spawnMarker: fakes.make(), spawnDecoration: fakes.make() }]),
        ),
    ),
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
  initialPlacementSelection: InitialPlacementSelection;
  engineers: Engineer[];
  placedItems: readonly PlacedItem[];
  nextItemId: number;
  itemPage: number;
  openMenu: 'engineer' | 'item' | 'balance' | null;
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

// 右上のアイコン(#156)を押す（最後に描いたアイコンのコールバックを呼ぶ）。
const pressIcon = (kind: 'engineer' | 'item' | 'balance'): void => {
  const call = vi.mocked(render.drawMenuIcons).mock.calls.at(-1);
  if (call === undefined) throw new Error('アイコンが描かれていません');
  call[1](kind);
};

// 最後に描いたアイテムのメニュー(#156)の中身と、枠・ページ切替のコールバック。
const lastItemMenu = (): {
  readonly view: ItemMenuView;
  readonly onBuySlot: (slot: number) => void;
  readonly onPage: (direction: 'previous' | 'next') => void;
} => {
  const call = vi.mocked(render.drawItemMenu).mock.calls.at(-1);
  if (call === undefined) throw new Error('アイテムのメニューが描かれていません');
  return { view: call[1], onBuySlot: call[2].onBuySlot, onPage: call[2].onPage };
};

// 右上のアイテムのアイコンでメニューを開き（開いていなければ）、ページを送ってから枠を押してアイテムの種類を選ぶ(#156)。
// メニューはページを送るたびに描き直すので、毎回最後に描いたメニューを使う。
const selectItem = (scene: SceneUnderTest, itemType: ItemType): void => {
  if (scene.openMenu !== 'item') pressIcon('item');
  const index = ITEM_TYPES.indexOf(itemType);
  const page = Math.floor(index / ITEM_PAGE_SIZE);
  while (scene.itemPage < page) lastItemMenu().onPage('next');
  while (scene.itemPage > page) lastItemMenu().onPage('previous');
  lastItemMenu().onBuySlot(index % ITEM_PAGE_SIZE);
};

// 最後に描いたエンジニアの選択ボタン(#157)。
const lastEngineerButton = (): {
  readonly onSelect: () => void;
  readonly setLabel: Mock<(text: string) => void>;
  readonly setSelected: Mock<(selected: boolean) => void>;
  readonly container: { readonly destroy: () => void };
} => {
  const call = vi.mocked(render.drawInitialPlacementEngineerButton).mock.calls.at(-1);
  const result = vi.mocked(render.drawInitialPlacementEngineerButton).mock.results.at(-1);
  if (call === undefined || result === undefined || result.type !== 'return') throw new Error('エンジニアの選択ボタンが描かれていません');
  return {
    onSelect: call[2],
    setLabel: vi.mocked(result.value.setLabel),
    setSelected: vi.mocked(result.value.setSelected),
    container: result.value.container,
  };
};

// 中心が center の×ボタンのうち最後に描いたもの(#157)。押す（コールバックを呼ぶ）関数と描画を返す。
const removeButtonAt = (center: Point): { readonly press: () => void; readonly view: { readonly destroy: () => void } } => {
  const calls = vi.mocked(render.drawRemoveButton).mock.calls;
  const results = vi.mocked(render.drawRemoveButton).mock.results;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const [, buttonCenter, onRemove] = calls[i];
    const result = results[i];
    if (buttonCenter.x === center.x && buttonCenter.y === center.y && result.type === 'return') {
      return { press: onRemove, view: result.value };
    }
  }
  throw new Error(`×ボタンがありません: (${center.x}, ${center.y})`);
};

// エンジニアの担当ルート（出現場所）。
const routeOf = (scene: SceneUnderTest, engineer: Engineer): Route => {
  const route = scene.routes.find((candidate) => candidate.id === engineer.routeId);
  if (route === undefined) throw new Error(`ルートがありません: engineerId=${engineer.id}`);
  return route;
};

describe('MainScene: 初期配置フェーズ(#47)', () => {
  it('create() は setup・STAGE_POINTS_INITIAL・配置なしで始まり、パネルと開始ボタンを描く', () => {
    const { scene } = createHarness();
    expect(scene.phase).toBe('setup');
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    expect(scene.placedItems).toEqual([]);
    expect(render.drawInitialPlacementPanel).toHaveBeenCalledOnce();
    expect(render.drawInitialPlacementStartButton).toHaveBeenCalledOnce();
  });

  it('create() は未選択で始まり、エンジニアの選択ボタン・置ける床・初期エンジニア全員の×ボタンを描く(#157)', () => {
    const { scene } = createHarness();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'none' });
    expect(render.drawInitialPlacementEngineerButton).toHaveBeenCalledOnce();
    expect(vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1]).toEqual(
      listEngineerCandidateCells(scene.routes, []),
    );
    expect(scene.engineers.length).toBeGreaterThan(0);
    expect(render.drawRemoveButton).toHaveBeenCalledTimes(scene.engineers.length);
    scene.engineers.forEach((engineer) => {
      expect(() => removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, engineer).spawn))).not.toThrow();
    });
    // アイテムのメニューは閉じた状態で始まり、開くと setup の文言（ステージポイント）で、強調なし(#156)。
    expect(scene.openMenu).toBeNull();
    expect(render.drawItemMenu).not.toHaveBeenCalled();
    pressIcon('item');
    const { view } = lastItemMenu();
    expect(view.labels[0]).toBe(formatInitialPlacementItemButton(ITEM_TYPES[0]));
    expect(view.selectedSlot).toBeNull();
  });

  it('未選択のまま床を押すと置かず、「先に置くものを選んでください」を出す(#157)', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, '先に置くものを選んでください');
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

  it('アイテムを選んで空のセルを押すと置き、右上の×を押すと撤去して全額返す。資金は変えない(#157)', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    const itemType: ItemType = 'linter';
    selectItem(scene, itemType);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType });

    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toEqual([
      { id: 0, itemType, cell, lastAttackTime: null },
    ]);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL - getStagePointCost(itemType));
    expect(render.drawPlacedItem).toHaveBeenCalledOnce();
    const drawing = vi.mocked(render.drawPlacedItem).mock.results[0];
    if (drawing === undefined || drawing.type !== 'return') throw new Error('描画の結果がありません');
    const view = vi.spyOn(drawing.value, 'destroy');
    const removeButton = removeButtonAt(itemRemoveButtonCenter(cell));
    const removeView = vi.spyOn(removeButton.view, 'destroy');

    removeButton.press();
    // ×の押下でもシーンの pointerdown は届くが、currentlyOver（×ボタン）があるので置かない。
    pointerDown(itemRemoveButtonCenter(cell), [removeButton.view]);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
    expect(view).toHaveBeenCalledOnce();
    expect(removeView).toHaveBeenCalledOnce();
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, `${ITEM_SHORT_NAMES.linter}を撤去しました`);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('選んだアイテムは置いたあとも選んだままで、続けて置ける。アイテムのメニューの選んだ枠を強調し、床を押してもメニューは閉じない(#157, #156)', () => {
    const { scene, pointerDown } = createHarness();
    const [first, second] = placeableCells(scene.routes, 2);
    selectItem(scene, 'linter');
    pointerDown(centerOf(first));
    pointerDown(centerOf(second));
    expect(scene.initialPlacement.itemState.placedItems.map((item) => item.cell)).toEqual([first, second]);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'linter' });
    expect(scene.openMenu).toBe('item');
    expect(lastItemMenu().view.selectedSlot).toBe(ITEM_TYPES.indexOf('linter') % ITEM_PAGE_SIZE);
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
    selectItem(scene, 'linter');
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

  it('置いたアイテムの上（フットプリント内）を押しても撤去しない（撤去は×だけ #157）。右端ちょうど（右隣のセル #154）は隣に新しく置く', () => {
    const { scene, pointerDown } = createHarness();
    // 右隣のセルも置けるセル（初期配置UIの範囲の左隣などは右隣が置けないので除く）。
    const setupContext = { routes: scene.routes, placedItems: [], blockedRects: [...ITEM_BLOCKED_RECTS, INITIAL_PLACEMENT_UI_BOUNDS] };
    const cell = placeableCells(scene.routes, PLACEMENT_COLS).find((candidate) =>
      isPlaceableCell({ col: candidate.col + 1, row: candidate.row }, setupContext),
    );
    if (cell === undefined) throw new Error('右隣も置けるセルがありません');
    selectItem(scene, 'linter');
    pointerDown(centerOf(cell));
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    const { x, y, width, height } = itemFootprint(cell);
    // 同じセルの中心と、右下の角の 0.01px 内側（同じセルの中心ではない点）は重なるので置かず、撤去もしない。
    pointerDown(centerOf(cell));
    pointerDown({ x: x + width - 0.01, y: y + height - 0.01 });
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL - getStagePointCost('linter'));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'そこには置けません');
    // 右端ちょうど（フットプリントの外 = 右隣のセル）を押すと、右隣に新しく置く（辺が接するだけなので重ならない）。
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
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'cat' });
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
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'codeFreeze' });
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
    selectItem(scene, 'codeRabbit');
    const cost = getStagePointCost('codeRabbit');
    const fits = Math.floor(STAGE_POINTS_INITIAL / cost);
    cells.slice(0, fits + 1).forEach((cell) => pointerDown(centerOf(cell)));
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(fits);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'ステージポイントが足りません');
  });

  it('開始キーで playing に移り、置いたアイテムと id を引き継ぐ。以降は時間が進み、押下で置かない', () => {
    const { scene, pointerDown, pressKey } = createHarness();
    const [first, second, third] = placeableCells(scene.routes, 3);
    selectItem(scene, 'linter');
    pointerDown(centerOf(first));
    pointerDown(centerOf(second));
    removeButtonAt(itemRemoveButtonCenter(second)).press();
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
    selectItem(scene, 'linter');
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
    expect(scene.initialPlacementSelection).toEqual({ kind: 'none' });
  });
});

describe('MainScene: 初期配置でエンジニアの位置を選ぶ(#157)', () => {
  // 出現列（ENGINEER_SPAWN_COL）の行 row のセルの中心。
  const spawnPoint = (row: number): Point => cellCenter({ col: ENGINEER_SPAWN_COL, row });

  it('×でエンジニアを外すと、ルートの線・出現場所・装飾・休暇マーカー・×ボタンを消し、未配置に戻す。開始ボタンは薄くなる', () => {
    const { scene } = createHarness();
    const engineer = scene.engineers[0];
    const route = routeOf(scene, engineer);
    const routeDrawing = vi.mocked(render.drawRoutes).mock.results[0];
    if (routeDrawing === undefined || routeDrawing.type !== 'return') throw new Error('ルートが描かれていません');
    const drawing = routeDrawing.value.get(route.id);
    if (drawing === undefined) throw new Error('ルートの描画がありません');
    const destroyed = [drawing.line, drawing.spawnMarker, drawing.spawnDecoration].map((view) => vi.spyOn(view, 'destroy'));
    const markerIndex = vi.mocked(render.drawVacationMarker).mock.calls.findIndex(([, markerRoute]) => markerRoute.id === route.id);
    const marker = vi.mocked(render.drawVacationMarker).mock.results[markerIndex];
    if (marker === undefined || marker.type !== 'return') throw new Error('休暇マーカーがありません');
    const markerDestroy = vi.spyOn(marker.value.container, 'destroy');
    const button = removeButtonAt(engineerRemoveButtonCenter(route.spawn));
    const buttonDestroy = vi.spyOn(button.view, 'destroy');
    const startButton = vi.mocked(render.drawInitialPlacementStartButton).mock.results[0];
    if (startButton === undefined || startButton.type !== 'return') throw new Error('開始ボタンがありません');
    const setAlpha = vi.spyOn(startButton.value, 'setAlpha');

    button.press();

    expect(scene.engineers.find((candidate) => candidate.id === engineer.id)?.routeId).toBeNull();
    expect(scene.engineers).toHaveLength(3);
    expect(scene.routes.map((candidate) => candidate.id)).not.toContain(route.id);
    destroyed.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(markerDestroy).toHaveBeenCalledOnce();
    expect(buttonDestroy).toHaveBeenCalledOnce();
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを外しました');
    expect(setAlpha).toHaveBeenLastCalledWith(INITIAL_PLACEMENT_START_BUTTON_ALPHA.disabled);
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア 残り1人');
    // 外した出現セルは置ける床に戻る。
    expect(vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1]).toContainEqual(route.spawn);
  });

  it('境界値: 未配置が1人でもいると開始できず「エンジニアを全員配置してください」を出す。全員置くと開始できる', () => {
    const { scene, pressKey, pointerDown } = createHarness();
    const engineer = scene.engineers[1];
    removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, engineer).spawn)).press();

    pressKey(startKey);
    expect(scene.phase).toBe('setup');
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを全員配置してください');
    // 開始ボタン（マウス）でも同じ。
    const onStart = vi.mocked(render.drawInitialPlacementStartButton).mock.calls[0]?.[1];
    if (onStart === undefined) throw new Error('開始ボタンのコールバックがありません');
    onStart();
    expect(scene.phase).toBe('setup');

    lastEngineerButton().onSelect();
    pointerDown(spawnPoint(0));
    expect(scene.engineers.every((candidate) => candidate.routeId !== null)).toBe(true);
    pressKey(startKey);
    expect(scene.phase).toBe('playing');
  });

  it('エンジニアを選んで置ける床を押すと、未配置の人をそこに置いてルートを1本描き、休暇マーカーと×ボタンを付ける。全員置くと未選択に戻る', () => {
    const { scene, pointerDown } = createHarness();
    const engineer = scene.engineers[0];
    removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, engineer).spawn)).press();
    vi.mocked(render.drawRoutes).mockClear();
    vi.mocked(render.drawVacationMarker).mockClear();

    lastEngineerButton().onSelect();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer' });
    expect(lastEngineerButton().setSelected).toHaveBeenLastCalledWith(true);
    // 行内のどこを押しても同じセル（右下の 0.01px 内側）。
    pointerDown({ x: CELL_SIZE - 0.01, y: CELL_SIZE * (FIELD_ROWS - 1) + CELL_SIZE - 0.01 });

    const placed = scene.engineers.find((candidate) => candidate.id === engineer.id);
    if (placed === undefined || placed.routeId === null) throw new Error('エンジニアが置かれていません');
    const route = routeOf(scene, placed);
    expect(route.spawn).toEqual({ col: ENGINEER_SPAWN_COL, row: FIELD_ROWS - 1 });
    expect(render.drawRoutes).toHaveBeenCalledOnce();
    expect(vi.mocked(render.drawRoutes).mock.calls[0]?.[1]).toEqual([route]);
    expect(render.drawVacationMarker).toHaveBeenCalledOnce();
    expect(() => removeButtonAt(engineerRemoveButtonCenter(route.spawn))).not.toThrow();
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを置きました');
    expect(scene.initialPlacementSelection).toEqual({ kind: 'none' });
    expect(lastEngineerButton().setSelected).toHaveBeenLastCalledWith(false);
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア 残り0人');
    expect(vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1]).not.toContainEqual(route.spawn);
  });

  it('境界値: エンジニアは出現列の右隣（x=60）や使用中の出現セルには置けず、0.01px 左（x=59.99）の空いた行なら置ける', () => {
    const { scene, pointerDown } = createHarness();
    removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, scene.engineers[0]).spawn)).press();
    lastEngineerButton().onSelect();
    pointerDown({ x: CELL_SIZE, y: spawnPoint(0).y });
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアはここに置けません');
    pointerDown(cellCenter(routeOf(scene, scene.engineers[1]).spawn));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアはここに置けません');
    expect(scene.engineers[0]?.routeId).toBeNull();
    pointerDown({ x: CELL_SIZE - 0.01, y: spawnPoint(0).y });
    expect(scene.engineers[0]?.routeId).not.toBeNull();
  });

  it('全員配置済みでエンジニアを選んで押すと「置けるエンジニアがいません」', () => {
    const { scene, pointerDown } = createHarness();
    lastEngineerButton().onSelect();
    pointerDown(spawnPoint(0));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, '置けるエンジニアがいません');
    expect(scene.routes).toHaveLength(scene.engineers.length);
  });

  it('アイテムを置く・外すたびに置ける床を描き直す（前の床は消す）', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    const before = vi.mocked(render.drawEngineerCandidateOverlay).mock.results.at(-1);
    if (before === undefined || before.type !== 'return') throw new Error('床が描かれていません');
    const beforeDestroy = vi.spyOn(before.value, 'destroy');
    selectItem(scene, 'linter');
    pointerDown(centerOf(cell));
    expect(beforeDestroy).toHaveBeenCalled();
    expect(vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1]).toEqual(
      listEngineerCandidateCells(scene.routes, scene.initialPlacement.itemState.placedItems),
    );
  });

  it('開始時に置ける床・すべての×ボタン・エンジニアの選択ボタンを消し、開いているアイテムのメニューを通常の表示（金額・強調なし）に戻す', () => {
    const { scene, pointerDown, pressKey } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    selectItem(scene, 'linter');
    pointerDown(centerOf(cell));
    const overlay = vi.mocked(render.drawEngineerCandidateOverlay).mock.results.at(-1);
    if (overlay === undefined || overlay.type !== 'return') throw new Error('床が描かれていません');
    const overlayDestroy = vi.spyOn(overlay.value, 'destroy');
    const removeButtons = vi
      .mocked(render.drawRemoveButton)
      .mock.results.flatMap((result) => (result.type === 'return' ? [vi.spyOn(result.value, 'destroy')] : []));
    expect(removeButtons).toHaveLength(scene.engineers.length + 1);
    const engineerButtonDestroy = vi.spyOn(lastEngineerButton().container, 'destroy');

    pressKey(startKey);

    expect(scene.phase).toBe('playing');
    expect(overlayDestroy).toHaveBeenCalledOnce();
    removeButtons.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(engineerButtonDestroy).toHaveBeenCalledOnce();
    const { view } = lastItemMenu();
    expect(view.labels[0]).not.toBe(formatInitialPlacementItemButton(ITEM_TYPES[0]));
    expect(view.labels[0]).toContain('万');
    expect(view.selectedSlot).toBeNull();
    // 開始後は床を押してもエンジニア・アイテムを置かない。
    const routes = scene.routes.length;
    pointerDown({ x: CELL_SIZE / 2, y: CELL_SIZE / 2 });
    expect(scene.routes).toHaveLength(routes);
  });
});
