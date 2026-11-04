// CodeRabbit(#52) の購入・自動攻撃・撃破・月額課金が MainScene に正しく接続されていることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（vacationNeutrality.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  DEFAULT_MALICIOUS_CODE_HP,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  ITEM_ATTACK_COOLDOWN_MS,
  ITEM_POWER_DAMAGE,
  ITEM_RANGE_RATIOS,
} from './config';
import { CODE_DEFEATED_EVENT } from './defeat';
import { createEngineerParameters } from './engineer';
import type { Engineer } from './engineer';
import { CELL_SIZE } from './field';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import { GAME_OVER_EVENT, isBankrupt } from './gameOver';
import type { GameOverState } from './gameOver';
import { createMonthElapsedEvent } from './gameTime';
import type { MonthElapsedEvent } from './gameTime';
import type { ItemType } from './item';
import { ITEM_FEE_PAID_EVENT } from './itemFee';
import { getItemMonthlyFee, getItemPrice, ITEM_PLACED_EVENT } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { drawDefeatEffect, drawItemAttackEffect, flashCode } from './render';
import { cellCenter } from './route';
import type { GridCell, Point, Route } from './route';
import { SALARY_PAID_EVENT } from './salary';

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
  drawPlacedItem: vi.fn(),
  drawItemMessage: vi.fn(() => ({ destroy: vi.fn() })),
  drawGameOver: vi.fn(),
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
  elapsedMs: number;
  engineers: Engineer[];
  routes: Route[];
  gameOver: GameOverState;
  player?: Point;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  placedItems: readonly PlacedItem[];
  nextItemId: number;
  time: { now: number };
  tweens: { readonly killTweensOf: Mock<(target: object) => void>; readonly pauseAll: Mock<() => void> };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  fundsText: { readonly setText: Mock<(text: string) => void> };
  salesText: { readonly setText: Mock<(text: string) => void> };
  updateItems(now: number): void;
  buyItem(itemType: ItemType): void;
  onMonthElapsed(event: MonthElapsedEvent): void;
  onFundsChanged(event: FundsChangedEvent): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const RANGE = ITEM_RANGE_RATIOS.long * CELL_SIZE;
const DAMAGE = ITEM_POWER_DAMAGE.medium;
const PRICE = getItemPrice('codeRabbit');
const FEE = getItemMonthlyFee('codeRabbit');
const T0 = 10_000;
// ルートは行 5 を通る。col 7・行 4 は HUD・昇給減給ボタンと重ならないルート隣接セル。
const ROUTE: Route = {
  id: 0,
  spawn: { col: 0, row: 5 },
  waypoints: [
    { col: 0, row: 5 },
    { col: 8, row: 5 },
  ],
};
const ITEM_CELL: GridCell = { col: 7, row: 4 };
const ITEM_CENTER = cellCenter(ITEM_CELL);

const isFundsChangedEvent = (payload: object): payload is FundsChangedEvent =>
  'previous' in payload && 'current' in payload && 'delta' in payload && 'reason' in payload;

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

const makeJunior = (id: number): Engineer => ({
  id,
  rank: 'junior',
  routeId: 0,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction: 0,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK.junior,
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK.junior,
  aiAgent: null,
  ...createEngineerParameters('junior', 'meticulous'),
});

const placedCodeRabbit = (lastAttackTime: number | null = null): PlacedItem => ({
  id: 0,
  itemType: 'codeRabbit',
  cell: ITEM_CELL,
  lastAttackTime,
});

const makeCode = (id: number, dx: number, kind: 'normal' | 'malicious' = 'malicious'): FakeCode => ({
  id,
  kind,
  routeId: ROUTE.id,
  path: [],
  segmentIndex: 0,
  position: { x: ITEM_CENTER.x + dx, y: ITEM_CENTER.y },
  released: false,
  graphics: { destroy: vi.fn<() => void>() },
});

