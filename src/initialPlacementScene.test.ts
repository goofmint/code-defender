// 初期配置フェーズ(#47)を、実際の MainScene の create() / update() / pointerdown / 開始ボタン / tryRestart() で確かめる（ほかのキー操作は #165 で廃止）。
// 主人公の移動・攻撃のキー（矢印・WASD・スペース）とバーチャルパッド(#182)もここで確かめる。
// ゲームの説明（右上の ℹ️ #165）の開閉と、開いている間に時間・配置・攻撃が止まることもここで確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（engineerResign.test.ts と同じ形）。
// 描画（render.ts）もモックして、Phaser の GameObject を作らずに create() を通す。
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  ATTACK_COOLDOWN_MS,
  CELL_SIZE,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  ENGINEER_RANKS,
  ENGINEER_SPAWN_COL,
  FIELD_ROWS,
  INITIAL_FUNDS,
  INITIAL_PLACEMENT_DEFAULT_ENGINEER_RANK,
  INITIAL_PLACEMENT_START_BUTTON_ALPHA,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  ITEM_PAGE_SIZE,
  ITEM_SHORT_NAMES,
  LEVEL_UP_INTERVAL_DAYS,
  MAX_ENGINEERS,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  PLAYER_SPEED,
  STAGE_POINTS_INITIAL,
  VIRTUAL_PAD_CELL_SIZE,
  VIRTUAL_PAD_RECT,
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { createFundsChangedEvent, FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import { ENGINEER_HIRED_EVENT, formatSelectedEngineerLines, getRankLabel, hireEngineer } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import type { GameOverState } from './gameOver';
import { MS_PER_GAME_DAY } from './gameTime';
import {
  engineerRemoveButtonCenter,
  formatInitialPlacementItemButton,
  getStagePointCost,
  itemRemoveButtonCenter,
  listEngineerCandidateCells,
} from './initialPlacement';
import type { InitialPlacementSelection, InitialPlacementState } from './initialPlacement';
import { buildHelpContent } from './help';
import { formatYen, getMessages, setLocale } from './i18n';
import { getItemPlacement, ITEM_REQUIRED_LEVELS, ITEM_TYPES } from './item';
import type { ItemType } from './item';
import { isPlaceableCell, itemFootprint, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { cellCenter } from './route';
import type { GridCell, Point, Route } from './route';
import type { EngineerMenuCallbacks, ItemMenuView } from './render';

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
    // ゲームの説明(#165)。アイコンのコールバックは drawHelpIcon の mock.calls の2番目、閉じるコールバックは drawHelpOverlay の4番目の引数。
    drawHelpIcon: vi.fn(object),
    drawHelpOverlay: vi.fn(() => ({ destroy: vi.fn() })),
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
      setTechDebt: vi.fn(),
    })),
    drawItemMessage: vi.fn(object),
    drawOutageText: vi.fn(),
    drawPlacedItem: vi.fn(object),
    // 置けるかどうかの枠(#162)。枠の状態は updatePlacementPreview の mock.calls の2番目の引数から読む。
    drawPlacementPreview: vi.fn(object),
    updatePlacementPreview: vi.fn(),
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
    // バーチャルパッド(#182)。押したときのコールバックは mock.calls の2番目の引数（押した Pointer を渡す）。
    drawVirtualPad: vi.fn(),
    flashCode: vi.fn(),
    setPlayerFacing: vi.fn(),
  };
});

const render = await import('./render');

type FakePointer = { worldX: number; worldY: number; isDown: boolean };
// Phaser の Key の偽物(#182)。isDown（押している）と、on で登録したハンドラー（イベント名がキー）だけを持つ。
type FakeKey = {
  isDown: boolean;
  readonly handlers: Map<string, (() => void)[]>;
  readonly on: (event: string, handler: () => void) => FakeKey;
};
type PointerDownHandler = (pointer: FakePointer, currentlyOver: readonly object[]) => void;
// pointerdown と pointermove(#162) は同じ形の引数で呼ばれる。
type PointerHandler = PointerDownHandler;

// 初期配置の処理が触る MainScene の private メンバーと、create() が使う Phaser のプロパティだけを表す型。
type SceneUnderTest = {
  phase: 'setup' | 'playing';
  initialPlacement: InitialPlacementState;
  initialPlacementSelection: InitialPlacementSelection;
  engineers: Engineer[];
  nextEngineerId: number;
  selectedEngineerId: number | null;
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
  helpOpen: boolean;
  lastAttackTime: number | null;
  player?: { x: number; y: number };
  padPointer: FakePointer | null;
  // ゲームオーバー(#182 のパッドの押下をやめる)を onFundsChanged で起こすテストだけが入れる。
  tweens?: { readonly pauseAll: Mock<() => void> };
  onFundsChanged(event: FundsChangedEvent): void;
  input: {
    readonly activePointer: FakePointer;
    // 主人公の移動・攻撃のキー(#182)。addKey はキー名ごとに新しい FakeKey を返す（Phaser は restart の shutdown でキーを破棄する）。
    readonly keyboard: { readonly addKey: Mock<(name: string, enableCapture: boolean, emitOnRepeat: boolean) => FakeKey> };
    readonly on: (event: string, handler: PointerHandler) => void;
  };
  events: {
    // 購読（handler と this）は記録するだけ。雇用(#172)のテストでは relayEmitted で ENGINEER_HIRED_EVENT を購読者に渡す。
    readonly on: Mock<(event: string, handler: (payload: object) => void, context: object) => void>;
    readonly once: Mock<(event: string) => void>;
    readonly off: Mock<(event: string) => void>;
    readonly emit: Mock<(event: string, payload?: object) => boolean>;
  };
  time: { now: number; readonly delayedCall: Mock<(delay: number, callback: () => void) => void> };
  scene: { readonly restart: Mock<() => void> };
  create(): void;
  update(time: number, delta: number): void;
};

