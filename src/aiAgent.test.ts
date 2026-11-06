import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import {
  AI_AGENT_DEFINITIONS,
  AI_AGENT_EQUIPPED_EVENT,
  AI_AGENT_TYPES,
  aiAgentMaliciousRateModifiers,
  aiAgentSpawnIntervalMs,
  equipAiAgent,
  formatAiAgentMessage,
  formatAiAgentOption,
  getAiAgentLabel,
  getAiAgentMonthlyFee,
  getAiAgentPrice,
  isAiAgentType,
} from './aiAgent';
import type { AiAgentType } from './aiAgent';
import {
  AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE,
  AI_AGENT_PRICE_TIER_BY_TYPE,
  AI_AGENT_PRICE_TIERS,
  AI_AGENT_SHORT_NAMES,
  AI_AGENT_SPAWN_INTERVAL_MULTIPLIER_BY_TYPE,
  CODE_SPAWN_INTERVAL_MIN_MS,
  CODE_SPAWN_INTERVAL_MS,
  ENGINEER_RANKS,
  ITEM_PRICE_TIERS,
  MALICIOUS_RATE_STEP_MS,
  VACATION_MALICIOUS_RATE_REDUCTION,
} from './config';
import { initialSpawnElapsed, pickCodeKind, stepSpawnTimerUnlessPaused } from './codeFlow';
import { effectiveMaliciousRate, maliciousRateForRank, vacationMaliciousRateModifiers } from './difficulty';
import { createEngineerParameters, getInitialSalary, setEngineerVacation } from './engineer';
import type { Engineer, EngineerRank } from './engineer';

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
  salary: getInitialSalary(rank),
  initialSalary: getInitialSalary(rank),
  aiAgent,
  ...createEngineerParameters(rank, 'meticulous'),
});

// AIエージェントの価格はアイテムの半額化(#164)の対象外で、半額前のまま（強い 10万・普通 5万・安い 2.5万）。
const PRICES: Readonly<Record<AiAgentType, number>> = {
  strong: 100000,
  normal: 50000,
  cheap: 25000,
};
const RICH = 1_000_000_000;
const ACTIVE = { funds: RICH, gameOver: false } as const;

describe('AIエージェントの種類と定義', () => {
  it('強い・普通・安いの3種で、すべて月額払い（攻撃しないので range・power を持たない）', () => {
    expect(AI_AGENT_TYPES).toEqual(['strong', 'normal', 'cheap']);
    for (const type of AI_AGENT_TYPES) {
      expect(AI_AGENT_DEFINITIONS[type].payment).toBe('monthly');
      expect(Object.keys(AI_AGENT_DEFINITIONS[type]).sort()).toEqual(['payment']);
    }
  });

  it.each([
    ['strong', true],
    ['cheap', true],
    ['codeRabbit', false],
    ['', false],
  ])('isAiAgentType(%s) = %s', (value, expected) => {
    expect(isAiAgentType(value)).toBe(expected);
  });

  it('イベント名', () => {
    expect(AI_AGENT_EQUIPPED_EVENT).toBe('ai-agent-equipped');
  });

});

