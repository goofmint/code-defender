// レベル(#164)が MainScene に正しく接続されていることを確かめる（アイテムのメニューの一覧と枠・左上の表示・リスタート・同じ更新での倒産）。
// 操作は開始ボタン・メニューのコールバック・押下だけ（キー操作は #165 で廃止）。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（initialPlacementScene.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  ENGINEER_SPAWN_COL,
  ITEM_PAGE_SIZE,
  LEVEL_UP_INTERVAL_DAYS,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
} from './config';
import type { Engineer } from './engineer';
import type { GameOverState } from './gameOver';
import { MS_PER_GAME_DAY } from './gameTime';
import { formatInitialPlacementItemButton } from './initialPlacement';
import { ITEM_TYPES } from './item';
import type { ItemType } from './item';
import { formatItemOption, getItemPrice, isPlaceableCell, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { cellCenter } from './route';
import type { Point, Route } from './route';
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
// 左上の表示（drawElapsedDays）の setText は呼ばれた文言を記録する。
const fakes = vi.hoisted(() => {
  type FakeObject = {
    x: number;
    y: number;
    readonly texts: string[];
    readonly destroy: () => void;
    readonly setText: (text: string | readonly string[]) => FakeObject;
    readonly setPosition: (x: number, y: number) => FakeObject;
    readonly setDepth: (depth: number) => FakeObject;
    readonly setAlpha: (alpha: number) => FakeObject;
    readonly setOnVacation: (onVacation: boolean) => void;
  };
  const make = (): FakeObject => {
    const object: FakeObject = {
      x: 0,
      y: 0,
      texts: [],
      destroy: () => undefined,
      setText: (text) => {
        object.texts.push(typeof text === 'string' ? text : text.join('\n'));
        return object;
      },
      setPosition: (x, y) => {
        object.x = x;
        object.y = y;
        return object;
      },
      setDepth: () => object,
      setAlpha: () => object,
      setOnVacation: () => undefined,
    };
    return object;
  };
  // 左上の表示（drawElapsedDays）として返した偽物。create() のたびに増える。
  const elapsed: FakeObject[] = [];
  return { make, elapsed };
});

vi.mock('./render', () => {
  const object = () => fakes.make();
  return {
    drawAttackEffect: vi.fn(),
    drawCode: vi.fn(object),
    drawDefeatEffect: vi.fn(),
    drawElapsedDays: vi.fn(() => {
      const text = fakes.make();
      fakes.elapsed.push(text);
      return text;
    }),
    drawField: vi.fn(),
    drawGameOver: vi.fn(),
    // ゲームの説明(#165)。
    drawHelpIcon: vi.fn(object),
    drawHelpOverlay: vi.fn(object),
    drawHireMessage: vi.fn(object),
    drawEngineerCandidateOverlay: vi.fn(object),
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
    // アイテムのメニュー(#156)。中身は mock.calls の2番目、枠・ページ切替のコールバックは3番目の引数。
    drawItemMenu: vi.fn(object),
    drawEngineerMenu: vi.fn(object),
    drawBalanceMenu: vi.fn(object),
    drawEngineerPopover: vi.fn(object),
    drawStatusPanel: vi.fn(() => ({
      setFunds: vi.fn(),
      setScore: vi.fn(),
      setMonthEndPayment: vi.fn(),
      setTechDebt: vi.fn(),
    })),
    drawItemMessage: vi.fn(object),
    drawOutageText: vi.fn(),
    drawPlacedItem: vi.fn(object),
    drawPlacementPreview: vi.fn(object),
    updatePlacementPreview: vi.fn(),
    drawPenaltyText: vi.fn(),
    drawPlayer: vi.fn(object),
    drawReleasePoint: vi.fn(),
    drawRemoveButton: vi.fn(object),
    drawRoutes: vi.fn(
      (_scene: object, routes: readonly { readonly id: number }[]) =>
        new Map(
          routes.map((route) => [route.id, { line: fakes.make(), spawnMarker: fakes.make(), spawnDecoration: fakes.make() }]),
        ),
    ),
    drawVacationMarker: vi.fn(() => ({ container: fakes.make(), setOnVacation: () => undefined })),
    // バーチャルパッド(#182)。プレイ開始（startPlay）で描く。このハーネスにはキーボードがない（input.keyboard なしでも動く）。
    drawVirtualPad: vi.fn(),
    flashCode: vi.fn(),
  };
});

const render = await import('./render');

type FakePointer = { readonly worldX: number; readonly worldY: number; isDown: boolean };
type PointerDownHandler = (pointer: FakePointer, currentlyOver: readonly object[]) => void;
type EventHandler = (payload: object) => void;

// テストで触る MainScene の private メンバーと、create() が使う Phaser のプロパティだけを表す型。
type SceneUnderTest = {
  phase: 'setup' | 'playing';
  engineers: readonly Engineer[];
  placedItems: readonly PlacedItem[];
  itemPage: number;
  openMenu: 'engineer' | 'item' | 'balance' | null;
  elapsedMs: number;
  funds: number;
  routes: Route[];
  gameOver: GameOverState;
  player?: Point;
  input: {
    readonly activePointer: FakePointer;
    readonly on: (event: string, handler: PointerDownHandler) => void;
  };
  // Phaser の EventEmitter と同じく、on で登録したハンドラーを emit で呼ぶ（月の境界の給料と倒産判定を動かすため）。
  events: {
    readonly on: (event: string, handler: EventHandler, context: object) => void;
    readonly once: (event: string) => void;
    readonly off: (event: string) => void;
    readonly emit: Mock<(event: string, payload?: object) => boolean>;
  };
  time: { now: number; readonly delayedCall: Mock<(delay: number, callback: () => void) => void> };
  tweens: { readonly pauseAll: Mock<() => void> };
  scene: { readonly restart: Mock<() => void> };
  create(): void;
  advanceClock(delta: number): void;
};

type Harness = {
  readonly scene: SceneUnderTest;
  readonly pointerDown: (point: Point) => void;
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

// create() を実行したシーン。scene.restart() は押下の処理が終わってから create() をもう一度実行する（Phaser と同じ）。
const createHarness = (): Harness => {
  let pointerHandlers: PointerDownHandler[] = [];
  let eventHandlers: { readonly event: string; readonly handler: EventHandler; readonly context: object }[] = [];
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.input = {
    activePointer: { worldX: 0, worldY: 0, isDown: false },
    // 押下（pointerdown）のハンドラーだけを記録する（リスタートの押下に使う）。
    on: (event, handler) => {
      if (event === 'pointerdown') pointerHandlers.push(handler);
    },
  };
  scene.events = {
    on: (event, handler, context) => {
      eventHandlers.push({ event, handler, context });
    },
    once: () => undefined,
    off: () => undefined,
    emit: vi.fn<(event: string, payload?: object) => boolean>((event, payload) => {
      for (const entry of eventHandlers) {
        if (entry.event === event && payload !== undefined) entry.handler.call(entry.context, payload);
      }
      return true;
    }),
  };
  scene.time = { now: 0, delayedCall: vi.fn<(delay: number, callback: () => void) => void>() };
  scene.tweens = { pauseAll: vi.fn<() => void>() };
  let restartPending = false;
  scene.scene = {
    restart: vi.fn<() => void>(() => {
      restartPending = true;
    }),
  };
  scene.create();
  return {
    scene,
    pointerDown: (point) => {
      pointerHandlers.forEach((handler) => handler({ worldX: point.x, worldY: point.y, isDown: true }, []));
      if (restartPending) {
        restartPending = false;
        pointerHandlers = [];
        eventHandlers = [];
        scene.create();
      }
    },
  };
};

const days = (n: number): number => n * MS_PER_GAME_DAY;
// Lv.n になる経過時間（その始まり）。
const levelStartMs = (level: number): number => days((level - 1) * LEVEL_UP_INTERVAL_DAYS);

// 開始ボタンを押す（最後に描いた開始ボタンのコールバック。開始キーは #165 で廃止）。
const pressStartButton = (): void => {
  const call = vi.mocked(render.drawInitialPlacementStartButton).mock.calls.at(-1);
  if (call === undefined) throw new Error('開始ボタンが描かれていません');
  call[1]();
};

const pressIcon = (kind: 'engineer' | 'item' | 'balance'): void => {
  const call = vi.mocked(render.drawMenuIcons).mock.calls.at(-1);
  if (call === undefined) throw new Error('アイコンが描かれていません');
  call[1](kind);
};

// 最後に描いたアイテムのメニュー(#156)の中身と、ページ切替のコールバック。
const lastItemMenu = (): {
  readonly view: ItemMenuView;
  readonly onPage: (direction: 'previous' | 'next') => void;
  readonly onBuySlot: (slot: number) => void;
} => {
  const call = vi.mocked(render.drawItemMenu).mock.calls.at(-1);
  if (call === undefined) throw new Error('アイテムのメニューが描かれていません');
  return { view: call[1], onPage: call[2].onPage, onBuySlot: call[2].onBuySlot };
};

// 左上の表示（最後に描いた drawElapsedDays の偽物）に setText した文言。
const elapsedTexts = (): readonly string[] => {
  const text = fakes.elapsed.at(-1);
  if (text === undefined) throw new Error('左上の表示が描かれていません');
  return text.texts;
};

// プレイ中のメニューの枠の文言（ITEM_PAGE_SIZE 枠。足りない枠は null）。
const labelsOf = (items: readonly ItemType[]): (string | null)[] =>
  Array.from({ length: ITEM_PAGE_SIZE }, (_, slot) => {
    const itemType = items[slot];
    return itemType === undefined ? null : formatItemOption(itemType);
  });

// 給料で倒産しない資金。時計を何か月も進めても月の境界の給料を払える。
const RICH = 1_000_000_000_000;

// 初期は0人(#172)なので、初期配置の間に右上のエンジニアのメニューで3人雇い、出現列の行1・4・7に置く（以前の初期配置と同じ形）。
// 雇うたびに次に置くものがエンジニアになるので、続けて出現列のその行を押して置く。最後にメニューを閉じる。
const FIXTURE_ROWS: readonly number[] = [1, 4, 7];
const hireAndPlace = (harness: Harness): void => {
  pressIcon('engineer');
  FIXTURE_ROWS.forEach((row) => {
    const call = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1);
    if (call === undefined) throw new Error('エンジニアのメニューが描かれていません');
    call[2].onHire('junior');
    harness.pointerDown(cellCenter({ col: ENGINEER_SPAWN_COL, row }));
  });
  pressIcon('engineer');
  if (harness.scene.routes.length !== FIXTURE_ROWS.length) throw new Error('初期配置の間に3人を雇って置けませんでした');
};

// プレイを始めてアイテムのメニューを開いた状態。倒産の確認以外は資金を RICH にして、月の境界の給料で倒産しないようにする。
const startPlaying = (funds: number = RICH): Harness => {
  const harness = createHarness();
  hireAndPlace(harness);
  pressStartButton();
  harness.scene.funds = funds;
  pressIcon('item');
  return harness;
};

describe('MainScene: レベルによるアイテムの解放(#164)', () => {
  it('開始時は Lv.1 📅0 を描き、メニューは CodeRabbit・Linter・テストツールの3枠だけ（1/1）', () => {
    const { scene } = startPlaying();
    expect(render.drawElapsedDays).toHaveBeenLastCalledWith(scene, 1, 0);
    expect(scene.phase).toBe('playing');
    expect(lastItemMenu().view.labels).toEqual(labelsOf(['codeRabbit', 'linter', 'testTool']));
    expect(lastItemMenu().view.pageLabel).toBe('1/1');
  });

  it('境界値: 29日はまだ Lv.1 でメニューを描き直さず、30日ちょうどで Lv.2 になり CI が増える', () => {
    const { scene } = startPlaying();
    const drawn = vi.mocked(render.drawItemMenu).mock.calls.length;
    scene.advanceClock(days(30) - 1);
    expect(elapsedTexts().at(-1)).toBe('Lv.1 📅29');
    expect(render.drawItemMenu).toHaveBeenCalledTimes(drawn);
    scene.advanceClock(1);
    expect(elapsedTexts().at(-1)).toBe('Lv.2 📅30');
    expect(render.drawItemMenu).toHaveBeenCalledTimes(drawn + 1);
    expect(lastItemMenu().view.labels).toEqual(labelsOf(['codeRabbit', 'linter', 'testTool', 'ci']));
    expect(lastItemMenu().view.pageLabel).toBe('1/1');
  });

  it('大きな時間差で2レベル越えても1回だけ描き直し、到達した Lv.3 の5種類を並べる', () => {
    const { scene } = startPlaying();
    const drawn = vi.mocked(render.drawItemMenu).mock.calls.length;
    scene.advanceClock(levelStartMs(3));
    expect(elapsedTexts().at(-1)).toBe('Lv.3 📅60');
    expect(render.drawItemMenu).toHaveBeenCalledTimes(drawn + 1);
    expect(lastItemMenu().view.labels).toEqual(labelsOf(ITEM_TYPES.slice(0, 5)));
  });

  it('メニューを閉じていればレベルが上がっても描かない（通知も出さない）。開くと増えた一覧になる', () => {
    const { scene } = startPlaying();
    pressIcon('item');
    expect(scene.openMenu).toBeNull();
    const drawn = vi.mocked(render.drawItemMenu).mock.calls.length;
    scene.advanceClock(levelStartMs(2));
    expect(render.drawItemMenu).toHaveBeenCalledTimes(drawn);
    expect(render.drawItemMessage).not.toHaveBeenCalled();
    pressIcon('item');
    expect(lastItemMenu().view.labels).toEqual(labelsOf(ITEM_TYPES.slice(0, 4)));
  });

  it('一覧が増えても今のページを残す（Lv.5 の 2/2 → Lv.11 で 2/3）', () => {
    const { scene } = startPlaying();
    scene.advanceClock(levelStartMs(5));
    expect(lastItemMenu().view.pageLabel).toBe('1/2');
    lastItemMenu().onPage('next');
    expect(scene.itemPage).toBe(1);
    expect(lastItemMenu().view.labels).toEqual(labelsOf(['cat']));
    expect(lastItemMenu().view.pageLabel).toBe('2/2');
    scene.advanceClock(levelStartMs(11) - levelStartMs(5));
    expect(scene.itemPage).toBe(1);
    expect(lastItemMenu().view.labels).toEqual(labelsOf(ITEM_TYPES.slice(6, 12)));
    expect(lastItemMenu().view.pageLabel).toBe('2/3');
  });

  it('ページ切替ボタンは解放済みの一覧のページ数で回り込む（Lv.1 は1ページ、Lv.5 は2ページ）', () => {
    const { scene } = startPlaying();
    lastItemMenu().onPage('next');
    expect(scene.itemPage).toBe(0);
    scene.advanceClock(levelStartMs(5));
    lastItemMenu().onPage('next');
    expect(scene.itemPage).toBe(1);
    lastItemMenu().onPage('next');
    expect(scene.itemPage).toBe(0);
  });

  it('メニューの枠は解放済みの一覧の枠を買う。Lv.1 の4枠目は空なので何もせず、Lv.2 で CI を買う', () => {
    const { scene } = startPlaying();
    // 主人公を置ける場所に立たせる（配置グリッドの置けるセルの中心）。
    const cell = Array.from({ length: PLACEMENT_ROWS * PLACEMENT_COLS }, (_, index) => ({
      col: index % PLACEMENT_COLS,
      row: Math.floor(index / PLACEMENT_COLS),
    })).find((candidate) => isPlaceableCell(candidate, { routes: scene.routes, placedItems: [] }));
    if (cell === undefined) throw new Error('置けるセルがありません');
    scene.player = placementCellCenter(cell);
    lastItemMenu().onBuySlot(3);
    expect(render.drawItemMessage).not.toHaveBeenCalled();
    expect(scene.funds).toBe(RICH);
    expect(scene.placedItems).toEqual([]);
    scene.advanceClock(levelStartMs(2));
    // 30日の境界で給料を払った後の資金から CI の価格を引く。
    const funds = scene.funds;
    lastItemMenu().onBuySlot(3);
    expect(scene.placedItems.map((item) => item.itemType)).toEqual(['ci']);
    expect(scene.funds).toBe(funds - getItemPrice('ci'));
  });

  it('リスタート（ゲームオーバー中の押下）で Lv.1 📅0 と Lv.1 の一覧・1ページ目に戻る', () => {
    const { scene, pointerDown } = startPlaying();
    scene.advanceClock(levelStartMs(5));
    lastItemMenu().onPage('next');
    scene.gameOver = { over: true, at: 0 };
    scene.time.now = Number.MAX_SAFE_INTEGER;
    pointerDown({ x: 480, y: 270 });
    expect(scene.scene.restart).toHaveBeenCalledOnce();
    expect(scene.elapsedMs).toBe(0);
    expect(scene.itemPage).toBe(0);
    expect(render.drawElapsedDays).toHaveBeenLastCalledWith(scene, 1, 0);
    // リスタート後は初期配置(#47)から。初期配置の間も Lv.1 の3種類だけ。
    expect(scene.phase).toBe('setup');
    pressIcon('item');
    expect(lastItemMenu().view.labels).toEqual([
      ...(['codeRabbit', 'linter', 'testTool'] as const).map((itemType) => formatInitialPlacementItemButton(itemType)),
      null,
      null,
      null,
    ]);
    expect(lastItemMenu().view.pageLabel).toBe('1/1');
    // リスタート後も0人(#172)なので、雇って置いてから始める（エンジニアのメニューに切り替わるので、始めたあとアイテムのメニューを開き直す）。
    expect(scene.engineers).toEqual([]);
    hireAndPlace({ scene, pointerDown });
    pressStartButton();
    expect(scene.phase).toBe('playing');
    pressIcon('item');
    expect(lastItemMenu().view.labels).toEqual(labelsOf(['codeRabbit', 'linter', 'testTool']));
  });

  it('30日の給料で倒産した同じ更新でも、時計は戻さず Lv.3 📅60 を表示し、倒産後の月は引かない（メニューは閉じる）', () => {
    const { scene } = startPlaying(1);
    scene.advanceClock(levelStartMs(3));
    expect(scene.gameOver.over).toBe(true);
    expect(scene.elapsedMs).toBe(levelStartMs(3));
    expect(elapsedTexts().at(-1)).toBe('Lv.3 📅60');
    expect(render.drawGameOver).toHaveBeenCalledWith(scene, expect.any(Number), 60);
    // 給料は1か月目だけ（倒産したら残りの月は発行しない）。
    expect(scene.events.emit.mock.calls.filter(([event]) => event === 'salary-paid')).toHaveLength(1);
    expect(scene.openMenu).toBeNull();
  });
});
