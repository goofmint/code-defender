// 「30 日を過ぎるとコードを書かなくなる」(#143) の回帰テスト。
// 実際の MainScene.update() を 100 ms 刻みで呼び、29〜32 日目（1 か月目の境界をまたぐ区間）でコードの生成・移動・月次精算が続くかを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（codeRabbit.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_REFACTORING_RATIO,
  INITIAL_FUNDS,
  ITEM_PRICE_TIERS,
  MS_PER_GAME_MONTH,
  REVENUE_PER_NORMAL_CODE,
  TECH_DEBT_INITIAL,
  TECH_DEBT_MAX,
} from './config';
import { CODE_RELEASED_EVENT } from './codeFlow';
import type { CodeReleasedPayload } from './codeFlow';
import { createInitialFleet } from './engineer';
import type { Engineer } from './engineer';
import { FIELD_COLS, FIELD_ROWS } from './field';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import { GAME_OVER_EVENT, INITIAL_GAME_OVER_STATE } from './gameOver';
import type { GameOverState } from './gameOver';
import { MONTH_ELAPSED_EVENT, MS_PER_GAME_DAY } from './gameTime';
import type { MonthElapsedEvent } from './gameTime';
import type { ItemType } from './item';
import { ITEM_FEE_PAID_EVENT } from './itemFee';
import { getItemMonthlyFee, getItemPrice, isPlaceableCell } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { cellCenter } from './route';
import type { GridCell, Point, Route } from './route';
import { getEngineerSalaries, getMonthlyPayroll, SALARY_PAID_EVENT } from './salary';
import { getReleaseRevenue } from './sales';
import { techDebtSpawnIntervalMs } from './techDebt';

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

// 描画は検証の対象外なので、update() と buyItem() で通る描画関数だけスタブにする。
vi.mock('./render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render')>()),
  drawCode: vi.fn(() => ({ setPosition: vi.fn(), destroy: vi.fn() })),
  drawGameOver: vi.fn(),
  drawPlacedItem: vi.fn(),
  drawItemMessage: vi.fn(() => ({ destroy: vi.fn() })),
}));

// 生成するコードを決定的に正常なコードにする（不正コードの障害・損害で資金が動かないようにする）。
// 生成タイマー・移動・リリース（updateCodes）と時計（advanceClock）は本物を使う。
vi.mock('./codeFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./codeFlow')>()),
  pickCodeKind: vi.fn(() => 'normal'),
}));

// update() と buyItem() が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeGraphics = { readonly setPosition: Mock<(x: number, y: number) => void>; readonly destroy: Mock<() => void> };
type FakeCode = {
  readonly id: number;
  readonly routeId: number;
  readonly position: Point;
  readonly released: boolean;
};
type FakePlayer = Point & { readonly setPosition: Mock<(x: number, y: number) => void> };
type FakeVacationMarker = { readonly setOnVacation: Mock<(onVacation: boolean) => void> };
type SceneUnderTest = {
  elapsedMs: number;
  displayedDays: number;
  funds: number;
  score: number;
  techDebt: number;
  techDebtNeglectMs: number;
  refactoringRatio: number;
  gameOver: GameOverState;
  routes: Route[];
  engineers: Engineer[];
  codes: FakeCode[];
  codeHp: Map<number, number>;
  spawnElapsed: Map<number, number>;
  nextCodeId: number;
  placedItems: readonly PlacedItem[];
  nextItemId: number;
  player?: FakePlayer;
  vacationMarkers: Map<number, FakeVacationMarker>;
  input: { readonly activePointer: { readonly isDown: boolean } };
  time: { now: number };
  tweens: { readonly killTweensOf: Mock<(target: FakeGraphics) => void>; readonly pauseAll: Mock<() => void> };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  update(time: number, delta: number): void;
  buyItem(itemType: ItemType): void;
  toggleVacation(routeId: number): void;
  onMonthElapsed(event: MonthElapsedEvent): void;
  onFundsChanged(event: FundsChangedEvent): void;
  onCodeReleased(payload: CodeReleasedPayload): void;
};

// 1 フレームの経過時間（ms）。60,000 ms の境界にちょうど到達する刻み。
const STEP_MS = 100;
// 1 か月目の境界（30 日目）と、その前後。
const MONTH_BOUNDARY_MS = MS_PER_GAME_MONTH;
const BEFORE_BOUNDARY_MS = MONTH_BOUNDARY_MS - MS_PER_GAME_DAY;
const LAST_FRAME_BEFORE_BOUNDARY_MS = MONTH_BOUNDARY_MS - STEP_MS;
const AFTER_BOUNDARY_MS = MONTH_BOUNDARY_MS + MS_PER_GAME_DAY;
// 既定のリファクタリング割合では、30 日目までに技術的負債が上限に達し、生成間隔が延びる(#44)。
// 境界後に新しいコードが出ることは、延びた生成間隔ぶん進めてから確かめる。
const MAX_DEBT_SPAWN_INTERVAL_MS = techDebtSpawnIntervalMs(TECH_DEBT_MAX, CODE_SPAWN_INTERVAL_MS);
const AFTER_SPAWN_INTERVAL_MS = MONTH_BOUNDARY_MS + MAX_DEBT_SPAWN_INTERVAL_MS;
// 30 日目の給料・月額を払っても倒産しない十分な資金（初期資金の 1000 倍）。
const AMPLE_FUNDS = INITIAL_FUNDS * 1000;
// ルート・エンジニアの抽選を固定する。
const FIXED_RANDOM = (): number => 0;

