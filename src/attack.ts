// 攻撃の判定ロジック。Phaser には依存しない（テスト可能にするため）。
import { ATTACK_COOLDOWN_MS, ATTACK_RANGE_RATIO, ATTACK_TAP_SIZE_RATIO, CELL_SIZE } from './config';
import type { CodeKind } from './code';
import type { Point } from './route';

export const ATTACK_RANGE = CELL_SIZE * ATTACK_RANGE_RATIO;
export const ATTACK_TAP_SIZE = CELL_SIZE * ATTACK_TAP_SIZE_RATIO;
export { ATTACK_COOLDOWN_MS };

// 攻撃対象の最小の形。
export type AttackTarget = {
  readonly kind: CodeKind;
  readonly position: Point;
};

// 命中時に発行するイベント名。後続タスク（撃破・減点など）は
// `scene.events.on(CODE_HIT_EVENT, (event: CodeHitEvent<...>) => { ... })` で接続する。
export const CODE_HIT_EVENT = 'code-hit';

// 命中イベントのペイロード。T に Graphics などを含む対象の型を渡せるので、Phaser 非依存のまま使える。
export type CodeHitEvent<T extends AttackTarget = AttackTarget> = {
  readonly code: T;
  readonly playerPosition: Point;
  // 発生時刻（ミリ秒）。シーンの時刻（scene.time.now）。
  readonly time: number;
};

// 射程内で最も近い対象を返す。なければ null。距離が射程と等しい場合は射程内。
// 距離が同じ対象が複数あるときは配列の先頭に近い方。入力は変更しない。
export const findAttackTarget = <T extends AttackTarget>(
  playerPosition: Point,
  targets: readonly T[],
  range: number = ATTACK_RANGE,
): T | null => {
  let nearest: T | null = null;
  let nearestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(
      target.position.x - playerPosition.x,
      target.position.y - playerPosition.y,
    );
    if (distance <= range && distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
};

// 攻撃可能か。初回（lastAttackTime が null）は常に可能。経過時間がクールダウン以上なら可能。
export const canAttack = (
  now: number,
  lastAttackTime: number | null,
  cooldownMs: number = ATTACK_COOLDOWN_MS,
): boolean => lastAttackTime === null || now - lastAttackTime >= cooldownMs;

// ポインター位置（ゲーム座標）が主人公中心の正方形のタップ判定領域内か。境界上は内側。
export const isInsideTapArea = (
  point: Point,
  playerPosition: Point,
  size: number = ATTACK_TAP_SIZE,
): boolean => {
  const half = size / 2;
  return (
    Math.abs(point.x - playerPosition.x) <= half && Math.abs(point.y - playerPosition.y) <= half
  );
};