describe('getAiAgentPrice / getAiAgentMonthlyFee', () => {
  it.each(AI_AGENT_TYPES)('%s の価格は段階表どおり、月額は価格 × 1', (type) => {
    expect(getAiAgentPrice(type)).toBe(PRICES[type]);
    expect(getAiAgentMonthlyFee(type)).toBe(PRICES[type]);
  });

  it('価格の段階表は AI_AGENT_PRICE_TIERS で、半額にしたアイテムの ITEM_PRICE_TIERS のちょうど2倍(#164)', () => {
    expect(AI_AGENT_PRICE_TIERS).toEqual({ cheap: 25000, normal: 50000, expensive: 100000 });
    expect(ITEM_PRICE_TIERS).toEqual({ cheap: 12500, normal: 25000, expensive: 50000 });
    for (const type of AI_AGENT_TYPES) {
      expect(getAiAgentPrice(type)).toBe(AI_AGENT_PRICE_TIERS[AI_AGENT_PRICE_TIER_BY_TYPE[type]]);
      expect(getAiAgentPrice(type)).toBe(ITEM_PRICE_TIERS[AI_AGENT_PRICE_TIER_BY_TYPE[type]] * 2);
    }
  });

  it('強い > 普通 > 安い', () => {
    expect(getAiAgentPrice('strong')).toBeGreaterThan(getAiAgentPrice('normal'));
    expect(getAiAgentPrice('normal')).toBeGreaterThan(getAiAgentPrice('cheap'));
  });

  it('段階表を差し替えられる', () => {
    expect(getAiAgentPrice('cheap', { cheap: 1, normal: 2, expensive: 3 })).toBe(1);
    expect(getAiAgentPrice('cheap', AI_AGENT_PRICE_TIERS, { strong: 'cheap', normal: 'cheap', cheap: 'expensive' })).toBe(
      AI_AGENT_PRICE_TIERS.expensive,
    );
  });

  it.each([
    [0, 0],
    [0.5, PRICES.strong / 2],
    [1.5, PRICES.strong * 1.5],
    [-1, 0],
    [Number.NaN, 0],
    [Infinity, 0],
  ])('ratio %d の強いの月額は %d', (ratio, expected) => {
    expect(getAiAgentMonthlyFee('strong', ratio)).toBe(expected);
  });

  it('端数は四捨五入する（安い 25000 × 0.00002 = 0.5 → 1、× 0.0000198 = 0.495 → 0）', () => {
    expect(getAiAgentMonthlyFee('cheap', 0.5 / PRICES.cheap)).toBe(1);
    expect(getAiAgentMonthlyFee('cheap', 0.495 / PRICES.cheap)).toBe(0);
  });

  it('ポップオーバーのボタンの文言は月額（精算と同じ計算）で、キー名は出さない(#156)', () => {
    expect(formatAiAgentOption('strong')).toBe(`AI 強い ${PRICES.strong / 10000}万/月`);
    expect(formatAiAgentOption('cheap')).toBe(`AI 安い ${PRICES.cheap / 10000}万/月`);
    expect(formatAiAgentOption('normal', 0.5)).toBe(`AI 普通 ${PRICES.normal / 2 / 10000}万/月`);
  });
});

describe('equipAiAgent: 資金の境界', () => {
  const engineers = [makeEngineer(0, 'junior', 0)];

  it.each(AI_AGENT_TYPES.flatMap((type) => [
    [type, -1, false],
    [type, 0, true],
    [type, 1, true],
  ] as const))('%s: 資金 価格%+d → 成功 = %s', (type, offset, ok) => {
    const result = equipAiAgent(engineers, 0, type, { funds: PRICES[type] + offset, gameOver: false });
    if (!ok) {
      expect(result).toEqual({ ok: false, reason: 'insufficientFunds' });
      return;
    }
    expect(result).toEqual({
      ok: true,
      engineers: [{ ...engineers[0], aiAgent: type }],
      fundsAfter: offset,
      price: PRICES[type],
      replaced: null,
    });
  });
});

describe('equipAiAgent: 失敗の理由と判定順', () => {
  const engineers = [makeEngineer(0, 'junior', 0, 'normal'), makeEngineer(1, 'middle', 1)];

  it('ゲームオーバー中は他の条件より先に gameOver', () => {
    expect(equipAiAgent(engineers, null, 'unknown', { funds: 0, gameOver: true })).toEqual({
      ok: false,
      reason: 'gameOver',
    });
    expect(equipAiAgent(engineers, 1, 'strong', { funds: RICH, gameOver: true })).toEqual({
      ok: false,
      reason: 'gameOver',
    });
  });

  it('不明な種類はエンジニアの有無より先に unknownAgent', () => {
    expect(equipAiAgent(engineers, null, 'codeRabbit', { funds: 0, gameOver: false })).toEqual({
      ok: false,
      reason: 'unknownAgent',
    });
  });

  it.each([null, 99])('エンジニア %s は engineerNotFound（資金不足より先）', (id) => {
    expect(equipAiAgent(engineers, id, 'strong', { funds: 0, gameOver: false })).toEqual({
      ok: false,
      reason: 'engineerNotFound',
    });
  });

  it('名簿が空なら engineerNotFound', () => {
    expect(equipAiAgent([], 0, 'strong', ACTIVE)).toEqual({ ok: false, reason: 'engineerNotFound' });
  });

  it('同じ種類を付けていれば資金不足より先に alreadyEquipped', () => {
    expect(equipAiAgent(engineers, 0, 'normal', { funds: 0, gameOver: false })).toEqual({
      ok: false,
      reason: 'alreadyEquipped',
    });
  });

  it('失敗しても入力を変更しない', () => {
    const snapshot = structuredClone(engineers);
    equipAiAgent(engineers, 0, 'normal', ACTIVE);
    equipAiAgent(engineers, 1, 'strong', { funds: 0, gameOver: false });
    expect(engineers).toEqual(snapshot);
  });
});

