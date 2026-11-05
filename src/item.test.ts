import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MALICIOUS_CODE_HP,
  ITEM_POWER_DAMAGE,
  ITEM_RANGE_RATIOS,
  ITEM_STRONG_AGAINST_MULTIPLIER,
} from './config';
import {
  calculateItemDamage,
  getItemActivation,
  getItemDamage,
  getItemRange,
  ITEM_DEFINITIONS,
  ITEM_TYPES,
  isItemSpecialty,
  isRandomDeleteItem,
  isTargetInItemRange,
  isWithinRange,
} from './item';
import type { ItemActivation, ItemPower, ItemRange, ItemType } from './item';
import { applyHit, getInitialHp } from './defeat';
import { MALICIOUS_CODE_TYPES } from './maliciousCode';
import type { MaliciousCodeType } from './maliciousCode';

const origin = { x: 100, y: 100 };

describe('アイテムのデータ', () => {
  it('7アイテムが企画書の順序で定義されている', () => {
    expect(ITEM_TYPES).toEqual([
      'codeRabbit',
      'linter',
      'testTool',
      'ci',
      'securityScanner',
      'pairProgrammer',
      'cat',
    ]);
  });

  it('IDも表示名も重複しない', () => {
    expect(new Set(ITEM_TYPES).size).toBe(ITEM_TYPES.length);
    const labels = ITEM_TYPES.map((t) => ITEM_DEFINITIONS[t].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('strongAgainst の types は MALICIOUS_CODE_TYPES に含まれ、重複しない', () => {
    for (const itemType of ITEM_TYPES) {
      const { strongAgainst } = ITEM_DEFINITIONS[itemType];
      if (strongAgainst.kind !== 'types') continue;
      expect(strongAgainst.types.length).toBeGreaterThan(0);
      expect(new Set(strongAgainst.types).size).toBe(strongAgainst.types.length);
      for (const t of strongAgainst.types) {
        expect(MALICIOUS_CODE_TYPES).toContain(t);
      }
    }
  });

  it.each<[ItemType, string, ItemRange, ItemPower, MaliciousCodeType[] | 'all']>([
    ['codeRabbit', 'CodeRabbit', 'long', 'medium', 'all'],
    ['linter', '静的解析ツール（Linter）', 'short', 'weak', ['typo', 'duplication']],
    ['testTool', 'テストツール', 'middle', 'weak', ['bug']],
    ['ci', 'CI', 'short', 'medium', ['bug', 'lowPerformance']],
    [
      'securityScanner',
      'セキュリティスキャナー',
      'middle',
      'strong',
      ['vulnerabilityCritical', 'vulnerabilityMajor'],
    ],
    ['pairProgrammer', 'ペアプロ相棒', 'short', 'medium', ['spaghetti']],
  ])('%s は企画書どおりの表示名・範囲・攻撃力・得意を持つ', (itemType, label, range, power, strong) => {
    const def = ITEM_DEFINITIONS[itemType];
    expect(def.label).toBe(label);
    expect(def.range).toBe(range);
    expect(def.power).toBe(power);
    if (strong === 'all') {
      expect(def.strongAgainst).toEqual({ kind: 'all' });
    } else {
      expect(def.strongAgainst).toEqual({ kind: 'types', types: strong });
    }
    expect(def.effect).toBe('attack');
  });

  it('猫は1回払いで、得意・攻撃力なし、範囲 random、正常なコードも対象、ランダムに消す効果', () => {
    expect(ITEM_DEFINITIONS.cat).toEqual({
      label: '猫',
      payment: 'oneTime',
      strongAgainst: { kind: 'none' },
      range: 'random',
      power: 'none',
      targetsNormalCode: true,
      activation: 'nearestTarget',
      effect: 'deleteRandomCode',
    });
  });

  it.each<[ItemType, boolean]>([
    ['codeRabbit', false],
    ['linter', false],
    ['testTool', false],
    ['ci', false],
    ['securityScanner', false],
    ['pairProgrammer', false],
    ['cat', true],
  ])('isRandomDeleteItem(%s) は %s', (itemType, expected) => {
    expect(isRandomDeleteItem(itemType)).toBe(expected);
  });
});

describe('発動方式（CI #55）', () => {
  it.each<[ItemType, ItemActivation]>([
    ['codeRabbit', 'nearestTarget'],
    ['linter', 'nearestTarget'],
    ['testTool', 'nearestTarget'],
    ['ci', 'releaseGate'],
    ['securityScanner', 'nearestTarget'],
    ['pairProgrammer', 'nearestTarget'],
  ])('%s の発動方式は %s', (itemType, activation) => {
    expect(getItemActivation(itemType)).toBe(activation);
    expect(ITEM_DEFINITIONS[itemType].activation).toBe(activation);
  });
});

describe('仮の数値の段階の順序', () => {
  it('範囲は short < middle < long', () => {
    expect(ITEM_RANGE_RATIOS.short).toBeLessThan(ITEM_RANGE_RATIOS.middle);
    expect(ITEM_RANGE_RATIOS.middle).toBeLessThan(ITEM_RANGE_RATIOS.long);
  });

  it('攻撃力は none < weak < medium < strong', () => {
    expect(ITEM_POWER_DAMAGE.none).toBeLessThan(ITEM_POWER_DAMAGE.weak);
    expect(ITEM_POWER_DAMAGE.weak).toBeLessThan(ITEM_POWER_DAMAGE.medium);
    expect(ITEM_POWER_DAMAGE.medium).toBeLessThan(ITEM_POWER_DAMAGE.strong);
  });
});

describe('getItemRange', () => {
  it.each<[ItemType, number]>([
    ['codeRabbit', 240],
    ['linter', 90],
    ['testTool', 150],
    ['ci', 90],
    ['securityScanner', 150],
    ['pairProgrammer', 90],
    ['cat', Infinity],
  ])('%s の範囲は %s px', (itemType, px) => {
    expect(getItemRange(itemType)).toBe(px);
  });

  it('猫(random)は段階の設定値に関係なく Infinity', () => {
    expect(getItemRange('cat', { short: 2, middle: 3, long: 5 }, 10)).toBe(Infinity);
  });

  it('設定値を引数で差し替えられる', () => {
    expect(getItemRange('linter', { short: 2, middle: 3, long: 5 }, 10)).toBe(20);
  });
});

describe('isWithinRange（境界値）', () => {
  // 3:4:5 の倍数で斜めの距離を整数にする。
  it.each<[ItemRange, number]>([
    ['short', 90],
    ['middle', 150],
    ['long', 240],
  ])('%s（%ipx）: 横', (_range, px) => {
    expect(isWithinRange(origin, { x: 100 + px, y: 100 }, px)).toBe(true);
    expect(isWithinRange(origin, { x: 100 + px - 1, y: 100 }, px)).toBe(true);
    expect(isWithinRange(origin, { x: 100 + px + 1, y: 100 }, px)).toBe(false);
  });

  it.each<[ItemRange, number]>([
    ['short', 90],
    ['middle', 150],
    ['long', 240],
  ])('%s（%ipx）: 縦', (_range, px) => {
    expect(isWithinRange(origin, { x: 100, y: 100 - px }, px)).toBe(true);
    expect(isWithinRange(origin, { x: 100, y: 100 - px + 1 }, px)).toBe(true);
    expect(isWithinRange(origin, { x: 100, y: 100 - px - 1 }, px)).toBe(false);
  });

  // 斜め: (3k, 4k) の距離は 5k。
  it.each<[ItemRange, number, number, number]>([
    ['short', 90, 54, 72],
    ['middle', 150, 90, 120],
    ['long', 240, 144, 192],
  ])('%s（%ipx）: 斜め(%i, %i)', (_range, px, dx, dy) => {
    expect(isWithinRange(origin, { x: 100 + dx, y: 100 + dy }, px)).toBe(true);
    // 1px 内側・外側（距離 px-1 / px+1）となる 3:4:5 の点。
    const inner = (px - 1) / px;
    const outer = (px + 1) / px;
    expect(
      isWithinRange(origin, { x: 100 + dx * inner, y: 100 + dy * inner }, px),
    ).toBe(true);
    expect(
      isWithinRange(origin, { x: 100 + dx * outer, y: 100 + dy * outer }, px),
    ).toBe(false);
  });

  it('距離0は範囲内', () => {
    expect(isWithinRange(origin, origin, 90)).toBe(true);
  });

  it('rangePx が 0 のときは距離0だけ true', () => {
    expect(isWithinRange(origin, origin, 0)).toBe(true);
    expect(isWithinRange(origin, { x: 101, y: 100 }, 0)).toBe(false);
  });

  it('rangePx が負・NaN のときは常に false', () => {
    expect(isWithinRange(origin, origin, -1)).toBe(false);
    expect(isWithinRange(origin, origin, NaN)).toBe(false);
    expect(isWithinRange(origin, { x: 101, y: 100 }, NaN)).toBe(false);
  });

  it('入力を変更しない', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    isWithinRange(a, b, 5);
    expect(a).toEqual({ x: 1, y: 2 });
    expect(b).toEqual({ x: 4, y: 6 });
  });
});

describe('isTargetInItemRange', () => {
  it.each<[ItemType, number]>([
    ['codeRabbit', 240],
    ['linter', 90],
    ['testTool', 150],
    ['ci', 90],
    ['securityScanner', 150],
    ['pairProgrammer', 90],
  ])('%s: 境界ちょうどは範囲内、1px外側は範囲外', (itemType, px) => {
    expect(isTargetInItemRange(itemType, origin, { x: 100 + px, y: 100 })).toBe(true);
    expect(isTargetInItemRange(itemType, origin, { x: 100 + px + 1, y: 100 })).toBe(false);
  });
});

const SPECIALTY: Record<ItemType, readonly MaliciousCodeType[]> = {
  codeRabbit: [],
  linter: ['typo', 'duplication'],
  testTool: ['bug'],
  ci: ['bug', 'lowPerformance'],
  securityScanner: ['vulnerabilityCritical', 'vulnerabilityMajor'],
  pairProgrammer: ['spaghetti'],
  cat: [],
};

describe('isItemSpecialty（7アイテム×9種類）', () => {
  const cases = ITEM_TYPES.flatMap((itemType) =>
    MALICIOUS_CODE_TYPES.map((t): [ItemType, MaliciousCodeType, boolean] => [
      itemType,
      t,
      SPECIALTY[itemType].includes(t),
    ]),
  );

  it.each(cases)('%s × %s => %s', (itemType, maliciousType, expected) => {
    expect(isItemSpecialty(itemType, maliciousType)).toBe(expected);
  });

  it.each(ITEM_TYPES)('%s は種類なしのとき false', (itemType) => {
    expect(isItemSpecialty(itemType, undefined)).toBe(false);
  });
});

describe('getItemDamage', () => {
  it('得意な種類は攻撃力×倍率', () => {
    expect(getItemDamage('linter', 'typo')).toBe(2);
    expect(getItemDamage('linter', 'duplication')).toBe(2);
    expect(getItemDamage('securityScanner', 'vulnerabilityCritical')).toBe(6);
    expect(getItemDamage('securityScanner', 'vulnerabilityMajor')).toBe(6);
  });

  it('得意でない種類にも等倍で効く', () => {
    expect(getItemDamage('linter', 'bug')).toBe(1);
    expect(getItemDamage('securityScanner', 'bug')).toBe(3);
  });

  it.each(MALICIOUS_CODE_TYPES)('万能型 CodeRabbit は %s にも 2（倍率なし）', (t) => {
    expect(getItemDamage('codeRabbit', t)).toBe(2);
  });

  it.each(ITEM_TYPES)('種類なしは %s でも等倍', (itemType) => {
    expect(getItemDamage(itemType, undefined)).toBe(
      ITEM_POWER_DAMAGE[ITEM_DEFINITIONS[itemType].power],
    );
  });

  it('攻撃するアイテム（effect: attack）× 9種類すべてが正の整数', () => {
    const attackItems = ITEM_TYPES.filter((itemType) => ITEM_DEFINITIONS[itemType].effect === 'attack');
    expect(attackItems).toHaveLength(6);
    for (const itemType of attackItems) {
      for (const t of MALICIOUS_CODE_TYPES) {
        const damage = getItemDamage(itemType, t);
        expect(Number.isInteger(damage)).toBe(true);
        expect(damage).toBeGreaterThan(0);
      }
    }
  });
});

describe('猫(#57)のダメージ', () => {
  it('攻撃力 none のダメージは 0', () => {
    expect(ITEM_POWER_DAMAGE.none).toBe(0);
  });

  it.each([...MALICIOUS_CODE_TYPES, undefined])('猫は %s にも 0', (t) => {
    expect(getItemDamage('cat', t)).toBe(0);
  });
});

describe('calculateItemDamage', () => {
  it('攻撃力0は得意でも0', () => {
    expect(calculateItemDamage(0, false)).toBe(0);
    expect(calculateItemDamage(0, true)).toBe(0);
  });

  it('攻撃力1: 得意でなければ1、得意なら倍率ぶん', () => {
    expect(calculateItemDamage(1, false)).toBe(1);
    expect(calculateItemDamage(1, true)).toBe(ITEM_STRONG_AGAINST_MULTIPLIER);
  });

  it.each([-1, NaN, Infinity])('攻撃力 %s は 0 扱い', (power) => {
    expect(calculateItemDamage(power, false)).toBe(0);
    expect(calculateItemDamage(power, true)).toBe(0);
  });

  it('倍率 0 は得意なとき 0、倍率 1 は等倍', () => {
    expect(calculateItemDamage(2, true, 0)).toBe(0);
    expect(calculateItemDamage(2, true, 1)).toBe(2);
  });

  it.each([-1, NaN, Infinity])('倍率 %s は 0 扱い（得意なとき 0）', (multiplier) => {
    expect(calculateItemDamage(2, true, multiplier)).toBe(0);
  });

  it('得意でなければ倍率は無関係', () => {
    expect(calculateItemDamage(2, false, 0)).toBe(2);
    expect(calculateItemDamage(2, false, NaN)).toBe(2);
  });
});

describe('CodeRabbit(#52): 撃破に必要な攻撃回数', () => {
  const damage = getItemDamage('codeRabbit', undefined);

  it('種類なしの不正なコードは 1 回目で生き残り、2 回目で撃破される', () => {
    expect(damage).toBe(ITEM_POWER_DAMAGE.medium);
    const initial = getInitialHp(undefined);
    expect(initial).toBe(DEFAULT_MALICIOUS_CODE_HP);

    const first = applyHit(initial, damage);
    expect(first).toEqual({ hp: DEFAULT_MALICIOUS_CODE_HP - ITEM_POWER_DAMAGE.medium, defeated: false });
    expect(first.hp).toBeGreaterThan(0);

    const second = applyHit(first.hp, damage);
    expect(second.defeated).toBe(true);
    expect(second.hp).toBeLessThanOrEqual(0);
  });

  it('撃破済みへの 3 回目は hp を変えず defeated も false', () => {
    const second = applyHit(applyHit(getInitialHp(undefined), damage).hp, damage);
    expect(applyHit(second.hp, damage)).toEqual({ hp: second.hp, defeated: false });
  });
});
