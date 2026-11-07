// 右上のアイコンで開くメニュー・出現地点で開くエンジニアのポップオーバー・右下の指標(#156)を、実際の MainScene の
// create() / pointerdown / ボタン・メニューのコールバックで確かめる（キー操作は #165 で廃止）。main.ts は読み込み時に new Phaser.Game(config) を実行するので、
// このファイルの中だけで phaser と描画（render.ts）をモックする（initialPlacementScene.test.ts と同じ形）。
// scene.events は実際と同じく、on で登録したハンドラーへ emit を届ける（倒産でゲームオーバーにするため）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { getAiAgentMonthlyFee, getAiAgentPrice } from './aiAgent';
import {
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  INITIAL_FUNDS,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  TECH_DEBT_INITIAL,
} from './config';
import type { Engineer } from './engineer';
import { findEngineerByRoute } from './engineer';
import type { GameOverState } from './gameOver';
import { ITEM_TYPES } from './item';
import { getItemMonthlyFee, isPlaceableCell, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { getEngineerSalaries, getMonthlyPayroll } from './salary';
import { cellCenter } from './route';
import type { GridCell, Route } from './route';
import type { EngineerPopoverCallbacks, ItemMenuView } from './render';

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

// 描画のモック。どの関数も、MainScene が触るメソッド（destroy・setText・setPosition など）だけを持つ偽物を返す。destroy は呼び出しを記録する。
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
  const make = (destroy: () => void = () => undefined): FakeObject => {
    const object: FakeObject = {
      x: 0,
      y: 0,
      destroy,
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
    return object;
  };
  return { make };
});

vi.mock('./render', () => {
  const object = () => fakes.make();
  // メニュー・ポップオーバーは destroy の呼び出しを確かめるので vi.fn にする。
  const panel = () => ({ destroy: vi.fn() });
  return {
    drawAttackEffect: vi.fn(),
    drawCode: vi.fn(object),
    drawDefeatEffect: vi.fn(),
    drawElapsedDays: vi.fn(object),
    drawField: vi.fn(),
    drawGameOver: vi.fn(),
    // ゲームの説明(#165)。
    drawHelpIcon: vi.fn(object),
    drawHelpOverlay: vi.fn(panel),
    drawHireMessage: vi.fn(object),
    drawEngineerCandidateOverlay: vi.fn(object),
    drawInitialPlacementEngineerButton: vi.fn(() => ({ container: fakes.make(), setLabel: vi.fn(), setSelected: vi.fn() })),
    drawInitialPlacementMessage: vi.fn(object),
    drawInitialPlacementPanel: vi.fn(object),
    drawInitialPlacementStartButton: vi.fn(object),
    drawItemAttackEffect: vi.fn(),
    drawMenuIcons: vi.fn(() => ({ setOpen: vi.fn(), setDimmed: vi.fn() })),
    drawItemMenu: vi.fn(panel),
    drawEngineerMenu: vi.fn(panel),
    drawBalanceMenu: vi.fn(panel),
    drawEngineerPopover: vi.fn(panel),
    drawStatusPanel: vi.fn(() => ({
      setFunds: vi.fn(),
      setScore: vi.fn(),
      setMonthEndPayment: vi.fn(),
      setTechDebt: vi.fn(),
    })),
    drawItemMessage: vi.fn(object),
    drawOutageText: vi.fn(),
    drawPlacedItem: vi.fn(object),
    // 置けるかどうかの枠(#162)。
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
    flashCode: vi.fn(),
  };
});

const render = await import('./render');

type MenuKind = 'engineer' | 'item' | 'balance';
type FakePointer = { readonly worldX: number; readonly worldY: number; isDown: boolean };
type PointerDownHandler = (pointer: FakePointer, currentlyOver: readonly object[]) => void;
type EventHandler = (payload: object) => void;