describe('equipAiAgent: 付け替え・不変性・休暇中と未割当', () => {
  it('別の種類へ付け替えると replaced に前の種類が入り、返金しない（新しい価格を満額引く）', () => {
    const engineers = [makeEngineer(0, 'junior', 0, 'strong')];
    const result = equipAiAgent(engineers, 0, 'cheap', { funds: PRICES.cheap, gameOver: false });
    expect(result).toEqual({
      ok: true,
      engineers: [{ ...engineers[0], aiAgent: 'cheap' }],
      fundsAfter: 0,
      price: PRICES.cheap,
      replaced: 'strong',
    });
  });

  it('対象だけを置き換えた新しい配列を返し、他のエンジニアは同じ参照のまま。入力は変更しない', () => {
    const engineers = [makeEngineer(0, 'junior', 0), makeEngineer(1, 'middle', 1), makeEngineer(2, 'senior', 2)];
    const snapshot = structuredClone(engineers);
    const result = equipAiAgent(engineers, 1, 'normal', ACTIVE);
    if (!result.ok) throw new Error('装着に失敗した');
    expect(result.engineers).not.toBe(engineers);
    expect(result.engineers[0]).toBe(engineers[0]);
    expect(result.engineers[2]).toBe(engineers[2]);
    expect(result.engineers[1]).toEqual({ ...engineers[1], aiAgent: 'normal' });
    expect(engineers).toEqual(snapshot);
  });

  it('休暇中のエンジニアにも付けられ、休暇状態は変わらない', () => {
    const engineers = setEngineerVacation([makeEngineer(0, 'junior', 0)], 0, true);
    const result = equipAiAgent(engineers, 0, 'strong', ACTIVE);
    if (!result.ok) throw new Error('装着に失敗した');
    expect(result.engineers[0]?.onVacation).toBe(true);
    expect(result.engineers[0]?.aiAgent).toBe('strong');
  });

  it('ルート未割当のエンジニアにも付けられ、routeId は null のまま', () => {
    const result = equipAiAgent([makeEngineer(5, 'senior', null)], 5, 'cheap', ACTIVE);
    if (!result.ok) throw new Error('装着に失敗した');
    expect(result.engineers[0]?.routeId).toBeNull();
    expect(result.engineers[0]?.aiAgent).toBe('cheap');
  });
});

