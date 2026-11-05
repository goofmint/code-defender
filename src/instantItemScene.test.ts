// 置かないアイテム(#58)の購入と効果が MainScene に正しく接続されていることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（codeRabbit.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  CODE_FREEZE_DURATION_MS,
  FRIDAY_DEPLOY_INCIDENT_DAMAGE_POINTS,
  FRIDAY_DEPLOY_INCIDENT_DELAY_MS,
  FRIDAY_DEPLOY_INCIDENT_PROBABILITY,
  FRIDAY_DEPLOY_SALES,
  PIZZA_DURATION_MS,
  PIZZA_TECH_DEBT,
  TECH_DEBT_INITIAL,
} from './config';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import type { GameOverState } from './gameOver';
import { calculateDamage } from './incident';
import type { ItemType } from './item';
import type { ActiveEffect, IncidentRecord, ScheduledIncident } from './itemEffect';
import { getItemPrice, ITEM_USED_EVENT } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { drawItemMessage } from './render';
import { routePixelPoints } from './route';
import type { Point, Route } from './route';
import { TECH_DEBT_CHANGED_EVENT } from './techDebt';

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
  drawItemMessage: vi.fn(() => ({ destroy: vi.fn() })),
  drawGameOver: vi.fn(),
}));

// テストで触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeGraphics = { readonly setPosition: Mock<(x: number, y: number) => void> };
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
  techDebt: number;
  elapsedMs: number;
  routes: Route[];
  gameOver: GameOverState;
  player?: Point;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  spawnElapsed: Map<number, number>;
  placedItems: readonly PlacedItem[];
  nextItemId: number;
  activeEffects: readonly ActiveEffect[];
  scheduledIncidents: readonly ScheduledIncident[];
  lastIncident: IncidentRecord | null;
  documentationPurchasedAtMs: number | null;
  time: { now: number };
  tweens: { readonly pauseAll: Mock<() => void> };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  // 右下の指標(#156)。資金・累計売上・月末支払・技術的負債の段階の表示を更新する。
  statusPanel: {
    readonly setFunds: Mock<(funds: number) => void>;
    readonly setScore: Mock<(score: number) => void>;
    readonly setMonthEndPayment: Mock<(amount: number) => void>;
    readonly setTechDebtLevel: Mock<(level: string) => void>;
  };
  buyItem(itemType: ItemType): void;
  onFundsChanged(event: FundsChangedEvent): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const NOW = 30_000;
const FUNDS = 1_000_000;
const ROUTE: Route = {
  id: 0,
  spawn: { col: 0, row: 5 },
  waypoints: [
    { col: 0, row: 5 },
    { col: 8, row: 5 },
  ],
};
const PATH = routePixelPoints(ROUTE);

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

const makeCode = (id: number, x: number): FakeCode => ({
  id,
  kind: 'malicious',
  routeId: ROUTE.id,
  path: PATH,
  segmentIndex: 1,
  position: { x, y: PATH[0].y },
  released: false,
  graphics: { setPosition: vi.fn<(x: number, y: number) => void>() },
});

const createScene = (funds: number = FUNDS): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = funds;
  scene.score = 0;
  scene.techDebt = TECH_DEBT_INITIAL;
  scene.elapsedMs = NOW;
  scene.routes = [ROUTE];
  scene.gameOver = NOT_OVER;
  scene.player = { x: 300, y: 300 };
  scene.codes = [];
  scene.codeHp = new Map();
  scene.spawnElapsed = new Map();
  scene.placedItems = [];
  scene.nextItemId = 0;
  scene.activeEffects = [];
  scene.scheduledIncidents = [];
  scene.lastIncident = null;
  scene.documentationPurchasedAtMs = null;
  scene.time = { now: NOW };
  scene.tweens = { pauseAll: vi.fn<() => void>() };
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

const fundsEvents = (scene: SceneUnderTest): FundsChangedEvent[] =>
  scene.events.emit.mock.calls.flatMap(([event, payload]) =>
    event === FUNDS_CHANGED_EVENT && isFundsChangedEvent(payload) ? [payload] : [],
  );

