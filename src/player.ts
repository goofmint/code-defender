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

const normalize = (x: number, y: number): Point => {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
};

// ポインターの目標位置へ向かう方向（長さ 1）を返す。距離がデッドゾーン以内なら {0,0}。
export const getPointerDirection = (from: Point, target: Point, deadZone: number): Point => {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  if (Math.hypot(dx, dy) <= deadZone) {
    return { x: 0, y: 0 };
  }
  return normalize(dx, dy);
};

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

// 上下左右の入力（キーボードの矢印・WASD、バーチャルパッドのボタン #182）。true は押している。
export type DirectionInput = { readonly up: boolean; readonly down: boolean; readonly left: boolean; readonly right: boolean };

export const NO_DIRECTION_INPUT: DirectionInput = { up: false, down: false, left: false, right: false };

// 複数の入力（キーボードとバーチャルパッド #182）を向きごとに合わせる（どれかで押していれば押している）。
export const mergeDirectionInputs = (inputs: readonly DirectionInput[]): DirectionInput => ({
  up: inputs.some((input) => input.up),
  down: inputs.some((input) => input.down),
  left: inputs.some((input) => input.left),
  right: inputs.some((input) => input.right),
});

// 上下左右の入力から進む方向（長さ 1）を返す(#182)。反対の向きを同時に押すと打ち消し、斜めは正規化する（斜めでも速くならない）。
// 何も押していない・すべて打ち消したときは {0,0}。
export const directionFromInput = (input: DirectionInput): Point =>
  normalize(Number(input.right) - Number(input.left), Number(input.down) - Number(input.up));

// 方向（長さ 1 か {0,0}）へ deltaMs の間 speed（ピクセル/秒）で進んだ位置を返す(#182)。目標がないので止める位置はなく、フィールドへの制限は clampToField で行う。
export const movePlayerInDirection = (position: Point, direction: Point, deltaMs: number, speed: number): Point => {
  const step = (speed * deltaMs) / 1000;
  return {
    x: position.x + direction.x * step,
    y: position.y + direction.y * step,
  };
};
