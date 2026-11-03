// 主人公の定数。Phaser には依存しない（テスト可能にするため）。
import {
  CELL_SIZE,
  PLAYER_COLORS,
  PLAYER_SIZE_RATIO,
  PLAYER_START_COL,
  PLAYER_START_ROW,
} from './config';

export { PLAYER_COLORS, PLAYER_START_COL, PLAYER_START_ROW };

export const PLAYER_SIZE = CELL_SIZE * PLAYER_SIZE_RATIO;

// 開始セルの中心ピクセル座標を返す。
export const getPlayerStartPosition = (): { x: number; y: number } => ({
  x: PLAYER_START_COL * CELL_SIZE + CELL_SIZE / 2,
  y: PLAYER_START_ROW * CELL_SIZE + CELL_SIZE / 2,
});
