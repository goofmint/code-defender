// 「25日過ぎると一気にコードの生産性が落ちる」(#150) の回帰テスト。
// 実際の MainScene.update() / updateCodes() を使い、(a) 技術的負債 0 と上限で生産量（生成数）が同じこと、
// (b) 生成時に pickCodeKind へ渡る不正コード率がゲーム内10日ごとに 3 ポイントずつ上がることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（dayBoundaryProduction.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CODE_MALICIOUS_RATE_INCREMENT,
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_RANKS,
  INITIAL_FUNDS,
  MALICIOUS_RATE_STEP_DAYS,
  REFACTORING_MALICIOUS_RATE_REDUCTION_MAX,
  TECH_DEBT_MAX,
  TECH_DEBT_OUTAGE_GRACE_MS,
  TECH_DEBT_PER_FEATURE_WORK,
  TECH_DEBT_REPAY_PER_REFACTORING_WORK,
} from './config';
import { CODE_RELEASED_EVENT, pickCodeKind } from './codeFlow';
import type { CodeReleasedPayload } from './codeFlow';
import type { Engineer } from './engineer';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import { INITIAL_GAME_OVER_STATE } from './gameOver';
import type { GameOverState } from './gameOver';
import { MONTH_ELAPSED_EVENT, MS_PER_GAME_DAY } from './gameTime';
import type { MonthElapsedEvent } from './gameTime';
import type { ActiveEffect, IncidentRecord, ScheduledIncident } from './itemEffect';
import type { PlacedItem } from './itemPlacement';
import type { Point, Route } from './route';
import { createFixtureFleet } from './testFixtures';

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

// 描画は検証の対象外なので、update() で通る描画関数だけスタブにする。
vi.mock('./render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render')>()),
  drawCode: vi.fn(() => ({ setPosition: vi.fn(), destroy: vi.fn() })),
  drawGameOver: vi.fn(),
  drawPlacedItem: vi.fn(),
  drawItemMessage: vi.fn(() => ({ destroy: vi.fn() })),
  drawReleaseBurst: vi.fn(),
}));

// 生成するコードを決定的に正常なコードにする（不正コードの障害・損害で資金が動かないようにする）。
// 渡された不正コード率（第2引数）は mock.calls から読む。生成タイマー・移動・リリース（updateCodes）と時計（advanceClock）は本物を使う。
vi.mock('./codeFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./codeFlow')>()),
  pickCodeKind: vi.fn(() => 'normal'),
}));

// update() / updateCodes() が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeGraphics = { readonly setPosition: Mock<(x: number, y: number) => void>; readonly destroy: Mock<() => void> };
type FakeCode = {
  readonly id: number;
  readonly routeId: number;
  readonly position: Point;
  readonly released: boolean;
};
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
  phase: 'setup' | 'playing';
  activeEffects: readonly ActiveEffect[];
  codeHold: Map<number, number>;
  scheduledIncidents: readonly ScheduledIncident[];
  lastIncident: IncidentRecord | null;
  documentationPurchasedAtMs: number | null;
  followItemViews: Map<number, FakeGraphics>;
  vacationMarkers: Map<number, FakeVacationMarker>;
  input: { readonly activePointer: { readonly isDown: boolean } };
  time: { now: number };
  tweens: { readonly killTweensOf: Mock<(target: FakeGraphics) => void>; readonly pauseAll: Mock<() => void> };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  update(time: number, delta: number): void;
  updateCodes(delta: number): void;
  onMonthElapsed(event: MonthElapsedEvent): void;
  onFundsChanged(event: FundsChangedEvent): void;
  onCodeReleased(payload: CodeReleasedPayload): void;
};

