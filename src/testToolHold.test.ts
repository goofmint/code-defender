// テストツールの足止め(#54)が MainScene の攻撃(updateItems)・移動(updateCodes)・後片付けに正しく接続されていることを確かめる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（codeRabbit.test.ts と同じ形）。
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_MALICIOUS_CODE_HP, ITEM_ATTACK_COOLDOWN_MS, TEST_TOOL_HOLD_MS } from './config';
import { CODE_DEFEATED_EVENT } from './defeat';
import { codeSpeedAt } from './difficulty';
import type { Engineer } from './engineer';
import type { GameOverState } from './gameOver';
import type { ItemType } from './item';
import type { PlacedItem } from './itemPlacement';
import type { MaliciousCodeType } from './maliciousCode';
import { cellCenter } from './route';
import type { GridCell, Point, Route } from './route';

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
  readonly maliciousType?: MaliciousCodeType;
  readonly graphics: FakeGraphics;
};
type SceneUnderTest = {
  elapsedMs: number;
  techDebt: number;
  engineers: Engineer[];
  routes: Route[];
  gameOver: GameOverState;
  codes: FakeCode[];
  codeHp: Map<number, number>;
  codeHold: Map<number, number>;
  placedItems: readonly PlacedItem[];
  tweens: { readonly killTweensOf: Mock<(target: object) => void> };
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  updateItems(now: number): void;
  updateCodes(delta: number): void;
  discardCode(code: FakeCode): void;
};

const NOT_OVER: GameOverState = { over: false, at: null };
const OVER: GameOverState = { over: true, at: 1000 };
const HOLD = TEST_TOOL_HOLD_MS;
const T0 = 10_000;
// テストではゲーム開始直後（elapsedMs = 0）の速度で動かす。
const SPEED = codeSpeedAt(0);
const ITEM_CELL: GridCell = { col: 7, row: 4 };
const ITEM_CENTER = cellCenter(ITEM_CELL);
// 移動の検証中にリリースされないよう、十分長い直線の経路にする。
const PATH_LENGTH = 100_000;

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

const placedItem = (id: number, itemType: ItemType): PlacedItem => ({
  id,
  itemType,
  cell: ITEM_CELL,
  lastAttackTime: null,
});

type CodeOptions = {
  readonly kind?: 'normal' | 'malicious';
  readonly maliciousType?: MaliciousCodeType;
  readonly released?: boolean;
};

const makeCode = (id: number, options: CodeOptions = {}): FakeCode => ({
  id,
  kind: options.kind ?? 'malicious',
  routeId: 0,
  path: [ITEM_CENTER, { x: ITEM_CENTER.x + PATH_LENGTH, y: ITEM_CENTER.y }],
  segmentIndex: 0,
  position: ITEM_CENTER,
  released: options.released ?? false,
  ...(options.maliciousType === undefined ? {} : { maliciousType: options.maliciousType }),
  graphics: { setPosition: vi.fn<(x: number, y: number) => void>(), destroy: vi.fn<() => void>() },
});

type SceneOptions = {
  readonly codes?: FakeCode[];
  readonly placedItems?: readonly PlacedItem[];
  readonly gameOver?: GameOverState;
};

const createScene = (options: SceneOptions = {}): SceneUnderTest => {
  const codes = options.codes ?? [];
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.elapsedMs = 0;
  scene.techDebt = 0;
  scene.engineers = [];
  // ルートなし: updateCodes で新しいコードを生成させない。
  scene.routes = [];
  scene.gameOver = options.gameOver ?? NOT_OVER;
  scene.codes = codes;
  // 実際のシーンと同じく、不正なコードだけが hp を持つ。
  scene.codeHp = new Map(
    codes.filter((code) => code.kind === 'malicious').map((code) => [code.id, DEFAULT_MALICIOUS_CODE_HP]),
  );
  scene.codeHold = new Map();
  scene.placedItems = options.placedItems ?? [placedItem(0, 'testTool')];
  scene.tweens = { killTweensOf: vi.fn<(target: object) => void>() };
  scene.events = { emit: vi.fn<(event: string, payload: object) => boolean>(() => true) };
  return scene;
};

