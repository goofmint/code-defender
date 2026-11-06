// 右上のアイコンで開くメニュー・出現地点で開くエンジニアのポップオーバー・右下の指標(#156)を、実際の MainScene の
// create() / pointerdown / キー / メニューのコールバックで確かめる。main.ts は読み込み時に new Phaser.Game(config) を実行するので、
// このファイルの中だけで phaser と描画（render.ts）をモックする（initialPlacementScene.test.ts と同じ形）。
// scene.events は実際と同じく、on で登録したハンドラーへ emit を届ける（倒産でゲームオーバーにするため）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { getAiAgentMonthlyFee, getAiAgentPrice } from './aiAgent';
import {
  ENGINEER_HIRE_COST,
  HIRE_KEYS,
  INITIAL_FUNDS,
  INITIAL_PLACEMENT_START_KEYS,
  INITIAL_PLACEMENT_UI_BOUNDS,
  ITEM_BLOCKED_RECTS,
  PLACEMENT_COLS,
  PLACEMENT_ROWS,
  SALARY_ADJUST_KEYS,
  SALARY_SELECT_KEYS,
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
      setTechDebtLevel: vi.fn(),
    })),
    drawItemMessage: vi.fn(object),
    drawOutageText: vi.fn(),
    drawPlacedItem: vi.fn(object),
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
type FakeKey = { readonly isDown: boolean; readonly on: (event: string, handler: () => void) => FakeKey };
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
    readonly keyboard: { readonly addKey: (name: string) => FakeKey };
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

const createHarness = (): Harness => {
  const keyHandlers = new Map<string, (() => void)[]>();
  const pointerHandlers: PointerDownHandler[] = [];
  const eventHandlers = new Map<string, { readonly handler: EventHandler; readonly context: object }[]>();
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.input = {
    activePointer: { worldX: 0, worldY: 0, isDown: false },
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
    pressKey: (name) => {
      const handlers = keyHandlers.get(name);
      if (handlers === undefined) throw new Error(`キーが登録されていません: ${name}`);
      handlers.forEach((handler) => handler());
    },
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

const startPlay = (pressKey: Harness['pressKey']): void => pressKey(INITIAL_PLACEMENT_START_KEYS[0]);

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

describe('MainScene: 右上のアイコンとメニュー(#156)', () => {
  it('create() はアイコンと右下の指標を描き、メニュー・ポップオーバーは閉じている。初期配置の間はエンジニアと開発バランスを薄くする', () => {
    const { scene } = createHarness();
    expect(render.drawMenuIcons).toHaveBeenCalledOnce();
    expect(scene.openMenu).toBeNull();
    expect(scene.popoverRouteId).toBeNull();
    expect(lastMenuIcons().setDimmed).toHaveBeenCalledWith('engineer', true);
    expect(lastMenuIcons().setDimmed).toHaveBeenCalledWith('balance', true);
    expect(render.drawStatusPanel).toHaveBeenCalledWith(scene, {
      funds: INITIAL_FUNDS,
      score: 0,
      monthEndPayment: payroll(scene.engineers),
      techDebtLevel: 'normal',
    });
  });

  it('初期配置の間はエンジニア・開発バランスのアイコンを押しても開かず、アイテムは開く。もう一度押すと閉じて destroy() する', () => {
    const { scene } = createHarness();
    pressIcon('engineer');
    pressIcon('balance');
    expect(scene.openMenu).toBeNull();
    expect(render.drawEngineerMenu).not.toHaveBeenCalled();
    expect(render.drawBalanceMenu).not.toHaveBeenCalled();
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
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    expect(lastMenuIcons().setDimmed).toHaveBeenLastCalledWith('balance', false);
    expect(lastMenuIcons().setDimmed).toHaveBeenCalledWith('engineer', false);
    pressIcon('engineer');
    expect(scene.openMenu).toBe('engineer');
    const engineerDestroy = lastPanelDestroy(render.drawEngineerMenu);
    pressIcon('balance');
    expect(scene.openMenu).toBe('balance');
    expect(engineerDestroy).toHaveBeenCalledOnce();
    expect(render.drawBalanceMenu).toHaveBeenCalledOnce();
  });

  it('開発バランスのメニューは 11 段階と現在値を渡し、選ぶとその割合にして描き直す', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    pressIcon('balance');
    const [, view, onSelect] = vi.mocked(render.drawBalanceMenu).mock.calls[0] ?? [];
    if (view === undefined || onSelect === undefined) throw new Error('開発バランスのメニューが描かれていません');
    expect(view.options).toHaveLength(11);
    expect(view.current).toBe(scene.refactoringRatio);
    onSelect(1);
    expect(scene.refactoringRatio).toBe(1);
    expect(render.drawBalanceMenu).toHaveBeenCalledTimes(2);
    expect(vi.mocked(render.drawBalanceMenu).mock.calls[1]?.[1].current).toBe(1);
    onSelect(0);
    expect(scene.refactoringRatio).toBe(0);
  });

  it('エンジニアのメニューから雇うと人数が増え、メニューを描き直す。月末に支払うお金に月給を足す', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    pressIcon('engineer');
    const before = scene.engineers.length;
    const [, view, callbacks] = vi.mocked(render.drawEngineerMenu).mock.calls.at(-1) ?? [];
    if (view === undefined || callbacks === undefined) throw new Error('エンジニアのメニューが描かれていません');
    expect(view.count).toBe(before);
    callbacks.onHire('junior');
    expect(scene.engineers).toHaveLength(before + 1);
    expect(vi.mocked(render.drawEngineerMenu).mock.calls.at(-1)?.[1].count).toBe(before + 1);
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(payroll(scene.engineers));
    expect(scene.funds).toBe(INITIAL_FUNDS - ENGINEER_HIRE_COST.junior);
  });
});