describe('MainScene.buyItem: 置かないアイテムの購入(#58)', () => {
  it('価格を引き、置かずに ITEM_USED_EVENT を発行する', () => {
    const scene = createScene();
    const price = getItemPrice('codeFreeze');

    scene.buyItem('codeFreeze');

    expect(scene.funds).toBe(FUNDS - price);
    expect(scene.placedItems).toEqual([]);
    expect(scene.events.emit).toHaveBeenCalledWith(ITEM_USED_EVENT, { itemType: 'codeFreeze', price });
    expect(scene.activeEffects).toEqual([
      { kind: 'codeFreeze', startMs: NOW, endMs: NOW + CODE_FREEZE_DURATION_MS },
    ]);
  });

  it('資金不足なら資金・効果は変わらず、イベントも出さない', () => {
    const scene = createScene(getItemPrice('codeFreeze') - 1);

    scene.buyItem('codeFreeze');

    expect(scene.funds).toBe(getItemPrice('codeFreeze') - 1);
    expect(scene.activeEffects).toEqual([]);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('購入で倒産したら効果は発動しない', () => {
    const scene = createScene(getItemPrice('pizza'));

    scene.buyItem('pizza');

    expect(scene.gameOver.over).toBe(true);
    expect(scene.activeEffects).toEqual([]);
    expect(scene.techDebt).toBe(TECH_DEBT_INITIAL);
    expect(scene.events.emit).not.toHaveBeenCalledWith(ITEM_USED_EVENT, expect.anything());
  });
});

describe('ロールバックボタン(#58)', () => {
  const price = getItemPrice('rollbackButton');
  const damage = 300_000;

  it('直前の障害の損害を1回だけ返金し、返金はスコアに入らない', () => {
    const scene = createScene();
    scene.lastIncident = { damage, rolledBack: false };

    scene.buyItem('rollbackButton');

    expect(scene.funds).toBe(FUNDS - price + damage);
    expect(scene.lastIncident).toEqual({ damage, rolledBack: true });
    expect(scene.score).toBe(0);
    expect(fundsEvents(scene).map((event) => [event.reason, event.delta])).toEqual([
      ['item', -price],
      ['rollback', damage],
    ]);

    vi.clearAllMocks();
    scene.buyItem('rollbackButton');

    expect(scene.funds).toBe(FUNDS - price + damage);
    expect(vi.mocked(drawItemMessage)).toHaveBeenCalledWith(scene, '取り消せる障害がありません');
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('障害がまだなければ買えず、資金は変わらない', () => {
    const scene = createScene();

    scene.buyItem('rollbackButton');

    expect(scene.funds).toBe(FUNDS);
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('ゲームオーバー中は買えず、倒産から復帰しない', () => {
    const scene = createScene(-1);
    scene.gameOver = { over: true, at: NOW };
    scene.lastIncident = { damage, rolledBack: false };

    scene.buyItem('rollbackButton');

    expect(scene.funds).toBe(-1);
    expect(scene.lastIncident).toEqual({ damage, rolledBack: false });
    expect(scene.gameOver.over).toBe(true);
  });
});

describe('金曜日の夕方デプロイ(#58)', () => {
  const price = getItemPrice('fridayDeploy');

  it('売上を即時に入れてスコアに反映し、当たりなら遅延後の障害を予約する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(FRIDAY_DEPLOY_INCIDENT_PROBABILITY - 0.01);
    const scene = createScene();

    scene.buyItem('fridayDeploy');

    expect(scene.funds).toBe(FUNDS - price + FRIDAY_DEPLOY_SALES);
    expect(scene.score).toBe(FRIDAY_DEPLOY_SALES);
    expect(scene.scheduledIncidents).toEqual([
      { atMs: NOW + FRIDAY_DEPLOY_INCIDENT_DELAY_MS, damage: calculateDamage(FRIDAY_DEPLOY_INCIDENT_DAMAGE_POINTS) },
    ]);
  });

  it('外れなら障害は予約しない（売上は入る）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(FRIDAY_DEPLOY_INCIDENT_PROBABILITY);
    const scene = createScene();

    scene.buyItem('fridayDeploy');

    expect(scene.score).toBe(FRIDAY_DEPLOY_SALES);
    expect(scene.scheduledIncidents).toEqual([]);
  });
});

describe('仕様変更の嵐・ピザ・ドキュメント(#58)', () => {
  it('仕様変更の嵐: 全コードをルートの始点に戻して描画も合わせ、全ルートの生成タイマーを 0 にする（id・hp は変えない）', () => {
    const scene = createScene();
    scene.codes = [makeCode(1, PATH[0].x + 100), makeCode(2, PATH[0].x + 200)];
    scene.codeHp = new Map([
      [1, 2],
      [2, 1],
    ]);
    scene.spawnElapsed = new Map([[ROUTE.id, 1234]]);

    scene.buyItem('specChangeStorm');

    expect(scene.codes.map((code) => [code.id, code.position, code.segmentIndex])).toEqual([
      [1, PATH[0], 0],
      [2, PATH[0], 0],
    ]);
    for (const code of scene.codes) {
      expect(code.graphics.setPosition).toHaveBeenCalledWith(PATH[0].x, PATH[0].y);
    }
    expect([...scene.codeHp.entries()]).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(scene.spawnElapsed.get(ROUTE.id)).toBe(0);
  });

  it('ピザ: 時限効果を始め、技術的負債を溜めて TECH_DEBT_CHANGED_EVENT を発行する', () => {
    const scene = createScene();

    scene.buyItem('pizza');

    expect(scene.activeEffects).toEqual([{ kind: 'pizza', startMs: NOW, endMs: NOW + PIZZA_DURATION_MS }]);
    expect(scene.techDebt).toBe(TECH_DEBT_INITIAL + PIZZA_TECH_DEBT);
    expect(scene.events.emit).toHaveBeenCalledWith(TECH_DEBT_CHANGED_EVENT, {
      previous: TECH_DEBT_INITIAL,
      current: TECH_DEBT_INITIAL + PIZZA_TECH_DEBT,
      delta: PIZZA_TECH_DEBT,
      reason: 'pizza',
    });
  });

  it('ドキュメント: 最初の購入時刻を記録し、買い直しても変えない', () => {
    const scene = createScene();

    scene.buyItem('documentation');
    scene.elapsedMs = NOW + 5_000;
    scene.buyItem('documentation');

    expect(scene.documentationPurchasedAtMs).toBe(NOW);
  });
});