// テストで触る MainScene の private メンバーと、create() が使う Phaser のプロパティだけを表す型。
type SceneUnderTest = {
  phase: 'setup' | 'playing';
  engineers: Engineer[];
  routes: Route[];
  placedItems: readonly PlacedItem[];
  funds: number;
  refactoringRatio: number;
  selectedEngineerId: number | null;
  openMenu: MenuKind | null;
  popoverRouteId: number | null;
  gameOver: GameOverState;
  attackPointerHeld: boolean;
  initialPlacement: { readonly itemState: { readonly placedItems: readonly PlacedItem[] } };
  input: {
    readonly activePointer: FakePointer;
    readonly on: (event: string, handler: PointerDownHandler) => void;
  };
  events: {
    readonly on: (event: string, handler: EventHandler, context: object) => void;
    readonly once: Mock<(event: string) => void>;
    readonly off: Mock<(event: string) => void>;
    readonly emit: (event: string, payload: object) => boolean;
  };
  time: { now: number; readonly delayedCall: Mock<(delay: number, callback: () => void) => void> };
  tweens: { readonly pauseAll: Mock<() => void> };
  scene: { readonly restart: Mock<() => void> };
  create(): void;
};

type Harness = {
  readonly scene: SceneUnderTest;
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

const createHarness = (): Harness => {
  const pointerHandlers: PointerDownHandler[] = [];
  const eventHandlers = new Map<string, { readonly handler: EventHandler; readonly context: object }[]>();
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.input = {
    activePointer: { worldX: 0, worldY: 0, isDown: false },
    // 押下（pointerdown）のハンドラーだけを記録する（置けるかどうかの枠 #162 の pointermove はこのファイルでは使わない）。
    on: (event, handler) => {
      if (event === 'pointerdown') pointerHandlers.push(handler);
    },
  };
  scene.events = {
    on: (event, handler, context) => {
      eventHandlers.set(event, [...(eventHandlers.get(event) ?? []), { handler, context }]);
    },
    once: vi.fn<(event: string) => void>(),
    off: vi.fn<(event: string) => void>(),
    emit: (event, payload) => {
      (eventHandlers.get(event) ?? []).forEach(({ handler, context }) => handler.call(context, payload));
      return true;
    },
  };
  scene.time = { now: 0, delayedCall: vi.fn<(delay: number, callback: () => void) => void>() };
  scene.tweens = { pauseAll: vi.fn<() => void>() };
  scene.scene = { restart: vi.fn<() => void>() };
  scene.create();
  return {
    scene,
    pointerDown: (point, currentlyOver = []) => {
      pointerHandlers.forEach((handler) => handler({ worldX: point.x, worldY: point.y, isDown: true }, currentlyOver));
    },
  };
};

// 右上のアイコンを押す（最後に描いたアイコンのコールバックを呼ぶ）。
const pressIcon = (kind: MenuKind): void => {
  const call = vi.mocked(render.drawMenuIcons).mock.calls.at(-1);
  if (call === undefined) throw new Error('アイコンが描かれていません');
  call[1](kind);
};

const lastMenuIcons = (): { readonly setOpen: Mock; readonly setDimmed: Mock } => {
  const result = vi.mocked(render.drawMenuIcons).mock.results.at(-1);
  if (result === undefined || result.type !== 'return') throw new Error('アイコンが描かれていません');
  return { setOpen: vi.mocked(result.value.setOpen), setDimmed: vi.mocked(result.value.setDimmed) };
};

const lastStatusPanel = (): { readonly setMonthEndPayment: Mock; readonly setFunds: Mock } => {
  const result = vi.mocked(render.drawStatusPanel).mock.results.at(-1);
  if (result === undefined || result.type !== 'return') throw new Error('右下の指標が描かれていません');
  return { setMonthEndPayment: vi.mocked(result.value.setMonthEndPayment), setFunds: vi.mocked(result.value.setFunds) };
};

// 最後に描いたパネル（メニュー・ポップオーバー）の destroy。
const lastPanelDestroy = (draw: typeof render.drawItemMenu | typeof render.drawEngineerMenu | typeof render.drawEngineerPopover): Mock => {
  const result = vi.mocked(draw).mock.results.at(-1);
  if (result === undefined || result.type !== 'return') throw new Error('パネルが描かれていません');
  return vi.mocked(result.value.destroy);
};

const lastItemMenu = (): { readonly view: ItemMenuView; readonly onBuySlot: (slot: number) => void } => {
  const call = vi.mocked(render.drawItemMenu).mock.calls.at(-1);
  if (call === undefined) throw new Error('アイテムのメニューが描かれていません');
  return { view: call[1], onBuySlot: call[2].onBuySlot };
};

const lastPopover = (): { readonly engineer: Engineer; readonly anchor: { readonly x: number; readonly y: number }; readonly callbacks: EngineerPopoverCallbacks } => {
  const call = vi.mocked(render.drawEngineerPopover).mock.calls.at(-1);
  if (call === undefined) throw new Error('ポップオーバーが描かれていません');
  return { anchor: call[1], engineer: call[2], callbacks: call[3] };
};

// routeId の出現地点の休暇マーカーを押す（最後に描いたそのルートのマーカーのコールバックを呼ぶ）。
const pressMarker = (scene: SceneUnderTest, routeId: number): void => {
  const route = scene.routes.find((candidate) => candidate.id === routeId);
  if (route === undefined) throw new Error(`ルートがありません: ${routeId}`);
  const calls = vi.mocked(render.drawVacationMarker).mock.calls;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const [, markerRoute, onPress] = calls[i];
    if (markerRoute.id === routeId) {
      onPress();
      return;
    }
  }
  throw new Error(`休暇マーカーがありません: routeId=${routeId}`);
};

