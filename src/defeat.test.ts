import { describe, expect, it } from 'vitest';
import { ATTACK_DAMAGE, DEFAULT_MALICIOUS_CODE_HP } from './config';
import { applyHit, CODE_DEFEATED_EVENT, getInitialHp, isDefeated, resolveCodeFate } from './defeat';
import { MALICIOUS_CODE_TYPE_DEFINITIONS, MALICIOUS_CODE_TYPES } from './maliciousCode';

describe('getInitialHp', () => {
  it.each(MALICIOUS_CODE_TYPES)('%s は #10 の hp', (type) => {
    expect(getInitialHp(type)).toBe(MALICIOUS_CODE_TYPE_DEFINITIONS[type].hp);
  });

  it('種類なしは既定値', () => {
    expect(getInitialHp()).toBe(DEFAULT_MALICIOUS_CODE_HP);
    expect(getInitialHp(undefined)).toBe(DEFAULT_MALICIOUS_CODE_HP);
  });
});

describe('applyHit', () => {
  it('hp 1 は1撃で撃破', () => {
    expect(applyHit(1, 1)).toEqual({ hp: 0, defeated: true });
  });

  it('hp 2 は1撃では残り、2撃で撃破', () => {
    const first = applyHit(2, 1);
    expect(first).toEqual({ hp: 1, defeated: false });
    expect(applyHit(first.hp, 1)).toEqual({ hp: 0, defeated: true });
  });

  it.each([2, 3, 5, 10])('hp %d はちょうど hp 回で撃破', (initial) => {
    let hp = initial;
    for (let i = 1; i <= initial; i++) {
      const result = applyHit(hp, 1);
      expect(result.defeated).toBe(i === initial);
      hp = result.hp;
    }
    expect(hp).toBe(0);
  });

  it('damage > hp で hp がマイナスになっても撃破', () => {
    expect(applyHit(1, 3)).toEqual({ hp: -2, defeated: true });
  });

  it('damage == hp - 1 は残る', () => {
    expect(applyHit(3, 2)).toEqual({ hp: 1, defeated: false });
  });

  it('撃破後（hp 0）の再ヒットは無効', () => {
    expect(applyHit(0, 1)).toEqual({ hp: 0, defeated: false });
  });

  it('撃破後（hp マイナス）の再ヒットは無効', () => {
    expect(applyHit(-2, 1)).toEqual({ hp: -2, defeated: false });
  });

  it('同じコードへ連続ヒットしても defeated は1回だけ', () => {
    let hp = 1;
    let count = 0;
    for (let i = 0; i < 5; i++) {
      const result = applyHit(hp, 1);
      if (result.defeated) count += 1;
      hp = result.hp;
    }
    expect(count).toBe(1);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('damage %d は 0 扱いで hp 不変', (damage) => {
    expect(applyHit(3, damage)).toEqual({ hp: 3, defeated: false });
  });

  it('damage を省略すると ATTACK_DAMAGE', () => {
    expect(applyHit(5)).toEqual({ hp: 5 - ATTACK_DAMAGE, defeated: false });
  });

  it('hp 0 以下の境界: 0 と 1', () => {
    expect(isDefeated(0)).toBe(true);
    expect(isDefeated(-1)).toBe(true);
    expect(isDefeated(1)).toBe(false);
  });
});

describe('resolveCodeFate', () => {
  it.each([
    [false, false, 'flowing'],
    [false, true, 'released'],
    [true, false, 'defeated'],
    [true, true, 'defeated'],
  ] as const)('defeated=%s released=%s → %s', (defeated, released, expected) => {
    expect(resolveCodeFate(defeated, released)).toBe(expected);
  });
});

describe('CODE_DEFEATED_EVENT', () => {
  it('イベント名', () => {
    expect(CODE_DEFEATED_EVENT).toBe('code-defeated');
  });
});
