// 主人公の定数。Phaser には依存しない（テスト可能にするため）。
import {
  CELL_SIZE,
  PLAYER_COLORS,
  PLAYER_SIZE_RATIO,
  PLAYER_SPEED,
  PLAYER_START_COL,
  PLAYER_START_ROW,
} from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';

export { PLAYER_COLORS, PLAYER_START_COL, PLAYER_START_ROW };

export const PLAYER_SIZE = CELL_SIZE * PLAYER_SIZE_RATIO;

// 開始セルの中心ピクセル座標を返す。
export const getPlayerStartPosition = (): { x: number; y: number } => ({
  x: PLAYER_START_COL * CELL_SIZE + CELL_SIZE / 2,
  y: PLAYER_START_ROW * CELL_SIZE + CELL_SIZE / 2,
});

export type Point = { x: number; y: number };

// 主人公の向き（見た目の scaleX）。1 = 右向き（描画の既定）、-1 = 左向き(#144)。
export type PlayerFacing = 1 | -1;

// 水平方向の移動量の符号から向きを返す。水平に動かない（0）・数値でないときは null（向きを変えない）。
export const facingFromHorizontal = (dx: number): PlayerFacing | null => {
  if (dx > 0) return 1;
  if (dx < 0) return -1;
  return null;
};

// 方向入力の状態（キーボードなどから組み立てる）。
export type MoveInput = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

const normalize = (x: number, y: number): Point => {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
};

// 入力から移動方向（長さ 0 または 1）を返す。反対方向の同時入力は軸ごとに打ち消し、斜めは正規化する。
export const getMoveDirection = (input: MoveInput): Point =>
  normalize(
    (input.right ? 1 : 0) - (input.left ? 1 : 0),
    (input.down ? 1 : 0) - (input.up ? 1 : 0),
  );

// ポインターの目標位置へ向かう方向（長さ 1）を返す。距離がデッドゾーン以内なら {0,0}。
export const getPointerDirection = (from: Point, target: Point, deadZone: number): Point => {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  if (Math.hypot(dx, dy) <= deadZone) {
    return { x: 0, y: 0 };
  }
  return normalize(dx, dy);
};

// 方向・速度（ピクセル/秒）・経過時間（ミリ秒）から新しい座標を返す。引数は変更しない。
export const movePlayer = (
  position: Point,
  direction: Point,
  deltaMs: number,
  speed: number = PLAYER_SPEED,
): Point => ({
  x: position.x + (direction.x * speed * deltaMs) / 1000,
  y: position.y + (direction.y * speed * deltaMs) / 1000,
});

// 目標へ向かって移動する。1回の移動量が目標までの距離を超えるときは目標で止める（行き過ぎ防止）。
export const movePlayerToward = (
  position: Point,
  target: Point,
  direction: Point,
  deltaMs: number,
  speed: number = PLAYER_SPEED,
): Point => {
  const distance = Math.hypot(target.x - position.x, target.y - position.y);
  const step = Math.min((speed * deltaMs) / 1000, distance);
  return {
    x: position.x + direction.x * step,
    y: position.y + direction.y * step,
  };
};

// 主人公の矩形がフィールド内に収まるよう座標を制限する。
export const clampToField = (position: Point): Point => {
  const half = PLAYER_SIZE / 2;
  return {
    x: Math.min(Math.max(position.x, half), FIELD_WIDTH - half),
    y: Math.min(Math.max(position.y, half), FIELD_HEIGHT - half),
  };
};