type Harness = {
  readonly scene: SceneUnderTest;
  readonly pointerDown: (point: { readonly x: number; readonly y: number }, currentlyOver?: readonly object[]) => void;
  // ポインターを動かす（pointermove #162）。
  readonly pointerMove: (point: { readonly x: number; readonly y: number }, currentlyOver?: readonly object[]) => void;
  // 最後に登録したキー名 name の FakeKey(#182)。登録されていなければエラー。
  readonly key: (name: string) => FakeKey;
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

// create() を実行したシーン。ポインターのハンドラーは記録して、テストから呼べるようにする。
// scene.restart() は create() をもう一度実行する（ハンドラーは Phaser の SHUTDOWN で消えるので記録し直す）。
const createHarness = (): Harness => {
  // ポインターのハンドラー（イベント名がキー。pointerdown と pointermove #162）。
  let pointerHandlers = new Map<string, PointerHandler[]>();
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  const activePointer: FakePointer = { worldX: 0, worldY: 0, isDown: false };
  const keys = new Map<string, FakeKey>();
  scene.input = {
    activePointer,
    keyboard: {
      addKey: vi.fn<(name: string, enableCapture: boolean, emitOnRepeat: boolean) => FakeKey>((name) => {
        const fakeKey: FakeKey = {
          isDown: false,
          handlers: new Map(),
          on: (event, handler) => {
            fakeKey.handlers.set(event, [...(fakeKey.handlers.get(event) ?? []), handler]);
            return fakeKey;
          },
        };
        keys.set(name, fakeKey);
        return fakeKey;
      }),
    },
    on: (event, handler) => {
      pointerHandlers.set(event, [...(pointerHandlers.get(event) ?? []), handler]);
    },
  };
  scene.events = {
    on: vi.fn<(event: string, handler: (payload: object) => void, context: object) => void>(),
    once: vi.fn<(event: string) => void>(),
    off: vi.fn<(event: string) => void>(),
    emit: vi.fn<(event: string, payload?: object) => boolean>(() => true),
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
    // ゲームオーバー中の押下でリスタートを予約したら、押下の処理が終わってから create() をやり直す（Phaser と同じ）。
    pointerDown: (point, currentlyOver = []) => {
      (pointerHandlers.get('pointerdown') ?? []).forEach((handler) =>
        handler({ worldX: point.x, worldY: point.y, isDown: true }, currentlyOver),
      );
      if (restartPending) {
        restartPending = false;
        pointerHandlers = new Map();
        scene.create();
      }
    },
    pointerMove: (point, currentlyOver = []) => {
      (pointerHandlers.get('pointermove') ?? []).forEach((handler) =>
        handler({ worldX: point.x, worldY: point.y, isDown: false }, currentlyOver),
      );
    },
    key: (name) => {
      const fakeKey = keys.get(name);
      if (fakeKey === undefined) throw new Error(`キーが登録されていません: ${name}`);
      return fakeKey;
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
          blockedRects: [...ITEM_BLOCKED_RECTS, ...INITIAL_PLACEMENT_UI_BOUNDS],
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

// 最後に描いた開始ボタンのコールバック（開始キーは #165 で廃止）。
const lastStartButton = (): (() => void) => {
  const call = vi.mocked(render.drawInitialPlacementStartButton).mock.calls.at(-1);
  if (call === undefined) throw new Error('開始ボタンが描かれていません');
  return call[1];
};
const pressStart = (): void => lastStartButton()();

// 出現 (30, 210) → (330, 210) → 折れ点 (330, 330) → 終点 (570, 330) の固定のルート。create() のランダムなルートを置き換え、
// 置けるセルが実行ごとに変わらないようにする（#162 の検査と #165 の開始・ゲームの説明の検査で使う）。
const fixedRoute: Route = {
  id: 100,
  spawn: { col: 0, row: 3 },
  waypoints: [
    { col: 0, row: 3 },
    { col: 5, row: 3 },
    { col: 5, row: 5 },
    { col: 9, row: 5 },
  ],
};

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

// 出現列（ENGINEER_SPAWN_COL）の行 row のセルの中心。
const spawnPoint = (row: number): Point => cellCenter({ col: ENGINEER_SPAWN_COL, row });

// 最後に描いたエンジニアのメニュー(#156)の雇う・選択・給与のコールバック。
const lastEngineerMenu = (): EngineerMenuCallbacks => {
  const call = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1);
  if (call === undefined) throw new Error('エンジニアのメニューが描かれていません');
  return call[2];
};

// harness の events.emit は記録するだけなので、fromIndex 番目以降に発行した event を、create() で購読した処理に渡す（Phaser と同じく同期で呼ぶ）。
const relayEmitted = (scene: SceneUnderTest, event: string, fromIndex: number): void => {
  const subscription = scene.events.on.mock.calls.filter(([name]) => name === event).at(-1);
  if (subscription === undefined) throw new Error(`購読がありません: ${event}`);
  const [, handler, context] = subscription;
  scene.events.emit.mock.calls.slice(fromIndex).forEach(([name, payload]) => {
    if (name !== event) return;
    if (payload === undefined) throw new Error(`ペイロードがありません: ${event}`);
    handler.call(context, payload);
  });
};

// 初期配置の間に、右上のエンジニアのメニューのランクのボタンで次に置くランクを選ぶ(#184)。雇うのは床を押したとき。
// 雇用のイベント（ENGINEER_HIRED_EVENT）が出ても購読者に渡す（初期配置の間は出ないことを各テストで確かめる）。
const selectRankInSetup = (scene: SceneUnderTest, rank: EngineerRank = 'junior'): void => {
  if (scene.openMenu !== 'engineer') pressIcon('engineer');
  const emitted = scene.events.emit.mock.calls.length;
  lastEngineerMenu().onHire(rank);
  relayEmitted(scene, ENGINEER_HIRED_EVENT, emitted);
};

// 雇用のイベント（ENGINEER_HIRED_EVENT）を出した回数。初期配置の間は出さない（雇うのと置くのを同時に行う #184）。
const hiredEmits = (scene: SceneUnderTest): number =>
  scene.events.emit.mock.calls.filter(([event]) => event === ENGINEER_HIRED_EVENT).length;

// 初期配置の間に、行ごとに rank を選んで出現列のその行を押し、雇って置く(#172, #184)。初期は0人なので、以前の初期配置（行1・4・7の3人）はこれで作る。
const FIXTURE_ROWS: readonly number[] = [1, 4, 7];
const hireAndPlace = (harness: Harness, rows: readonly number[] = FIXTURE_ROWS, rank: EngineerRank = 'junior'): void => {
  const before = harness.scene.engineers.length;
  rows.forEach((row) => {
    selectRankInSetup(harness.scene, rank);
    harness.pointerDown(spawnPoint(row));
  });
  if (harness.scene.engineers.length !== before + rows.length || harness.scene.engineers.some((engineer) => engineer.routeId === null)) {
    throw new Error('エンジニアを置けませんでした');
  }
};

// 出現列の行 row のルートの担当者のランク(#184)。担当者がいなければ undefined。
const rankOnRow = (scene: SceneUnderTest, row: number): EngineerRank | undefined => {
  const route = scene.routes.find((candidate) => candidate.spawn.col === ENGINEER_SPAWN_COL && candidate.spawn.row === row);
  return scene.engineers.find((engineer) => route !== undefined && engineer.routeId === route.id)?.rank;
};

// route を担当するジュニア1人(#172)。ルートを固定のもの（fixedRoute）に置き換えるテストで、開始の条件（1人以上を配置）を満たすために使う。
const engineerOn = (route: Route): Engineer => {
  const hired = hireEngineer(
    { engineers: [], nextId: 0 },
    'junior',
    { max: MAX_ENGINEERS },
    () => 0,
  );
  if (!hired.ok) throw new Error(`雇えませんでした: ${hired.reason}`);
  return { ...hired.engineer, routeId: route.id };
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

  it('create() は未選択・エンジニア0人・ルート0本で始まり、エンジニアの選択ボタン（既定のジュニア #184）と出現列の全行の置ける床を描き、×ボタンは描かない(#157, #172)', () => {
    const { scene } = createHarness();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'none' });
    expect(scene.engineers).toEqual([]);
    expect(scene.routes).toEqual([]);
    expect(scene.nextEngineerId).toBe(0);
    expect(scene.selectedEngineerId).toBeNull();
    expect(render.drawInitialPlacementEngineerButton).toHaveBeenCalledOnce();
    expect(INITIAL_PLACEMENT_DEFAULT_ENGINEER_RANK).toBe('junior');
    expect(vi.mocked(render.drawInitialPlacementEngineerButton).mock.calls[0]?.[1]).toBe('エンジニア: ジュニア');
    const candidates = vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1];
    expect(candidates).toEqual(listEngineerCandidateCells([], []));
    expect(candidates).toHaveLength(FIELD_ROWS);
    expect(render.drawRemoveButton).not.toHaveBeenCalled();
    // ルートの描画は create() で空の一覧を1回だけ描く。
    expect(render.drawRoutes).toHaveBeenCalledOnce();
    expect(vi.mocked(render.drawRoutes).mock.calls[0]?.[1]).toEqual([]);
    expect(render.drawVacationMarker).not.toHaveBeenCalled();
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
    const setupContext = { routes: scene.routes, placedItems: [], blockedRects: [...ITEM_BLOCKED_RECTS, ...INITIAL_PLACEMENT_UI_BOUNDS] };
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

  it('アイテムのメニューの枠は setup の間は解放済み（Lv.1 #164）の一覧の枠の種類を選ぶだけで、買わない。ページ切り替え(#58)は setup の間も動く', () => {
    const { scene } = createHarness();
    pressIcon('item');
    // Lv.1 は CodeRabbit・Linter・テストツールの1ページだけなので、次のページへ送っても1ページ目に戻る。
    lastItemMenu().onPage('next');
    expect(scene.itemPage).toBe(0);
    lastItemMenu().onBuySlot(2);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'testTool' });
    expect(scene.placedItems).toEqual([]);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(render.drawItemMessage).not.toHaveBeenCalled();
  });

  it('境界値: Lv.1 では4枠目より先は空の枠なので、その枠を押しても選択は変わらない(#164)', () => {
    const { scene } = createHarness();
    pressIcon('item');
    lastItemMenu().onBuySlot(0);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'codeRabbit' });
    for (let slot = 3; slot < ITEM_PAGE_SIZE; slot += 1) lastItemMenu().onBuySlot(slot);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'codeRabbit' });
  });

  it('初期配置のアイテムのメニューは Lv.1 の3種類だけで、ページは 1/1(#164)', () => {
    const { scene } = createHarness();
    pressIcon('item');
    expect(scene.openMenu).toBe('item');
    const { view } = lastItemMenu();
    expect(view.labels).toEqual([
      formatInitialPlacementItemButton('codeRabbit'),
      formatInitialPlacementItemButton('linter'),
      formatInitialPlacementItemButton('testTool'),
      null,
      null,
      null,
    ]);
    expect(view.pageLabel).toBe('1/1');
    expect(view.pageCount).toBe(1);
  });

  it('解放前のアイテム（CI・コードフリーズ）は選択が残っていても置けず、「まだ使えないアイテムです」を出す。ポイント・資金は変えない(#164)', () => {
    const { scene, pointerDown } = createHarness();
    const [cell] = placeableCells(scene.routes, 1);
    for (const itemType of ['ci', 'codeFreeze'] as const) {
      scene.initialPlacementSelection = { kind: 'item', itemType };
      pointerDown(centerOf(cell));
      expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
      expect(scene.initialPlacement.points).toBe(STAGE_POINTS_INITIAL);
      expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'まだ使えないアイテムです');
    }
    expect(render.drawItemMessage).not.toHaveBeenCalled();
    expect(scene.funds).toBe(INITIAL_FUNDS);
  });

  it('初期配置で置いた主人公についてまわるアイテム（ペアプロ相棒 #58）は、開始時に followItemViews へ登録する', () => {
    const harness = createHarness();
    const { scene, pointerDown } = harness;
    // 開始にはエンジニアが1人以上いる(#172)。
    hireAndPlace(harness, [1]);
    // ペアプロ相棒は Lv.4 で解放する(#164)。初期配置の間は Lv.1 なので、ここでは経過時間を Lv.4 にして開始時の引き継ぎの経路だけを確かめる。
    scene.elapsedMs = (ITEM_REQUIRED_LEVELS.pairProgrammer - 1) * LEVEL_UP_INTERVAL_DAYS * MS_PER_GAME_DAY;
    scene.initialPlacementSelection = { kind: 'item', itemType: 'pairProgrammer' };
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    const drawing = vi.mocked(render.drawPlacedItem).mock.results[0];
    if (drawing === undefined || drawing.type !== 'return') throw new Error('描画の結果がありません');
    expect(scene.followItemViews.size).toBe(0);
    pressStart();
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

  it('開始ボタンで playing に移り、置いたアイテムと id を引き継ぐ。以降は時間が進み、押下で置かない', () => {
    const { scene, pointerDown } = createHarness();
    // 置けるセルが実行ごとに変わらないよう、ルートを固定のものにする（開始の条件 #172 のため、その担当を1人置く）。
    scene.routes = [fixedRoute];
    scene.engineers = [engineerOn(fixedRoute)];
    const [first, second, third] = placeableCells(scene.routes, 3);
    selectItem(scene, 'linter');
    pointerDown(centerOf(first));
    pointerDown(centerOf(second));
    removeButtonAt(itemRemoveButtonCenter(second)).press();
    const placed = scene.initialPlacement.itemState.placedItems;
    scene.input.activePointer.isDown = true;

    pressStart();

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

  it('アイテムの配置ゼロでも（エンジニアを1人置けば #172）開始できる。開始後に開始ボタンのコールバックをもう一度呼んでも何も変わらない', () => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, [1]);
    const onStart = lastStartButton();
    onStart();
    expect(scene.phase).toBe('playing');
    expect(scene.placedItems).toEqual([]);
    expect(scene.nextItemId).toBe(0);
    scene.placedItems = [{ id: 0, itemType: 'linter', cell: { col: 1, row: 6 }, lastAttackTime: null }];
    onStart();
    expect(scene.placedItems).toHaveLength(1);
  });

  it('倒産後のリスタート（ゲームオーバー中の押下）で setup・STAGE_POINTS_INITIAL・配置なしに戻る', () => {
    const harness = createHarness();
    const { scene, pointerDown } = harness;
    hireAndPlace(harness, [1]);
    const [cell] = placeableCells(scene.routes, 1);
    selectItem(scene, 'linter');
    pointerDown(centerOf(cell));
    pressStart();
    scene.gameOver = { over: true, at: 0 };
    scene.time.now = Number.MAX_SAFE_INTEGER;

    pointerDown(centerOf(cell));

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
  // 初期は0人(#172)なので、各テストは雇って行1・4・7に置いた3人（hireAndPlace）から始める。
  const createPlacedHarness = (): Harness => {
    const harness = createHarness();
    hireAndPlace(harness);
    return harness;
  };

  it('×でエンジニアを外すと、ルートの線・出現場所・装飾・休暇マーカー・×ボタンを消し、名簿からも外す(#184)。2人残れば開始ボタンは濃いまま', () => {
    const { scene } = createPlacedHarness();
    const engineer = scene.engineers[0];
    const route = routeOf(scene, engineer);
    // 置くたびにそのルートだけを描く（drawRoutes は1人1回）。
    const drawing = vi
      .mocked(render.drawRoutes)
      .mock.results.flatMap((result) => (result.type === 'return' ? [result.value.get(route.id)] : []))
      .find((candidate) => candidate !== undefined);
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

    expect(scene.engineers.find((candidate) => candidate.id === engineer.id)).toBeUndefined();
    expect(scene.engineers).toHaveLength(FIXTURE_ROWS.length - 1);
    // 次の id は戻さない（外した人の id を再利用しない）。
    expect(scene.nextEngineerId).toBe(FIXTURE_ROWS.length);
    expect(scene.routes.map((candidate) => candidate.id)).not.toContain(route.id);
    destroyed.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(markerDestroy).toHaveBeenCalledOnce();
    expect(buttonDestroy).toHaveBeenCalledOnce();
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを外しました');
    expect(setAlpha).toHaveBeenLastCalledWith(INITIAL_PLACEMENT_START_BUTTON_ALPHA.enabled);
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア: ジュニア');
    // 選んでいた人（最後に置いた人）は残っているので選択は変わらない。
    expect(scene.selectedEngineerId).toBe(scene.engineers.at(-1)?.id);
    // 外した出現セルは置ける床に戻る。
    expect(vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1]).toContainEqual(route.spawn);
  });

  it('境界値(#184): 全員を×で外すと（0人）開始できず、1人置き直すと開始できる', () => {
    const { scene, pointerDown } = createPlacedHarness();
    [...scene.engineers].forEach((engineer) => removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, engineer).spawn)).press());
    expect(scene.engineers).toEqual([]);
    expect(scene.routes).toEqual([]);
    expect(scene.selectedEngineerId).toBeNull();

    pressStart();
    expect(scene.phase).toBe('setup');
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを1人以上雇って配置してください');

    lastEngineerButton().onSelect();
    pointerDown(spawnPoint(0));
    expect(scene.engineers).toHaveLength(1);
    pressStart();
    expect(scene.phase).toBe('playing');
  });

  it('境界値(#178, #184): 3人を強制しない。シニア → ジュニアの順に2人置けば開始でき、各ルートの担当者は選んだランク', () => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, [1], 'senior');
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア: シニア');
    hireAndPlace(harness, [4], 'junior');
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア: ジュニア');
    expect(hiredEmits(scene)).toBe(0);
    pressStart();
    expect(scene.phase).toBe('playing');
    expect(scene.engineers).toHaveLength(2);
    expect(scene.routes).toHaveLength(2);
    expect(rankOnRow(scene, 1)).toBe('senior');
    expect(rankOnRow(scene, 4)).toBe('junior');
    expect(scene.engineers.map((engineer) => engineer.id)).toEqual([0, 1]);
    expect(scene.nextEngineerId).toBe(2);
  });

  it.each([4, MAX_ENGINEERS])('境界値(#184): %i 人置いても開始できる（人数の上限は雇用の上限だけ）', (count) => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, Array.from({ length: count }, (_, row) => row));
    expect(scene.engineers).toHaveLength(count);
    pressStart();
    expect(scene.phase).toBe('playing');
    expect(scene.routes).toHaveLength(count);
  });

  it('エンジニアを選んで置ける床を押すと、そのランクの人を雇ってそこに置き、ルートを1本描き、休暇マーカーと×ボタンを付ける。選択はエンジニアのまま', () => {
    const { scene, pointerDown } = createPlacedHarness();
    const engineer = scene.engineers[0];
    removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, engineer).spawn)).press();
    vi.mocked(render.drawRoutes).mockClear();
    vi.mocked(render.drawVacationMarker).mockClear();

    lastEngineerButton().onSelect();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank: 'junior' });
    expect(lastEngineerButton().setSelected).toHaveBeenLastCalledWith(true);
    // 行内のどこを押しても同じセル（右下の 0.01px 内側）。
    pointerDown({ x: CELL_SIZE - 0.01, y: CELL_SIZE * (FIELD_ROWS - 1) + CELL_SIZE - 0.01 });

    // 外した人（id 0）ではなく、次の id（3）で雇って置く。
    const placed = scene.engineers.find((candidate) => candidate.id === FIXTURE_ROWS.length);
    if (placed === undefined || placed.routeId === null) throw new Error('エンジニアが置かれていません');
    expect(placed.rank).toBe('junior');
    expect(scene.engineers).toHaveLength(FIXTURE_ROWS.length);
    expect(scene.nextEngineerId).toBe(FIXTURE_ROWS.length + 1);
    const route = routeOf(scene, placed);
    expect(route.spawn).toEqual({ col: ENGINEER_SPAWN_COL, row: FIELD_ROWS - 1 });
    expect(render.drawRoutes).toHaveBeenCalledOnce();
    expect(vi.mocked(render.drawRoutes).mock.calls[0]?.[1]).toEqual([route]);
    expect(render.drawVacationMarker).toHaveBeenCalledOnce();
    expect(() => removeButtonAt(engineerRemoveButtonCenter(route.spawn))).not.toThrow();
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを置きました');
    // アイテムと同じく、置いたあとも選んだままで続けて置ける。置いた人をメニューに出す。
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank: 'junior' });
    expect(lastEngineerButton().setSelected).toHaveBeenLastCalledWith(true);
    expect(scene.selectedEngineerId).toBe(placed.id);
    expect(vi.mocked(render.drawEngineerCandidateOverlay).mock.calls.at(-1)?.[1]).not.toContainEqual(route.spawn);
  });

  it('境界値: エンジニアは出現列の右隣（x=60）や使用中の出現セルには置けず（名簿・次の id は変えない）、0.01px 左（x=59.99）の空いた行なら置ける', () => {
    const { scene, pointerDown } = createPlacedHarness();
    removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, scene.engineers[0]).spawn)).press();
    lastEngineerButton().onSelect();
    const before = scene.engineers;
    pointerDown({ x: CELL_SIZE, y: spawnPoint(0).y });
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアはここに置けません');
    pointerDown(cellCenter(routeOf(scene, scene.engineers[0]).spawn));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアはここに置けません');
    expect(scene.engineers).toBe(before);
    expect(scene.nextEngineerId).toBe(FIXTURE_ROWS.length);
    pointerDown({ x: CELL_SIZE - 0.01, y: spawnPoint(0).y });
    expect(scene.engineers).toHaveLength(FIXTURE_ROWS.length);
    expect(rankOnRow(scene, 0)).toBe('junior');
  });

  it(`境界値(#184): ${MAX_ENGINEERS}人置いたあとに押すと「これ以上雇えません」で、名簿・ルート・次の id は変えない`, () => {
    const harness = createHarness();
    const { scene, pointerDown } = harness;
    hireAndPlace(harness, Array.from({ length: MAX_ENGINEERS }, (_, row) => row));
    pointerDown(spawnPoint(0));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, getMessages().engineer.hireLimit);
    expect(scene.engineers).toHaveLength(MAX_ENGINEERS);
    expect(scene.routes).toHaveLength(MAX_ENGINEERS);
    expect(scene.nextEngineerId).toBe(MAX_ENGINEERS);
  });

  it('境界値(#172, #184): 0人からエンジニアの選択ボタンで押すと、既定のランク（ジュニア）を雇って置く', () => {
    const { scene, pointerDown } = createHarness();
    lastEngineerButton().onSelect();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank: INITIAL_PLACEMENT_DEFAULT_ENGINEER_RANK });
    pointerDown(spawnPoint(0));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを置きました');
    expect(scene.engineers.map((engineer) => engineer.rank)).toEqual([INITIAL_PLACEMENT_DEFAULT_ENGINEER_RANK]);
    expect(scene.routes).toHaveLength(1);
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
    const { scene, pointerDown } = createPlacedHarness();
    const [cell] = placeableCells(scene.routes, 1);
    selectItem(scene, 'linter');
    pointerDown(centerOf(cell));
    const overlay = vi.mocked(render.drawEngineerCandidateOverlay).mock.results.at(-1);
    if (overlay === undefined || overlay.type !== 'return') throw new Error('床が描かれていません');
    const overlayDestroy = vi.spyOn(overlay.value, 'destroy');
    const removeButtons = vi
      .mocked(render.drawRemoveButton)
      .mock.results.flatMap((result) => (result.type === 'return' ? [vi.spyOn(result.value, 'destroy')] : []));
    expect(removeButtons).toHaveLength(FIXTURE_ROWS.length + 1);
    const engineerButtonDestroy = vi.spyOn(lastEngineerButton().container, 'destroy');

    pressStart();

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

