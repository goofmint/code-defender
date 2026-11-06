import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import { ATTACK_COOLDOWN_MS, ATTACK_RANGE } from './attack';
import type { AttackTarget } from './attack';
import { INITIAL_GAME_OVER_STATE, checkBankruptcy } from './gameOver';
import { NORMAL_CODE_PENALTY } from './config';
import type { AttackPenaltyResult } from './penalty';
import {
  formatPenalty,
  resolveAttackPenalty,
  resolveNormalCodePenalty,
} from './penalty';

const PENALTY = 50000;
const normal = { kind: 'normal', funds: 0, gameOver: false, penalty: PENALTY } as const;

describe('resolveNormalCodePenalty: 残高の境界', () => {
  it.each([
    ['ちょうど0になる（funds == penalty）', PENALTY, 0],
    ['1残る（funds == penalty + 1）', PENALTY + 1, 1],
    ['-1になる（funds == penalty - 1）', PENALTY - 1, -1],
    ['funds が 0 でもマイナスになる', 0, -PENALTY],
    ['funds が既にマイナスでもさらに減る', -100, -100 - PENALTY],
  ])('%s', (_name, funds, expected) => {
    expect(resolveNormalCodePenalty({ ...normal, funds })).toEqual({
      applied: true,
      fundsAfter: expected,
      amount: PENALTY,
    });
  });

  it('penalty を省略すると設定値（仮）を使う', () => {
    expect(resolveNormalCodePenalty({ kind: 'normal', funds: 100000, gameOver: false })).toEqual({
      applied: true,
      fundsAfter: 100000 - NORMAL_CODE_PENALTY,
      amount: NORMAL_CODE_PENALTY,
    });
  });
});

describe('resolveNormalCodePenalty: 減点しない条件', () => {
  it('不正なコードでは減点しない', () => {
    expect(resolveNormalCodePenalty({ ...normal, kind: 'malicious', funds: 100000 })).toEqual({
      applied: false,
      fundsAfter: 100000,
      amount: 0,
    });
  });

  it('ゲームオーバー後は減点しない', () => {
    expect(resolveNormalCodePenalty({ ...normal, gameOver: true, funds: 100000 })).toEqual({
      applied: false,
      fundsAfter: 100000,
      amount: 0,
    });
  });

  it.each([
    ['0', 0],
    ['負', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('penalty が %s のときは 0 扱いで減点しない', (_name, penalty) => {
    expect(resolveNormalCodePenalty({ ...normal, funds: 100000, penalty })).toEqual({
      applied: false,
      fundsAfter: 100000,
      amount: 0,
    });
  });
});

describe('減点後の残高と倒産判定', () => {
  it.each([
    [1, false],
    [0, true],
    [-1, true],
  ])('減点後の残高が %d のとき倒産 = %s', (after, bankrupt) => {
    const result = resolveNormalCodePenalty({ ...normal, funds: after + PENALTY });
    expect(result.fundsAfter).toBe(after);
    expect(checkBankruptcy(INITIAL_GAME_OVER_STATE, result.fundsAfter, 0).triggered).toBe(bankrupt);
  });
});

describe('resolveAttackPenalty: 攻撃→命中→減点', () => {
  const player = { x: 0, y: 0 };
  const target = (kind: AttackTarget['kind'], x: number): AttackTarget => ({
    kind,
    position: { x, y: 0 },
  });
  const base = {
    now: 0,
    lastAttackTime: null,
    cooldownMs: ATTACK_COOLDOWN_MS,
    playerPosition: player,
    range: ATTACK_RANGE,
    funds: 1000000,
    gameOver: false,
    penalty: PENALTY,
  } as const;

  it.each([
    ['射程 -ε（内側）', ATTACK_RANGE - 0.001, true],
    ['射程ちょうど', ATTACK_RANGE, true],
    ['射程 +ε（外側）', ATTACK_RANGE + 0.001, false],
  ])('正常コード: %s', (_name, x, penalized) => {
    const result = resolveAttackPenalty({ ...base, targets: [target('normal', x)] });
    expect(result.attacked).toBe(true);
    expect(result.penalty.applied).toBe(penalized);
    expect(result.penalty.fundsAfter).toBe(penalized ? 1000000 - PENALTY : 1000000);
  });

  it('不正コードに命中しても減点しない', () => {
    const result = resolveAttackPenalty({ ...base, targets: [target('malicious', 0)] });
    expect(result.hit).not.toBeNull();
    expect(result.penalty.applied).toBe(false);
  });

  it.each([
    ['クールダウン -1ms', ATTACK_COOLDOWN_MS - 1, false],
    ['クールダウンちょうど', ATTACK_COOLDOWN_MS, true],
    ['クールダウン +1ms', ATTACK_COOLDOWN_MS + 1, true],
  ])('%s の時刻では攻撃可 = %s', (_name, now, allowed) => {
    const result = resolveAttackPenalty({
      ...base,
      now,
      lastAttackTime: 0,
      targets: [target('normal', 0)],
    });
    expect(result.attacked).toBe(allowed);
    expect(result.penalty.applied).toBe(allowed);
    expect(result.lastAttackTime).toBe(allowed ? now : 0);
  });

  it('ゲームオーバー後は攻撃も減点もしない', () => {
    const result = resolveAttackPenalty({
      ...base,
      gameOver: true,
      targets: [target('normal', 0)],
    });
    expect(result.attacked).toBe(false);
    expect(result.penalty.applied).toBe(false);
  });

  it.each([1, 2, 5, 10])('同じ正常コードへ %d 回命中すると 減点額×回数 になる', (n) => {
    const targets = [target('normal', 0)];
    let funds = 1000000;
    let lastAttackTime: number | null = null;
    for (let i = 0; i < n; i++) {
      const result: AttackPenaltyResult<AttackTarget> = resolveAttackPenalty({
        ...base,
        now: i * ATTACK_COOLDOWN_MS,
        lastAttackTime,
        funds,
        targets,
      });
      expect(result.penalty.applied).toBe(true);
      funds = result.penalty.fundsAfter;
      lastAttackTime = result.lastAttackTime;
    }
    expect(funds).toBe(1000000 - PENALTY * n);
  });

  it('クールダウン内の連続攻撃は2回目が減点されない', () => {
    const targets = [target('normal', 0)];
    const first = resolveAttackPenalty({ ...base, targets });
    const second = resolveAttackPenalty({
      ...base,
      now: ATTACK_COOLDOWN_MS - 1,
      lastAttackTime: first.lastAttackTime,
      funds: first.penalty.fundsAfter,
      targets,
    });
    expect(second.penalty.applied).toBe(false);
    expect(second.penalty.fundsAfter).toBe(1000000 - PENALTY);
  });
});

describe('formatPenalty', () => {
  it.each([
    [50000, '-50,000円'],
    [1, '-1円'],
  ])('%d → %s', (amount, expected) => {
    expect(formatPenalty(amount)).toBe(expected);
  });
});

describe('formatPenalty（英語 #158）', () => {
  beforeEach(() => {
    setLocale('en');
  });
  afterEach(() => {
    setLocale('ja');
  });

  it.each([
    [50000, '-¥50,000'],
    [1000, '-¥1,000'],
    [999, '-¥999'],
    [1, '-¥1'],
  ])('%d → %s（負の符号は通貨記号の前）', (amount, expected) => {
    expect(formatPenalty(amount)).toBe(expected);
  });
});