// 先頭のコードの、経路の始点からの移動距離。
const movedDistance = (scene: SceneUnderTest): number => {
  const code = scene.codes[0];
  if (code === undefined) {
    throw new Error('コードがありません');
  }
  return code.position.x - ITEM_CENTER.x;
};

describe('MainScene: テストツールの足止め（境界値）', () => {
  it('攻撃すると、撃破されずに残った不正コードに足止め時間が付く', () => {
    const scene = createScene({ codes: [makeCode(1)] });

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBeLessThan(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.codeHold.get(1)).toBe(HOLD);
  });

  it.each([
    ['持続時間 − 1', HOLD - 1, 0, 1],
    ['持続時間ちょうど', HOLD, 0, undefined],
    ['持続時間 + 1', HOLD + 1, 1, undefined],
  ])('%s: delta %d ms → 移動時間 %d ms・残り %s', (_name, delta, movableMs, remaining) => {
    const scene = createScene({ codes: [makeCode(1)] });
    scene.updateItems(T0);

    scene.updateCodes(delta);

    expect(movedDistance(scene)).toBeCloseTo((SPEED * movableMs) / 1000);
    expect(scene.codeHold.get(1)).toBe(remaining);
  });

  it('複数フレームでは、合計が持続時間に達するまで止まり、切れたフレームでは残りの時間だけ進む', () => {
    const scene = createScene({ codes: [makeCode(1)] });
    scene.updateItems(T0);

    scene.updateCodes(HOLD - 1);
    expect(movedDistance(scene)).toBe(0);
    expect(scene.codeHold.get(1)).toBe(1);

    // 残り 1ms に対して 16ms 進めると、足止めが切れて 15ms 分だけ進む。
    scene.updateCodes(16);
    expect(movedDistance(scene)).toBeCloseTo((SPEED * 15) / 1000);
    expect(scene.codeHold.has(1)).toBe(false);

    // 足止めが切れたあとは delta の分だけ進む。
    scene.updateCodes(16);
    expect(movedDistance(scene)).toBeCloseTo((SPEED * 31) / 1000);
  });

  it('足止め中もグラフィックスの位置は更新され、コードは流れたまま残る', () => {
    const code = makeCode(1);
    const scene = createScene({ codes: [code] });
    scene.updateItems(T0);

    scene.updateCodes(HOLD - 1);

    expect(scene.codes.map((active) => active.id)).toEqual([1]);
    expect(code.graphics.setPosition).toHaveBeenCalledWith(ITEM_CENTER.x, ITEM_CENTER.y);
  });

  it('足止めのないコードは delta の分だけ進む（変更前と同じ）', () => {
    const scene = createScene({ codes: [makeCode(1)], placedItems: [] });

    scene.updateCodes(16);

    expect(movedDistance(scene)).toBeCloseTo((SPEED * 16) / 1000);
    expect(scene.codeHold.size).toBe(0);
  });
});