describe('MainScene: 0人から初期配置の間に雇って置く(#172)', () => {
  // 資金の変化のイベント（FUNDS_CHANGED_EVENT）を出した回数。雇うときの費用はない(#179)ので、雇っても出ない。
  const fundsChangedEmits = (scene: SceneUnderTest): number =>
    scene.events.emit.mock.calls.filter(([event]) => event === FUNDS_CHANGED_EVENT).length;

  it('0人のままでは開始できず「エンジニアを1人以上雇って配置してください」を出す。開始ボタンは薄い', () => {
    const { scene } = createHarness();
    const startButton = vi.mocked(render.drawInitialPlacementStartButton).mock.results[0];
    if (startButton === undefined || startButton.type !== 'return') throw new Error('開始ボタンがありません');
    const setAlpha = vi.spyOn(startButton.value, 'setAlpha');
    pressStart();
    expect(scene.phase).toBe('setup');
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを1人以上雇って配置してください');
    // 描き直したときも薄いまま。
    lastEngineerButton().onSelect();
    expect(setAlpha).toHaveBeenLastCalledWith(INITIAL_PLACEMENT_START_BUTTON_ALPHA.disabled);
  });

  it('初期配置の間はエンジニアのアイコンでメニューが開き、開発バランスは開かない', () => {
    const { scene } = createHarness();
    pressIcon('balance');
    expect(scene.openMenu).toBeNull();
    pressIcon('engineer');
    expect(scene.openMenu).toBe('engineer');
    expect(render.drawEngineerMenu).toHaveBeenCalledOnce();
  });

  it('ランクのボタンを押しても雇わず（名簿・ルート・次の id・資金は変わらない #184）、次に置くものがそのランクのエンジニアになる', () => {
    const { scene } = createHarness();
    const panel = vi.mocked(render.drawInitialPlacementPanel).mock.results.at(-1);
    if (panel === undefined || panel.type !== 'return') throw new Error('パネルが描かれていません');
    const setText = vi.spyOn(panel.value, 'setText');
    selectRankInSetup(scene, 'senior');
    expect(scene.engineers).toEqual([]);
    expect(scene.nextEngineerId).toBe(0);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(fundsChangedEmits(scene)).toBe(0);
    expect(hiredEmits(scene)).toBe(0);
    expect(scene.routes).toEqual([]);
    expect(render.drawRoutes).toHaveBeenCalledOnce();
    expect(render.drawHireMessage).not.toHaveBeenCalled();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank: 'senior' });
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア: シニア');
    expect(lastEngineerButton().setSelected).toHaveBeenLastCalledWith(true);
    expect(setText).toHaveBeenLastCalledWith([
      `初期配置 残りポイント: ${STAGE_POINTS_INITIAL}pt`,
      '選択: エンジニア（シニア）',
    ]);
    // 置く前は開始できない（0人）。
    pressStart();
    expect(scene.phase).toBe('setup');
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを1人以上雇って配置してください');
  });

  it('アイテムを選んだあとでもエンジニアの選択ボタンを押すと、最後に選んだランクに戻る(#184)', () => {
    const { scene } = createHarness();
    selectRankInSetup(scene, 'middle');
    selectItem(scene, 'linter');
    expect(scene.initialPlacementSelection).toEqual({ kind: 'item', itemType: 'linter' });
    expect(lastEngineerButton().setLabel).toHaveBeenLastCalledWith('エンジニア: ミドル');
    lastEngineerButton().onSelect();
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank: 'middle' });
  });

  it('ランクを選んで置ける床を押すと雇って置き、そのまま開始できる', () => {
    const { scene, pointerDown } = createHarness();
    selectRankInSetup(scene);
    pointerDown(spawnPoint(2));
    const [engineer] = scene.engineers;
    if (engineer === undefined) throw new Error('エンジニアがいません');
    expect(routeOf(scene, engineer).spawn).toEqual({ col: ENGINEER_SPAWN_COL, row: 2 });
    expect(scene.routes).toHaveLength(1);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank: 'junior' });
    expect(hiredEmits(scene)).toBe(0);
    pressStart();
    expect(scene.phase).toBe('playing');
  });

  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s を置いても資金は変わらず、資金のイベントも出ない(#179)', (rank) => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, [0], rank);
    expect(scene.engineers.map((engineer) => engineer.rank)).toEqual([rank]);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(fundsChangedEmits(scene)).toBe(0);
    expect(scene.initialPlacementSelection).toEqual({ kind: 'engineer', rank });
  });

  it.each([0, 1, -1])('境界値: 資金が %i 円でも置けて、資金は変わらず倒産もしない（雇うときの費用はない #179）', (funds) => {
    const harness = createHarness();
    const { scene } = harness;
    scene.funds = funds;
    hireAndPlace(harness, [0]);
    expect(scene.engineers).toHaveLength(1);
    expect(scene.funds).toBe(funds);
    expect(fundsChangedEmits(scene)).toBe(0);
    expect(scene.gameOver.over).toBe(false);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'エンジニアを置きました');
  });

  it(`境界値: ${MAX_ENGINEERS - 1}人なら${MAX_ENGINEERS}人目を置け、${MAX_ENGINEERS}人なら上限で断る（資金は変わらない）`, () => {
    const harness = createHarness();
    const { scene, pointerDown } = harness;
    hireAndPlace(harness, Array.from({ length: MAX_ENGINEERS - 1 }, (_, row) => row));
    expect(scene.engineers).toHaveLength(MAX_ENGINEERS - 1);
    hireAndPlace(harness, [MAX_ENGINEERS - 1]);
    expect(scene.engineers).toHaveLength(MAX_ENGINEERS);
    pointerDown(spawnPoint(0));
    expect(scene.engineers).toHaveLength(MAX_ENGINEERS);
    expect(scene.nextEngineerId).toBe(MAX_ENGINEERS);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, getMessages().engineer.hireLimit);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(fundsChangedEmits(scene)).toBe(0);
  });

  it('エンジニアのメニューの雇うボタンはランクだけで、金額を渡さない(#179)', () => {
    createHarness();
    pressIcon('engineer');
    const view = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1)?.[1];
    expect(view?.hireOptions).toEqual(ENGINEER_RANKS.map((rank) => ({ rank: rank.id })));
  });

  it('エンジニアのメニューには前へ・次へ・昇給・減給がなく（雇うボタンだけ #186）、選択中の表示は最後に置いたエンジニア', () => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, [0, 1]);
    expect(scene.engineers).toHaveLength(2);
    expect(scene.openMenu).toBe('engineer');
    expect(Object.keys(lastEngineerMenu())).toEqual(['onHire']);
    const view = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1)?.[1];
    expect(view?.selected).toEqual(scene.engineers.at(-1));
  });

  it.each(ENGINEER_RANKS.map((rank) => rank.id))('%s を選んで置くと、ランク別の月給（初期額）のまま表示される(#176)', (rank) => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, [3], rank);
    const placed = scene.engineers[0];
    expect(placed?.rank).toBe(rank);
    expect(placed?.salary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK[rank]);
    expect(placed?.initialSalary).toBe(ENGINEER_MONTHLY_SALARY_BY_RANK[rank]);
    expect(rankOnRow(scene, 3)).toBe(rank);
  });

  it('ジュニアの後にシニアを置くと、シニアが選択され、そのランクと月給が表示される(#176)', () => {
    const harness = createHarness();
    const { scene } = harness;
    hireAndPlace(harness, [0], 'junior');
    hireAndPlace(harness, [1], 'senior');
    const [junior, senior] = scene.engineers;
    if (junior === undefined || senior === undefined) throw new Error('2人置けていません');
    expect(senior.rank).toBe('senior');
    expect(scene.selectedEngineerId).toBe(senior.id);
    const view = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1)?.[1];
    expect(view?.selected?.id).toBe(senior.id);
    expect(view?.count).toBe(2);
    const lines = formatSelectedEngineerLines(view?.selected ?? null);
    expect(lines[0]).toContain(getRankLabel('senior'));
    expect(lines[1]).toContain(formatYen(ENGINEER_MONTHLY_SALARY_BY_RANK.senior));
  });

  it('×で外すと名簿からも外れ、置き直すと次の id で雇う。雇うときの費用はない(#179)ので、置いても外しても資金は変わらない', () => {
    const harness = createHarness();
    const { scene, pointerDown } = harness;
    hireAndPlace(harness, [3]);
    const [engineer] = scene.engineers;
    if (engineer === undefined) throw new Error('エンジニアがいません');
    expect(scene.funds).toBe(INITIAL_FUNDS);
    removeButtonAt(engineerRemoveButtonCenter(routeOf(scene, engineer).spawn)).press();
    expect(scene.engineers).toEqual([]);
    expect(scene.routes).toEqual([]);
    expect(scene.selectedEngineerId).toBeNull();
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(fundsChangedEmits(scene)).toBe(0);
    lastEngineerButton().onSelect();
    pointerDown(spawnPoint(5));
    const placed = scene.engineers[0];
    if (placed === undefined) throw new Error('エンジニアがいません');
    expect(placed.id).toBe(engineer.id + 1);
    expect(routeOf(scene, placed).spawn).toEqual({ col: ENGINEER_SPAWN_COL, row: 5 });
    pressStart();
    expect(scene.phase).toBe('playing');
  });

  it('倒産後のリスタートで0人・0ルート・INITIAL_FUNDS・次の id 0 に戻る', () => {
    const harness = createHarness();
    const { scene, pointerDown } = harness;
    hireAndPlace(harness);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    pressStart();
    scene.gameOver = { over: true, at: 0 };
    scene.time.now = Number.MAX_SAFE_INTEGER;

    pointerDown(spawnPoint(0));

    expect(scene.scene.restart).toHaveBeenCalledOnce();
    expect(scene.phase).toBe('setup');
    expect(scene.engineers).toEqual([]);
    expect(scene.routes).toEqual([]);
    expect(scene.nextEngineerId).toBe(0);
    expect(scene.funds).toBe(INITIAL_FUNDS);
  });
});

