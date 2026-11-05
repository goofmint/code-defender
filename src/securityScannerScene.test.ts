// 実際の MainScene で、通常生成の不正コードに種別が付き(#56)、セキュリティスキャナーがその種別で攻撃することを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（vacationNeutrality.test.ts と同じ方式）。
// 描画（render.ts の Graphics・Tween）はこのテストの対象外なので、使う関数だけをモックに差し替える。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { FlowingCode } from './codeFlow';
import { spawnCode } from './codeFlow';
import { DEFAULT_REFACTORING_RATIO, ENGINEER_SPAWN_CELLS, ITEM_ATTACK_COOLDOWN_MS } from './config';
import { getInitialHp } from './defeat';
import type { Engineer } from './engineer';
import type { GameOverState } from './gameOver';
import type { PlacedItem } from './itemPlacement';
import { MALICIOUS_CODE_TYPES } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';
import { drawCode } from './render';
import { cellCenter, createRoutes } from './route';
import type { Route } from './route';
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
      Scene,
      Game,
    },
  };
});

type FakeGraphics = {
  readonly setPosition: Mock<(x: number, y: number) => void>;
  readonly destroy: Mock<() => void>;
};

const createFakeGraphics = (): FakeGraphics => ({
  setPosition: vi.fn<(x: number, y: number) => void>(),
  destroy: vi.fn<() => void>(),
});

vi.mock('./render', async (importOriginal) => {
  const original = await importOriginal<typeof import('./render')>();
  return {
    ...original,
    drawCode: vi.fn(() => createFakeGraphics()),
    drawItemAttackEffect: vi.fn(),
    flashCode: vi.fn(),
    drawDefeatEffect: vi.fn(),
  };
});

// updateCodes() / updateItems() が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeActiveCode = FlowingCode & { readonly graphics: FakeGraphics };
type SceneUnderTest = {
  routes: Route[];
  engineers: Engineer[];
  codes: FakeActiveCode[];
  codeHp: Map<number, number>;
  codeHold: Map<number, number>;
  spawnElapsed: Map<number, number>;
  nextCodeId: number;
  elapsedMs: number;
  techDebt: number;
  refactoringRatio: number;
  gameOver: GameOverState;
  placedItems: readonly PlacedItem[];
  // #58 の時限効果・直前の障害・ドキュメントの購入時刻。
  activeEffects: readonly ActiveEffect[];
  lastIncident: IncidentRecord | null;
  documentationPurchasedAtMs: number | null;
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  tweens: { readonly killTweensOf: Mock<(target: object) => void> };
  updateCodes(delta: number): void;
  updateItems(now: number): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const OVER: GameOverState = { over: true, at: 1000 };
const route = createRoutes(ENGINEER_SPAWN_CELLS, () => 0)[0];
const scannerCell = { col: 5, row: 5 };

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(drawCode).mockClear();
});

const createScene = (): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.routes = [route];
  scene.engineers = [];
  scene.codes = [];
  scene.codeHp = new Map();
  scene.codeHold = new Map();
  scene.spawnElapsed = new Map();
  scene.nextCodeId = 0;
  scene.elapsedMs = 0;
  scene.techDebt = 0;
  scene.refactoringRatio = DEFAULT_REFACTORING_RATIO;
  scene.gameOver = NOT_OVER;
  scene.placedItems = [];
  scene.activeEffects = [];
  scene.lastIncident = null;
  scene.documentationPurchasedAtMs = null;
  scene.events = { emit: vi.fn<(event: string, payload: object) => boolean>(() => true) };
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>() };
  return scene;
};

// Math.random を決まった順の値に固定する。用意した値より多く呼ばれたら失敗させる。
const seedRandom = (values: readonly number[]): Mock<() => number> => {
  const queue = [...values];
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = queue.shift();
    if (value === undefined) throw new Error('用意した乱数を使い切りました');
    return value;
  });
};

const placeScanner = (scene: SceneUnderTest, lastAttackTime: number | null): void => {
  scene.placedItems = [{ id: 0, itemType: 'securityScanner', cell: scannerCell, lastAttackTime }];
};

// スキャナーのセル中心から (dx, dy) の位置に不正コードを置く。HP は種別の初期値。
const placeMaliciousCode = (scene: SceneUnderTest, id: number, maliciousType: MaliciousCodeType, dx = 0, dy = 0): void => {
  const center = cellCenter(scannerCell);
  const code: FakeActiveCode = {
    ...spawnCode(id, 'malicious', route, maliciousType),
    position: { x: center.x + dx, y: center.y + dy },
    graphics: createFakeGraphics(),
  };
  scene.codes = [...scene.codes, code];
  scene.codeHp.set(id, getInitialHp(maliciousType));
};

const lastAttackTimeOf = (scene: SceneUnderTest): number | null => {
  const item = scene.placedItems[0];
  if (item === undefined) throw new Error('アイテムが置かれていません');
  return item.lastAttackTime;
};