type SceneOptions = {
  readonly funds?: number;
  readonly codes?: FakeCode[];
  readonly placedItems?: readonly PlacedItem[];
  readonly engineers?: Engineer[];
};

const createScene = (options: SceneOptions = {}): SceneUnderTest => {
  const codes = options.codes ?? [];
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = options.funds ?? PRICE;
  scene.score = 0;
  scene.elapsedMs = 0;
  scene.engineers = options.engineers ?? [];
  scene.routes = [ROUTE];
  scene.gameOver = NOT_OVER;
  scene.player = ITEM_CENTER;
  scene.codes = codes;
  // 実際のシーンと同じく、不正なコードだけが hp を持つ。
  scene.codeHp = new Map(
    codes.filter((code) => code.kind === 'malicious').map((code) => [code.id, DEFAULT_MALICIOUS_CODE_HP]),
  );
  scene.placedItems = options.placedItems ?? [];
  scene.nextItemId = scene.placedItems.length;
  scene.time = { now: T0 };
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>(), pauseAll: vi.fn<() => void>() };
  // 実際のシーンは FUNDS_CHANGED_EVENT を onFundsChanged で購読して倒産を判定する。その接続だけを再現する。
  scene.events = {
    emit: vi.fn<(event: string, payload: object) => boolean>((event, payload) => {
      if (event === FUNDS_CHANGED_EVENT && isFundsChangedEvent(payload)) {
        scene.onFundsChanged(payload);
      }
      return true;
    }),
  };
  scene.fundsText = { setText: vi.fn<(text: string) => void>() };
  scene.salesText = { setText: vi.fn<(text: string) => void>() };
  return scene;
};

const emittedEvents = (scene: SceneUnderTest): string[] => scene.events.emit.mock.calls.map(([event]) => event);

describe('MainScene.updateItems: CodeRabbit の自動攻撃と撃破', () => {
  it('種類なしの不正なコードを 1 回目で削り、クールダウン明けの 2 回目で撃破する', () => {
    const code = makeCode(1, 0);
    const scene = createScene({ codes: [code], placedItems: [placedCodeRabbit()] });

    scene.updateItems(T0);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - DAMAGE);
    expect(scene.placedItems[0]?.lastAttackTime).toBe(T0);
    expect(drawItemAttackEffect).toHaveBeenCalledExactlyOnceWith(scene, ITEM_CENTER, code.position);
    expect(flashCode).toHaveBeenCalledExactlyOnceWith(scene, code.graphics);
    expect(scene.codes).toEqual([code]);

    scene.updateItems(T0 + ITEM_ATTACK_COOLDOWN_MS - 1);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - DAMAGE);
    expect(scene.placedItems[0]?.lastAttackTime).toBe(T0);
    expect(drawItemAttackEffect).toHaveBeenCalledTimes(1);
    expect(emittedEvents(scene)).not.toContain(CODE_DEFEATED_EVENT);

    scene.updateItems(T0 + ITEM_ATTACK_COOLDOWN_MS);
    expect(scene.codes).toEqual([]);
    expect(scene.codeHp.has(1)).toBe(false);
    expect(scene.placedItems[0]?.lastAttackTime).toBe(T0 + ITEM_ATTACK_COOLDOWN_MS);
    expect(code.graphics.destroy).toHaveBeenCalledTimes(1);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(code.graphics);
    expect(drawDefeatEffect).toHaveBeenCalledExactlyOnceWith(scene, code.position);
    expect(scene.events.emit).toHaveBeenCalledExactlyOnceWith(CODE_DEFEATED_EVENT, { id: 1, routeId: ROUTE.id });
  });

  it.each([
    ['射程ちょうど', RANGE, DEFAULT_MALICIOUS_CODE_HP - DAMAGE, T0],
    ['射程 + 1px', RANGE + 1, DEFAULT_MALICIOUS_CODE_HP, null],
  ])('%s の不正なコード → hp %i・最終攻撃時刻 %s', (_name, dx, hp, lastAttackTime) => {
    const scene = createScene({ codes: [makeCode(1, dx)], placedItems: [placedCodeRabbit()] });

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBe(hp);
    expect(scene.placedItems[0]?.lastAttackTime).toBe(lastAttackTime);
  });

  it('距離 0 に正常なコードしかなければ攻撃せず、hp とクールダウンは変わらない', () => {
    const normal = makeCode(1, 0, 'normal');
    const outOfRange = makeCode(2, RANGE + 1);
    const scene = createScene({ codes: [normal, outOfRange], placedItems: [placedCodeRabbit()] });

    scene.updateItems(T0);

    expect(scene.codes).toEqual([normal, outOfRange]);
    expect(scene.codeHp.has(1)).toBe(false);
    expect(scene.codeHp.get(2)).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.placedItems[0]?.lastAttackTime).toBeNull();
    expect(drawItemAttackEffect).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalled();
  });
});

