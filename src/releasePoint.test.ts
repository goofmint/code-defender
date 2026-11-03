import { describe, expect, it } from 'vitest';
import { RELEASE_POINT_CELL } from './config';
import {
  CELL_SIZE,
  FIELD_COLS,
  FIELD_HEIGHT,
  FIELD_ROWS,
  FIELD_WIDTH,
} from './field';
import { RELEASE_POINT_CENTER, RELEASE_POINT_STYLE } from './releasePoint';

describe('releasePoint', () => {
  it('フィールド内のセル上にある', () => {
    expect(RELEASE_POINT_CELL.col).toBeGreaterThanOrEqual(0);
    expect(RELEASE_POINT_CELL.col).toBeLessThan(FIELD_COLS);
    expect(RELEASE_POINT_CELL.row).toBeGreaterThanOrEqual(0);
    expect(RELEASE_POINT_CELL.row).toBeLessThan(FIELD_ROWS);
  });

  it('右端の列・縦中央の行のセル中心に置かれる', () => {
    expect(RELEASE_POINT_CELL).toEqual({ col: FIELD_COLS - 1, row: 4 });
    expect(RELEASE_POINT_CENTER).toEqual({ x: 930, y: 270 });
  });

  it('円がフィールドからはみ出さない', () => {
    const { x, y } = RELEASE_POINT_CENTER;
    const { radius } = RELEASE_POINT_STYLE;
    expect(x - radius).toBeGreaterThanOrEqual(0);
    expect(x + radius).toBeLessThanOrEqual(FIELD_WIDTH);
    expect(y - radius).toBeGreaterThanOrEqual(0);
    expect(y + radius).toBeLessThanOrEqual(FIELD_HEIGHT);
    expect(radius * 2).toBeLessThanOrEqual(CELL_SIZE);
  });
});