describe('formatAiAgentMessage', () => {
  const engineers = [makeEngineer(0, 'junior', 0, 'strong')];

  it('成功・付け替え・各失敗', () => {
    expect(formatAiAgentMessage(equipAiAgent([makeEngineer(0, 'junior', 0)], 0, 'cheap', ACTIVE), 'cheap')).toBe(
      'AI(安い)を付けました',
    );
    expect(formatAiAgentMessage(equipAiAgent(engineers, 0, 'normal', ACTIVE), 'normal')).toBe(
      'AI(強い)を AI(普通)に付け替えました',
    );
    expect(formatAiAgentMessage({ ok: false, reason: 'gameOver' }, 'strong')).toBe('');
    expect(formatAiAgentMessage({ ok: false, reason: 'unknownAgent' }, 'foo')).toBe('不明なAIエージェントです: foo');
    expect(formatAiAgentMessage({ ok: false, reason: 'engineerNotFound' }, 'strong')).toBe('対象のエンジニアがいません');
    expect(formatAiAgentMessage({ ok: false, reason: 'alreadyEquipped' }, 'strong')).toBe(
      '同じAIエージェントを付けています',
    );
    expect(formatAiAgentMessage({ ok: false, reason: 'insufficientFunds' }, 'strong')).toBe('資金が足りません');
  });

  it('成功の結果に不明な種類を渡したら例外を投げる', () => {
    const result = equipAiAgent([makeEngineer(0, 'junior', 0)], 0, 'cheap', ACTIVE);
    expect(() => formatAiAgentMessage(result, 'foo')).toThrow('不明なAIエージェント');
  });
});

describe('aiAgentSpawnIntervalMs: コード生成間隔', () => {
  it('担当者がいない・付けていないなら基準の間隔のまま', () => {
    expect(aiAgentSpawnIntervalMs(undefined, CODE_SPAWN_INTERVAL_MS)).toBe(CODE_SPAWN_INTERVAL_MS);
    expect(aiAgentSpawnIntervalMs(makeEngineer(0, 'junior', 0), CODE_SPAWN_INTERVAL_MS)).toBe(CODE_SPAWN_INTERVAL_MS);
  });

  it.each(AI_AGENT_TYPES)('%s は基準の間隔 × 倍率', (type) => {
    expect(aiAgentSpawnIntervalMs(makeEngineer(0, 'junior', 0, type), CODE_SPAWN_INTERVAL_MS)).toBe(
      CODE_SPAWN_INTERVAL_MS * AI_AGENT_SPAWN_INTERVAL_MULTIPLIER_BY_TYPE[type],
    );
  });

  it.each([0, -0.5, Number.NaN, Infinity, -Infinity])('倍率 %d は 1 として扱う（効果なし）', (multiplier) => {
    const table = { strong: multiplier, normal: multiplier, cheap: multiplier };
    expect(aiAgentSpawnIntervalMs(makeEngineer(0, 'junior', 0, 'strong'), CODE_SPAWN_INTERVAL_MS, table)).toBe(
      CODE_SPAWN_INTERVAL_MS,
    );
  });

  // 倍率 0.5 で、掛けた値が 下限-1 / 下限 / 下限+1 になる基準の間隔。
  it.each([
    [(CODE_SPAWN_INTERVAL_MIN_MS - 1) * 2, CODE_SPAWN_INTERVAL_MIN_MS],
    [CODE_SPAWN_INTERVAL_MIN_MS * 2, CODE_SPAWN_INTERVAL_MIN_MS],
    [(CODE_SPAWN_INTERVAL_MIN_MS + 1) * 2, CODE_SPAWN_INTERVAL_MIN_MS + 1],
  ])('基準 %d ms × 0.5 は下限で止まる（→ %d ms）', (baseMs, expected) => {
    const table = { strong: 0.5, normal: 0.5, cheap: 0.5 };
    expect(aiAgentSpawnIntervalMs(makeEngineer(0, 'junior', 0, 'normal'), baseMs, table)).toBe(expected);
  });

  it('技術的負債で延びた間隔（基準）にも倍率を掛ける', () => {
    const debtAdjusted = CODE_SPAWN_INTERVAL_MS * 2;
    expect(aiAgentSpawnIntervalMs(makeEngineer(0, 'junior', 0, 'cheap'), debtAdjusted)).toBe(
      debtAdjusted * AI_AGENT_SPAWN_INTERVAL_MULTIPLIER_BY_TYPE.cheap,
    );
  });
});