describe('MainScene: テストツール以外・重ね掛け', () => {
  it.each<ItemType>(['codeRabbit', 'linter', 'ci', 'securityScanner', 'pairProgrammer'])(
    '%s の攻撃では足止めしない',
    (itemType) => {
      const scene = createScene({ codes: [makeCode(1)], placedItems: [placedItem(0, itemType)] });
      // 攻撃力の強いアイテムでも1回で撃破されないよう、hp に余裕を持たせる。
      scene.codeHp.set(1, DEFAULT_MALICIOUS_CODE_HP * 10);

      scene.updateItems(T0);
      scene.updateCodes(16);

      expect(scene.codeHp.get(1)).toBeLessThan(DEFAULT_MALICIOUS_CODE_HP * 10);
      expect(scene.codeHold.has(1)).toBe(false);
      expect(movedDistance(scene)).toBeCloseTo((SPEED * 16) / 1000);
    },
  );

  it('2 つのテストツールが同じコードに当たっても足止め時間は加算されない', () => {
    const scene = createScene({ codes: [makeCode(1)], placedItems: [placedItem(0, 'testTool'), placedItem(1, 'testTool')] });

    scene.updateItems(T0);

    expect(scene.placedItems.map((item) => item.lastAttackTime)).toEqual([T0, T0]);
    expect(scene.codeHold.get(1)).toBe(HOLD);
  });

  it('足止めが残っている間に再び当たると、持続時間に戻る（加算しない）', () => {
    const scene = createScene({ codes: [makeCode(1)] });
    scene.updateItems(T0);
    scene.updateCodes(1);
    expect(scene.codeHold.get(1)).toBe(HOLD - 1);

    scene.updateItems(T0 + ITEM_ATTACK_COOLDOWN_MS);

    expect(scene.codeHold.get(1)).toBe(HOLD);
  });

  it.each<MaliciousCodeType | undefined>(['bug', undefined])(
    '種類 %s でも足止め時間は同じ（得意で変わるのはダメージだけ）',
    (maliciousType) => {
      const scene = createScene({ codes: [makeCode(1, { maliciousType })] });

      scene.updateItems(T0);
      scene.updateCodes(HOLD - 1);

      expect(scene.codeHold.get(1)).toBe(1);
      expect(movedDistance(scene)).toBe(0);
    },
  );
});

describe('MainScene: 足止めの後片付けと対象外', () => {
  it('攻撃で撃破したコードには足止めを付けない', () => {
    const scene = createScene({ codes: [makeCode(1)] });
    scene.codeHp.set(1, 1);

    scene.updateItems(T0);

    expect(scene.codes).toEqual([]);
    expect(scene.codeHold.has(1)).toBe(false);
    expect(scene.events.emit).toHaveBeenCalledWith(CODE_DEFEATED_EVENT, { id: 1, routeId: 0 });
  });

  it('足止め中のコードを撃破すると、足止めの記録も消える', () => {
    const scene = createScene({ codes: [makeCode(1)] });
    scene.updateItems(T0);
    scene.codeHp.set(1, 1);

    scene.updateItems(T0 + ITEM_ATTACK_COOLDOWN_MS);

    expect(scene.codes).toEqual([]);
    expect(scene.codeHold.has(1)).toBe(false);
  });

  it('足止め中のコードがリリースされると、足止めの記録も消える', () => {
    const scene = createScene({ codes: [makeCode(1, { released: true })], placedItems: [] });
    scene.codeHold.set(1, HOLD);

    scene.updateCodes(1);

    expect(scene.codes).toEqual([]);
    expect(scene.codeHold.has(1)).toBe(false);
  });

  it('精算せずに消したコード（退職でルートが消えたとき）の足止めの記録も消える', () => {
    const code = makeCode(1);
    const scene = createScene({ codes: [code] });
    scene.codeHold.set(1, HOLD);

    scene.discardCode(code);

    expect(scene.codeHold.has(1)).toBe(false);
    expect(scene.codeHp.has(1)).toBe(false);
  });

  it('正常なコードは攻撃せず、足止めもしない', () => {
    const scene = createScene({ codes: [makeCode(1, { kind: 'normal' })] });

    scene.updateItems(T0);

    expect(scene.placedItems[0]?.lastAttackTime).toBeNull();
    expect(scene.codeHold.size).toBe(0);
  });

  it('ゲームオーバー中は攻撃せず、足止めもしない', () => {
    const scene = createScene({ codes: [makeCode(1)], gameOver: OVER });

    scene.updateItems(T0);

    expect(scene.codeHp.get(1)).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(scene.codeHold.size).toBe(0);
  });
});
