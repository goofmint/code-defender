import { describe, expect, it } from 'vitest';
import {
  ATTACK_RANGE,
  ATTACK_TAP_SIZE,
  canAttack,
  findAttackTarget,
  isInsideTapArea,
} from './attack';
import type { AttackTarget } from './attack';

const player = { x: 100, y: 100 };
const EPS = 0.001;
const at = (kind: AttackTarget['kind'], x: number, y: number): AttackTarget => ({
  kind,
  position: { x, y },
});

describe('攻撃の対象選択', () => {
  it('射程の内側（射程-ε）の対象に命中する', () => {
    const target = at('normal', 100 + ATTACK_RANGE - EPS, 100);
    expect(findAttackTarget(player, [target])).toBe(target);
  });

  it('ちょうど射程の距離の対象は射程内として命中する', () => {
    const target = at('normal', 100 + ATTACK_RANGE, 100);
    expect(findAttackTarget(player, [target])).toBe(target);
  });

  it('射程の外側（射程+ε）の対象には命中しない', () => {
    expect(findAttackTarget(player, [at('normal', 100 + ATTACK_RANGE + EPS, 100)])).toBeNull();
  });

  it('斜め方向でも距離で判定する', () => {
    const d = ATTACK_RANGE / Math.SQRT2;
    const inside = at('malicious', 100 + d - EPS, 100 - d + EPS);
    const outside = at('malicious', 100 + d + EPS, 100 + d + EPS);
    expect(findAttackTarget(player, [inside])).toBe(inside);
    expect(findAttackTarget(player, [outside])).toBeNull();
  });

  it('射程内で最も近い対象を選ぶ', () => {
    const far = at('normal', 100 + 40, 100);
    const near = at('malicious', 100, 100 - 10);
    expect(findAttackTarget(player, [far, near])).toBe(near);
  });

  it('射程外の対象より射程内の対象を選ぶ', () => {
    const out = at('normal', 100 + ATTACK_RANGE + 10, 100);
    const inRange = at('malicious', 100 + ATTACK_RANGE - 1, 100);
    expect(findAttackTarget(player, [out, inRange])).toBe(inRange);
  });

  it('正常コードと不正コードの両方が対象になる', () => {
    const normal = at('normal', 110, 100);
    const malicious = at('malicious', 110, 100);
    expect(findAttackTarget(player, [normal])).toBe(normal);
    expect(findAttackTarget(player, [malicious])).toBe(malicious);
  });

  it('対象が空配列なら null を返す', () => {
    expect(findAttackTarget(player, [])).toBeNull();
  });

  it('入力を変更しない', () => {
    const targets = [at('normal', 120, 100), at('malicious', 110, 100)];
    const snapshot = JSON.stringify(targets);
    const playerSnapshot = JSON.stringify(player);
    findAttackTarget(player, targets);
    expect(JSON.stringify(targets)).toBe(snapshot);
    expect(JSON.stringify(player)).toBe(playerSnapshot);
  });
});

describe('攻撃のクールダウン', () => {
  const cooldown = 400;

  it('初回は常に攻撃できる', () => {
    expect(canAttack(0, null, cooldown)).toBe(true);
  });

  it('期限の直前（cooldown-1）は攻撃できない', () => {
    expect(canAttack(1000 + cooldown - 1, 1000, cooldown)).toBe(false);
  });

  it('ちょうどクールダウンが経過したら攻撃できる', () => {
    expect(canAttack(1000 + cooldown, 1000, cooldown)).toBe(true);
  });

  it('期限の直後（cooldown+1）は攻撃できる', () => {
    expect(canAttack(1000 + cooldown + 1, 1000, cooldown)).toBe(true);
  });
});

describe('タップ判定領域', () => {
  const half = ATTACK_TAP_SIZE / 2;

  it('中心と内側は領域内である', () => {
    expect(isInsideTapArea(player, player)).toBe(true);
    expect(isInsideTapArea({ x: 100 + half - EPS, y: 100 - half + EPS }, player)).toBe(true);
  });

  it('各辺の上は領域内である', () => {
    expect(isInsideTapArea({ x: 100 + half, y: 100 }, player)).toBe(true);
    expect(isInsideTapArea({ x: 100 - half, y: 100 }, player)).toBe(true);
    expect(isInsideTapArea({ x: 100, y: 100 + half }, player)).toBe(true);
    expect(isInsideTapArea({ x: 100, y: 100 - half }, player)).toBe(true);
  });

  it('各辺の外側は領域外である', () => {
    expect(isInsideTapArea({ x: 100 + half + EPS, y: 100 }, player)).toBe(false);
    expect(isInsideTapArea({ x: 100 - half - EPS, y: 100 }, player)).toBe(false);
    expect(isInsideTapArea({ x: 100, y: 100 + half + EPS }, player)).toBe(false);
    expect(isInsideTapArea({ x: 100, y: 100 - half - EPS }, player)).toBe(false);
  });

  it('角は領域内で、角の外側は領域外である', () => {
    expect(isInsideTapArea({ x: 100 + half, y: 100 + half }, player)).toBe(true);
    expect(isInsideTapArea({ x: 100 - half, y: 100 - half }, player)).toBe(true);
    expect(isInsideTapArea({ x: 100 + half + EPS, y: 100 + half + EPS }, player)).toBe(false);
    expect(isInsideTapArea({ x: 100 - half - EPS, y: 100 + half }, player)).toBe(false);
  });
});
