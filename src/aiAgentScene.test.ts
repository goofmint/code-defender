// 実際の MainScene.buyAiAgent() で、選択中のエンジニア（または指定したエンジニア #156）に AIエージェントを付けたときの資金・イベント・表示を確かめる(#53)。
// main.ts は読み込み時に new Phaser.Game(config) を実行するので、vacationNeutrality.test.ts と同じくこのファイルの中だけで phaser をモックする。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { AI_AGENT_EQUIPPED_EVENT, getAiAgentMonthlyFee, getAiAgentPrice } from './aiAgent';
import type { AiAgentType } from './aiAgent';
import { ENGINEER_MONTHLY_SALARY_BY_RANK, INITIAL_FUNDS } from './config';
import { createEngineerParameters } from './engineer';
import type { Engineer, EngineerRank } from './engineer';
import { createFundsChangedEvent, FUNDS_CHANGED_EVENT } from './funds';
import type { GameOverState } from './gameOver';

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

// drawHireMessage が使う Text の最小限の形。
type FakeText = {
  readonly setDepth: Mock<(depth: number) => FakeText>;
  readonly setText: Mock<(text: string) => void>;
  readonly destroy: Mock<() => void>;
};

// buyAiAgent() が触る MainScene の private メンバーだけを表す型。キャストはこのテストファイルの中に閉じる。
type SceneUnderTest = {
  funds: number;
  engineers: Engineer[];
  selectedEngineerId: number | null;
  gameOver: GameOverState;
  events: { readonly emit: Mock<(event: string, payload: object) => boolean> };
  // 右下の指標(#156)。資金と月末に支払うお金（AIエージェントの月額を含む）の更新を記録する。
  statusPanel: { readonly setFunds: Mock<(funds: number) => void>; readonly setMonthEndPayment: Mock<(amount: number) => void> };
  // メニュー・ポップオーバー(#156)は閉じた状態（クラスのフィールドの初期値は Object.create では入らないので明示する）。
  openMenu: null;
  popoverRouteId: null;
  phase: 'playing';
  placedItems: readonly [];
  hireMessageText: FakeText | undefined;
  add: { readonly text: Mock<(x: number, y: number, text: string) => FakeText> };
  time: { readonly delayedCall: Mock<(delay: number, callback: () => void) => void> };
  buyAiAgent(agentType: AiAgentType, engineerId?: number): void;
};

const makeFakeText = (): FakeText => {
  const text: FakeText = {
    setDepth: vi.fn<(depth: number) => FakeText>(() => text),
    setText: vi.fn<(value: string) => void>(),
    destroy: vi.fn<() => void>(),
  };
  return text;
};

// src/engineer.test.ts の makeEngineer と同じ形。
const makeEngineer = (
  id: number,
  rank: EngineerRank,
  routeId: number | null,
  aiAgent: AiAgentType | null = null,
): Engineer => ({
  id,
  rank,
  routeId,
  personality: 'meticulous',
  onVacation: false,
  vacationRateReduction: 0,
  salary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  initialSalary: ENGINEER_MONTHLY_SALARY_BY_RANK[rank],
  aiAgent,
  ...createEngineerParameters(rank, 'meticulous'),
});

const NOT_OVER: GameOverState = { over: false, at: null };
const OVER: GameOverState = { over: true, at: 1000 };

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

type SceneOptions = {
  readonly funds?: number;
  readonly engineers?: Engineer[];
  readonly selectedEngineerId?: number | null;
  readonly gameOver?: GameOverState;
};

const createScene = (options: SceneOptions = {}): SceneUnderTest => {
  const scene: SceneUnderTest = Object.create(mainScenePrototype);
  scene.funds = options.funds ?? INITIAL_FUNDS;
  scene.engineers = options.engineers ?? [makeEngineer(0, 'junior', 0), makeEngineer(1, 'middle', 1)];
  scene.selectedEngineerId = options.selectedEngineerId === undefined ? 0 : options.selectedEngineerId;
  scene.gameOver = options.gameOver ?? NOT_OVER;
  scene.events = { emit: vi.fn<(event: string, payload: object) => boolean>(() => true) };
  scene.statusPanel = { setFunds: vi.fn<(funds: number) => void>(), setMonthEndPayment: vi.fn<(amount: number) => void>() };
  scene.openMenu = null;
  scene.popoverRouteId = null;
  scene.phase = 'playing';
  scene.placedItems = [];
  scene.hireMessageText = undefined;
  scene.add = { text: vi.fn<(x: number, y: number, text: string) => FakeText>(() => makeFakeText()) };
  scene.time = { delayedCall: vi.fn<(delay: number, callback: () => void) => void>() };
  return scene;
};

const messageOf = (scene: SceneUnderTest): string | undefined => scene.add.text.mock.calls[0]?.[2];

