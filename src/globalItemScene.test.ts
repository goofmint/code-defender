// 購入時に発動するアイテムの時限効果・予約した障害(#58)が、毎フレームの更新（MainScene）に正しく接続されていることを確かめる。
// 購入そのものは instantItemScene.test.ts。main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  ATTACK_DAMAGE,
  CODE_FREEZE_DURATION_MS,
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_MALICIOUS_CODE_HP,
  DEFAULT_REFACTORING_RATIO,
  ENERGY_DRINK_BOOST_SPEED_MULTIPLIER,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  ITEM_POWER_DAMAGE,
  PIZZA_SPAWN_INTERVAL_MULTIPLIER,
  MS_PER_GAME_MONTH,
  PLAYER_SPEED,
  TECH_DEBT_INITIAL,
  WORKS_FINE_CODE_SPEED_MULTIPLIER,
  WORKS_FINE_DURATION_MS,
} from './config';
import type { CodeHitEvent } from './attack';
import { codeSpeedAt } from './difficulty';
import { createEngineerParameters } from './engineer';
import type { Engineer } from './engineer';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import type { GameOverState } from './gameOver';
import { INCIDENT_EVENT } from './incident';
import { documentationRateReduction, startEffect, startEnergyDrink } from './itemEffect';
import type { ActiveEffect, IncidentRecord, ScheduledIncident } from './itemEffect';
import { placementCellCenter, pointToPlacementCell } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { RELEASE_POINT_CENTER } from './releasePoint';
import { drawCode } from './render';
import { routePixelPoints } from './route';
import type { Point, Route } from './route';
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
      Display: { Color: { IntegerToRGB: () => ({ r: 0, g: 0, b: 0 }) } },
      Scene,
      Game,
    },
  };
});

// 描画は検証の対象外なので、テストで通る関数だけスタブにする。
vi.mock('./render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render')>()),
  drawCode: vi.fn(() => ({ setPosition: vi.fn(), destroy: vi.fn() })),
  drawItemAttackEffect: vi.fn(),
  drawDefeatEffect: vi.fn(),
  flashCode: vi.fn(),
  drawGameOver: vi.fn(),
  // 主人公の向きの切り替え(#144)。
  setPlayerFacing: vi.fn(),
}));

// テストで触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeGraphics = {
  readonly setPosition: Mock<(x: number, y: number) => void>;
  readonly destroy: Mock<() => void>;
};
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
type FakeKey = { readonly isDown: boolean };
type FakePlayer = Point & { readonly setPosition: Mock<(x: number, y: number) => void> };
type SceneUnderTest = {
  funds: number;
  score: number;
  techDebt: number;
  elapsedMs: number;
  routes: Route[];
  engineers: Engineer[];
  gameOver: GameOverState;
  player?: FakePlayer;
  moveKeys?: Record<'left' | 'right' | 'up' | 'down', FakeKey[]>;
  input: { readonly activePointer: { readonly isDown: boolean } };
  attackPointerHeld: boolean;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  spawnElapsed: Map<number, number>;
  nextCodeId: number;
  placedItems: readonly PlacedItem[];
  activeEffects: readonly ActiveEffect[];
  codeHold: Map<number, number>;
  refactoringRatio: number;
  scheduledIncidents: readonly ScheduledIncident[];
  lastIncident: IncidentRecord | null;
  documentationPurchasedAtMs: number | null;
  time: { now: number };
  tweens: { readonly killTweensOf: Mock<(target: object) => void>; readonly pauseAll: Mock<() => void> };
  cameras: { readonly main: { readonly flash: Mock<() => void> } };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  // 右下の指標(#156)。資金・累計売上・月末支払・技術的負債の段階の表示を更新する。
  statusPanel: {
    readonly setFunds: Mock<(funds: number) => void>;
    readonly setScore: Mock<(score: number) => void>;
    readonly setMonthEndPayment: Mock<(amount: number) => void>;
    readonly setTechDebtLevel: Mock<(level: string) => void>;
  };
  updateCodes(delta: number): void;
  updateItems(now: number): void;
  updatePlayer(delta: number): void;
  fireScheduledIncidents(): void;
  maliciousRateModifiersFor(engineer: Engineer | undefined): readonly number[];
  onCodeHit(event: CodeHitEvent<FakeCode>): void;
  onFundsChanged(event: FundsChangedEvent): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const NOW = 30_000;
const FUNDS = 1_000_000;
const DELTA = 100;
const ROUTE: Route = {
  id: 0,
  spawn: { col: 0, row: 5 },
  waypoints: [
    { col: 0, row: 5 },
    { col: 8, row: 5 },
  ],
};
const PATH = routePixelPoints(ROUTE);
const BASE_INTERVAL_MS = techDebtSpawnIntervalMs(TECH_DEBT_INITIAL, CODE_SPAWN_INTERVAL_MS);

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
  vi.restoreAllMocks();
});