describe('aiAgentSpawnIntervalMs × stepSpawnTimerUnlessPaused: 生成タイマー', () => {
  const engineer = makeEngineer(0, 'junior', 0, 'strong');
  const interval = aiAgentSpawnIntervalMs(engineer, CODE_SPAWN_INTERVAL_MS);

  it.each([
    [interval - 1, false, interval - 1],
    [interval, true, 0],
    [interval + 1, true, 1],
  ])('経過 0 から %d ms 進めると生成 = %s・経過 %d', (delta, spawn, elapsed) => {
    expect(stepSpawnTimerUnlessPaused(0, delta, interval, false)).toEqual({ elapsedMs: elapsed, spawn });
  });

  it('新しいルートの初期値は短くなった間隔と同じで、最初の更新ですぐ生成する', () => {
    expect(stepSpawnTimerUnlessPaused(initialSpawnElapsed(interval), 0, interval, false).spawn).toBe(true);
  });

  it('装着直後（間隔が短くなった直後）も保存済みの経過時間から続ける', () => {
    const saved = stepSpawnTimerUnlessPaused(0, interval / 2, CODE_SPAWN_INTERVAL_MS, false).elapsedMs;
    expect(stepSpawnTimerUnlessPaused(saved, interval / 2 - 1, interval, false)).toEqual({
      elapsedMs: interval - 1,
      spawn: false,
    });
    expect(stepSpawnTimerUnlessPaused(saved, interval / 2, interval, false)).toEqual({ elapsedMs: 0, spawn: true });
  });

  it('担当者が休暇中ならタイマーは止まったまま（付けていても生成しない）', () => {
    expect(stepSpawnTimerUnlessPaused(interval - 1, interval * 3, interval, true)).toEqual({
      elapsedMs: interval - 1,
      spawn: false,
    });
  });
});

describe('aiAgentMaliciousRateModifiers: 不正コード率の補正', () => {
  it('担当者がいない・付けていない・差分 0（強い）なら空配列', () => {
    expect(aiAgentMaliciousRateModifiers(undefined)).toEqual([]);
    expect(aiAgentMaliciousRateModifiers(makeEngineer(0, 'junior', 0))).toEqual([]);
    expect(AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE.strong).toBe(0);
    expect(aiAgentMaliciousRateModifiers(makeEngineer(0, 'junior', 0, 'strong'))).toEqual([]);
  });

  it.each(['normal', 'cheap'] as const)('%s は差分1つ', (type) => {
    expect(aiAgentMaliciousRateModifiers(makeEngineer(0, 'junior', 0, type))).toEqual([
      AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE[type],
    ]);
  });

  it('強い ≦ 普通 ≦ 安い の順に不正コードを混ぜやすい', () => {
    const { strong, normal, cheap } = AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE;
    expect(strong).toBeLessThan(normal);
    expect(normal).toBeLessThan(cheap);
  });

  it.each([Number.NaN, Infinity, -Infinity])('差分 %d は空配列', (value) => {
    const table = { strong: value, normal: value, cheap: value };
    expect(aiAgentMaliciousRateModifiers(makeEngineer(0, 'junior', 0, 'cheap'), table)).toEqual([]);
  });

  it('休暇の補正と連結すると [休暇, AI] の順で、合計が率に反映される', () => {
    const engineer = { ...makeEngineer(0, 'middle', 0, 'cheap'), vacationRateReduction: VACATION_MALICIOUS_RATE_REDUCTION };
    const modifiers = [...vacationMaliciousRateModifiers(engineer), ...aiAgentMaliciousRateModifiers(engineer)];
    expect(modifiers).toEqual([-VACATION_MALICIOUS_RATE_REDUCTION, AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE.cheap]);
    expect(effectiveMaliciousRate('middle', 0, modifiers)).toBeCloseTo(
      maliciousRateForRank('middle', 0) - VACATION_MALICIOUS_RATE_REDUCTION + AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE.cheap,
    );
  });

  it('ランク表の上限（シニア）を補正後に超えてもよい（上限は再適用しない）', () => {
    const senior = ENGINEER_RANKS.find((entry) => entry.id === 'senior');
    if (senior === undefined) throw new Error('シニアがランク表にない');
    // 不正コード率の段階間隔（#150）の 1000 倍。全ランクが上限に達した後。
    const late = MALICIOUS_RATE_STEP_MS * 1000;
    expect(maliciousRateForRank('senior', late)).toBeCloseTo(senior.maliciousRateMax);
    const rate = effectiveMaliciousRate(
      'senior',
      late,
      aiAgentMaliciousRateModifiers(makeEngineer(0, 'senior', 0, 'cheap')),
    );
    expect(rate).toBeCloseTo(senior.maliciousRateMax + AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE.cheap);
    expect(rate).toBeGreaterThan(senior.maliciousRateMax);
  });

  it.each([
    ['ちょうど 1', 0],
    ['1 を超える', 0.01],
  ])('補正後が%sなら 1 に収まる', (_name, extra) => {
    const base = maliciousRateForRank('junior', 0);
    const table = { strong: 1 - base + extra, normal: 0, cheap: 0 };
    expect(effectiveMaliciousRate('junior', 0, aiAgentMaliciousRateModifiers(makeEngineer(0, 'junior', 0, 'strong'), table))).toBe(1);
  });

  it('pickCodeKind は補正後の率 −ε で不正、ちょうどで正常', () => {
    const rate = effectiveMaliciousRate('junior', 0, aiAgentMaliciousRateModifiers(makeEngineer(0, 'junior', 0, 'normal')));
    expect(pickCodeKind(() => rate - 1e-9, rate)).toBe('malicious');
    expect(pickCodeKind(() => rate, rate)).toBe('normal');
  });
});