describe('MainScene: 英語の初期配置パネル(#158)', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  // 操作説明の行は #165 でやめた（説明は右上の ℹ️ のゲームの説明）。
  const expectedPanel = [`Setup - Points left: ${STAGE_POINTS_INITIAL}pt`, 'Selected: None'];

  it('create() で英語のパネル・エンジニアの選択ボタンを描き、未選択で床を押すと英語のメッセージを出す', () => {
    const { scene, pointerDown } = createHarness();
    expect(vi.mocked(render.drawInitialPlacementPanel).mock.calls.at(-1)?.[1]).toEqual(expectedPanel);
    expect(vi.mocked(render.drawInitialPlacementEngineerButton).mock.calls.at(-1)?.[1]).toBe('Engineer: Junior');
    const [cell] = placeableCells(scene.routes, 1);
    pointerDown(centerOf(cell));
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'Choose what to place first');
  });

  it('倒産後のリスタート（create() のやり直し）でも英語のパネルを描く', () => {
    const { scene, pointerDown } = createHarness();
    pressStart();
    scene.gameOver = { over: true, at: 0 };
    scene.time.now = Number.MAX_SAFE_INTEGER;
    vi.mocked(render.drawInitialPlacementPanel).mockClear();

    pointerDown({ x: 480, y: 270 });

    expect(scene.scene.restart).toHaveBeenCalledOnce();
    expect(render.drawInitialPlacementPanel).toHaveBeenCalledOnce();
    expect(vi.mocked(render.drawInitialPlacementPanel).mock.calls[0]?.[1]).toEqual(expectedPanel);
  });
});