const makeGraphics = (): FakeGraphics => ({
  setPosition: vi.fn<(x: number, y: number) => void>(),
  destroy: vi.fn<() => void>(),
});

const makeCode = (id: number, dx: number, kind: 'normal' | 'malicious' = 'malicious'): FakeCode => ({
  id,
  kind,
  routeId: ROUTE.id,
  path: PATH,
  segmentIndex: 0,
  position: { x: PATH[0].x + dx, y: PATH[0].y },
  released: false,
  graphics: makeGraphics(),
});

const noKeys = (): FakeKey[] => [{ isDown: false }];

const createScene = (funds: number = FUNDS): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = funds;
  scene.score = 0;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.elapsedMs = NOW;
  scene.routes = [ROUTE];
  scene.engineers = [];
  scene.gameOver = NOT_OVER;
  scene.player = { x: 300, y: 300, setPosition: vi.fn<(x: number, y: number) => void>() };
  scene.moveKeys = { left: noKeys(), right: [{ isDown: true }], up: noKeys(), down: noKeys() };
  scene.input = { activePointer: { isDown: false } };
  scene.attackPointerHeld = false;
  scene.codes = [];
  scene.codeHp = new Map();
  scene.spawnElapsed = new Map();
  scene.nextCodeId = 100;
  scene.placedItems = [];
  scene.activeEffects = [];
  scene.codeHold = new Map();
  scene.refactoringRatio = DEFAULT_REFACTORING_RATIO;
  scene.scheduledIncidents = [];
  scene.lastIncident = null;
  scene.documentationPurchasedAtMs = null;
  scene.time = { now: NOW };
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>(), pauseAll: vi.fn<() => void>() };
  scene.cameras = { main: { flash: vi.fn<() => void>() } };
  // 実際のシーンは FUNDS_CHANGED_EVENT を onFundsChanged で購読して倒産とスコアを更新する。その接続だけを再現する。
  scene.events = {
    emit: vi.fn<(event: string, payload: object) => boolean>((event, payload) => {
      if (event === FUNDS_CHANGED_EVENT && isFundsChangedEvent(payload)) {
        scene.onFundsChanged(payload);
      }
      return true;
    }),
  };
  scene.statusPanel = {
    setFunds: vi.fn<(funds: number) => void>(),
    setScore: vi.fn<(score: number) => void>(),
    setMonthEndPayment: vi.fn<(amount: number) => void>(),
    setTechDebtLevel: vi.fn<(level: string) => void>(),
  };
  return scene;
};

const withMaliciousHp = (scene: SceneUnderTest): void => {
  scene.codeHp = new Map(
    scene.codes.filter((code) => code.kind === 'malicious').map((code) => [code.id, DEFAULT_MALICIOUS_CODE_HP]),
  );
};

