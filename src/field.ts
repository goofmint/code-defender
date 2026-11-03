// フィールド定数。Phaser には依存しない（テスト可能にするため）。
import { CELL_SIZE, FIELD_COLS, FIELD_ROWS } from './config';

export { CELL_SIZE, FIELD_COLS, FIELD_ROWS };

export const FIELD_WIDTH = CELL_SIZE * FIELD_COLS;
export const FIELD_HEIGHT = CELL_SIZE * FIELD_ROWS;

// 仮: 配色。背景色 #0b1020 と区別できるやや明るい暗色。
export const FIELD_COLORS = {
  ground: 0x16203a,
  grid: 0x2a3a62,
} as const;
export const GRID_LINE_WIDTH = 1;