const isMonthElapsedEvent = (payload: object): payload is MonthElapsedEvent =>
  'month' in payload && 'elapsedMs' in payload && 'days' in payload;
const isFundsChangedEvent = (payload: object): payload is FundsChangedEvent =>
  'previous' in payload && 'current' in payload && 'delta' in payload && 'reason' in payload;
const isCodeReleasedPayload = (payload: object): payload is CodeReleasedPayload =>
  'id' in payload && 'kind' in payload && 'routeId' in payload;

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

// create() が設定するフィールドを明示的に初期化する（Object.create はクラスフィールドの初期値を設定しない）。
const createScene = (funds: number): SceneUnderTest => {
  const fleet = createInitialFleet(FIXED_RANDOM);
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.elapsedMs = 0;
  scene.displayedDays = 0;
  scene.funds = funds;
  scene.score = 0;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.techDebtNeglectMs = 0;
  scene.refactoringRatio = DEFAULT_REFACTORING_RATIO;
  scene.gameOver = INITIAL_GAME_OVER_STATE;
  scene.routes = fleet.routes;
  scene.engineers = fleet.engineers;
  scene.codes = [];
  scene.codeHp = new Map();
  scene.spawnElapsed = new Map();
  scene.nextCodeId = 0;
  scene.placedItems = [];
  scene.nextItemId = 0;
  scene.vacationMarkers = new Map(
    fleet.routes.map((route) => [route.id, { setOnVacation: vi.fn<(onVacation: boolean) => void>() }]),
  );
  scene.input = { activePointer: { isDown: false } };
  scene.time = { now: 0 };
  scene.tweens = { killTweensOf: vi.fn<(target: FakeGraphics) => void>(), pauseAll: vi.fn<() => void>() };
  // 実際のシーンは create() でこの 3 つのイベントを購読する。その接続だけを同期的に再現する。
  scene.events = {
    emit: vi.fn<(event: string, payload: object) => boolean>((event, payload) => {
      if (event === MONTH_ELAPSED_EVENT && isMonthElapsedEvent(payload)) scene.onMonthElapsed(payload);
      if (event === FUNDS_CHANGED_EVENT && isFundsChangedEvent(payload)) scene.onFundsChanged(payload);
      if (event === CODE_RELEASED_EVENT && isCodeReleasedPayload(payload)) scene.onCodeReleased(payload);
      return true;
    }),
  };
  return scene;
};

// 実際の update() を STEP_MS 刻みで untilMs まで呼ぶ。time.now もゲーム内時計に合わせて進める。
const runUntil = (scene: SceneUnderTest, startMs: number, untilMs: number): void => {
  for (let now = startMs + STEP_MS; now <= untilMs; now += STEP_MS) {
    scene.time.now = now;
    scene.update(now, STEP_MS);
  }
};

const countEvents = (scene: SceneUnderTest, name: string): number =>
  scene.events.emit.mock.calls.filter(([event]) => event === name).length;

const payloadsOf = (scene: SceneUnderTest, name: string): object[] =>
  scene.events.emit.mock.calls.filter(([event]) => event === name).map(([, payload]) => payload);

const positionsById = (codes: readonly FakeCode[]): Map<number, Point> =>
  new Map(codes.map((code) => [code.id, code.position]));

const payrollOf = (scene: SceneUnderTest): number => getMonthlyPayroll(getEngineerSalaries(scene.engineers));

// 1 つ前の時点から残っているコード（id が同じもの）のうち、位置が変わったものの数。
const movedCount = (before: Map<number, Point>, after: readonly FakeCode[]): { shared: number; moved: number } => {
  const shared = after.filter((code) => before.has(code.id));
  const moved = shared.filter((code) => {
    const previous = before.get(code.id);
    return previous !== undefined && (previous.x !== code.position.x || previous.y !== code.position.y);
  });
  return { shared: shared.length, moved: moved.length };
};