// 1 フレームの経過時間（ms）。生成間隔（2,000ms）の境界にちょうど到達する刻み。
const STEP_MS = 100;
// 生産量を比べる区間（ゲーム内10日 = 20,000ms）。
// 負債上限のまま TECH_DEBT_OUTAGE_GRACE_MS を過ぎると大障害の演出（cameras.flash）が走るので、それより短くする。
const SPAN_MS = MS_PER_GAME_DAY * MALICIOUS_RATE_STEP_DAYS;
// 正常なコードのリリースで負債が増減しないリファクタリング割合（溜まる量 (1 − r) × 10 = 返す量 r × 20 → r = 1/3）。
// 負債 0 と上限をそれぞれ区間の間ずっと保つ。
const DEBT_NEUTRAL_RATIO = TECH_DEBT_PER_FEATURE_WORK / (TECH_DEBT_PER_FEATURE_WORK + TECH_DEBT_REPAY_PER_REFACTORING_WORK);
// 給料・月額を払っても倒産しない十分な資金（初期資金の 1000 倍）。
const AMPLE_FUNDS = INITIAL_FUNDS * 1000;
// ルート・エンジニアの抽選を固定する（初期編成はジュニア 3 人）。
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
// ピザ・コーヒー・AIエージェント・休暇・コードフリーズはどれも無効（アイテムなし・時限効果なし・初期編成のまま）。
const createScene = (techDebt: number, refactoringRatio: number): SceneUnderTest => {
  const fleet = createFixtureFleet(FIXED_RANDOM);
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.elapsedMs = 0;
  scene.displayedDays = 0;
  scene.funds = AMPLE_FUNDS;
  scene.score = 0;
  scene.techDebt = techDebt;
  scene.techDebtNeglectMs = 0;
  scene.refactoringRatio = refactoringRatio;
  scene.gameOver = INITIAL_GAME_OVER_STATE;
  scene.routes = fleet.routes;
  scene.engineers = fleet.engineers;
  scene.codes = [];
  scene.codeHp = new Map();
  scene.spawnElapsed = new Map();
  scene.nextCodeId = 0;
  scene.placedItems = [];
  scene.nextItemId = 0;
  scene.phase = 'playing';
  scene.activeEffects = [];
  scene.codeHold = new Map();
  scene.scheduledIncidents = [];
  scene.lastIncident = null;
  scene.documentationPurchasedAtMs = null;
  scene.followItemViews = new Map();
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

describe('MainScene.update: 技術的負債があっても生産量（生成数）は落ちない(#150)', () => {
  // 生成の境界: 最初の生成間隔ちょうどの直前・ちょうど・直後と、区間の終わり。
  const CHECKPOINTS = [CODE_SPAWN_INTERVAL_MS - STEP_MS, CODE_SPAWN_INTERVAL_MS, CODE_SPAWN_INTERVAL_MS + STEP_MS, SPAN_MS] as const;

  it('前提: 比べる区間は大障害の猶予より短く、リファクタリング割合は負債を増減させない', () => {
    expect(SPAN_MS).toBeLessThan(TECH_DEBT_OUTAGE_GRACE_MS);
    expect(SPAN_MS % STEP_MS).toBe(0);
    expect(CODE_SPAWN_INTERVAL_MS % STEP_MS).toBe(0);
    expect((1 - DEBT_NEUTRAL_RATIO) * TECH_DEBT_PER_FEATURE_WORK).toBeCloseTo(
      DEBT_NEUTRAL_RATIO * TECH_DEBT_REPAY_PER_REFACTORING_WORK,
      12,
    );
  });

  it('負債 0 と負債上限（TECH_DEBT_MAX）で、同じ delta の刻みなら生成数（nextCodeId の増加）が各境界で等しい', () => {
    const noDebt = createScene(0, DEBT_NEUTRAL_RATIO);
    const maxDebt = createScene(TECH_DEBT_MAX, DEBT_NEUTRAL_RATIO);
    // 初回の即時生成（最初の更新でルートごとに 1 個）+ 生成間隔ごとに 1 個。
    const expectedAt = (ms: number): number => noDebt.routes.length * (1 + Math.floor(ms / CODE_SPAWN_INTERVAL_MS));

    let from = 0;
    for (const checkpoint of CHECKPOINTS) {
      runUntil(noDebt, from, checkpoint);
      runUntil(maxDebt, from, checkpoint);
      from = checkpoint;
      expect(noDebt.elapsedMs).toBe(checkpoint);
      expect(maxDebt.elapsedMs).toBe(checkpoint);
      expect(noDebt.nextCodeId).toBe(expectedAt(checkpoint));
      expect(maxDebt.nextCodeId).toBe(noDebt.nextCodeId);
    }
    expect(noDebt.nextCodeId).toBeGreaterThan(noDebt.routes.length);
    // 区間の間、負債はそれぞれ 0 と上限のまま（割合が負債を増減させないため）。
    expect(noDebt.techDebt).toBeCloseTo(0, 9);
    expect(maxDebt.techDebt).toBeCloseTo(TECH_DEBT_MAX, 9);
    // リリース数も同じ（移動速度は負債に依存しない）。
    expect(countEvents(maxDebt, CODE_RELEASED_EVENT)).toBe(countEvents(noDebt, CODE_RELEASED_EVENT));
    expect(countEvents(noDebt, CODE_RELEASED_EVENT)).toBeGreaterThan(0);
    expect(noDebt.gameOver.over).toBe(false);
    expect(maxDebt.gameOver.over).toBe(false);
  });
});

describe('MainScene.updateCodes: 生成時の不正コード率はゲーム内10日ごとに 3 ポイント上がる(#150)', () => {
  // 負債 0・リファクタリング割合は既定で固定・休暇の履歴なし。担当は全員ジュニア（FIXED_RANDOM の初期編成）。
  const junior = ENGINEER_RANKS.find((entry) => entry.id === 'junior');
  if (junior === undefined) throw new Error('ジュニアがランク表にない');

  // elapsedMs を日数で設定して updateCodes を 1 回呼び、初回の即時生成で pickCodeKind に渡った率（第2引数）を全ルートぶん集める。
  const ratesAtDay = (days: number): number[] => {
    vi.mocked(pickCodeKind).mockClear();
    const scene = createScene(0, DEFAULT_REFACTORING_RATIO);
    scene.elapsedMs = days * MS_PER_GAME_DAY;
    scene.updateCodes(0);
    const calls = vi.mocked(pickCodeKind).mock.calls;
    expect(calls).toHaveLength(scene.routes.length);
    expect(scene.engineers.every((engineer) => engineer.rank === 'junior' && engineer.vacationRateReduction === 0)).toBe(true);
    return calls.map(([, rate]) => rate);
  };
  // 全ルートで同じ率（同じランク・同じ補正）なので 1 つにまとめる。
  const rateAtDay = (days: number): number => {
    const rates = ratesAtDay(days);
    for (const rate of rates) expect(rate).toBe(rates[0]);
    return rates[0];
  };

  it('0 日の率はジュニアの開始値 − リファクタリング既定割合の減少（負債 0 なので負債の差分は 0）', () => {
    expect(rateAtDay(0)).toBeCloseTo(
      junior.maliciousRate - REFACTORING_MALICIOUS_RATE_REDUCTION_MAX * DEFAULT_REFACTORING_RATIO,
      12,
    );
  });

  it('境界値: 9 日は 0 日と同じ、10 日で +0.03、20 日でさらに +0.03、25 日は 20 日と同じ', () => {
    const day0 = rateAtDay(0);
    const day9 = rateAtDay(9);
    const day10 = rateAtDay(10);
    const day20 = rateAtDay(20);
    const day25 = rateAtDay(25);
    expect(day9).toBe(day0);
    expect(day10 - day9).toBeCloseTo(CODE_MALICIOUS_RATE_INCREMENT, 12);
    expect(day10 - day9).toBeCloseTo(0.03, 12);
    expect(day20 - day10).toBeCloseTo(0.03, 12);
    expect(day25).toBe(day20);
    // 10 日の直前（-1ms）はまだ上がらない。
    vi.mocked(pickCodeKind).mockClear();
    const scene = createScene(0, DEFAULT_REFACTORING_RATIO);
    scene.elapsedMs = MS_PER_GAME_DAY * MALICIOUS_RATE_STEP_DAYS - 1;
    scene.updateCodes(0);
    for (const [, rate] of vi.mocked(pickCodeKind).mock.calls) expect(rate).toBe(day0);
  });
});