// #162: 見た目では空いているのに置けなかった位置。ルートは座標を直接書いた固定のもの（create() のランダムなルートを置き換える）で、
// 押す点と期待値も共有定数から求めずに書く。ポイントは 6pt、置くのは Linter（1pt）。
describe('MainScene: 描画どおりの配置判定と置けるかどうかの枠(#162)', () => {
  // 固定のルート fixedRoute（上で定義）。描いている外形は中心線から 6px。
  // ルート（y=330）の下のセル (28, 21)。フットプリント x=448〜464、y=336〜352 は線の外形の下端 y=336 に接するだけ（#151 の 8px では置けなかった）。
  const besideRoute = { x: 456, y: 344 };
  // ルートの線の上のセル (28, 20)。フットプリント y=320〜336。
  const onRouteLine = { x: 456, y: 328 };
  // 開始ボタン（x=228〜356、y=114〜142 #165）の右のセル (23, 7)。フットプリント x=368〜384、y=112〜128（#156 の外接矩形では置けなかった）。
  const rightOfStartButton = { x: 376, y: 120 };
  // パネル（x=72〜464、y=68〜108 #165）の上のセル (10, 5)。
  const onPanel = { x: 168, y: 88 };

  const createFixture = (): Harness => {
    const harness = createHarness();
    harness.scene.routes = [fixedRoute];
    // 開始の条件(#172)のため、固定のルートの担当を1人置く。
    harness.scene.engineers = [engineerOn(fixedRoute)];
    harness.scene.initialPlacement = { points: 6, itemState: { placedItems: [], nextId: 0 } };
    return harness;
  };

  // 最後に描いた枠の状態。まだ一度も描き直していなければ、作ったときの「隠した状態」。
  const lastPreview = (): { readonly visible: boolean; readonly cell?: GridCell; readonly placeable?: boolean } => {
    const call = vi.mocked(render.updatePlacementPreview).mock.calls.at(-1);
    return call === undefined ? { visible: false } : call[1];
  };

  it('create() で枠を1つだけ作る', () => {
    createFixture();
    expect(render.drawPlacementPreview).toHaveBeenCalledOnce();
    expect(render.updatePlacementPreview).not.toHaveBeenCalled();
  });

  it('ルートの線の外形に接するだけの (456, 344) を押すと Linter を置く（6pt → 5pt、次の id 1、描画と×ボタン）', () => {
    const { scene, pointerDown } = createFixture();
    selectItem(scene, 'linter');
    pointerDown(besideRoute);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([
      { id: 0, itemType: 'linter', cell: { col: 28, row: 21 }, lastAttackTime: null },
    ]);
    expect(scene.initialPlacement.points).toBe(5);
    expect(scene.initialPlacement.itemState.nextId).toBe(1);
    expect(render.drawPlacedItem).toHaveBeenCalledOnce();
    expect(render.drawPlacedItem).toHaveBeenCalledWith(scene, {
      id: 0,
      itemType: 'linter',
      cell: { col: 28, row: 21 },
      lastAttackTime: null,
    });
    // ×ボタンはフットプリントの右上の角 (464, 336)。
    expect(vi.mocked(render.drawRemoveButton).mock.calls.at(-1)?.[1]).toEqual({ x: 464, y: 336 });
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'Linterを置きました');
  });

  it('開始ボタンの右の (376, 120) を押すと置き、パネルの上の (168, 88) とルートの線の上の (456, 328) は置かない', () => {
    const { scene, pointerDown } = createFixture();
    selectItem(scene, 'linter');
    pointerDown(onPanel);
    pointerDown(onRouteLine);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawPlacedItem).not.toHaveBeenCalled();
    pointerDown(rightOfStartButton);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([
      { id: 0, itemType: 'linter', cell: { col: 23, row: 7 }, lastAttackTime: null },
    ]);
    expect(scene.initialPlacement.points).toBe(5);
  });

  // 枠の可否と、同じ点を押したときに置けたかどうかが一致する。
  it.each([
    ['ルートの線の外形に接するだけ', besideRoute, { col: 28, row: 21 }, true],
    ['ルートの線の上', onRouteLine, { col: 28, row: 20 }, false],
    ['開始ボタンの右（初期配置UIの矩形の間）', rightOfStartButton, { col: 23, row: 7 }, true],
    ['パネルの上', onPanel, { col: 10, row: 5 }, false],
  ])('%s: 枠は %j のセルに出て可否 %s で、押すとそのとおりになる', (_name, point, cell, placeable) => {
    const { scene, pointerDown, pointerMove } = createFixture();
    selectItem(scene, 'linter');
    pointerMove(point);
    expect(lastPreview()).toEqual({ visible: true, cell, placeable });
    pointerDown(point);
    expect(scene.initialPlacement.itemState.placedItems.length).toBe(placeable ? 1 : 0);
  });

  it('既にある: 置いたセルの枠は置けない色になり、もう一度押しても置かない', () => {
    const { scene, pointerDown, pointerMove } = createFixture();
    selectItem(scene, 'linter');
    pointerMove(besideRoute);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 28, row: 21 }, placeable: true });
    pointerDown(besideRoute);
    // 置いた直後に枠を出し直す（ポインターは動かしていない）。
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 28, row: 21 }, placeable: false });
    pointerDown(besideRoute);
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'そこには置けません');
  });

  it('ポイント不足: 0pt では置ける場所でも枠は置けない色で、押しても置かない', () => {
    const { scene, pointerDown, pointerMove } = createFixture();
    scene.initialPlacement = { points: 0, itemState: { placedItems: [], nextId: 0 } };
    selectItem(scene, 'linter');
    pointerMove(besideRoute);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 28, row: 21 }, placeable: false });
    pointerDown(besideRoute);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawInitialPlacementMessage).toHaveBeenLastCalledWith(scene, 'ステージポイントが足りません');
  });

  it('置かないアイテム（placement: none #58）: 枠は置けない色で、押しても置かない', () => {
    const { scene, pointerDown, pointerMove } = createFixture();
    const instant = ITEM_TYPES.find((itemType) => getItemPlacement(itemType) === 'none');
    if (instant === undefined) throw new Error('置かないアイテムがありません');
    // 置かないアイテムは Lv.1 では解放前(#164)でメニューに並ばないので、選択を直接入れる（解放前・置かないのどちらでも置けない）。
    scene.initialPlacementSelection = { kind: 'item', itemType: instant };
    pointerMove(besideRoute);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 28, row: 21 }, placeable: false });
    pointerDown(besideRoute);
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
  });

  it('ボタンなどの上（currentlyOver あり）・フィールドの外・アイテムを選んでいないときは枠を隠す', () => {
    const { scene, pointerMove } = createFixture();
    // 未選択。
    pointerMove(besideRoute);
    expect(render.updatePlacementPreview).not.toHaveBeenCalled();
    selectItem(scene, 'linter');
    pointerMove(besideRoute);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 28, row: 21 }, placeable: true });
    pointerMove(besideRoute, [{}]);
    expect(lastPreview()).toEqual({ visible: false });
    pointerMove(besideRoute);
    expect(lastPreview().visible).toBe(true);
    pointerMove({ x: 960, y: 344 });
    expect(lastPreview()).toEqual({ visible: false });
    pointerMove({ x: 959.99, y: 344 });
    // フィールド内の右端（959.99）は判定する。セル (59, 21) は x=944〜960・y=336〜352 で、バーチャルパッド（x=808〜952・y=336〜480 #182）に重なるので置けない。
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 59, row: 21 }, placeable: false });
    // 境界値: 1つ上のセル (59, 20)（y=320〜336）はパッドの上端に接するだけなので置ける。
    pointerMove({ x: 959.99, y: 335.99 });
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 59, row: 20 }, placeable: true });
    // エンジニアを選ぶと隠す（エンジニアはルートグリッドのセルに置くため）。
    lastEngineerButton().onSelect();
    expect(lastPreview()).toEqual({ visible: false });
  });

  it('同じセルの中で動かしても描き直さない', () => {
    const { scene, pointerMove } = createFixture();
    selectItem(scene, 'linter');
    pointerMove({ x: 449, y: 337 });
    pointerMove({ x: 463, y: 351 });
    expect(render.updatePlacementPreview).toHaveBeenCalledTimes(1);
    pointerMove({ x: 464, y: 351 });
    expect(render.updatePlacementPreview).toHaveBeenCalledTimes(2);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 29, row: 21 }, placeable: true });
  });

  it('プレイ中は主人公の位置を含むセルに枠を出し（既定の置けない範囲）、セルか可否が変わったときだけ描き直す。ゲームオーバーで隠す', () => {
    const { scene, pointerMove } = createFixture();
    selectItem(scene, 'linter');
    pointerMove(besideRoute);
    pressStart();
    // プレイ開始で初期配置の枠を隠す。
    expect(scene.phase).toBe('playing');
    expect(lastPreview()).toEqual({ visible: false });
    scene.routes = [fixedRoute];
    const player = scene.player;
    if (player === undefined) throw new Error('主人公がいません');
    // 初期配置のパネルがあった位置（プレイ中は初期配置UIが消えるので置ける）。
    player.x = 168;
    player.y = 88;
    scene.update(0, 16);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 10, row: 5 }, placeable: true });
    const calls = vi.mocked(render.updatePlacementPreview).mock.calls.length;
    scene.update(16, 16);
    expect(render.updatePlacementPreview).toHaveBeenCalledTimes(calls);
    player.x = 456;
    player.y = 328;
    scene.update(32, 16);
    expect(lastPreview()).toEqual({ visible: true, cell: { col: 28, row: 20 }, placeable: false });
    scene.gameOver = { over: true, at: 0 };
    scene.update(48, 16);
    expect(lastPreview()).toEqual({ visible: false });
  });
});