// 開始ボタンを押す（最後に描いた開始ボタンのコールバックを呼ぶ。開始キーは #165 で廃止）。
const startPlay = (): void => {
  const call = vi.mocked(render.drawInitialPlacementStartButton).mock.calls.at(-1);
  if (call === undefined) throw new Error('開始ボタンが描かれていません');
  call[1]();
};

// 最後に描いたエンジニアのメニューのコールバック。
const lastEngineerMenuCallbacks = () => {
  const call = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1);
  if (call === undefined) throw new Error('エンジニアのメニューが描かれていません');
  return call[2];
};

// 初期配置の間に置ける配置グリッドのセル（ルート・置けない矩形・初期配置UIの範囲に重ならない最初のセル）。
const firstPlaceableCell = (routes: readonly Route[]): GridCell => {
  for (let row = 0; row < PLACEMENT_ROWS; row += 1) {
    for (let col = 0; col < PLACEMENT_COLS; col += 1) {
      const cell = { col, row };
      if (isPlaceableCell(cell, { routes, placedItems: [], blockedRects: [...ITEM_BLOCKED_RECTS, ...INITIAL_PLACEMENT_UI_BOUNDS] })) {
        return cell;
      }
    }
  }
  throw new Error('置けるセルがありません');
};

const payroll = (engineers: readonly Engineer[]): number => getMonthlyPayroll(getEngineerSalaries(engineers));

// 初期は0人(#172)なので、初期配置の間に右上のエンジニアのメニューで3人雇い、出現列の行1・4・7に置いたシーン（以前の初期配置と同じ形）。
// 雇うたびに次に置くものがエンジニアになるので、続けて出現列のその行を押して置く。最後にメニューを閉じる（開いたまま始めない）。
const FIXTURE_ROWS: readonly number[] = [1, 4, 7];
const createPlacedHarness = (): Harness => {
  const harness = createHarness();
  pressIcon('engineer');
  FIXTURE_ROWS.forEach((row) => {
    lastEngineerMenuCallbacks().onHire('junior');
    harness.pointerDown(cellCenter({ col: 0, row }));
  });
  pressIcon('engineer');
  const { engineers, routes, openMenu } = harness.scene;
  if (engineers.length !== FIXTURE_ROWS.length || routes.length !== FIXTURE_ROWS.length || openMenu !== null) {
    throw new Error('初期配置の間に3人を雇って置けませんでした');
  }
  return harness;
};

