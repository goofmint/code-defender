// CI(#55) のリリース直前の減速と確率阻止が MainScene.updateCodes / updateItems に正しく接続されていることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（vacationNeutrality.test.ts・codeRabbit.test.ts と同じ形）。
// シーンでは代表値だけを確かめる。次の境界値は純粋関数のテストで保証する:
// - 減速量のゾーン境界（±1px・入口ちょうど・残り 0）、倍率 0/1/NaN/範囲外、移動量 0・負値 → src/ci.test.ts の ciSlowedDistance
// - 阻止確率の閾値（rate − ε・rate ちょうど・0・1・NaN）、得意な種類の倍率と上限、CI 複数の順次判定と乱数の呼び出し回数 → src/ci.test.ts の rollCiInterception / getCiInterceptRate
// - 残り経路距離（曲がり角・終点手前 ε・リリース済み・空/1点の経路）→ src/codeFlow.test.ts の remainingPathDistance
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CI_INTERCEPT_RATE,
  CI_SLOW_MULTIPLIER,
  DEFAULT_MALICIOUS_CODE_HP,
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_MONTHLY_SALARY_BY_RANK,
  REVENUE_PER_NORMAL_CODE,
  TECH_DEBT_INITIAL,
} from './config';
import { CODE_RELEASED_EVENT } from './codeFlow';
import type { CodeReleasedPayload } from './codeFlow';
import { CODE_DEFEATED_EVENT } from './defeat';
import { codeSpeedAt } from './difficulty';
import { createEngineerParameters } from './engineer';
import type { Engineer } from './engineer';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import type { GameOverState } from './gameOver';
import { INCIDENT_EVENT, incidentDamage } from './incident';
import { getItemRange } from './item';
import type { ItemType } from './item';
import { placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { drawDefeatEffect, drawItemAttackEffect } from './render';
import { cellCenter } from './route';
import type { Point, Route } from './route';
import { getReleaseRevenue } from './sales';
import type { ActiveEffect, IncidentRecord } from './itemEffect';

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
  drawItemAttackEffect: vi.fn(),
  flashCode: vi.fn(),
  drawDefeatEffect: vi.fn(),
  drawGameOver: vi.fn(),
  drawCode: vi.fn(() => ({ destroy: vi.fn(), setPosition: vi.fn() })),
  // 正常なコードのリリース演出(#144)。
  drawReleaseBurst: vi.fn(),
}));

// テストで触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
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
  readonly graphics: FakeGraphics;
};
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
  codes: FakeCode[];
  codeHp: Map<number, number>;
  codeHold: Map<number, number>;
  placedItems: readonly PlacedItem[];
  // #58 の時限効果・直前の障害・ドキュメントの購入時刻。
  activeEffects: readonly ActiveEffect[];
  lastIncident: IncidentRecord | null;
  documentationPurchasedAtMs: number | null;
  time: { now: number };
  tweens: { readonly killTweensOf: Mock<(target: object) => void>; readonly pauseAll: Mock<() => void> };
  cameras: { readonly main: { readonly flash: Mock<() => void> } };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  updateCodes(delta: number): void;
  updateItems(now: number): void;
  onFundsChanged(event: FundsChangedEvent): void;
  onCodeReleased(payload: CodeReleasedPayload): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const ZONE = getItemRange('ci');
const DELTA_MS = 100;
// 経過時間 0 の1フレームの移動距離。
const STEP = (codeSpeedAt(0) * DELTA_MS) / 1000;
const LARGE_FUNDS = 1_000_000_000;
const T0 = 10_000;
// テスト用の直線の経路。終点がリリース地点。
const ROUTE_ID = 0;
const PATH_Y = 300;
const PATH_LENGTH = 1000;
const RELEASE: Point = { x: PATH_LENGTH, y: PATH_Y };
const CI_CELL = { col: 3, row: 2 };

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

afterEach(() => {
  vi.restoreAllMocks();
});

const placed = (id: number, itemType: ItemType, cell = CI_CELL): PlacedItem => ({
  id,
  itemType,
  cell,
  lastAttackTime: null,
});

