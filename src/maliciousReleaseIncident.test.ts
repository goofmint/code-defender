// 実際の MainScene で、通常生成で種別が付いた不正コード(#56)がリリースされると、種別ごとの損害が資金から引かれることを確かめる。
// 種別が付く前は既定の損害（INCIDENT_DEFAULT_DAMAGE_POINTS）だったので、資金の減り方と倒産のタイミングが変わる。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、このファイルの中だけで phaser をモックする（securityScannerScene.test.ts と同じ方式）。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CodeReleasedPayload, FlowingCode } from './codeFlow';
import { CODE_RELEASED_EVENT, spawnCode } from './codeFlow';
import {
  DEFAULT_REFACTORING_RATIO,
  ENGINEER_SPAWN_CELLS,
  INCIDENT_DAMAGE_UNIT_YEN,
  INCIDENT_DEFAULT_DAMAGE_POINTS,
  MALICIOUS_CODE_PARAMS,
  REVENUE_PER_NORMAL_CODE,
} from './config';
import type { Engineer } from './engineer';
import { FUNDS_CHANGED_EVENT } from './funds';
import type { FundsChangedEvent } from './funds';
import { GAME_OVER_EVENT, INITIAL_GAME_OVER_STATE, isBankrupt } from './gameOver';
import type { GameOverState } from './gameOver';
import { INCIDENT_EVENT, incidentDamage } from './incident';
import type { PlacedItem } from './itemPlacement';
import type { MaliciousCodeType } from './maliciousCode';
import { drawCode, drawGameOver } from './render';
import { createRoutes } from './route';
import type { Route } from './route';
import { sellReleasedCode } from './sales';
import { INITIAL_SCORE } from './score';

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
    drawGameOver: vi.fn(),
  };
});

// updateCodes() からリリース精算・倒産判定までに触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type FakeActiveCode = FlowingCode & { readonly graphics: FakeGraphics };
type EmitCall = { readonly event: string; readonly payload: object };
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
  placedItems: readonly PlacedItem[];
  funds: number;
  score: number;
  gameOver: GameOverState;
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  tweens: { readonly pauseAll: Mock<() => void> };
  cameras: { readonly main: { readonly flash: Mock<(duration: number, r: number, g: number, b: number) => void> } };
  time: { readonly now: number };
  updateCodes(delta: number): void;
  onCodeReleased(payload: CodeReleasedPayload): void;
  onFundsChanged(event: FundsChangedEvent): void;
};

// リリース地点まで1回で届く十分に大きい経過ミリ秒。
const RELEASE_DELTA_MS = 1e9;
const route = createRoutes(ENGINEER_SPAWN_CELLS, () => 0)[0];

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
  vi.mocked(drawGameOver).mockClear();
});

