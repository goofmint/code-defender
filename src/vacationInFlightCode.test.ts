// 休暇中も生成済みのコード・バグは流れ続け、リリースされる(#163)ことを MainScene.updateCodes で確かめる。
// 止まるのは新規生成（生成タイマー）だけで、移動はコードフリーズ(#58)のときだけ止まる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（dayBoundaryProduction.test.ts・testToolHold.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CODE_SPAWN_INTERVAL_MS,
  DEFAULT_MALICIOUS_CODE_HP,
  DEFAULT_REFACTORING_RATIO,
  REVENUE_PER_NORMAL_CODE,
  TECH_DEBT_INITIAL,
} from './config';
import { CODE_RELEASED_EVENT } from './codeFlow';
import type { CodeReleasedPayload } from './codeFlow';
import { codeSpeedAt } from './difficulty';
import { createFixtureFleet } from './testFixtures';
import type { Engineer } from './engineer';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import type { GameOverState } from './gameOver';
import { INCIDENT_EVENT, incidentDamage } from './incident';
import type { ActiveEffect, IncidentRecord } from './itemEffect';
import type { MaliciousCodeType } from './maliciousCode';
import type { PlacedItem } from './itemPlacement';
import type { Point, Route } from './route';
import { getReleaseRevenue } from './sales';

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
      // 障害の画面フラッシュ（onCodeReleased）で使う。
      Display: { Color: { IntegerToRGB: () => ({ r: 0, g: 0, b: 0 }) } },
      Scene,
      Game,
    },
  };
});

// 描画は検証の対象外なので、テストで通る関数だけスタブにする。
vi.mock('./render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render')>()),
  drawGameOver: vi.fn(),
  drawCode: vi.fn(() => ({ destroy: vi.fn(), setPosition: vi.fn() })),
  // 正常なコードのリリース演出(#144)。
  drawReleaseBurst: vi.fn(),
}));

// 生成するコードを決定的に正常なコードにする（生成の再開を、不正率の抽選に左右されずに確かめる）。
vi.mock('./codeFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./codeFlow')>()),
  pickCodeKind: vi.fn(() => 'normal'),
}));