describe('MainScene: メニュー・ポップオーバーの外の押下(#156)', () => {
  const emptyPoint = { x: 500, y: 300 };

  it('プレイ中にメニューが開いていればフィールドの押下で閉じ、押下を消費する（離すまで移動・攻撃しない）', () => {
    const { scene, pressKey, pointerDown } = createHarness();
    startPlay(pressKey);
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
    const { scene, pressKey, pointerDown } = createHarness();
    startPlay(pressKey);
    scene.attackPointerHeld = false;
    pointerDown(emptyPoint);
    expect(scene.attackPointerHeld).toBe(false);
  });

  it('メニューの上（背景・ボタンを含む currentlyOver あり）の押下では閉じない', () => {
    const { scene, pressKey, pointerDown } = createHarness();
    startPlay(pressKey);
    pressIcon('item');
    pointerDown(emptyPoint, [{}]);
    expect(scene.openMenu).toBe('item');
    expect(scene.attackPointerHeld).toBe(true);
  });

  it('ポップオーバーが開いていればフィールドの押下で閉じて destroy() する', () => {
    const { scene, pressKey, pointerDown } = createHarness();
    startPlay(pressKey);
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
    const { scene } = createHarness();
    pressMarker(scene, scene.routes[0].id);
    expect(render.drawEngineerPopover).not.toHaveBeenCalled();
    expect(scene.popoverRouteId).toBeNull();
    expect(scene.engineers.every((engineer) => !engineer.onVacation)).toBe(true);
  });

  it('ゲームオーバー中は出現地点を押しても開かない', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    scene.gameOver = { over: true, at: 0 };
    pressMarker(scene, scene.routes[0].id);
    expect(render.drawEngineerPopover).not.toHaveBeenCalled();
  });

  it('プレイ中に出現地点を押すと、担当エンジニアのポップオーバーを出現地点の中心に開き、その人を選択中にしてメニューを閉じる。もう一度押すと閉じる', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
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
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    pressMarker(scene, scene.routes[0].id);
    const popoverDestroy = lastPanelDestroy(render.drawEngineerPopover);
    pressIcon('item');
    expect(scene.popoverRouteId).toBeNull();
    expect(popoverDestroy).toHaveBeenCalledOnce();
    expect(scene.openMenu).toBe('item');
  });

  it('休暇ボタンでそのルートの担当エンジニアの休暇を切り替え、ポップオーバーを描き直す', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    const route = scene.routes[0];
    pressMarker(scene, route.id);
    lastPopover().callbacks.onToggleVacation();
    expect(findEngineerByRoute(scene.engineers, route.id)?.onVacation).toBe(true);
    expect(lastPopover().engineer.onVacation).toBe(true);
    lastPopover().callbacks.onToggleVacation();
    expect(findEngineerByRoute(scene.engineers, route.id)?.onVacation).toBe(false);
  });

  it('AIエージェントのボタンは、開いたあとに選択中のエンジニアがキーで変わっても、ポップオーバーの担当エンジニアに付ける', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    const route = scene.routes[1];
    const target = findEngineerByRoute(scene.engineers, route.id);
    if (target === undefined) throw new Error('担当エンジニアがいません');
    pressMarker(scene, route.id);
    pressKey(SALARY_SELECT_KEYS.next);
    expect(scene.selectedEngineerId).not.toBe(target.id);
    const selected = scene.selectedEngineerId;
    lastPopover().callbacks.onBuyAiAgent('cheap');
    expect(scene.engineers.find((engineer) => engineer.id === target.id)?.aiAgent).toBe('cheap');
    expect(scene.engineers.find((engineer) => engineer.id === selected)?.aiAgent).toBeNull();
    expect(scene.funds).toBe(INITIAL_FUNDS - getAiAgentPrice('cheap'));
    // 描き直したポップオーバーは付けた AIエージェントを表示し、月末に支払うお金に月額を足す。
    expect(lastPopover().engineer.aiAgent).toBe('cheap');
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(payroll(scene.engineers) + getAiAgentMonthlyFee('cheap'));
  });

  it('倒産（ゲームオーバー）で開いているポップオーバーとメニューを閉じる', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    pressMarker(scene, scene.routes[0].id);
    const popoverDestroy = lastPanelDestroy(render.drawEngineerPopover);
    // 雇う費用ちょうどの資金で雇うと資金 0 で倒産する（BANKRUPT_INCLUDES_ZERO）。
    scene.funds = ENGINEER_HIRE_COST.junior;
    pressKey(HIRE_KEYS[0]);
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
    const { scene, pointerDown, pressKey } = createHarness();
    const base = payroll(scene.engineers);
    pressIcon('item');
    const slot = ITEM_TYPES.indexOf('codeRabbit');
    lastItemMenu().onBuySlot(slot);
    const cell = firstPlaceableCell(scene.routes);
    pointerDown(placementCellCenter(cell));
    expect(scene.initialPlacement.itemState.placedItems).toHaveLength(1);
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(base + getItemMonthlyFee('codeRabbit'));
    lastStatusPanel().setMonthEndPayment.mockClear();
    startPlay(pressKey);
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

  it('昇給すると月給の増分を足す', () => {
    const { scene, pressKey } = createHarness();
    startPlay(pressKey);
    pressKey(SALARY_ADJUST_KEYS.raise);
    expect(lastStatusPanel().setMonthEndPayment).toHaveBeenLastCalledWith(payroll(scene.engineers));
    expect(payroll(scene.engineers)).toBeGreaterThan(0);
  });
});