describe('MainScene: 右上のアイコンとメニュー(#156)', () => {
  it('create() はアイコンと右下の指標を描き、メニュー・ポップオーバーは閉じている。初期配置の間は開発バランスだけを薄くする（エンジニアは雇える #172）', () => {
    const { scene } = createHarness();
    expect(render.drawMenuIcons).toHaveBeenCalledOnce();
    expect(scene.openMenu).toBeNull();
    expect(scene.popoverRouteId).toBeNull();
    expect(lastMenuIcons().setDimmed).not.toHaveBeenCalledWith('engineer', true);
    expect(lastMenuIcons().setDimmed).toHaveBeenCalledWith('balance', true);
    expect(render.drawStatusPanel).toHaveBeenCalledWith(scene, {
      funds: INITIAL_FUNDS,
      score: 0,
      monthEndPayment: payroll(scene.engineers),
      techDebt: TECH_DEBT_INITIAL,
    });
  });

  it('初期配置の間は開発バランスのアイコンを押しても開かず、エンジニア(#172)・アイテムは開く。もう一度押すと閉じて destroy() する', () => {
    const { scene } = createHarness();
    pressIcon('balance');
    expect(scene.openMenu).toBeNull();
    expect(render.drawBalanceMenu).not.toHaveBeenCalled();
    pressIcon('engineer');
    expect(scene.openMenu).toBe('engineer');
    expect(render.drawEngineerMenu).toHaveBeenCalledOnce();
    pressIcon('engineer');
    expect(scene.openMenu).toBeNull();
    pressIcon('item');
    expect(scene.openMenu).toBe('item');
    expect(render.drawItemMenu).toHaveBeenCalledOnce();
    expect(lastMenuIcons().setOpen).toHaveBeenLastCalledWith('item');
    const destroy = lastPanelDestroy(render.drawItemMenu);
    pressIcon('item');
    expect(scene.openMenu).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
    expect(lastMenuIcons().setOpen).toHaveBeenLastCalledWith(null);
  });

  it('プレイ開始で薄い表示を戻し、別のアイコンを押すと前のメニューを destroy() してそちらに切り替える（一度に1つだけ）', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    expect(lastMenuIcons().setDimmed).toHaveBeenLastCalledWith('balance', false);
    expect(lastMenuIcons().setDimmed).not.toHaveBeenCalledWith('engineer', true);
    pressIcon('engineer');
    expect(scene.openMenu).toBe('engineer');
    const engineerDestroy = lastPanelDestroy(render.drawEngineerMenu);
    pressIcon('balance');
    expect(scene.openMenu).toBe('balance');
    expect(engineerDestroy).toHaveBeenCalledOnce();
    expect(render.drawBalanceMenu).toHaveBeenCalledOnce();
  });

  it('開発バランスのメニューはゲージに今の割合を渡し、◀ でリファクタリングへ・▶ で機能開発へ1段階寄せて描き直す(#165)', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressIcon('balance');
    const lastBalance = () => {
      const call = vi.mocked(render.drawBalanceMenu).mock.calls.at(-1);
      if (call === undefined) throw new Error('開発バランスのメニューが描かれていません');
      return { view: call[1], onStep: call[2] };
    };
    expect(scene.refactoringRatio).toBe(DEFAULT_REFACTORING_RATIO);
    expect(lastBalance().view).toEqual({ ratio: DEFAULT_REFACTORING_RATIO });
    lastBalance().onStep('refactoring');
    expect(scene.refactoringRatio).toBe(0.3);
    expect(render.drawBalanceMenu).toHaveBeenCalledTimes(2);
    expect(lastBalance().view).toEqual({ ratio: 0.3 });
    lastBalance().onStep('feature');
    lastBalance().onStep('feature');
    expect(scene.refactoringRatio).toBe(0.1);
  });

  it('境界値: 0% で ▶（機能開発へ）・100% で ◀（リファクタリングへ）を押しても値は変わらず、描き直さない', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressIcon('balance');
    const onStep = vi.mocked(render.drawBalanceMenu).mock.calls.at(-1)?.[2];
    if (onStep === undefined) throw new Error('開発バランスのメニューが描かれていません');
    scene.refactoringRatio = 0;
    onStep('feature');
    expect(scene.refactoringRatio).toBe(0);
    scene.refactoringRatio = 1;
    onStep('refactoring');
    expect(scene.refactoringRatio).toBe(1);
    expect(render.drawBalanceMenu).toHaveBeenCalledOnce();
    onStep('feature');
    expect(scene.refactoringRatio).toBe(0.9);
    expect(render.drawBalanceMenu).toHaveBeenCalledTimes(2);
  });

  it('エンジニアのメニューから雇うと人数が増え、メニューを描き直す。月末に支払うお金に月給を足す。資金は変えない(#179)', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressIcon('engineer');
    const before = scene.engineers.length;
    // 初期配置の間に雇っても資金は減らない（雇うときの費用はない #179）。
    expect(scene.funds).toBe(INITIAL_FUNDS);
    const setFundsCalls = lastStatusPanel().setFunds.mock.calls.length;
    const [, view, callbacks] = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1) ?? [];
    if (view === undefined || callbacks === undefined) throw new Error('エンジニアのメニューが描かれていません');
    expect(view.count).toBe(before);
    callbacks.onHire('junior');
    expect(scene.engineers).toHaveLength(before + 1);
    expect(vi.mocked(render.drawEngineerMenu).mock.calls.at(-1)?.[1].count).toBe(before + 1);
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(payroll(scene.engineers));
    // プレイ中も雇うときの費用はない(#179)。資金も、資金の表示も変わらない。
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(lastStatusPanel().setFunds.mock.calls.length).toBe(setFundsCalls);
  });
});