describe('コードフリーズ(#58): 全ルートを休暇と同じく止める', () => {
  it('有効な間は生成タイマーもコードも進まない（担当者がいないルートも止める）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const scene = createScene();
    scene.activeEffects = startEffect([], 'codeFreeze', NOW, CODE_FREEZE_DURATION_MS);
    scene.spawnElapsed = new Map([[ROUTE.id, BASE_INTERVAL_MS - 1]]);
    scene.codes = [makeCode(1, 50)];

    scene.updateCodes(DELTA);

    expect(scene.spawnElapsed.get(ROUTE.id)).toBe(BASE_INTERVAL_MS - 1);
    expect(scene.codes.map((code) => [code.id, code.position])).toEqual([[1, { x: PATH[0].x + 50, y: PATH[0].y }]]);
    expect(vi.mocked(drawCode)).not.toHaveBeenCalled();
  });

  it('終了時刻ちょうどで止まらなくなり、生成と移動が再開する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const scene = createScene();
    scene.activeEffects = startEffect([], 'codeFreeze', NOW - CODE_FREEZE_DURATION_MS, CODE_FREEZE_DURATION_MS);
    scene.spawnElapsed = new Map([[ROUTE.id, BASE_INTERVAL_MS - 1]]);
    scene.codes = [makeCode(1, 50)];

    scene.updateCodes(DELTA);

    const distance = (codeSpeedAt(NOW) * DELTA) / 1000;
    expect(scene.codes.map((code) => code.id)).toEqual([1, 100]);
    expect(scene.codes[0].position.x).toBeCloseTo(PATH[0].x + 50 + distance);
  });
});

describe('ピザ(#58): 全ルートの生成ペースが上がる', () => {
  it('ピザの間は短くなった間隔で生成する（ピザなしでは生成しない経過時間）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const pizzaInterval = BASE_INTERVAL_MS * PIZZA_SPAWN_INTERVAL_MULTIPLIER;
    const without = createScene();
    without.spawnElapsed = new Map([[ROUTE.id, pizzaInterval - DELTA]]);
    without.updateCodes(DELTA);
    expect(without.codes).toEqual([]);

    const scene = createScene();
    scene.activeEffects = startEffect([], 'pizza', NOW, 1);
    scene.spawnElapsed = new Map([[ROUTE.id, pizzaInterval - DELTA]]);
    scene.updateCodes(DELTA);
    expect(scene.codes.map((code) => code.id)).toEqual([100]);
  });
});

describe('「動いてるからヨシ！」(#58)', () => {
  it('コードの移動距離が倍率倍になる', () => {
    const scene = createScene();
    scene.activeEffects = startEffect([], 'worksFine', NOW, WORKS_FINE_DURATION_MS);
    scene.spawnElapsed = new Map([[ROUTE.id, 0]]);
    scene.codes = [makeCode(1, 0)];

    scene.updateCodes(DELTA);

    const distance = (codeSpeedAt(NOW) * DELTA) / 1000;
    expect(scene.codes[0].position.x).toBeCloseTo(PATH[0].x + distance * WORKS_FINE_CODE_SPEED_MULTIPLIER);
  });

  it('置いたアイテムは攻撃しないが、主人公の攻撃は効く。期限が切れると再び攻撃する', () => {
    const itemCell = { col: 3, row: 4 };
    const code: FakeCode = { ...makeCode(1, 0), position: placementCellCenter(itemCell) };
    const scene = createScene();
    scene.codes = [code];
    withMaliciousHp(scene);
    scene.placedItems = [{ id: 0, itemType: 'codeRabbit', cell: itemCell, lastAttackTime: null }];
    scene.activeEffects = startEffect([], 'worksFine', NOW, WORKS_FINE_DURATION_MS);

    scene.updateItems(NOW);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.placedItems[0].lastAttackTime).toBeNull();

    scene.onCodeHit({ code, playerPosition: code.position, time: NOW });
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - ATTACK_DAMAGE);

    scene.elapsedMs = NOW + WORKS_FINE_DURATION_MS;
    scene.updateItems(NOW + WORKS_FINE_DURATION_MS);
    expect(scene.placedItems[0].lastAttackTime).toBe(NOW + WORKS_FINE_DURATION_MS);
    // 主人公とCodeRabbitの1回ずつで hp が 0 になり撃破される。
    expect(DEFAULT_MALICIOUS_CODE_HP - ATTACK_DAMAGE - ITEM_POWER_DAMAGE.medium).toBe(0);
    expect(scene.codes).toEqual([]);
  });
});