type FakeGraphics = {
  readonly destroy: Mock<() => void>;
  readonly setPosition: Mock<(x: number, y: number) => void>;
};
type FakeCode = {
  readonly id: number;
  readonly kind: 'normal' | 'malicious';
  readonly routeId: number;
  readonly path: readonly Point[];
  readonly segmentIndex: number;
  readonly position: Point;
  readonly released: boolean;
  readonly maliciousType?: MaliciousCodeType;
  readonly graphics: FakeGraphics;
};
type FakeVacationMarker = { readonly setOnVacation: Mock<(onVacation: boolean) => void> };
type SceneUnderTest = {
  funds: number;
  score: number;
  elapsedMs: number;
  techDebt: number;
  refactoringRatio: number;
  engineers: Engineer[];
  routes: Route[];
  spawnElapsed: Map<number, number>;
  nextCodeId: number;
  gameOver: GameOverState;
  phase: 'setup' | 'playing';
  codes: FakeCode[];
  codeHp: Map<number, number>;
  codeHold: Map<number, number>;
  placedItems: readonly PlacedItem[];
  activeEffects: readonly ActiveEffect[];
  lastIncident: IncidentRecord | null;
  documentationPurchasedAtMs: number | null;
  vacationMarkers: Map<number, FakeVacationMarker>;
  time: { now: number };
  tweens: { readonly killTweensOf: Mock<(target: object) => void>; readonly pauseAll: Mock<() => void> };
  cameras: { readonly main: { readonly flash: Mock<() => void> } };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  updateCodes(delta: number): void;
  toggleVacation(routeId: number): void;
  onFundsChanged(event: FundsChangedEvent): void;
  onCodeReleased(payload: CodeReleasedPayload): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const DELTA_MS = 100;
// 経過時間 0 の1フレームの移動距離。
const STEP = (codeSpeedAt(0) * DELTA_MS) / 1000;
const LARGE_FUNDS = 1_000_000_000;
// リリース地点までの残り距離: 2.5 フレーム分。1 フレーム目は進むだけ、3 フレーム目でリリースされる。
const REMAINING = STEP * 2.5;
const FRAMES = 5;
// 休暇ルートの生成タイマーの保持値。間隔の手前（休暇中の FRAMES フレームでは生成しない値）。
const HELD_SPAWN_ELAPSED_MS = CODE_SPAWN_INTERVAL_MS - 1000;
const NORMAL_ID = 1;
const BUG_ID = 2;
const PATH_Y = 300;
const PATH_LENGTH = 1000;

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

const makeCode = (id: number, routeId: number, kind: 'normal' | 'malicious', maliciousType?: MaliciousCodeType): FakeCode => ({
  id,
  kind,
  routeId,
  path: [
    { x: 0, y: PATH_Y },
    { x: PATH_LENGTH, y: PATH_Y },
  ],
  segmentIndex: 0,
  position: { x: PATH_LENGTH - REMAINING, y: PATH_Y },
  released: false,
  ...(maliciousType === undefined ? {} : { maliciousType }),
  graphics: { destroy: vi.fn<() => void>(), setPosition: vi.fn<(x: number, y: number) => void>() },
});

type SceneOptions = { readonly activeEffects?: readonly ActiveEffect[] };

// ルート 1 本・エンジニア 1 人（テスト用の編成 createFixtureFleet の先頭。#172 から初期編成は 0 人）。休暇ルートの出口の直前に、正常コードと bug を 1 つずつ置く。CI・アイテムは置かない。
const createScene = (options: SceneOptions = {}): { scene: SceneUnderTest; route: Route } => {
  const fleet = createFixtureFleet(() => 0);
  const route = fleet.routes[0];
  if (route === undefined) throw new Error('ルートがありません');
  const codes = [makeCode(NORMAL_ID, route.id, 'normal'), makeCode(BUG_ID, route.id, 'malicious', 'bug')];
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = LARGE_FUNDS;
  scene.score = 0;
  scene.elapsedMs = 0;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.refactoringRatio = DEFAULT_REFACTORING_RATIO;
  scene.engineers = fleet.engineers;
  scene.routes = [route];
  scene.spawnElapsed = new Map([[route.id, HELD_SPAWN_ELAPSED_MS]]);
  scene.nextCodeId = 100;
  scene.gameOver = NOT_OVER;
  scene.phase = 'playing';
  scene.codes = codes;
  // 実際のシーンと同じく、不正なコードだけが hp を持つ。
  scene.codeHp = new Map([[BUG_ID, DEFAULT_MALICIOUS_CODE_HP]]);
  scene.codeHold = new Map();
  scene.placedItems = [];
  scene.activeEffects = options.activeEffects ?? [];
  scene.lastIncident = null;
  scene.documentationPurchasedAtMs = null;
  scene.vacationMarkers = new Map([[route.id, { setOnVacation: vi.fn<(onVacation: boolean) => void>() }]]);
  scene.time = { now: 0 };
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>(), pauseAll: vi.fn<() => void>() };
  scene.cameras = { main: { flash: vi.fn<() => void>() } };
  // 実際のシーンは FUNDS_CHANGED_EVENT を onFundsChanged、CODE_RELEASED_EVENT を onCodeReleased で購読する。その接続だけを再現する。
  scene.events = {
    emit: vi.fn<(event: string, payload: object) => boolean>((event, payload) => {
      if (event === FUNDS_CHANGED_EVENT && isFundsChangedEvent(payload)) scene.onFundsChanged(payload);
      if (event === CODE_RELEASED_EVENT && isCodeReleasedPayload(payload)) scene.onCodeReleased(payload);
      return true;
    }),
  };
  return { scene, route };
};

const runFrames = (scene: SceneUnderTest, frames: number): void => {
  for (let i = 0; i < frames; i++) scene.updateCodes(DELTA_MS);
};

const releasedIds = (scene: SceneUnderTest): number[] =>
  scene.events.emit.mock.calls
    .filter(([event]) => event === CODE_RELEASED_EVENT)
    .map(([, payload]) => (isCodeReleasedPayload(payload) ? payload.id : -1));