// リリース地点までの残り距離が remaining の位置にあるコード。
const makeCode = (id: number, remaining: number, kind: 'normal' | 'malicious' = 'malicious'): FakeCode => ({
  id,
  kind,
  routeId: ROUTE_ID,
  path: [
    { x: 0, y: PATH_Y },
    { x: PATH_LENGTH, y: PATH_Y },
  ],
  segmentIndex: 0,
  position: { x: PATH_LENGTH - remaining, y: PATH_Y },
  released: false,
  graphics: { destroy: vi.fn<() => void>(), setPosition: vi.fn<(x: number, y: number) => void>() },
});

const makeEngineer = (onVacation: boolean): Engineer => ({
  id: 0,
  rank: 'junior',
  routeId: ROUTE_ID,
  personality: 'meticulous',
  onVacation,
  vacationRateReduction: 0,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK.junior,
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK.junior,
  aiAgent: null,
  ...createEngineerParameters('junior', 'meticulous'),
});

type SceneOptions = {
  readonly funds?: number;
  readonly codes?: FakeCode[];
  readonly placedItems?: readonly PlacedItem[];
  readonly engineers?: Engineer[];
  readonly routes?: Route[];
  // hp を上書きする（同一フレームの撃破の再現用）。
  readonly hp?: ReadonlyMap<number, number>;
};

const createScene = (options: SceneOptions = {}): SceneUnderTest => {
  const codes = options.codes ?? [];
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = options.funds ?? LARGE_FUNDS;
  scene.score = 0;
  scene.elapsedMs = 0;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.refactoringRatio = DEFAULT_REFACTORING_RATIO;
  scene.engineers = options.engineers ?? [];
  // 既定はルートなし（コードを生成しない）。生成は「出現と同じフレーム」のテストだけで使う。
  scene.routes = options.routes ?? [];
  scene.spawnElapsed = new Map();
  scene.nextCodeId = 100;
  scene.gameOver = NOT_OVER;
  scene.codes = codes;
  // 実際のシーンと同じく、不正なコードだけが hp を持つ。
  scene.codeHp = new Map(
    codes
      .filter((code) => code.kind === 'malicious')
      .map((code) => [code.id, options.hp?.get(code.id) ?? DEFAULT_MALICIOUS_CODE_HP]),
  );
  scene.codeHold = new Map();
  scene.placedItems = options.placedItems ?? [];
  scene.activeEffects = [];
  scene.lastIncident = null;
  scene.documentationPurchasedAtMs = null;
  scene.time = { now: T0 };
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>(), pauseAll: vi.fn<() => void>() };
  scene.cameras = { main: { flash: vi.fn<() => void>() } };
  // 実際のシーンは FUNDS_CHANGED_EVENT を onFundsChanged、CODE_RELEASED_EVENT を onCodeReleased で購読する。その接続だけを再現する。
  scene.events = {
    emit: vi.fn<(event: string, payload: object) => boolean>((event, payload) => {
      if (event === FUNDS_CHANGED_EVENT && isFundsChangedEvent(payload)) {
        scene.onFundsChanged(payload);
      }
      if (event === CODE_RELEASED_EVENT && isCodeReleasedPayload(payload)) {
        scene.onCodeReleased(payload);
      }
      return true;
    }),
  };
  return scene;
};

const emittedEvents = (scene: SceneUnderTest): string[] => scene.events.emit.mock.calls.map(([event]) => event);
const countEvent = (scene: SceneUnderTest, event: string): number =>
  emittedEvents(scene).filter((name) => name === event).length;
const mockRandom = (value: number) => vi.spyOn(Math, 'random').mockReturnValue(value);