describe('MainScene.buyAiAgent: 成功', () => {
  it('選択中のエンジニアに付け、資金を価格ぶん減らし、FUNDS_CHANGED_EVENT と AI_AGENT_EQUIPPED_EVENT を発行する', () => {
    const price = getAiAgentPrice('strong');
    const scene = createScene({ funds: price + 1, selectedEngineerId: 1 });

    scene.buyAiAgent('strong');

    expect(scene.funds).toBe(1);
    expect(scene.engineers.map((engineer) => engineer.aiAgent)).toEqual([null, 'strong']);
    expect(scene.events.emit).toHaveBeenNthCalledWith(1, FUNDS_CHANGED_EVENT, createFundsChangedEvent(price + 1, 1, 'aiAgent'));
    expect(scene.events.emit).toHaveBeenNthCalledWith(2, AI_AGENT_EQUIPPED_EVENT, {
      engineerId: 1,
      agentType: 'strong',
      price,
      replaced: null,
    });
    expect(scene.statusPanel.setFunds).toHaveBeenCalledExactlyOnceWith(1);
    // 月末に支払うお金は給料 2 人分と付けた AIエージェントの月額(#156)。
    expect(scene.statusPanel.setMonthEndPayment).toHaveBeenCalledExactlyOnceWith(
      ENGINEER_MONTHLY_SALARY_BY_RANK.junior + ENGINEER_MONTHLY_SALARY_BY_RANK.middle + getAiAgentMonthlyFee('strong'),
    );
    expect(messageOf(scene)).toBe('AI(強い)を付けました');
  });

  it('エンジニアの id を渡すと、選択中のエンジニアではなくその人に付ける(#156、ポップオーバー)', () => {
    const scene = createScene({ selectedEngineerId: 0 });

    scene.buyAiAgent('normal', 1);

    expect(scene.engineers.map((engineer) => engineer.aiAgent)).toEqual([null, 'normal']);
    expect(scene.selectedEngineerId).toBe(0);
    expect(scene.events.emit).toHaveBeenLastCalledWith(AI_AGENT_EQUIPPED_EVENT, {
      engineerId: 1,
      agentType: 'normal',
      price: getAiAgentPrice('normal'),
      replaced: null,
    });
  });

  it('渡した id のエンジニアが名簿にいなければ、選択中のエンジニアにも付けない(#156)', () => {
    const scene = createScene({ selectedEngineerId: 0 });
    const before = structuredClone(scene.engineers);

    scene.buyAiAgent('normal', 99);

    expect(scene.engineers).toEqual(before);
    expect(scene.funds).toBe(INITIAL_FUNDS);
    expect(messageOf(scene)).toBe('対象のエンジニアがいません');
  });

  it('資金がちょうど価格なら付けられて 0 になる', () => {
    const price = getAiAgentPrice('cheap');
    const scene = createScene({ funds: price });

    scene.buyAiAgent('cheap');

    expect(scene.funds).toBe(0);
    expect(scene.engineers[0]?.aiAgent).toBe('cheap');
  });

  it('付け替えでは replaced に前の種類が入り、新しい価格を引く', () => {
    const scene = createScene({ engineers: [makeEngineer(0, 'junior', 0, 'cheap')] });

    scene.buyAiAgent('normal');

    expect(scene.funds).toBe(INITIAL_FUNDS - getAiAgentPrice('normal'));
    expect(scene.events.emit).toHaveBeenLastCalledWith(AI_AGENT_EQUIPPED_EVENT, {
      engineerId: 0,
      agentType: 'normal',
      price: getAiAgentPrice('normal'),
      replaced: 'cheap',
    });
  });
});

describe('MainScene.buyAiAgent: 副作用なし', () => {
  const expectNoSideEffects = (scene: SceneUnderTest, funds: number, engineers: readonly Engineer[]): void => {
    expect(scene.funds).toBe(funds);
    expect(scene.engineers).toEqual(engineers);
    expect(scene.events.emit).not.toHaveBeenCalled();
    expect(scene.statusPanel.setFunds).not.toHaveBeenCalled();
    expect(scene.statusPanel.setMonthEndPayment).not.toHaveBeenCalled();
  };

  it('ゲームオーバー中は何もしない（メッセージも出さない）', () => {
    const scene = createScene({ gameOver: OVER });
    const before = structuredClone(scene.engineers);

    scene.buyAiAgent('strong');

    expectNoSideEffects(scene, INITIAL_FUNDS, before);
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it.each([null, 99])('選択中のエンジニアがいない（%s）なら付けず、メッセージを出す', (selectedEngineerId) => {
    const scene = createScene({ selectedEngineerId });
    const before = structuredClone(scene.engineers);

    scene.buyAiAgent('strong');

    expectNoSideEffects(scene, INITIAL_FUNDS, before);
    expect(messageOf(scene)).toBe('対象のエンジニアがいません');
  });

  it('資金が価格 −1 なら資金は変わらず、メッセージを出す', () => {
    const funds = getAiAgentPrice('strong') - 1;
    const scene = createScene({ funds });
    const before = structuredClone(scene.engineers);

    scene.buyAiAgent('strong');

    expectNoSideEffects(scene, funds, before);
    expect(messageOf(scene)).toBe('資金が足りません');
  });

  it('同じ種類を付けていれば資金は変わらない', () => {
    const scene = createScene({ engineers: [makeEngineer(0, 'junior', 0, 'strong')] });
    const before = structuredClone(scene.engineers);

    scene.buyAiAgent('strong');

    expectNoSideEffects(scene, INITIAL_FUNDS, before);
    expect(messageOf(scene)).toBe('同じAIエージェントを付けています');
  });
});