// 右上の ℹ️ を押す（最後に描いたアイコンのコールバックを呼ぶ）。
const pressHelpIcon = (): void => {
  const call = vi.mocked(render.drawHelpIcon).mock.calls.at(-1);
  if (call === undefined) throw new Error('ゲームの説明のアイコンが描かれていません');
  call[1]();
};
// 最後に開いた説明を閉じる（背景と ✕ の押下）。
const closeHelpOverlay = (): void => {
  const call = vi.mocked(render.drawHelpOverlay).mock.calls.at(-1);
  if (call === undefined) throw new Error('ゲームの説明が開いていません');
  call[3]();
};

// 固定のルートと担当1人で作り、開始して主人公を中央（480, 270）に置いたシーン(#182)。
const PLAYER_CENTER = { x: 480, y: 270 } as const;
const createPlayingFixture = (): Harness & { readonly player: { x: number; y: number } } => {
  const harness = createHarness();
  harness.scene.routes = [fixedRoute];
  harness.scene.engineers = [engineerOn(fixedRoute)];
  pressStart();
  const player = harness.scene.player;
  if (player === undefined) throw new Error('主人公がいません');
  player.x = PLAYER_CENTER.x;
  player.y = PLAYER_CENTER.y;
  return { ...harness, player };
};

// 押した1回の攻撃キー（スペース）。Phaser の Key と同じく、押したときに 'down' のハンドラーを呼ぶ。
const pressAttackKey = (harness: Harness): void => {
  const space = harness.key('SPACE');
  space.isDown = true;
  (space.handlers.get('down') ?? []).forEach((handler) => handler());
  space.isDown = false;
};

const STEP_MS = 500;
const STEP_PX = (PLAYER_SPEED * STEP_MS) / 1000;