describe('MainScene: メニュー・ポップオーバーの外の押下(#156)', () => {
  const emptyPoint = { x: 500, y: 300 };

  it('プレイ中にメニューが開いていればフィールドの押下で閉じ、押下を消費する（離すまで移動・攻撃しない）', () => {
    const { scene, pointerDown } = createPlacedHarness();
    startPlay();
    scene.attackPointerHeld = false;
    pressIcon('item');
    const destroy = lastPanelDestroy(render.drawItemMenu);
    pointerDown(emptyPoint);
    expect(scene.openMenu).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
    expect(scene.attackPointerHeld).toBe(true);
    expect(render.drawAttackEffect).not.toHaveBeenCalled();
  });

  it('何も開いていなければ同じ押下は消費しない', () => {
    const { scene, pointerDown } = createPlacedHarness();
    startPlay();
    scene.attackPointerHeld = false;
    pointerDown(emptyPoint);
    expect(scene.attackPointerHeld).toBe(false);
  });

  it('メニューの上（背景・ボタンを含む currentlyOver あり）の押下では閉じない', () => {
    const { scene, pointerDown } = createPlacedHarness();
    startPlay();
    pressIcon('item');
    pointerDown(emptyPoint, [{}]);
    expect(scene.openMenu).toBe('item');
    expect(scene.attackPointerHeld).toBe(true);
  });

  it('ポップオーバーが開いていればフィールドの押下で閉じて destroy() する', () => {
    const { scene, pointerDown } = createPlacedHarness();
    startPlay();
    pressMarker(scene, scene.routes[0].id);
    const destroy = lastPanelDestroy(render.drawEngineerPopover);
    pointerDown(emptyPoint);
    expect(scene.popoverRouteId).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
    expect(scene.attackPointerHeld).toBe(true);
  });
});

