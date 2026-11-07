import { describe, expect, it } from 'vitest';
import { CELL_SIZE, FIELD_COLS, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import { PLAYER_POINTER_DEAD_ZONE, PLAYER_SCREEN_GLOW_ALPHA, PLAYER_SHADOW_ALPHA } from './config';
import {
  clampToField,
  directionFromInput,
  facingFromHorizontal,
  getPlayerStartPosition,
  getPointerDirection,
  mergeDirectionInputs,
  movePlayerInDirection,
  movePlayerToward,
  NO_DIRECTION_INPUT,
  PLAYER_COLORS,
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

describe('facingFromHorizontal(#144)', () => {
  it('右へ動くと右向き(1)、左へ動くと左向き(-1)', () => {
    expect(facingFromHorizontal(1)).toBe(1);
    expect(facingFromHorizontal(-1)).toBe(-1);
  });

  it('ごく小さい移動量でも符号だけで決まる（境界値）', () => {
    expect(facingFromHorizontal(Number.MIN_VALUE)).toBe(1);
    expect(facingFromHorizontal(-Number.MIN_VALUE)).toBe(-1);
  });

  it('水平に動かない（0・-0）・数値でないときは null（向きを変えない）', () => {
    expect(facingFromHorizontal(0)).toBeNull();
    expect(facingFromHorizontal(-0)).toBeNull();
    expect(facingFromHorizontal(Number.NaN)).toBeNull();
  });
});

describe('主人公の配色(#144)', () => {
  it('影・手足・目・ヘッドセット・画面・画面の光の色がある', () => {
    for (const key of ['shadow', 'limbs', 'eyes', 'headset', 'screen', 'screenGlow'] as const) {
      expect(Number.isInteger(PLAYER_COLORS[key])).toBe(true);
    }
  });

  it('影と画面の光の不透明度は 0 より大きく 1 以下', () => {
    for (const alpha of [PLAYER_SHADOW_ALPHA, PLAYER_SCREEN_GLOW_ALPHA]) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});

describe('上下左右の入力による移動(#182)', () => {
  const input = (pressed: Partial<Record<'up' | 'down' | 'left' | 'right', boolean>>) => ({ ...NO_DIRECTION_INPUT, ...pressed });

  it('何も押していなければ {0,0}', () => {
    expect(directionFromInput(NO_DIRECTION_INPUT)).toEqual({ x: 0, y: 0 });
  });

  it('1つの向きだけなら、その向きの長さ 1 の方向（上は y が負、下は y が正）', () => {
    expect(directionFromInput(input({ up: true }))).toEqual({ x: 0, y: -1 });
    expect(directionFromInput(input({ down: true }))).toEqual({ x: 0, y: 1 });
    expect(directionFromInput(input({ left: true }))).toEqual({ x: -1, y: 0 });
    expect(directionFromInput(input({ right: true }))).toEqual({ x: 1, y: 0 });
  });

  it('斜めは正規化して長さ 1（斜めでも速くならない）', () => {
    const direction = directionFromInput(input({ up: true, right: true }));
    expect(direction.x).toBeCloseTo(Math.SQRT1_2);
    expect(direction.y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1);
  });

  it('反対の向きを同時に押すと打ち消す（上下・左右どちらも。残りの向きだけ進む）', () => {
    expect(directionFromInput(input({ up: true, down: true }))).toEqual({ x: 0, y: 0 });
    expect(directionFromInput(input({ left: true, right: true }))).toEqual({ x: 0, y: 0 });
    expect(directionFromInput(input({ up: true, down: true, left: true }))).toEqual({ x: -1, y: 0 });
    expect(directionFromInput(input({ up: true, down: true, left: true, right: true }))).toEqual({ x: 0, y: 0 });
  });

  it('入力の合成: どれかで押していれば押している。空の一覧は何も押していない', () => {
    expect(mergeDirectionInputs([])).toEqual(NO_DIRECTION_INPUT);
    expect(mergeDirectionInputs([input({ up: true }), input({ right: true })])).toEqual(input({ up: true, right: true }));
    // キーボードの左とパッドの右は打ち消す。
    expect(directionFromInput(mergeDirectionInputs([input({ left: true }), input({ right: true })]))).toEqual({ x: 0, y: 0 });
  });

  it('移動距離は speed × deltaMs / 1000（境界値: deltaMs = 0 なら動かない）', () => {
    expect(movePlayerInDirection({ x: 100, y: 100 }, { x: 1, y: 0 }, 500, 240)).toEqual({ x: 220, y: 100 });
    expect(movePlayerInDirection({ x: 100, y: 100 }, { x: 0, y: -1 }, 1000, 240)).toEqual({ x: 100, y: -140 });
    expect(movePlayerInDirection({ x: 100, y: 100 }, { x: 1, y: 0 }, 0, 240)).toEqual({ x: 100, y: 100 });
    expect(movePlayerInDirection({ x: 100, y: 100 }, { x: 0, y: 0 }, 1000, 240)).toEqual({ x: 100, y: 100 });
  });

  it('フィールドの外へ進んだ位置は clampToField で端に止まる', () => {
    const next = movePlayerInDirection({ x: PLAYER_SIZE / 2, y: 100 }, { x: -1, y: 0 }, 1000, 240);
    expect(clampToField(next)).toEqual({ x: PLAYER_SIZE / 2, y: 100 });
  });
});