// emit は呼び出しを記録し、create() で登録するリスナーのうちリリース精算と倒産判定に関わるものへ渡す。
const createScene = (funds: number, emitted: EmitCall[]): SceneUnderTest => {
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
  scene.placedItems = [];
  scene.funds = funds;
  scene.score = INITIAL_SCORE;
  scene.gameOver = INITIAL_GAME_OVER_STATE;
  scene.tweens = { pauseAll: vi.fn<() => void>() };
  scene.cameras = { main: { flash: vi.fn<(duration: number, r: number, g: number, b: number) => void>() } };
  scene.time = { now: 1000 };
  scene.events = {
    emit: vi.fn<(event: string, payload: object) => boolean>((event, payload) => {
      emitted.push({ event, payload });
      if (event === CODE_RELEASED_EVENT && 'kind' in payload) {
        scene.onCodeReleased(payload as CodeReleasedPayload);
      }
      if (event === FUNDS_CHANGED_EVENT && 'current' in payload) {
        scene.onFundsChanged(payload as FundsChangedEvent);
      }
      return true;
    }),
  };
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

// 実際の生成ブロックでコードを1つ生成し、ルートを外して（追加の生成をさせずに）リリース地点まで進める。
const spawnAndRelease = (scene: SceneUnderTest, random: readonly number[]): void => {
  seedRandom(random);
  scene.updateCodes(0);
  expect(scene.codes).toHaveLength(1);
  scene.routes = [];
  scene.updateCodes(RELEASE_DELTA_MS);
  expect(scene.codes).toHaveLength(0);
};

const payloadsOf = (emitted: readonly EmitCall[], event: string): object[] =>
  emitted.filter((call) => call.event === event).map((call) => call.payload);

// 乱数 [0, 0] で不正コード・クリティカルが生成される（securityScannerScene.test.ts と同じ固定値）。
const CRITICAL_RANDOM = [0, 0] as const;
const CRITICAL: MaliciousCodeType = 'vulnerabilityCritical';
// config から求めたクリティカルの損害額（円）。
const criticalDamage = MALICIOUS_CODE_PARAMS[CRITICAL].damage * INCIDENT_DAMAGE_UNIT_YEN;
const defaultDamage = INCIDENT_DEFAULT_DAMAGE_POINTS * INCIDENT_DAMAGE_UNIT_YEN;

describe('MainScene: 種別付きの不正コードのリリースで種別ごとの損害を引く', () => {
  it('前提: クリティカルの損害は config の損害ポイントから求まり、既定の損害とは異なる', () => {
    expect(incidentDamage(CRITICAL)).toBe(criticalDamage);
    expect(criticalDamage).not.toBe(defaultDamage);
  });

  it('リリースのペイロードに種別が入り、資金はクリティカルの損害ぶん減る', () => {
    const emitted: EmitCall[] = [];
    const funds = criticalDamage * 3;
    const scene = createScene(funds, emitted);

    spawnAndRelease(scene, CRITICAL_RANDOM);

    expect(payloadsOf(emitted, CODE_RELEASED_EVENT)).toEqual([
      { id: 0, kind: 'malicious', routeId: route.id, maliciousType: CRITICAL },
    ]);
    expect(scene.funds).toBe(funds - criticalDamage);
    expect(payloadsOf(emitted, INCIDENT_EVENT)).toEqual([
      { codeId: 0, maliciousType: CRITICAL, damage: criticalDamage, fundsBefore: funds, fundsAfter: funds - criticalDamage },
    ]);
    expect(scene.gameOver.over).toBe(false);
  });

  it('資金がクリティカルの損害ちょうどなら資金は 0 になり、既存の倒産ルールどおりに判定する', () => {
    const emitted: EmitCall[] = [];
    const scene = createScene(criticalDamage, emitted);

    spawnAndRelease(scene, CRITICAL_RANDOM);

    expect(scene.funds).toBe(0);
    const bankrupt = isBankrupt(0);
    expect(scene.gameOver.over).toBe(bankrupt);
    expect(payloadsOf(emitted, GAME_OVER_EVENT)).toHaveLength(bankrupt ? 1 : 0);
    expect(vi.mocked(drawGameOver)).toHaveBeenCalledTimes(bankrupt ? 1 : 0);
  });

  it('資金がクリティカルの損害より 1 円多ければ資金 1 円で倒産しない', () => {
    const emitted: EmitCall[] = [];
    const scene = createScene(criticalDamage + 1, emitted);

    spawnAndRelease(scene, CRITICAL_RANDOM);

    expect(scene.funds).toBe(1);
    expect(scene.gameOver.over).toBe(false);
    expect(payloadsOf(emitted, GAME_OVER_EVENT)).toHaveLength(0);
  });

  it('既定の損害なら生き残る資金でも、クリティカルの損害では倒産する', () => {
    const emitted: EmitCall[] = [];
    const scene = createScene(defaultDamage + 1, emitted);
    expect(defaultDamage + 1).toBeLessThanOrEqual(criticalDamage);

    spawnAndRelease(scene, CRITICAL_RANDOM);

    expect(scene.funds).toBe(defaultDamage + 1 - criticalDamage);
    expect(scene.gameOver.over).toBe(true);
  });
});

describe('MainScene: 種別のないコードのリリースは従来どおり', () => {
  it('種別を持たない不正コードは既定の損害を引く', () => {
    const emitted: EmitCall[] = [];
    const funds = defaultDamage * 3;
    const scene = createScene(funds, emitted);
    scene.routes = [];
    scene.codes = [{ ...spawnCode(0, 'malicious', route), graphics: createFakeGraphics() }];
    scene.codeHp.set(0, 1);

    scene.updateCodes(RELEASE_DELTA_MS);

    expect(payloadsOf(emitted, CODE_RELEASED_EVENT)).toEqual([
      { id: 0, kind: 'malicious', routeId: route.id, maliciousType: undefined },
    ]);
    expect(scene.funds).toBe(funds - defaultDamage);
    expect(payloadsOf(emitted, INCIDENT_EVENT)).toEqual([
      { codeId: 0, maliciousType: undefined, damage: defaultDamage, fundsBefore: funds, fundsAfter: funds - defaultDamage },
    ]);
  });

  it('通常生成の正常なコードは種別を持たず、売上だけが入って障害にならない', () => {
    const emitted: EmitCall[] = [];
    const funds = defaultDamage;
    const scene = createScene(funds, emitted);

    spawnAndRelease(scene, [1 - 1e-9]);

    expect(payloadsOf(emitted, CODE_RELEASED_EVENT)).toEqual([
      { id: 0, kind: 'normal', routeId: route.id, maliciousType: undefined },
    ]);
    expect(scene.funds).toBe(sellReleasedCode(funds, 'normal', REVENUE_PER_NORMAL_CODE, DEFAULT_REFACTORING_RATIO));
    expect(payloadsOf(emitted, INCIDENT_EVENT)).toHaveLength(0);
    expect(scene.gameOver.over).toBe(false);
  });
});