describe('MainScene.updateCodes: 通常生成の不正コードに種別を付ける', () => {
  it('乱数を固定するとクリティカルが生成され、HP 初期化・描画・コードで同じ種別を使う', () => {
    const scene = createScene();
    seedRandom([0, 0]);

    scene.updateCodes(0);

    expect(scene.codes).toHaveLength(1);
    const code = scene.codes[0];
    if (code === undefined) throw new Error('コードが生成されていません');
    expect(code.kind).toBe('malicious');
    expect(code.maliciousType).toBe('vulnerabilityCritical');
    expect(scene.codeHp.get(code.id)).toBe(getInitialHp('vulnerabilityCritical'));
    expect(vi.mocked(drawCode)).toHaveBeenCalledExactlyOnceWith(scene, 'malicious', code.position, 'vulnerabilityCritical');
  });

  it.each(MALICIOUS_CODE_TYPES.map((type, index) => [type, index] as const))(
    '%s は種別の初期 HP で生成される',
    (type, index) => {
      const scene = createScene();
      seedRandom([0, (index + 0.5) / MALICIOUS_CODE_TYPES.length]);

      scene.updateCodes(0);

      expect(scene.codes[0]?.maliciousType).toBe(type);
      expect(scene.codeHp.get(0)).toBe(getInitialHp(type));
    },
  );

  it('正常なコードは種別を持たず、HP も持たず、種別の抽選もしない', () => {
    const scene = createScene();
    const random = seedRandom([1 - 1e-9]);

    scene.updateCodes(0);

    expect(scene.codes[0]?.kind).toBe('normal');
    expect(scene.codes[0]?.maliciousType).toBeUndefined();
    expect(scene.codeHp.size).toBe(0);
    expect(random).toHaveBeenCalledTimes(1);
    expect(vi.mocked(drawCode)).toHaveBeenCalledExactlyOnceWith(scene, 'normal', scene.codes[0]?.position, undefined);
  });
});

describe('MainScene.updateItems: セキュリティスキャナーがクリティカルを攻撃する', () => {
  it('射程内のクリティカルを1回で撃破し、コード配列と HP から除き、攻撃時刻を更新する', () => {
    const scene = createScene();
    placeScanner(scene, null);
    placeMaliciousCode(scene, 7, 'vulnerabilityCritical');
    const graphics = scene.codes[0]?.graphics;

    scene.updateItems(5000);

    expect(scene.codes).toHaveLength(0);
    expect(scene.codeHp.has(7)).toBe(false);
    expect(graphics?.destroy).toHaveBeenCalledTimes(1);
    expect(lastAttackTimeOf(scene)).toBe(5000);
  });

  it('得意でない種別（スパゲティコード）は等倍で、撃破せず HP だけ減る', () => {
    const scene = createScene();
    placeScanner(scene, null);
    placeMaliciousCode(scene, 7, 'spaghetti');

    scene.updateItems(5000);

    expect(scene.codes).toHaveLength(1);
    expect(scene.codeHp.get(7)).toBeLessThan(getInitialHp('spaghetti'));
    expect(scene.codeHp.get(7)).toBeGreaterThan(0);
    expect(lastAttackTimeOf(scene)).toBe(5000);
  });

  it.each([
    ['クールダウン − 1ms は攻撃しない', ITEM_ATTACK_COOLDOWN_MS - 1, false],
    ['クールダウンちょうどは攻撃する', ITEM_ATTACK_COOLDOWN_MS, true],
  ])('%s', (_label, elapsed, attacks) => {
    const lastAttack = 10_000;
    const scene = createScene();
    placeScanner(scene, lastAttack);
    placeMaliciousCode(scene, 7, 'vulnerabilityCritical');

    scene.updateItems(lastAttack + elapsed);

    expect(scene.codeHp.has(7)).toBe(!attacks);
    expect(scene.codes).toHaveLength(attacks ? 0 : 1);
    expect(lastAttackTimeOf(scene)).toBe(attacks ? lastAttack + elapsed : lastAttack);
  });

  it('射程内に対象がいなければ攻撃時刻は変わらない', () => {
    const scene = createScene();
    placeScanner(scene, null);
    placeMaliciousCode(scene, 7, 'vulnerabilityCritical', 1000, 0);

    scene.updateItems(5000);

    expect(scene.codeHp.get(7)).toBe(getInitialHp('vulnerabilityCritical'));
    expect(lastAttackTimeOf(scene)).toBeNull();
  });

  it('ゲームオーバー中は HP も攻撃時刻も変わらない', () => {
    const scene = createScene();
    scene.gameOver = OVER;
    placeScanner(scene, null);
    placeMaliciousCode(scene, 7, 'vulnerabilityCritical');

    scene.updateItems(5000);

    expect(scene.codes).toHaveLength(1);
    expect(scene.codeHp.get(7)).toBe(getInitialHp('vulnerabilityCritical'));
    expect(lastAttackTimeOf(scene)).toBeNull();
  });
});
