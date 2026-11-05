// フィールド定数。Phaser には依存しない（テスト可能にするため）。
import { CELL_SIZE, FIELD_COLS, FIELD_ROWS } from './config';

export { CELL_SIZE, FIELD_COLS, FIELD_ROWS };

export const FIELD_WIDTH = CELL_SIZE * FIELD_COLS;
export const FIELD_HEIGHT = CELL_SIZE * FIELD_ROWS;

// 床の配色は config.ts の FIELD_FLOOR_COLORS / FIELD_FLOOR_STYLE(#144)。
export const GRID_LINE_WIDTH = 1;