describe('MainScene.buyItem: CodeRabbit の購入', () => {
  it('資金がちょうど価格なら置けて資金 0 になり、ITEM_PLACED_EVENT を発行する', () => {
    const scene = createScene({ funds: PRICE });

    scene.buyItem('codeRabbit');

    const item: PlacedItem = { id: 0, itemType: 'codeRabbit', cell: ITEM_CELL, lastAttackTime: null };
    expect(scene.placedItems).toEqual([item]);
    expect(scene.funds).toBe(0);
    expect(scene.events.emit).toHaveBeenCalledWith(ITEM_PLACED_EVENT, { item, price: PRICE });
    // 資金 0 になったときの倒産判定は既存ルール（changeFunds → onFundsChanged）に従う。
    expect(scene.gameOver.over).toBe(isBankrupt(0));
  });

  it('資金が価格 - 1 なら置けず、資金も変わらない', () => {
    const scene = createScene({ funds: PRICE - 1 });

    scene.buyItem('codeRabbit');

    expect(scene.placedItems).toEqual([]);
    expect(scene.funds).toBe(PRICE - 1);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });
});

describe('MainScene.onMonthElapsed: CodeRabbit の月額', () => {
  const salary = ENGINEER_MONTHLY_SALARY_BY_RANK.junior;

  it('給料の後に月額を引き、イベントは 給料 → 月額 の順に発行する', () => {
    const scene = createScene({ funds: salary + FEE + 1, engineers: [makeJunior(0)], placedItems: [placedCodeRabbit()] });

    scene.onMonthElapsed(createMonthElapsedEvent(1));

    expect(scene.funds).toBe(1);
    expect(emittedEvents(scene)).toEqual([FUNDS_CHANGED_EVENT, SALARY_PAID_EVENT, FUNDS_CHANGED_EVENT, ITEM_FEE_PAID_EVENT]);
    expect(scene.events.emit).toHaveBeenCalledWith(ITEM_FEE_PAID_EVENT, {
      month: 1,
      amount: FEE,
      itemCount: 1,
      fundsBefore: FEE + 1,
      fundsAfter: 1,
    });
  });

  it.each([
    ['月額ちょうど', FEE, 0],
    ['月額 + 1', FEE + 1, 1],
  ])('給料後の資金が%s → 資金 %i、倒産は既存ルール（isBankrupt）どおり', (_name, afterSalary, expected) => {
    const scene = createScene({
      funds: salary + afterSalary,
      engineers: [makeJunior(0)],
      placedItems: [placedCodeRabbit()],
    });

    scene.onMonthElapsed(createMonthElapsedEvent(1));

    expect(scene.funds).toBe(expected);
    expect(scene.gameOver.over).toBe(isBankrupt(expected));
    expect(emittedEvents(scene).includes(GAME_OVER_EVENT)).toBe(isBankrupt(expected));
  });
});
