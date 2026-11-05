// 置いて範囲内に効くアイテム・ついてまわるアイテム(#58)が MainScene に正しく接続されていることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（codeRabbit.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  DEFAULT_MALICIOUS_CODE_HP,
  ITEM_POWER_DAMAGE,
  LINTER_ATTACK_COOLDOWN_MS,
  LINTER_HESITATION_PROBABILITY,
  PAIR_PROGRAMMER_FOLLOW_OFFSET,
  SENIOR_NOTE_PREVENTED_MESSAGE,
  TECH_DEBT_INITIAL,
} from './config';
import type { CodeReleasedPayload } from './codeFlow';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import type { GameOverState } from './gameOver';
import { INCIDENT_EVENT, INCIDENT_PREVENTED_EVENT, incidentDamage } from './incident';
import type { ActiveEffect, IncidentRecord } from './itemEffect';
import { placementCellCenter, pointToPlacementCell } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { RELEASE_POINT_CENTER } from './releasePoint';
import { drawCode, drawItemAttackEffect, drawItemMessage } from './render';
import type { GridCell, Point } from './route';

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
  drawCode: vi.fn(() => ({ destroy: vi.fn() })),
  drawItemAttackEffect: vi.fn(),
  drawItemMessage: vi.fn(() => ({ destroy: vi.fn() })),
  flashCode: vi.fn(),
  drawDefeatEffect: vi.fn(),
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
  readonly revealed?: boolean;
  readonly graphics: FakeGraphics;
};
type FakeView = { readonly setPosition: Mock<(x: number, y: number) => void> };
type SceneUnderTest = {
  funds: number;
  score: number;
  techDebt: number;
  refactoringRatio: number;
  elapsedMs: number;
  gameOver: GameOverState;
  player?: Point;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  placedItems: readonly PlacedItem[];
  followItemViews: Map<number, FakeView>;
  activeEffects: readonly ActiveEffect[];
  lastIncident: IncidentRecord | null;
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
  updateItems(now: number): void;
  moveFollowItems(): void;
  revealCodes(): void;
  onCodeReleased(payload: CodeReleasedPayload): void;
  onFundsChanged(event: FundsChangedEvent): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const T0 = 10_000;
const FUNDS = 1_000_000;
// アイテムのセルは配置グリッド（16px #151）の座標。中心は (456, 264)。
const ITEM_CELL: GridCell = { col: 28, row: 16 };
const ITEM_CENTER = placementCellCenter(ITEM_CELL);
// リリース地点を含む配置グリッドのセル。
const NOTE_CELL = pointToPlacementCell(RELEASE_POINT_CENTER);

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

const placed = (id: number, itemType: PlacedItem['itemType'], cell: GridCell = ITEM_CELL): PlacedItem => ({
  id,
  itemType,
  cell,
  lastAttackTime: null,
});

const makeCode = (id: number, position: Point, kind: 'normal' | 'malicious' = 'malicious'): FakeCode => ({
  id,
  kind,
  routeId: 0,
  path: [],
  segmentIndex: 0,
  position,
  released: false,
  graphics: { destroy: vi.fn<() => void>() },
});

const createScene = (codes: FakeCode[], placedItems: readonly PlacedItem[]): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = FUNDS;
  scene.score = 0;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.refactoringRatio = 0;
  scene.elapsedMs = T0;
  scene.gameOver = NOT_OVER;
  scene.player = { x: 600, y: 400 };
  scene.codes = codes;
  scene.codeHp = new Map(
    codes.filter((code) => code.kind === 'malicious').map((code) => [code.id, DEFAULT_MALICIOUS_CODE_HP]),
  );
  scene.placedItems = placedItems;
  scene.followItemViews = new Map();
  scene.activeEffects = [];
  scene.lastIncident = null;
  scene.time = { now: T0 };
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>(), pauseAll: vi.fn<() => void>() };
  scene.cameras = { main: { flash: vi.fn<() => void>() } };
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

describe('Linter(#58): 正常なコードが射程内にあるとときどき止まる', () => {
  it('見送ったときは攻撃せずクールダウンだけ消費し、正常なコードも攻撃しない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(LINTER_HESITATION_PROBABILITY - 0.01);
    const scene = createScene([makeCode(1, ITEM_CENTER), makeCode(2, ITEM_CENTER, 'normal')], [placed(0, 'linter')]);

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.placedItems[0].lastAttackTime).toBe(T0);
    expect(vi.mocked(drawItemAttackEffect)).not.toHaveBeenCalled();
    expect(scene.funds).toBe(FUNDS);
  });

  it('見送らなければ不正なコードだけを撃ち、Linter 専用の短い間隔で次を撃てる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(LINTER_HESITATION_PROBABILITY);
    const scene = createScene([makeCode(1, ITEM_CENTER), makeCode(2, ITEM_CENTER, 'normal')], [placed(0, 'linter')]);

    scene.updateItems(T0);
    scene.updateItems(T0 + LINTER_ATTACK_COOLDOWN_MS - 1);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - ITEM_POWER_DAMAGE.weak);

    scene.updateItems(T0 + LINTER_ATTACK_COOLDOWN_MS);
    expect(DEFAULT_MALICIOUS_CODE_HP - ITEM_POWER_DAMAGE.weak * 2).toBeGreaterThan(0);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - ITEM_POWER_DAMAGE.weak * 2);
    expect(scene.codes.map((code) => code.id)).toEqual([1, 2]);
    expect(scene.funds).toBe(FUNDS);
  });

  it('射程内に正常なコードがなければ乱数を引かずに撃つ', () => {
    const random = vi.spyOn(Math, 'random');
    const scene = createScene([makeCode(1, ITEM_CENTER)], [placed(0, 'linter')]);

    scene.updateItems(T0);

    expect(random).not.toHaveBeenCalled();
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - ITEM_POWER_DAMAGE.weak);
  });
});