describe('MainScene: エンジニアのポップオーバー(#156)', () => {
  it('初期配置の間は出現地点を押しても開かない（休暇も切り替えない）', () => {
    const { scene } = createPlacedHarness();
    pressMarker(scene, scene.routes[0].id);
    expect(render.drawEngineerPopover).not.toHaveBeenCalled();
    expect(scene.popoverRouteId).toBeNull();
    expect(scene.engineers.every((engineer) => !engineer.onVacation)).toBe(true);
  });

  it('ゲームオーバー中は出現地点を押しても開かない', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    scene.gameOver = { over: true, at: 0 };
    pressMarker(scene, scene.routes[0].id);
    expect(render.drawEngineerPopover).not.toHaveBeenCalled();
  });

  it('プレイ中に出現地点を押すと、担当エンジニアのポップオーバーを出現地点の中心に開き、その人を選択中にしてメニューを閉じる。もう一度押すと閉じる', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressIcon('engineer');
    const menuDestroy = lastPanelDestroy(render.drawEngineerMenu);
    const route = scene.routes[1];
    const engineer = findEngineerByRoute(scene.engineers, route.id);
    if (engineer === undefined) throw new Error('担当エンジニアがいません');
    pressMarker(scene, route.id);
    expect(scene.popoverRouteId).toBe(route.id);
    expect(scene.selectedEngineerId).toBe(engineer.id);
    expect(scene.openMenu).toBeNull();
    expect(menuDestroy).toHaveBeenCalledOnce();
    expect(lastPopover().engineer).toEqual(engineer);
    expect(lastPopover().anchor).toEqual(cellCenter(route.spawn));
    const popoverDestroy = lastPanelDestroy(render.drawEngineerPopover);
    pressMarker(scene, route.id);
    expect(scene.popoverRouteId).toBeNull();
    expect(popoverDestroy).toHaveBeenCalledOnce();
  });

  it('アイコンでメニューを開くとポップオーバーを閉じる（一度に1つだけ）', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressMarker(scene, scene.routes[0].id);
    const popoverDestroy = lastPanelDestroy(render.drawEngineerPopover);
    pressIcon('item');
    expect(scene.popoverRouteId).toBeNull();
    expect(popoverDestroy).toHaveBeenCalledOnce();
    expect(scene.openMenu).toBe('item');
  });

  it('休暇ボタンでそのルートの担当エンジニアの休暇を切り替え、ポップオーバーを描き直す', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    const route = scene.routes[0];
    pressMarker(scene, route.id);
    lastPopover().callbacks.onToggleVacation();
    expect(findEngineerByRoute(scene.engineers, route.id)?.onVacation).toBe(true);
    expect(lastPopover().engineer.onVacation).toBe(true);
    lastPopover().callbacks.onToggleVacation();
    expect(findEngineerByRoute(scene.engineers, route.id)?.onVacation).toBe(false);
  });

  it('AIエージェントのボタンは、開いたあとに選択中のエンジニアが変わっても、ポップオーバーの担当エンジニアに付ける', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    const route = scene.routes[1];
    const target = findEngineerByRoute(scene.engineers, route.id);
    if (target === undefined) throw new Error('担当エンジニアがいません');
    pressMarker(scene, route.id);
    const other = scene.engineers.find((engineer) => engineer.id !== target.id);
    if (other === undefined) throw new Error('ほかのエンジニアがいません');
    scene.selectedEngineerId = other.id;
    expect(scene.selectedEngineerId).not.toBe(target.id);
    const selected = scene.selectedEngineerId;
    const fundsBefore = scene.funds;
    lastPopover().callbacks.onBuyAiAgent('cheap');
    expect(scene.engineers.find((engineer) => engineer.id === target.id)?.aiAgent).toBe('cheap');
    expect(scene.engineers.find((engineer) => engineer.id === selected)?.aiAgent).toBeNull();
    expect(scene.funds).toBe(fundsBefore - getAiAgentPrice('cheap'));
    // 描き直したポップオーバーは付けた AIエージェントを表示し、月末に支払うお金に月額を足す。
    expect(lastPopover().engineer.aiAgent).toBe('cheap');
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(payroll(scene.engineers) + getAiAgentMonthlyFee('cheap'));
  });

  it('倒産（ゲームオーバー）で開いているポップオーバーとメニューを閉じる', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressMarker(scene, scene.routes[0].id);
    const popoverDestroy = lastPanelDestroy(render.drawEngineerPopover);
    // AIエージェントの価格ちょうどの資金で付けると資金 0 で倒産する（BANKRUPT_INCLUDES_ZERO）。
    scene.funds = getAiAgentPrice('cheap');
    lastPopover().callbacks.onBuyAiAgent('cheap');
    expect(scene.gameOver.over).toBe(true);
    expect(scene.popoverRouteId).toBeNull();
    expect(popoverDestroy).toHaveBeenCalledOnce();
    expect(scene.openMenu).toBeNull();
    // ゲームオーバー中はアイコンを押しても開かない。
    pressIcon('engineer');
    expect(scene.openMenu).toBeNull();
  });
});

