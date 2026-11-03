import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  FIELD_COLS,
  FIELD_HEIGHT,
  FIELD_ROWS,
  FIELD_WIDTH,
} from './field';

describe('field', () => {
  it('フィールド寸法はセルサイズ×列数・行数で、960×540 になる', () => {
    expect(FIELD_WIDTH).toBe(CELL_SIZE * FIELD_COLS);
    expect(FIELD_HEIGHT).toBe(CELL_SIZE * FIELD_ROWS);
    expect([FIELD_WIDTH, FIELD_HEIGHT]).toEqual([960, 540]);
  });
});