describe('攻撃しないアイテム(#58)', () => {
  it('ラバーダック・コーヒーマシン・書き置きは範囲内の不正なコードを攻撃しない', () => {
    const scene = createScene(
      [makeCode(1, ITEM_CENTER)],
      [placed(0, 'rubberDuck'), placed(1, 'coffeeMachine', { col: 31, row: 16 }), placed(2, 'seniorNote', { col: 25, row: 16 })],
    );

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.placedItems.every((item) => item.lastAttackTime === null)).toBe(true);
  });
});

describe('ペアプロ相棒(#58): 主人公についてまわる', () => {
  const offsetFrom = (player: Point): Point => ({
    x: player.x + PAIR_PROGRAMMER_FOLLOW_OFFSET.x,
    y: player.y + PAIR_PROGRAMMER_FOLLOW_OFFSET.y,
  });

  it('置いたセルから遠くても、主人公の位置 + ずれから近くの不正なコードを叩く', () => {
    const scene = createScene([], [placed(0, 'pairProgrammer', { col: 1, row: 1 })]);
    const origin = offsetFrom({ x: 600, y: 400 });
    scene.codes = [makeCode(1, origin)];
    scene.codeHp = new Map([[1, DEFAULT_MALICIOUS_CODE_HP]]);

    scene.updateItems(T0);

    expect(vi.mocked(drawItemAttackEffect)).toHaveBeenCalledWith(scene, origin, origin);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP - ITEM_POWER_DAMAGE.medium);
  });

  it('置いたセルの近くのコードは、主人公が離れていれば叩かない', () => {
    const scene = createScene([makeCode(1, placementCellCenter({ col: 1, row: 1 }))], [placed(0, 'pairProgrammer', { col: 1, row: 1 })]);

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);
  });

  it('表示を主人公の位置 + ずれへ動かす', () => {
    const scene = createScene([], [placed(0, 'pairProgrammer', { col: 1, row: 1 })]);
    const view: FakeView = { setPosition: vi.fn<(x: number, y: number) => void>() };
    scene.followItemViews.set(0, view);
    scene.player = { x: 200, y: 250 };

    scene.moveFollowItems();

    const origin = offsetFrom({ x: 200, y: 250 });
    expect(view.setPosition).toHaveBeenCalledWith(origin.x, origin.y);
  });
});

describe('ラバーダック(#58): 範囲内の不正なコードの正体を暴く', () => {
  it('範囲内の不正なコードを一度だけ濃い色で描き直し、hp は変えない。正常なコードは描き直さない', () => {
    const malicious = makeCode(1, ITEM_CENTER);
    const scene = createScene([malicious, makeCode(2, ITEM_CENTER, 'normal')], [placed(0, 'rubberDuck')]);

    scene.revealCodes();

    expect(malicious.graphics.destroy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(drawCode)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(drawCode)).toHaveBeenCalledWith(scene, 'malicious', ITEM_CENTER, undefined, true);
    expect(scene.codes.map((code) => [code.id, code.revealed === true])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);

    scene.revealCodes();
    expect(vi.mocked(drawCode)).toHaveBeenCalledTimes(1);
  });
});

describe('伝説のシニアの書き置き(#58): リリース地点の周辺で障害を防ぐ', () => {
  const payload: CodeReleasedPayload = { id: 9, kind: 'malicious', routeId: 0 };

  it('リリース地点が範囲内なら損害・INCIDENT_EVENT・直前の障害の記録を出さず、防いだことを知らせる', () => {
    const scene = createScene([], [placed(0, 'seniorNote', NOTE_CELL)]);

    scene.onCodeReleased(payload);

    expect(scene.funds).toBe(FUNDS);
    expect(scene.lastIncident).toBeNull();
    expect(scene.cameras.main.flash).not.toHaveBeenCalled();
    expect(scene.events.emit).not.toHaveBeenCalledWith(INCIDENT_EVENT, expect.anything());
    expect(scene.events.emit).toHaveBeenCalledWith(INCIDENT_PREVENTED_EVENT, {
      codeId: 9,
      maliciousType: undefined,
      damage: incidentDamage(undefined),
    });
    expect(vi.mocked(drawItemMessage)).toHaveBeenCalledWith(scene, SENIOR_NOTE_PREVENTED_MESSAGE);
  });

  it('書き置きの範囲外なら障害が起き、直前の障害として記録する', () => {
    const scene = createScene([], [placed(0, 'seniorNote', { col: 0, row: 1 })]);

    scene.onCodeReleased(payload);

    expect(scene.funds).toBe(FUNDS - incidentDamage(undefined));
    expect(scene.lastIncident).toEqual({ damage: incidentDamage(undefined), rolledBack: false });
    expect(scene.events.emit).toHaveBeenCalledWith(INCIDENT_EVENT, expect.objectContaining({ codeId: 9 }));
  });
});