// 置けるセルを左上から探す（ルート・UI・HUD に重ならないセル）。
const findPlaceableCell = (scene: SceneUnderTest): GridCell => {
  for (let row = 0; row < FIELD_ROWS; row++) {
    for (let col = 0; col < FIELD_COLS; col++) {
      const cell: GridCell = { col, row };
      if (isPlaceableCell(cell, { routes: scene.routes, placedItems: scene.placedItems })) return cell;
    }
  }
  throw new Error('アイテムを置けるセルがありません');
};

describe('MainScene.update: 30 日目の境界をまたいでもコードを書き続ける', () => {
  it('休暇なし・資金十分なら、境界前は精算せず、境界で 1 回だけ精算し、その後も生成と移動が続く', () => {
    const scene = createScene(AMPLE_FUNDS);
    const payroll = payrollOf(scene);

    runUntil(scene, 0, BEFORE_BOUNDARY_MS);
    expect(countEvents(scene, MONTH_ELAPSED_EVENT)).toBe(0);
    expect(countEvents(scene, SALARY_PAID_EVENT)).toBe(0);

    runUntil(scene, BEFORE_BOUNDARY_MS, LAST_FRAME_BEFORE_BOUNDARY_MS);
    expect(countEvents(scene, MONTH_ELAPSED_EVENT)).toBe(0);

    runUntil(scene, LAST_FRAME_BEFORE_BOUNDARY_MS, MONTH_BOUNDARY_MS);
    expect(scene.elapsedMs).toBe(MONTH_BOUNDARY_MS);
    expect(countEvents(scene, MONTH_ELAPSED_EVENT)).toBe(1);
    expect(payloadsOf(scene, SALARY_PAID_EVENT)).toEqual([expect.objectContaining({ month: 1, amount: payroll })]);
    expect(scene.gameOver.over).toBe(false);
    expect(countEvents(scene, GAME_OVER_EVENT)).toBe(0);
    // 生成は止まらないが、負債が上限なので生成間隔は既定の 2 倍（#44 の仕様どおり）。
    expect(scene.techDebt).toBe(TECH_DEBT_MAX);
    const nextIdAtBoundary = scene.nextCodeId;
    const positionsAtBoundary = positionsById(scene.codes);
    const releasedAtBoundary = countEvents(scene, CODE_RELEASED_EVENT);

    runUntil(scene, MONTH_BOUNDARY_MS, AFTER_BOUNDARY_MS);
    expect(scene.elapsedMs).toBe(AFTER_BOUNDARY_MS);
    const { shared, moved } = movedCount(positionsAtBoundary, scene.codes);
    expect(shared).toBeGreaterThan(0);
    expect(moved).toBe(shared);
    expect(countEvents(scene, CODE_RELEASED_EVENT)).toBeGreaterThan(releasedAtBoundary);

    runUntil(scene, AFTER_BOUNDARY_MS, AFTER_SPAWN_INTERVAL_MS);
    expect(scene.nextCodeId).toBeGreaterThan(nextIdAtBoundary);
    expect(countEvents(scene, MONTH_ELAPSED_EVENT)).toBe(1);
    expect(scene.gameOver.over).toBe(false);
  });

  it('初期資金のまま（create() と同じ）でも、正常なコードの売上で 30 日目の給料を払えて生成が続く', () => {
    const scene = createScene(INITIAL_FUNDS);

    runUntil(scene, 0, MONTH_BOUNDARY_MS);
    const released = countEvents(scene, CODE_RELEASED_EVENT);
    const revenue = getReleaseRevenue('normal', REVENUE_PER_NORMAL_CODE, DEFAULT_REFACTORING_RATIO);
    expect(scene.funds).toBe(INITIAL_FUNDS + released * revenue - payrollOf(scene));
    expect(scene.gameOver.over).toBe(false);
    const nextIdAtBoundary = scene.nextCodeId;

    runUntil(scene, MONTH_BOUNDARY_MS, AFTER_SPAWN_INTERVAL_MS);
    expect(scene.nextCodeId).toBeGreaterThan(nextIdAtBoundary);
    expect(scene.gameOver.over).toBe(false);
  });
});

describe('MainScene.update: 30 日目の給料で倒産すると、そこで止まる', () => {
  it('境界直前に資金を給料合計 - 1 にすると、境界で 1 回だけ倒産し、時計・生成・移動が止まる', () => {
    const scene = createScene(AMPLE_FUNDS);
    runUntil(scene, 0, LAST_FRAME_BEFORE_BOUNDARY_MS);
    scene.funds = payrollOf(scene) - 1;

    runUntil(scene, LAST_FRAME_BEFORE_BOUNDARY_MS, MONTH_BOUNDARY_MS);
    expect(scene.gameOver.over).toBe(true);
    expect(payloadsOf(scene, GAME_OVER_EVENT)).toEqual([expect.objectContaining({ reason: 'bankruptcy', funds: -1 })]);
    const nextIdAtBoundary = scene.nextCodeId;
    const positionsAtBoundary = positionsById(scene.codes);

    runUntil(scene, MONTH_BOUNDARY_MS, AFTER_BOUNDARY_MS);
    expect(scene.elapsedMs).toBe(MONTH_BOUNDARY_MS);
    expect(scene.nextCodeId).toBe(nextIdAtBoundary);
    expect(positionsById(scene.codes)).toEqual(positionsAtBoundary);
    expect(countEvents(scene, GAME_OVER_EVENT)).toBe(1);
    expect(countEvents(scene, MONTH_ELAPSED_EVENT)).toBe(1);
  });
});