describe('MainScene.updateCodes: CI の確率阻止', () => {
  it('阻止に成功すると撃破として消え、リリース・資金・障害は発生しない', () => {
    const code = makeCode(1, 1);
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'ci')] });
    mockRandom(0);

    scene.updateCodes(DELTA_MS);

    expect(scene.codes).toEqual([]);
    expect(scene.codeHp.has(1)).toBe(false);
    expect(scene.funds).toBe(LARGE_FUNDS);
    expect(scene.score).toBe(0);
    expect(emittedEvents(scene)).not.toContain(CODE_RELEASED_EVENT);
    expect(emittedEvents(scene)).not.toContain(INCIDENT_EVENT);
    expect(emittedEvents(scene)).not.toContain(FUNDS_CHANGED_EVENT);
    expect(scene.events.emit).toHaveBeenCalledExactlyOnceWith(CODE_DEFEATED_EVENT, { id: 1, routeId: ROUTE_ID });
    expect(code.graphics.destroy).toHaveBeenCalledTimes(1);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(code.graphics);
    expect(drawDefeatEffect).toHaveBeenCalledExactlyOnceWith(scene, RELEASE);
    expect(drawItemAttackEffect).toHaveBeenCalledExactlyOnceWith(scene, placementCellCenter(CI_CELL), RELEASE);
  });

  it('阻止に失敗すると従来どおりリリースされ、障害で資金が減る', () => {
    const code = makeCode(1, 1);
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'ci')] });
    const random = mockRandom(CI_INTERCEPT_RATE);

    scene.updateCodes(DELTA_MS);

    expect(random).toHaveBeenCalledTimes(1);
    expect(scene.codes).toEqual([]);
    expect(countEvent(scene, CODE_RELEASED_EVENT)).toBe(1);
    expect(countEvent(scene, INCIDENT_EVENT)).toBe(1);
    expect(emittedEvents(scene)).not.toContain(CODE_DEFEATED_EVENT);
    expect(scene.funds).toBe(LARGE_FUNDS - incidentDamage(undefined));
    expect(drawItemAttackEffect).not.toHaveBeenCalled();
  });

  it('CI が0個なら乱数を呼ばずにリリースされ、障害になる', () => {
    const code = makeCode(1, 1);
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'codeRabbit', { col: 10, row: 8 })] });
    const random = mockRandom(0);

    scene.updateCodes(DELTA_MS);

    expect(random).not.toHaveBeenCalled();
    expect(countEvent(scene, CODE_RELEASED_EVENT)).toBe(1);
    expect(countEvent(scene, INCIDENT_EVENT)).toBe(1);
    expect(emittedEvents(scene)).not.toContain(CODE_DEFEATED_EVENT);
  });

  it('正常なコードは阻止されず、売上が計上される', () => {
    const code = makeCode(1, 1, 'normal');
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'ci')] });
    const random = mockRandom(0);

    scene.updateCodes(DELTA_MS);

    expect(random).not.toHaveBeenCalled();
    expect(countEvent(scene, CODE_RELEASED_EVENT)).toBe(1);
    expect(emittedEvents(scene)).not.toContain(CODE_DEFEATED_EVENT);
    expect(scene.funds).toBe(
      LARGE_FUNDS + getReleaseRevenue('normal', REVENUE_PER_NORMAL_CODE, DEFAULT_REFACTORING_RATIO),
    );
  });

  it('同じフレームで撃破済みなら撃破が優先され、阻止判定もリリースもしない', () => {
    const code = makeCode(1, 1);
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'ci')], hp: new Map([[1, 0]]) });
    const random = mockRandom(0);

    scene.updateCodes(DELTA_MS);

    expect(random).not.toHaveBeenCalled();
    expect(scene.codes).toEqual([]);
    expect(scene.events.emit).not.toHaveBeenCalled();
    expect(drawDefeatEffect).not.toHaveBeenCalled();
  });

  it('リリースに届かないコードは阻止判定をしない', () => {
    const code = makeCode(1, ZONE);
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'ci')] });
    const random = mockRandom(0);

    scene.updateCodes(DELTA_MS);

    expect(random).not.toHaveBeenCalled();
    expect(scene.codes).toHaveLength(1);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('倒産したら同じフレームの残りのコードは処理しない（阻止判定もしない）', () => {
    const first = makeCode(1, 1);
    const second = makeCode(2, 1);
    const scene = createScene({ funds: 1, codes: [first, second], placedItems: [placed(0, 'ci')] });
    const random = mockRandom(CI_INTERCEPT_RATE);

    scene.updateCodes(DELTA_MS);

    expect(scene.gameOver.over).toBe(true);
    expect(random).toHaveBeenCalledTimes(1);
    expect(scene.codes).toEqual([second]);
    expect(countEvent(scene, CODE_RELEASED_EVENT)).toBe(1);
  });
});

