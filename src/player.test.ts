import { describe, expect, it } from 'vitest';
import { CELL_SIZE, FIELD_COLS, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import { PLAYER_POINTER_DEAD_ZONE, PLAYER_SPEED } from './config';
import {
  clampToField,
  getMoveDirection,
  getPlayerStartPosition,
  getPointerDirection,
  movePlayer,
  movePlayerToward,
  PLAYER_SIZE,
  PLAYER_START_COL,
  PLAYER_START_ROW,
} from './player';

describe('主人公', () => {
  it('サイズは 0 より大きく、セルサイズ以下である', () => {
    expect(PLAYER_SIZE).toBeGreaterThan(0);
    expect(PLAYER_SIZE).toBeLessThanOrEqual(CELL_SIZE);
  });

  it('開始セルはフィールドの範囲内である', () => {
    expect(PLAYER_START_COL).toBeGreaterThanOrEqual(0);
    expect(PLAYER_START_COL).toBeLessThanOrEqual(FIELD_COLS - 1);
    expect(PLAYER_START_ROW).toBeGreaterThanOrEqual(0);
    expect(PLAYER_START_ROW).toBeLessThanOrEqual(FIELD_ROWS - 1);
  });

  it('初期位置は開始セルの中心と一致する', () => {
    const { x, y } = getPlayerStartPosition();
    expect(x).toBe(PLAYER_START_COL * CELL_SIZE + CELL_SIZE / 2);
    expect(y).toBe(PLAYER_START_ROW * CELL_SIZE + CELL_SIZE / 2);
  });

  it('初期位置の主人公の矩形がフィールド内に収まる', () => {
    const { x, y } = getPlayerStartPosition();
    const half = PLAYER_SIZE / 2;
    expect(x - half).toBeGreaterThanOrEqual(0);
    expect(x + half).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(y - half).toBeGreaterThanOrEqual(0);
    expect(y + half).toBeLessThanOrEqual(FIELD_HEIGHT);
  });
});

describe('getMoveDirection', () => {
  const none = { left: false, right: false, up: false, down: false };

  it('入力がなければ {x:0,y:0} を返す', () => {
    expect(getMoveDirection(none)).toEqual({ x: 0, y: 0 });
  });

  it('4方向それぞれの単一入力で長さ 1 の方向を返す', () => {
    expect(getMoveDirection({ ...none, left: true })).toEqual({ x: -1, y: 0 });
    expect(getMoveDirection({ ...none, right: true })).toEqual({ x: 1, y: 0 });
    expect(getMoveDirection({ ...none, up: true })).toEqual({ x: 0, y: -1 });
    expect(getMoveDirection({ ...none, down: true })).toEqual({ x: 0, y: 1 });
  });

  it('反対方向の同時入力は軸ごとに打ち消される', () => {
    expect(getMoveDirection({ ...none, left: true, right: true })).toEqual({ x: 0, y: 0 });
    expect(getMoveDirection({ ...none, up: true, down: true })).toEqual({ x: 0, y: 0 });
    expect(getMoveDirection({ left: true, right: true, up: true, down: false })).toEqual({
      x: 0,
      y: -1,
    });
  });

  it('斜め入力は長さ 1 に正規化される', () => {
    const d = getMoveDirection({ ...none, right: true, down: true });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('movePlayer', () => {
  it('移動量は 方向 × 速度 × 経過時間(秒) になる', () => {
    expect(movePlayer({ x: 100, y: 100 }, { x: 1, y: 0 }, 500, 200)).toEqual({ x: 200, y: 100 });
    expect(movePlayer({ x: 100, y: 100 }, { x: 0, y: -1 }, 250, 200)).toEqual({ x: 100, y: 50 });
  });

  it('速度を省略すると PLAYER_SPEED を使う', () => {
    expect(movePlayer({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000)).toEqual({ x: PLAYER_SPEED, y: 0 });
  });

  it('方向が {0,0} なら動かない', () => {
    expect(movePlayer({ x: 10, y: 20 }, { x: 0, y: 0 }, 1000)).toEqual({ x: 10, y: 20 });
  });

  it('引数のオブジェクトを変更しない', () => {
    const position = { x: 10, y: 20 };
    const direction = { x: 1, y: 0 };
    movePlayer(position, direction, 1000);
    expect(position).toEqual({ x: 10, y: 20 });
    expect(direction).toEqual({ x: 1, y: 0 });
  });
});

describe('clampToField（境界値分析）', () => {
  const minX = PLAYER_SIZE / 2;
  const maxX = FIELD_WIDTH - PLAYER_SIZE / 2;
  const minY = PLAYER_SIZE / 2;
  const maxY = FIELD_HEIGHT - PLAYER_SIZE / 2;
  const midX = FIELD_WIDTH / 2;
  const midY = FIELD_HEIGHT / 2;

  it('左辺: すぐ内側・ちょうど・すぐ外側', () => {
    expect(clampToField({ x: minX + 1, y: midY })).toEqual({ x: minX + 1, y: midY });
    expect(clampToField({ x: minX, y: midY })).toEqual({ x: minX, y: midY });
    expect(clampToField({ x: minX - 1, y: midY })).toEqual({ x: minX, y: midY });
  });

  it('右辺: すぐ内側・ちょうど・すぐ外側', () => {
    expect(clampToField({ x: maxX - 1, y: midY })).toEqual({ x: maxX - 1, y: midY });
    expect(clampToField({ x: maxX, y: midY })).toEqual({ x: maxX, y: midY });
    expect(clampToField({ x: maxX + 1, y: midY })).toEqual({ x: maxX, y: midY });
  });

  it('上辺: すぐ内側・ちょうど・すぐ外側', () => {
    expect(clampToField({ x: midX, y: minY + 1 })).toEqual({ x: midX, y: minY + 1 });
    expect(clampToField({ x: midX, y: minY })).toEqual({ x: midX, y: minY });
    expect(clampToField({ x: midX, y: minY - 1 })).toEqual({ x: midX, y: minY });
  });

  it('下辺: すぐ内側・ちょうど・すぐ外側', () => {
    expect(clampToField({ x: midX, y: maxY - 1 })).toEqual({ x: midX, y: maxY - 1 });
    expect(clampToField({ x: midX, y: maxY })).toEqual({ x: midX, y: maxY });
    expect(clampToField({ x: midX, y: maxY + 1 })).toEqual({ x: midX, y: maxY });
  });

  it('4つの角のすぐ外側は角の境界値に収まる', () => {
    expect(clampToField({ x: minX - 1, y: minY - 1 })).toEqual({ x: minX, y: minY });
    expect(clampToField({ x: maxX + 1, y: minY - 1 })).toEqual({ x: maxX, y: minY });
    expect(clampToField({ x: minX - 1, y: maxY + 1 })).toEqual({ x: minX, y: maxY });
    expect(clampToField({ x: maxX + 1, y: maxY + 1 })).toEqual({ x: maxX, y: maxY });
  });
});

describe('getPointerDirection', () => {
  const from = { x: 100, y: 100 };
  const deadZone = PLAYER_POINTER_DEAD_ZONE;

  it('デッドゾーンちょうどの距離では止まる', () => {
    expect(getPointerDirection(from, { x: 100 + deadZone, y: 100 }, deadZone)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('デッドゾーンのすぐ内側では止まる', () => {
    expect(getPointerDirection(from, { x: 100 + deadZone - 1, y: 100 }, deadZone)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('デッドゾーンのすぐ外側では目標へ向かう', () => {
    expect(getPointerDirection(from, { x: 100 + deadZone + 1, y: 100 }, deadZone)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('斜め方向も長さ 1 に正規化される', () => {
    const d = getPointerDirection(from, { x: 200, y: 200 }, deadZone);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
  });

  it('目標が真上・真左でも向きが正しい', () => {
    expect(getPointerDirection(from, { x: 100, y: 0 }, deadZone)).toEqual({ x: 0, y: -1 });
    expect(getPointerDirection(from, { x: 0, y: 100 }, deadZone)).toEqual({ x: -1, y: 0 });
  });
});

describe('movePlayerToward（行き過ぎ防止）', () => {
  const from = { x: 100, y: 100 };
  const direction = { x: 1, y: 0 };

  it('移動量が距離より小さければ通常どおり進む', () => {
    expect(movePlayerToward(from, { x: 200, y: 100 }, direction, 100, 240)).toEqual({
      x: 124,
      y: 100,
    });
  });

  it('移動量が距離とちょうど等しければ目標に着く', () => {
    expect(movePlayerToward(from, { x: 124, y: 100 }, direction, 100, 240)).toEqual({
      x: 124,
      y: 100,
    });
  });

  it('移動量が距離より大きければ目標で止まる', () => {
    expect(movePlayerToward(from, { x: 110, y: 100 }, direction, 100, 240)).toEqual({
      x: 110,
      y: 100,
    });
  });

  it('斜め移動でも目標を通り過ぎない', () => {
    const d = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const result = movePlayerToward(from, { x: 105, y: 105 }, d, 1000, 240);
    expect(result.x).toBeCloseTo(105);
    expect(result.y).toBeCloseTo(105);
  });
});
