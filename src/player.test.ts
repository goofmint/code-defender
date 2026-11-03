import { describe, expect, it } from 'vitest';
import { CELL_SIZE, FIELD_COLS, FIELD_HEIGHT, FIELD_ROWS, FIELD_WIDTH } from './field';
import {
  getPlayerStartPosition,
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