describe('MainScene.update: 1 人だけ休暇にすると、そのルートだけが止まる', () => {
  it('休暇中のルートは生成・移動が止まり、時計・他のルート・給料の精算は続く', () => {
    const scene = createScene(AMPLE_FUNDS);
    const vacationRoute = scene.routes[0];
    if (vacationRoute === undefined) throw new Error('ルートがありません');
    const payroll = payrollOf(scene);
    runUntil(scene, 0, BEFORE_BOUNDARY_MS);
    scene.toggleVacation(vacationRoute.id);
    const pausedPositions = positionsById(scene.codes.filter((code) => code.routeId === vacationRoute.id));
    const nextIdAtVacation = scene.nextCodeId;

    runUntil(scene, BEFORE_BOUNDARY_MS, MONTH_BOUNDARY_MS);
    const workingAtBoundary = positionsById(scene.codes.filter((code) => code.routeId !== vacationRoute.id));
    runUntil(scene, MONTH_BOUNDARY_MS, AFTER_SPAWN_INTERVAL_MS);
    expect(scene.elapsedMs).toBe(AFTER_SPAWN_INTERVAL_MS);
    // 休暇中も給料は全員分を引く(#37)。
    expect(payloadsOf(scene, SALARY_PAID_EVENT)).toEqual([expect.objectContaining({ month: 1, amount: payroll })]);
    expect(scene.gameOver.over).toBe(false);
    const pausedCodes = scene.codes.filter((code) => code.routeId === vacationRoute.id);
    expect(pausedCodes.length).toBeGreaterThan(0);
    expect(positionsById(pausedCodes)).toEqual(pausedPositions);
    const newCodes = scene.codes.filter((code) => code.id >= nextIdAtVacation);
    expect(newCodes.length).toBeGreaterThan(0);
    expect(newCodes.every((code) => code.routeId !== vacationRoute.id)).toBe(true);
    const working = movedCount(workingAtBoundary, scene.codes);
    expect(working.shared).toBeGreaterThan(0);
    expect(working.moved).toBe(working.shared);
  });
});

describe('MainScene.update: 新しい価格で CodeRabbit を買っても 30 日目を越えて続く', () => {
  it('購入価格と月額は半額の expensive で、30 日目に給料 → 月額の順に引かれ、その後も生成が続く', () => {
    const price = getItemPrice('codeRabbit');
    const fee = getItemMonthlyFee('codeRabbit');
    expect(price).toBe(ITEM_PRICE_TIERS.expensive);
    expect(fee).toBe(ITEM_PRICE_TIERS.expensive);
    const scene = createScene(INITIAL_FUNDS);
    const center = cellCenter(findPlaceableCell(scene));
    scene.player = { x: center.x, y: center.y, setPosition: vi.fn<(x: number, y: number) => void>() };

    scene.buyItem('codeRabbit');
    expect(scene.placedItems.map((item) => item.itemType)).toEqual(['codeRabbit']);
    expect(scene.funds).toBe(INITIAL_FUNDS - price);

    runUntil(scene, 0, MONTH_BOUNDARY_MS);
    const released = countEvents(scene, CODE_RELEASED_EVENT);
    const revenue = getReleaseRevenue('normal', REVENUE_PER_NORMAL_CODE, DEFAULT_REFACTORING_RATIO);
    expect(scene.funds).toBe(INITIAL_FUNDS - price + released * revenue - payrollOf(scene) - fee);
    expect(payloadsOf(scene, ITEM_FEE_PAID_EVENT)).toEqual([expect.objectContaining({ month: 1, amount: fee })]);
    const settlementOrder = scene.events.emit.mock.calls
      .map(([event]) => event)
      .filter((event) => event === SALARY_PAID_EVENT || event === ITEM_FEE_PAID_EVENT);
    expect(settlementOrder).toEqual([SALARY_PAID_EVENT, ITEM_FEE_PAID_EVENT]);
    expect(scene.gameOver.over).toBe(false);
    const nextIdAtBoundary = scene.nextCodeId;

    runUntil(scene, MONTH_BOUNDARY_MS, AFTER_SPAWN_INTERVAL_MS);
    expect(scene.nextCodeId).toBeGreaterThan(nextIdAtBoundary);
    expect(scene.gameOver.over).toBe(false);
  });
});