describe('MainScene: 主人公のキー操作（矢印・WASD・スペース）(#182)', () => {
  it('create() は移動の8キー（矢印・WASD）と攻撃のスペースの9キーだけを、キャプチャあり・リピートなしで登録する（ほかの操作のキーは登録しない #165）', () => {
    const { scene } = createHarness();
    const names = scene.input.keyboard.addKey.mock.calls.map(([name]) => name);
    expect([...names].sort()).toEqual(['A', 'D', 'DOWN', 'LEFT', 'RIGHT', 'S', 'SPACE', 'UP', 'W']);
    for (const [, enableCapture, emitOnRepeat] of scene.input.keyboard.addKey.mock.calls) {
      expect(enableCapture).toBe(true);
      expect(emitOnRepeat).toBe(false);
    }
  });

  it('倒産後のリスタート（create() のやり直し）でキーを登録し直し、攻撃のハンドラーは新しいスペースに1つだけ', () => {
    const harness = createPlayingFixture();
    const { scene, pointerDown } = harness;
    const before = harness.key('SPACE');
    scene.gameOver = { over: true, at: 0 };
    scene.time.now = Number.MAX_SAFE_INTEGER;
    pointerDown({ x: 480, y: 270 });
    expect(scene.scene.restart).toHaveBeenCalledOnce();
    expect(scene.input.keyboard.addKey).toHaveBeenCalledTimes(18);
    const after = harness.key('SPACE');
    expect(after).not.toBe(before);
    expect(after.handlers.get('down')).toHaveLength(1);
  });

  it.each([
    ['UP', 0, -1],
    ['W', 0, -1],
    ['DOWN', 0, 1],
    ['S', 0, 1],
    ['LEFT', -1, 0],
    ['A', -1, 0],
    ['RIGHT', 1, 0],
    ['D', 1, 0],
  ] as const)('プレイ中に %s を押している間は、その向きへ PLAYER_SPEED で進む', (name, dx, dy) => {
    const harness = createPlayingFixture();
    harness.key(name).isDown = true;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x + dx * STEP_PX, y: PLAYER_CENTER.y + dy * STEP_PX });
    // 離すと止まる。
    harness.key(name).isDown = false;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x + dx * STEP_PX, y: PLAYER_CENTER.y + dy * STEP_PX });
  });

  it('斜め（↑ と D）は正規化して同じ速さ。反対の向き（← と →）は打ち消して動かない', () => {
    const harness = createPlayingFixture();
    harness.key('UP').isDown = true;
    harness.key('D').isDown = true;
    harness.scene.update(0, STEP_MS);
    expect(harness.player.x).toBeCloseTo(PLAYER_CENTER.x + STEP_PX * Math.SQRT1_2);
    expect(harness.player.y).toBeCloseTo(PLAYER_CENTER.y - STEP_PX * Math.SQRT1_2);
    harness.key('UP').isDown = false;
    harness.key('D').isDown = false;
    const { x, y } = harness.player;
    harness.key('LEFT').isDown = true;
    harness.key('RIGHT').isDown = true;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x, y });
  });

  it('キーの移動はポインターの押し続けより優先する（左を押し続けていても → で右へ進む）', () => {
    const harness = createPlayingFixture();
    const pointer = harness.scene.input.activePointer;
    pointer.isDown = true;
    pointer.worldX = 100;
    pointer.worldY = PLAYER_CENTER.y;
    harness.scene.attackPointerHeld = false;
    harness.key('RIGHT').isDown = true;
    harness.scene.update(0, STEP_MS);
    expect(harness.player.x).toBe(PLAYER_CENTER.x + STEP_PX);
    // キーを離せば、これまでどおりポインターの位置へ向かう。
    harness.key('RIGHT').isDown = false;
    harness.scene.update(0, STEP_MS);
    expect(harness.player.x).toBe(PLAYER_CENTER.x);
  });

  it('境界値: フィールドの端を越えて進まない（左端で ← を押し続けても主人公の半分の幅の位置で止まる）', () => {
    const harness = createPlayingFixture();
    harness.key('LEFT').isDown = true;
    for (let i = 0; i < 10; i += 1) harness.scene.update(0, STEP_MS);
    const stopped = harness.player.x;
    expect(stopped).toBeGreaterThan(0);
    harness.scene.update(0, STEP_MS);
    expect(harness.player.x).toBe(stopped);
  });

  it('初期配置の間とゲームの説明を開いている間は、キーを押していても動かない', () => {
    const harness = createHarness();
    harness.scene.routes = [fixedRoute];
    harness.scene.engineers = [engineerOn(fixedRoute)];
    const player = harness.scene.player;
    if (player === undefined) throw new Error('主人公がいません');
    player.x = PLAYER_CENTER.x;
    player.y = PLAYER_CENTER.y;
    harness.key('RIGHT').isDown = true;
    harness.scene.update(0, STEP_MS);
    expect(player).toMatchObject(PLAYER_CENTER);
    pressStart();
    pressHelpIcon();
    harness.scene.update(0, STEP_MS);
    expect(player).toMatchObject(PLAYER_CENTER);
    // 閉じたあとは押し続けているキーで動き出す。
    closeHelpOverlay();
    harness.scene.update(0, STEP_MS);
    expect(player.x).toBe(PLAYER_CENTER.x + STEP_PX);
  });

  it('境界値: スペースは押した1回につき1回攻撃し、クールダウン（ATTACK_COOLDOWN_MS）の 1ms 前は攻撃せず、ちょうどで攻撃する', () => {
    const harness = createPlayingFixture();
    harness.scene.time.now = 10_000;
    pressAttackKey(harness);
    expect(render.drawAttackEffect).toHaveBeenCalledOnce();
    expect(harness.scene.lastAttackTime).toBe(10_000);
    harness.scene.time.now = 10_000 + ATTACK_COOLDOWN_MS - 1;
    pressAttackKey(harness);
    expect(render.drawAttackEffect).toHaveBeenCalledOnce();
    harness.scene.time.now = 10_000 + ATTACK_COOLDOWN_MS;
    pressAttackKey(harness);
    expect(render.drawAttackEffect).toHaveBeenCalledTimes(2);
    expect(harness.scene.lastAttackTime).toBe(10_000 + ATTACK_COOLDOWN_MS);
  });

  it('初期配置の間・ゲームの説明を開いている間・ゲームオーバー中はスペースで攻撃せず、ゲームオーバー中もリスタートしない', () => {
    const harness = createHarness();
    harness.scene.routes = [fixedRoute];
    harness.scene.engineers = [engineerOn(fixedRoute)];
    harness.scene.time.now = 10_000;
    pressAttackKey(harness);
    pressStart();
    pressHelpIcon();
    pressAttackKey(harness);
    closeHelpOverlay();
    harness.scene.gameOver = { over: true, at: 0 };
    pressAttackKey(harness);
    expect(render.drawAttackEffect).not.toHaveBeenCalled();
    expect(harness.scene.lastAttackTime).toBeNull();
    expect(harness.scene.scene.restart).not.toHaveBeenCalled();
  });
});