describe('MainScene.updateCodes: CI の減速', () => {
  const positionAfter = (scene: SceneUnderTest): number => {
    const code = scene.codes[0];
    if (code === undefined) {
      throw new Error('コードが残っていません');
    }
    return code.position.x;
  };

  it.each<['normal' | 'malicious']>([['normal'], ['malicious']])(
    'ゾーンの境界をまたぐ %s のコードは、ゾーン内の部分だけ減速する',
    (kind) => {
      const remaining = ZONE + STEP / 2;
      const scene = createScene({ codes: [makeCode(1, remaining, kind)], placedItems: [placed(0, 'ci')] });

      scene.updateCodes(DELTA_MS);

      expect(positionAfter(scene)).toBeCloseTo(PATH_LENGTH - remaining + STEP / 2 + (STEP / 2) * CI_SLOW_MULTIPLIER);
    },
  );

  it('ゾーン外を進むコードは減速しない', () => {
    const remaining = ZONE + STEP;
    const scene = createScene({ codes: [makeCode(1, remaining)], placedItems: [placed(0, 'ci')] });

    scene.updateCodes(DELTA_MS);

    expect(positionAfter(scene)).toBeCloseTo(PATH_LENGTH - remaining + STEP);
  });

  it('CI が2個あっても減速は重ねがけしない', () => {
    const scene = createScene({
      codes: [makeCode(1, ZONE)],
      placedItems: [placed(0, 'ci'), placed(1, 'ci', { col: 4, row: 2 })],
    });

    scene.updateCodes(DELTA_MS);

    expect(positionAfter(scene)).toBeCloseTo(PATH_LENGTH - ZONE + STEP * CI_SLOW_MULTIPLIER);
  });

  it('CI が0個ならゾーン内でも減速しない', () => {
    const scene = createScene({ codes: [makeCode(1, ZONE)] });

    scene.updateCodes(DELTA_MS);

    expect(positionAfter(scene)).toBeCloseTo(PATH_LENGTH - ZONE + STEP);
  });

  it('担当者の休暇中はゾーン内でも移動量 0 のまま', () => {
    const scene = createScene({
      codes: [makeCode(1, ZONE)],
      placedItems: [placed(0, 'ci')],
      engineers: [makeEngineer(true)],
    });

    scene.updateCodes(DELTA_MS);

    expect(positionAfter(scene)).toBe(PATH_LENGTH - ZONE);
  });

  it('出現と同じフレームで動くコードにも減速が効く', () => {
    // 出現セルからリリース地点まで1セル（ゾーン長以下）の短いルート。
    const route: Route = {
      id: ROUTE_ID,
      spawn: { col: 0, row: 5 },
      waypoints: [
        { col: 0, row: 5 },
        { col: 1, row: 5 },
      ],
    };
    const scene = createScene({ routes: [route], placedItems: [placed(0, 'ci')] });
    // 正常なコードを生成させる（阻止判定の対象外にして、減速だけを見る）。
    mockRandom(1 - Number.EPSILON);

    scene.updateCodes(DELTA_MS);

    expect(scene.codes).toHaveLength(1);
    expect(scene.codes[0]?.kind).toBe('normal');
    expect(positionAfter(scene)).toBeCloseTo(cellCenter(route.spawn).x + STEP * CI_SLOW_MULTIPLIER);
  });
});

describe('MainScene.updateItems: CI は汎用攻撃をしない', () => {
  it('CI の範囲内に不正なコードがいても攻撃せず、クールダウンも変わらない', () => {
    const center = placementCellCenter(CI_CELL);
    const code: FakeCode = { ...makeCode(1, 1), position: center };
    const scene = createScene({ codes: [code], placedItems: [placed(0, 'ci')] });

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.placedItems[0]?.lastAttackTime).toBeNull();
    expect(drawItemAttackEffect).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('CI と並べて置いた nearestTarget のアイテムは従来どおり攻撃する', () => {
    const center = placementCellCenter(CI_CELL);
    const code: FakeCode = { ...makeCode(1, 1), position: center };
    const scene = createScene({
      codes: [code],
      placedItems: [placed(0, 'ci'), placed(1, 'codeRabbit', { col: 4, row: 2 })],
    });

    scene.updateItems(T0);

    expect(scene.placedItems[0]?.lastAttackTime).toBeNull();
    expect(scene.placedItems[1]?.lastAttackTime).toBe(T0);
    expect(drawItemAttackEffect).toHaveBeenCalledExactlyOnceWith(scene, placementCellCenter({ col: 4, row: 2 }), center);
  });
});