const positionOf = (scene: SceneUnderTest, id: number): Point | undefined =>
  scene.codes.find((code) => code.id === id)?.position;

const EXPECTED_FUNDS =
  LARGE_FUNDS +
  getReleaseRevenue('normal', REVENUE_PER_NORMAL_CODE, DEFAULT_REFACTORING_RATIO) +
  getReleaseRevenue('malicious', REVENUE_PER_NORMAL_CODE, DEFAULT_REFACTORING_RATIO) -
  incidentDamage('bug');

describe('MainScene.updateCodes: 休暇中も生成済みのコードとバグは流れ続ける(#163)', () => {
  it('休暇にした直後の 1 フレームで、正常コードと bug の両方が進む（リリース地点の手前）', () => {
    const { scene, route } = createScene();
    scene.toggleVacation(route.id);

    runFrames(scene, 1);

    expect(positionOf(scene, NORMAL_ID)?.x).toBeCloseTo(PATH_LENGTH - REMAINING + STEP);
    expect(positionOf(scene, BUG_ID)?.x).toBeCloseTo(PATH_LENGTH - REMAINING + STEP);
    expect(releasedIds(scene)).toEqual([]);
  });

  it('休暇中に両方がリリースされ、正常コードは売上、bug は障害と損害になる', () => {
    const { scene, route } = createScene();
    scene.toggleVacation(route.id);

    runFrames(scene, FRAMES);

    expect(releasedIds(scene).sort()).toEqual([NORMAL_ID, BUG_ID]);
    expect(scene.codes).toEqual([]);
    expect(scene.events.emit.mock.calls.filter(([event]) => event === INCIDENT_EVENT)).toHaveLength(1);
    expect(scene.funds).toBe(EXPECTED_FUNDS);
  });

  it('休暇中は生成タイマーの経過値が保持され、新しい id のコードは出ない', () => {
    const { scene, route } = createScene();
    scene.toggleVacation(route.id);

    runFrames(scene, FRAMES);

    expect(scene.spawnElapsed.get(route.id)).toBe(HELD_SPAWN_ELAPSED_MS);
    expect(scene.nextCodeId).toBe(100);
    expect(scene.codes.filter((code) => code.id >= 100)).toEqual([]);
  });

  it('復帰すると保存済みのタイマー値から生成が再開し、休暇ルートに新しいコードが出る', () => {
    const { scene, route } = createScene();
    scene.toggleVacation(route.id);
    runFrames(scene, FRAMES);
    scene.toggleVacation(route.id);

    // 保持値 + 間隔の残り（1000ms）ちょうどでは生成する。1 フレーム（100ms）では生成しない。
    runFrames(scene, 1);
    expect(scene.nextCodeId).toBe(100);
    expect(scene.spawnElapsed.get(route.id)).toBe(HELD_SPAWN_ELAPSED_MS + DELTA_MS);
    scene.updateCodes(CODE_SPAWN_INTERVAL_MS - HELD_SPAWN_ELAPSED_MS - DELTA_MS);

    expect(scene.nextCodeId).toBe(101);
    expect(scene.codes.map((code) => [code.id, code.routeId])).toEqual([[100, route.id]]);
  });
});

describe('MainScene.updateCodes: 対照（コードフリーズ中は休暇ルートでも動かない）', () => {
  it('コードフリーズ中は休暇中でも既存コードは進まず、リリースも生成もしない', () => {
    const { scene, route } = createScene({ activeEffects: [{ kind: 'codeFreeze', startMs: 0, endMs: 1_000_000 }] });
    scene.toggleVacation(route.id);
    const before = [positionOf(scene, NORMAL_ID), positionOf(scene, BUG_ID)];

    runFrames(scene, FRAMES);

    expect([positionOf(scene, NORMAL_ID), positionOf(scene, BUG_ID)]).toEqual(before);
    expect(releasedIds(scene)).toEqual([]);
    expect(scene.spawnElapsed.get(route.id)).toBe(HELD_SPAWN_ELAPSED_MS);
    expect(scene.nextCodeId).toBe(100);
  });
});