describe('MainScene: バーチャルパッド(#182)', () => {
  // パッドの左上からのセル (col, row) の中心。
  const padCell = (col: number, row: number): { readonly x: number; readonly y: number } => ({
    x: VIRTUAL_PAD_RECT.x + (col + 0.5) * VIRTUAL_PAD_CELL_SIZE,
    y: VIRTUAL_PAD_RECT.y + (row + 0.5) * VIRTUAL_PAD_CELL_SIZE,
  });
  const RIGHT = padCell(2, 1);
  const UP = padCell(1, 0);
  const CENTER = padCell(1, 1);

  // パッドのボタンを押す。Phaser と同じく、ボタンのコールバックに押した Pointer を渡し、シーンの pointerdown にはボタンを currentlyOver で渡す。
  // 押す Pointer は activePointer（最後に操作した Pointer）にする。
  const pressPad = (harness: Harness, point: { readonly x: number; readonly y: number }): FakePointer => {
    const call = vi.mocked(render.drawVirtualPad).mock.calls.at(-1);
    if (call === undefined) throw new Error('バーチャルパッドが描かれていません');
    const pointer = harness.scene.input.activePointer;
    pointer.worldX = point.x;
    pointer.worldY = point.y;
    pointer.isDown = true;
    // render のコールバックは Phaser.Input.Pointer を受け取る。偽物の Pointer は main.ts が読むプロパティ（worldX・worldY・isDown）だけを持つ。
    (call[1] as (pointer: FakePointer) => void)(pointer);
    harness.pointerDown(point, [{}]);
    return pointer;
  };

  it('初期配置の間は描かず、開始したときに1回描く', () => {
    const harness = createHarness();
    harness.scene.routes = [fixedRoute];
    harness.scene.engineers = [engineerOn(fixedRoute)];
    expect(render.drawVirtualPad).not.toHaveBeenCalled();
    pressStart();
    expect(render.drawVirtualPad).toHaveBeenCalledOnce();
  });

  it('向きのボタン（▶）を押している間はその向きへ進み、その Pointer を離すと止まる', () => {
    const harness = createPlayingFixture();
    const pointer = pressPad(harness, RIGHT);
    expect(harness.scene.padPointer).toBe(pointer);
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x + STEP_PX, y: PLAYER_CENTER.y });
    pointer.isDown = false;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x + STEP_PX, y: PLAYER_CENTER.y });
    expect(harness.scene.padPointer).toBeNull();
  });

  it('押したまま隣のボタンへ滑らせると向きが変わり、中央・パッドの外へ滑らせると止まる（パッドの位置へは向かわない）', () => {
    const harness = createPlayingFixture();
    const pointer = pressPad(harness, RIGHT);
    pointer.worldX = UP.x;
    pointer.worldY = UP.y;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x, y: PLAYER_CENTER.y - STEP_PX });
    // ポインターの押し続けの抑止（attackPointerHeld）が外れていても、パッドを押している指の位置へは向かわない。
    harness.scene.attackPointerHeld = false;
    pointer.worldX = CENTER.x;
    pointer.worldY = CENTER.y;
    harness.scene.update(0, STEP_MS);
    pointer.worldX = VIRTUAL_PAD_RECT.x - 1;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x, y: PLAYER_CENTER.y - STEP_PX });
    // 押したままの指をパッドの向きのボタンへ戻せば、また進む。
    pointer.worldX = RIGHT.x;
    pointer.worldY = RIGHT.y;
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject({ x: PLAYER_CENTER.x + STEP_PX, y: PLAYER_CENTER.y - STEP_PX });
  });

  it('パッドの押下はポインターの押し続けの移動にならない（中央を押したままでも、押した位置へ向かわない）', () => {
    const harness = createPlayingFixture();
    pressPad(harness, CENTER);
    expect(harness.scene.padPointer).toBeNull();
    expect(harness.scene.attackPointerHeld).toBe(true);
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject(PLAYER_CENTER);
  });

  it('境界値: 中央を押すと1回攻撃し（向きの Pointer は変えない）、クールダウンの 1ms 前は攻撃しない', () => {
    const harness = createPlayingFixture();
    harness.scene.time.now = 10_000;
    pressPad(harness, CENTER);
    expect(render.drawAttackEffect).toHaveBeenCalledOnce();
    expect(harness.scene.lastAttackTime).toBe(10_000);
    expect(harness.scene.padPointer).toBeNull();
    harness.scene.time.now = 10_000 + ATTACK_COOLDOWN_MS - 1;
    pressPad(harness, CENTER);
    expect(render.drawAttackEffect).toHaveBeenCalledOnce();
    harness.scene.time.now = 10_000 + ATTACK_COOLDOWN_MS;
    pressPad(harness, CENTER);
    expect(render.drawAttackEffect).toHaveBeenCalledTimes(2);
  });

  it('ゲームの説明を開く・閉じるとパッドの押下をやめ、開いている間のパッドの押下は受け付けない', () => {
    const harness = createPlayingFixture();
    pressPad(harness, RIGHT);
    pressHelpIcon();
    expect(harness.scene.padPointer).toBeNull();
    pressPad(harness, RIGHT);
    expect(harness.scene.padPointer).toBeNull();
    closeHelpOverlay();
    harness.scene.update(0, STEP_MS);
    expect(harness.player).toMatchObject(PLAYER_CENTER);
    pressPad(harness, RIGHT);
    expect(harness.scene.padPointer).not.toBeNull();
    pressHelpIcon();
    closeHelpOverlay();
    expect(harness.scene.padPointer).toBeNull();
  });

  it('倒産（ゲームオーバー）でパッドの押下をやめ、ゲームオーバー中のパッドの押下は受け付けない', () => {
    const harness = createPlayingFixture();
    pressPad(harness, RIGHT);
    harness.scene.tweens = { pauseAll: vi.fn<() => void>() };
    harness.scene.onFundsChanged(createFundsChangedEvent(0, -1, 'salary'));
    expect(harness.scene.gameOver.over).toBe(true);
    expect(harness.scene.padPointer).toBeNull();
    const call = vi.mocked(render.drawVirtualPad).mock.calls.at(-1);
    if (call === undefined) throw new Error('バーチャルパッドが描かれていません');
    (call[1] as (pointer: FakePointer) => void)({ worldX: RIGHT.x, worldY: RIGHT.y, isDown: true });
    expect(harness.scene.padPointer).toBeNull();
  });
});

describe('MainScene: ゲームの説明（右上の ℹ️）(#165)', () => {
  // 最後に開いた説明の閉じるコールバック（背景と ✕ の押下）と destroy。
  const lastHelpOverlay = (): { readonly close: () => void; readonly destroy: Mock } => {
    const call = vi.mocked(render.drawHelpOverlay).mock.calls.at(-1);
    const result = vi.mocked(render.drawHelpOverlay).mock.results.at(-1);
    if (call === undefined || result === undefined || result.type !== 'return') throw new Error('ゲームの説明が開いていません');
    return { close: call[3], destroy: vi.mocked(result.value.destroy) };
  };

  const createFixture = (): Harness => {
    const harness = createHarness();
    harness.scene.routes = [fixedRoute];
    // 開始の条件(#172)のため、固定のルートの担当を1人置く。
    harness.scene.engineers = [engineerOn(fixedRoute)];
    return harness;
  };

  it('create() は ℹ️ のアイコンを1つ描き、説明は閉じた状態で始まる', () => {
    const { scene } = createFixture();
    expect(render.drawHelpIcon).toHaveBeenCalledOnce();
    expect(render.drawHelpOverlay).not.toHaveBeenCalled();
    expect(scene.helpOpen).toBe(false);
  });

  it('ℹ️ を押すと、見出しと buildHelpContent の行で説明を開く。開いている間にもう一度押しても重ねて開かない', () => {
    const { scene } = createFixture();
    pressHelpIcon();
    expect(scene.helpOpen).toBe(true);
    expect(render.drawHelpOverlay).toHaveBeenCalledOnce();
    expect(vi.mocked(render.drawHelpOverlay).mock.calls[0]?.[1]).toBe(buildHelpContent().title);
    expect(vi.mocked(render.drawHelpOverlay).mock.calls[0]?.[2]).toEqual(buildHelpContent().lines);
    pressHelpIcon();
    expect(render.drawHelpOverlay).toHaveBeenCalledOnce();
  });

  it('初期配置の間に開いている間は、床を押してもアイテムを置かず、メッセージも出さない', () => {
    const { scene, pointerDown } = createFixture();
    selectItem(scene, 'linter');
    vi.mocked(render.drawInitialPlacementMessage).mockClear();
    pressHelpIcon();
    pointerDown({ x: 456, y: 344 });
    expect(scene.initialPlacement.itemState.placedItems).toEqual([]);
    expect(render.drawInitialPlacementMessage).not.toHaveBeenCalled();
  });

  it('プレイ中に開いている間は時計が止まり（update で経過時間が進まない）、主人公を押しても攻撃しない', () => {
    const { scene, pointerDown } = createFixture();
    pressStart();
    scene.update(0, 1000);
    expect(scene.elapsedMs).toBe(1000);
    pressHelpIcon();
    scene.update(1000, 5000);
    expect(scene.elapsedMs).toBe(1000);
    const player = scene.player;
    if (player === undefined) throw new Error('主人公がいません');
    scene.time.now = 10_000;
    pointerDown({ x: player.x, y: player.y });
    expect(render.drawAttackEffect).not.toHaveBeenCalled();
    expect(scene.lastAttackTime).toBeNull();
    // 閉じたあとは同じ押下で攻撃する（開いている間だけ止まっていた）。
    lastHelpOverlay().close();
    pointerDown({ x: player.x, y: player.y });
    expect(render.drawAttackEffect).toHaveBeenCalledOnce();
    expect(scene.lastAttackTime).toBe(10_000);
  });

  it('背景か ✕ で閉じると destroy() し、押したままのポインターで動かないよう attackPointerHeld を押下の状態にする。閉じたあとは時計と配置が戻る', () => {
    const { scene, pointerDown } = createFixture();
    selectItem(scene, 'linter');
    pressHelpIcon();
    const { close, destroy } = lastHelpOverlay();
    scene.attackPointerHeld = false;
    scene.input.activePointer.isDown = true;
    close();
    expect(scene.helpOpen).toBe(false);
    expect(destroy).toHaveBeenCalledOnce();
    expect(scene.attackPointerHeld).toBe(true);
    // 閉じたあとは床の押下で置ける。
    pointerDown({ x: 456, y: 344 });
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    // もう一度閉じても何もしない（destroy は1回だけ）。
    close();
    expect(destroy).toHaveBeenCalledOnce();
    pressStart();
    scene.update(0, 1000);
    expect(scene.elapsedMs).toBe(1000);
  });

  it('境界値: ポインターを離した状態で閉じれば attackPointerHeld は false（次の押し続けで動ける）', () => {
    const { scene } = createFixture();
    pressStart();
    pressHelpIcon();
    scene.attackPointerHeld = true;
    scene.input.activePointer.isDown = false;
    lastHelpOverlay().close();
    expect(scene.attackPointerHeld).toBe(false);
  });

  it('ゲームオーバー中は ℹ️ を押しても開かない（リスタートの押下はそのまま動く）', () => {
    const { scene, pointerDown } = createFixture();
    pressStart();
    scene.gameOver = { over: true, at: 0 };
    pressHelpIcon();
    expect(scene.helpOpen).toBe(false);
    expect(render.drawHelpOverlay).not.toHaveBeenCalled();
    scene.time.now = Number.MAX_SAFE_INTEGER;
    pointerDown({ x: 480, y: 270 });
    expect(scene.scene.restart).toHaveBeenCalledOnce();
  });

  it('リスタート（create() のやり直し）で説明は閉じた状態に戻り、アイコンを描き直す', () => {
    const { scene } = createFixture();
    pressHelpIcon();
    expect(scene.helpOpen).toBe(true);
    scene.create();
    expect(scene.helpOpen).toBe(false);
    expect(render.drawHelpIcon).toHaveBeenCalledTimes(2);
  });
});