describe('AIエージェントの表示名 #158', () => {
  it('日本語の正式名称と短い名前', () => {
    expect(AI_AGENT_TYPES.map((type) => getAiAgentLabel(type))).toEqual([
      'AIコーディングエージェント（強い）',
      'AIコーディングエージェント（普通）',
      'AIコーディングエージェント（安い）',
    ]);
    expect(AI_AGENT_TYPES.map((type) => AI_AGENT_SHORT_NAMES[type])).toEqual(['強い', '普通', '安い']);
  });

  describe('英語', () => {
    beforeEach(() => {
      setLocale('en');
    });
    afterEach(() => {
      setLocale('ja');
    });

    it('正式名称と短い名前', () => {
      expect(AI_AGENT_TYPES.map((type) => getAiAgentLabel(type))).toEqual([
        'AI coding agent (strong)',
        'AI coding agent (standard)',
        'AI coding agent (budget)',
      ]);
      expect(AI_AGENT_TYPES.map((type) => AI_AGENT_SHORT_NAMES[type])).toEqual(['Strong', 'Std', 'Budget']);
    });
  });
});

describe('AIエージェントの文言（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it('成功・付け替え・各失敗', () => {
    const engineers = [makeEngineer(0, 'junior', 0, 'strong')];
    expect(formatAiAgentMessage(equipAiAgent([makeEngineer(0, 'junior', 0)], 0, 'cheap', ACTIVE), 'cheap')).toBe(
      'Equipped AI (Budget)',
    );
    expect(formatAiAgentMessage(equipAiAgent(engineers, 0, 'normal', ACTIVE), 'normal')).toBe('Swapped AI (Strong) for AI (Std)');
    expect(formatAiAgentMessage({ ok: false, reason: 'gameOver' }, 'strong')).toBe('');
    expect(formatAiAgentMessage({ ok: false, reason: 'unknownAgent' }, 'foo')).toBe('Unknown AI agent: foo');
    expect(formatAiAgentMessage({ ok: false, reason: 'engineerNotFound' }, 'strong')).toBe('No engineer selected');
    expect(formatAiAgentMessage({ ok: false, reason: 'alreadyEquipped' }, 'strong')).toBe('Already using this AI agent');
    expect(formatAiAgentMessage({ ok: false, reason: 'insufficientFunds' }, 'strong')).toBe('Not enough funds');
  });

  it.each(AI_AGENT_TYPES)('%s のボタンは「AI 名前 月額」で、月額は精算と同じ計算を千円単位にする', (type) => {
    expect(formatAiAgentOption(type)).toBe(`AI ${AI_AGENT_SHORT_NAMES[type]} ¥${getAiAgentMonthlyFee(type) / 1000}K/mo`);
  });
});