describe('MainScene: 月末に支払うお金の更新(#156)', () => {
  it('初期配置で月額アイテムを置く・×で外すと更新し、プレイ開始でもプレイ中の配置で求め直す', () => {
    const { scene, pointerDown } = createPlacedHarness();
    const base = payroll(scene.engineers);
    pressIcon('item');
    const slot = ITEM_TYPES.indexOf('codeRabbit');
    lastItemMenu().onBuySlot(slot);
    const cell = firstPlaceableCell(scene.routes);
    pointerDown(placementCellCenter(cell));
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(base + getItemMonthlyFee('codeRabbit'));
    lastStatusPanel().setMonthEndPayment.mockClear();
    startPlay();
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenCalledWith(base + getItemMonthlyFee('codeRabbit'));
  });

  it('×で外すと月額アイテムの分を戻す', () => {
    const { scene, pointerDown } = createHarness();
    const base = payroll(scene.engineers);
    pressIcon('item');
    lastItemMenu().onBuySlot(ITEM_TYPES.indexOf('codeRabbit'));
    pointerDown(placementCellCenter(firstPlaceableCell(scene.routes)));
    const removeCall = vi.mocked(render.drawRemoveButton).mock.calls.at(-1);
    if (removeCall === undefined) throw new Error('×ボタンが描かれていません');
    removeCall[2]();
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(0);
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(base);
  });

  it('初期配置の間に雇うと月給を足し、資金は変えない(#172, #179)', () => {
    const { scene } = createHarness();
    expect(payroll(scene.engineers)).toBe(0);
    pressIcon('engineer');
    const setFundsCalls = lastStatusPanel().setFunds.mock.calls.length;
    lastEngineerMenuCallbacks().onHire('junior');
    expect(scene.engineers).toHaveLength(1);
    expect(payroll(scene.engineers)).toBeGreaterThan(0);
    // 雇っただけで未配置なので、月末に支払う予告は0円のまま(#176)。
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(0);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(lastStatusPanel().setFunds.mock.calls.length).toBe(setFundsCalls);
    expect(vi.mocked(render.drawEngineerMenu).mock.calls.at(-1)?.[1].count).toBe(1);
  });

  describe('初期配置の間の月末支払予告は配置済みのエンジニアに連動する(#176)', () => {
    const hire = (rank: 'junior' | 'middle' | 'senior'): void => {
      pressIcon('engineer');
      lastEngineerMenuCallbacks().onHire(rank);
    };
    const salaryOf = (rank: 'junior' | 'middle' | 'senior'): number => ENGINEER_MONTHLY_SALARY_BY_RANK[rank];
    const forecast = (): number => {
      const call = lastStatusPanel().setMonthEndPayment.mock.calls.at(-1);
      if (call === undefined) throw new Error('月末支払が更新されていません');
      return call[0] as number;
    };
    const pressRemove = (): void => {
      const removeCall = vi.mocked(render.drawRemoveButton).mock.calls.at(-1);
      if (removeCall === undefined) throw new Error('×ボタンが描かれていません');
      removeCall[2]();
    };

    it('シニアの採用→配置→×→再配置→開始で 0 → 月給 → 0 → 月給 → 月給', () => {
      const { scene, pointerDown } = createHarness();
      const senior = salaryOf('senior');
      hire('senior');
      expect(forecast()).toBe(0);
      pointerDown(cellCenter({ col: 0, row: 1 }));
      expect(forecast()).toBe(senior);
      pressRemove();
      expect(forecast()).toBe(0);
      // 左上の「エンジニアを置く」ボタンで未配置のエンジニアを選び直して置く。
      const selectButton = vi.mocked(render.drawInitialPlacementEngineerButton).mock.calls.at(-1);
      if (selectButton === undefined) throw new Error('エンジニアの選択ボタンが描かれていません');
      selectButton[2]();
      pointerDown(cellCenter({ col: 0, row: 1 }));
      expect(forecast()).toBe(senior);
      startPlay();
      expect(scene.phase).toBe('playing');
      expect(forecast()).toBe(senior);
    });

    it('ジュニアとシニアを雇い、片方だけ置くとその人の月給だけになる', () => {
      const { scene, pointerDown } = createHarness();
      hire('junior');
      hire('senior');
      expect(forecast()).toBe(0);
      pointerDown(cellCenter({ col: 0, row: 1 }));
      const placed = scene.engineers.filter((engineer) => engineer.routeId !== null);
      expect(placed).toHaveLength(1);
      expect(forecast()).toBe(placed[0]?.salary);
      expect(forecast()).not.toBe(payroll(scene.engineers));
    });

    it('月額アイテムを置いたままエンジニアを外すと、配置済みの月給＋アイテムの月額になる', () => {
      const { scene, pointerDown } = createHarness();
      hire('junior');
      pointerDown(cellCenter({ col: 0, row: 1 }));
      hire('middle');
      pointerDown(cellCenter({ col: 0, row: 4 }));
      pressIcon('item');
      lastItemMenu().onBuySlot(ITEM_TYPES.indexOf('codeRabbit'));
      pointerDown(placementCellCenter(firstPlaceableCell(scene.routes)));
      expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
      const fee = getItemMonthlyFee('codeRabbit');
      expect(forecast()).toBe(salaryOf('junior') + salaryOf('middle') + fee);
      // 最初に描いた×ボタン（ジュニア）を押して外す。
      const juniorRemove = vi.mocked(render.drawRemoveButton).mock.calls[0];
      if (juniorRemove === undefined) throw new Error('×ボタンが描かれていません');
      juniorRemove[2]();
      expect(forecast()).toBe(salaryOf('middle') + fee);
    });

    it('配置に失敗したときは月末支払を更新しない（候補外のセル）', () => {
      const { pointerDown } = createHarness();
      hire('junior');
      lastStatusPanel().setMonthEndPayment.mockClear();
      pointerDown(cellCenter({ col: PLACEMENT_COLS - 1, row: 1 }));
      expect(lastStatusPanel().setMonthEndPayment).not.toHaveBeenCalled();
    });

    it('開始後は未配置・休暇中を含む名簿全員を数える', () => {
      const { scene } = createPlacedHarness();
      startPlay();
      expect(forecast()).toBe(payroll(scene.engineers));
      pressIcon('engineer');
      lastEngineerMenuCallbacks().onHire('senior');
      expect(forecast()).toBe(payroll(scene.engineers));
    });
  });

  it('昇給すると月給の増分を足す', () => {
    const { scene } = createPlacedHarness();
    startPlay();
    pressIcon('engineer');
    lastEngineerMenuCallbacks().onAdjust('raise');
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(payroll(scene.engineers));
    expect(payroll(scene.engineers)).toBeGreaterThan(0);
  });
});