describe('エナジードリンク(#58): 主人公の速度', () => {
  it('加速期はキー移動の距離が倍率倍になる', () => {
    const scene = createScene();
    scene.activeEffects = startEnergyDrink([], NOW);

    scene.updatePlayer(DELTA);

    const step = (PLAYER_SPEED * ENERGY_DRINK_BOOST_SPEED_MULTIPLIER * DELTA) / 1000;
    expect(scene.player?.setPosition).toHaveBeenCalledWith(300 + step, 300);
  });

  it('効果がなければ通常の速度', () => {
    const scene = createScene();

    scene.updatePlayer(DELTA);

    expect(scene.player?.setPosition).toHaveBeenCalledWith(300 + (PLAYER_SPEED * DELTA) / 1000, 300);
  });
});

describe('ドキュメント(#58): ジュニアの不正コード率の補正', () => {
  const engineer = (rank: 'junior' | 'senior'): Engineer => ({
    id: 0,
    rank,
    routeId: ROUTE.id,
    personality: 'meticulous',
    onVacation: false,
    vacationRateReduction: 0,
    salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
    initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
    aiAgent: null,
    ...createEngineerParameters(rank, 'meticulous'),
  });

  it('担当がジュニアなら購入からの経過時間に応じた負の差分を追加し、ほかのランクには追加しない', () => {
    const scene = createScene();
    scene.documentationPurchasedAtMs = NOW - MS_PER_GAME_MONTH;
    const reduction = documentationRateReduction(NOW - MS_PER_GAME_MONTH, NOW);

    expect(scene.maliciousRateModifiersFor(engineer('junior'))).toContain(-reduction);
    expect(scene.maliciousRateModifiersFor(engineer('senior'))).not.toContain(-reduction);
    // シニアは技術的負債(#45)とリファクタリング(#41)の2つだけ（AIエージェントなし・休暇なし）。
    expect(scene.maliciousRateModifiersFor(engineer('senior'))).toHaveLength(2);
  });
});

describe('金曜日の夕方デプロイ(#58): 予約した障害', () => {
  const damage = 200_000;

  it('時刻が来る前は起きず、時刻ちょうどで損害を引き、コード id なしの INCIDENT_EVENT と直前の障害の記録を出す', () => {
    const scene = createScene();
    scene.scheduledIncidents = [{ atMs: NOW + 1, damage }];

    scene.fireScheduledIncidents();
    expect(scene.funds).toBe(FUNDS);

    scene.elapsedMs = NOW + 1;
    scene.fireScheduledIncidents();

    expect(scene.funds).toBe(FUNDS - damage);
    expect(scene.scheduledIncidents).toEqual([]);
    expect(scene.lastIncident).toEqual({ damage, rolledBack: false });
    expect(scene.events.emit).toHaveBeenCalledWith(INCIDENT_EVENT, {
      codeId: null,
      maliciousType: undefined,
      damage,
      fundsBefore: FUNDS,
      fundsAfter: FUNDS - damage,
    });
    expect(scene.score).toBe(0);
  });

  it('書き置きがリリース地点を守っていても防がない', () => {
    const scene = createScene();
    // リリース地点を含む配置グリッド（16px #151）のセルに書き置きを置く。
    scene.placedItems = [
      { id: 0, itemType: 'seniorNote', cell: pointToPlacementCell(RELEASE_POINT_CENTER), lastAttackTime: null },
    ];
    scene.scheduledIncidents = [{ atMs: NOW, damage }];

    scene.fireScheduledIncidents();

    expect(scene.funds).toBe(FUNDS - damage);
  });

  it('倒産したら残りの予約は起こさずに捨てる', () => {
    const scene = createScene(damage - 1);
    scene.scheduledIncidents = [
      { atMs: NOW, damage },
      { atMs: NOW, damage },
      { atMs: NOW + 10_000, damage },
    ];

    scene.fireScheduledIncidents();

    expect(scene.gameOver.over).toBe(true);
    expect(scene.funds).toBe(-1);
    expect(scene.scheduledIncidents).toEqual([]);
    expect(scene.events.emit.mock.calls.filter(([event]) => event === INCIDENT_EVENT)).toHaveLength(1);
  });
});
